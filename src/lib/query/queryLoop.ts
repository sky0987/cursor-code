/**
 * 主查询循环 - 参考 Claude Code CLI 的 query.ts 架构
 * 实现 agentic loop: 发送请求 -> 获取响应 -> 执行工具 -> 继续循环
 */

import type {
  Message,
  AssistantMessage,
  UserMessage,
  QueryParams,
  TerminalResult,
  ToolUseBlock,
  StreamEvent,
} from '../messages/types';
import {
  createUserMessage,
  createSystemMessage,
  extractToolUseBlocks,
  hasToolUse,
} from '../messages/types';
import type { Tool, ToolUseContext } from '../tools/types';
import { ToolExecutor, runToolsAndCollect } from '../tools/orchestration';
import { StreamHandler, createSimpleTextHandler } from './streamHandler';

// ==================== 配置 ====================

export interface QueryConfig {
  maxTurns: number;
  maxOutputTokensRecoveryLimit: number;
  streamIdleTimeoutMs: number;
}

export const DEFAULT_QUERY_CONFIG: QueryConfig = {
  maxTurns: 50,
  maxOutputTokensRecoveryLimit: 3,
  streamIdleTimeoutMs: 90000,
};

// ==================== 查询状态 ====================

interface QueryState {
  messages: Message[];
  turnCount: number;
  maxOutputTokensRecoveryCount: number;
  aborted: boolean;
}

// ==================== 查询上下文 ====================

export interface QueryContext {
  tools: Tool[];
  toolExecutor: ToolExecutor;
  config: QueryConfig;
  abortController: AbortController;
  
  // 回调
  onStreamStart?: () => void;
  onTextDelta?: (delta: string, fullText: string) => void;
  onToolStart?: (toolName: string, toolId: string) => void;
  onToolEnd?: (toolName: string, toolId: string, result: unknown) => void;
  onMessage?: (message: Message) => void;
  onTurnComplete?: (turnCount: number, messages: Message[]) => void;
}

// ==================== 主查询循环 ====================

/**
 * 执行查询循环
 * 这是一个生成器函数，会 yield 中间消息和流事件
 */
export async function* queryLoop(
  params: QueryParams,
  context: QueryContext
): AsyncGenerator<Message | StreamEvent, TerminalResult> {
  const state: QueryState = {
    messages: [...params.messages],
    turnCount: 0,
    maxOutputTokensRecoveryCount: 0,
    aborted: false,
  };

  // 监听中止信号
  const abortHandler = () => {
    state.aborted = true;
  };
  context.abortController.signal.addEventListener('abort', abortHandler);

  try {
    // 主循环
    while (true) {
      state.turnCount++;

      // 检查是否达到最大轮次
      if (state.turnCount > context.config.maxTurns) {
        yield createSystemMessage(
          `Reached maximum turns (${context.config.maxTurns})`,
          'warning'
        );
        return { reason: 'max_turns', turnCount: state.turnCount };
      }

      // 检查是否中止
      if (state.aborted) {
        return { reason: 'aborted' };
      }

      // 通知流开始
      context.onStreamStart?.();

      // 发送 API 请求并处理响应
      const { assistantMessage, toolUseBlocks } = yield* sendRequestAndStream(
        state.messages,
        params.systemPrompt,
        params.model,
        context
      );

      if (!assistantMessage) {
        return { reason: 'error', error: new Error('No response from API') };
      }

      // 添加助手消息到历史
      state.messages.push(assistantMessage);
      yield assistantMessage;
      context.onMessage?.(assistantMessage);

      // 检查是否有错误
      if (assistantMessage.isApiErrorMessage) {
        // 检查是否可以恢复
        if (assistantMessage.apiError === 'max_output_tokens') {
          if (state.maxOutputTokensRecoveryCount < context.config.maxOutputTokensRecoveryLimit) {
            state.maxOutputTokensRecoveryCount++;
            
            // 添加恢复消息
            const recoveryMessage = createUserMessage({
              content: 'Output token limit hit. Resume directly — no recap. Break remaining work into smaller pieces.',
              isMeta: true,
            });
            state.messages.push(recoveryMessage);
            yield recoveryMessage;
            
            continue; // 重试
          }
        }
        
        return { reason: 'error', error: new Error(assistantMessage.apiError || 'API error') };
      }

      // 检查是否有工具调用
      if (toolUseBlocks.length === 0) {
        // 没有工具调用，查询完成
        context.onTurnComplete?.(state.turnCount, state.messages);
        return { reason: 'completed', turnCount: state.turnCount };
      }

      // 检查是否中止
      if (state.aborted) {
        // 生成中断消息
        for (const block of toolUseBlocks) {
          const interruptMessage = createUserMessage({
            content: [{
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Execution interrupted by user',
              is_error: true,
            }],
          });
          state.messages.push(interruptMessage);
          yield interruptMessage;
        }
        return { reason: 'aborted' };
      }

      // 执行工具调用
      const toolContext: ToolUseContext = {
        workingDirectory: '',
        abortSignal: context.abortController.signal,
        permissionContext: {
          mode: 'default',
          workingDirectory: '',
          allowedTools: [],
          deniedTools: [],
          allowedPaths: [],
          deniedPaths: [],
        },
      };

      for await (const update of context.toolExecutor.runTools(
        toolUseBlocks,
        assistantMessage,
        toolContext
      )) {
        if (update.message) {
          state.messages.push(update.message);
          yield update.message;
          context.onMessage?.(update.message);
        }
        if (update.progress) {
          yield update.progress;
          
          // 触发工具回调
          if (update.progress.data.type === 'start') {
            context.onToolStart?.(
              update.progress.data.toolName as string,
              update.progress.toolUseID
            );
          } else if (update.progress.data.type === 'complete' || update.progress.data.type === 'error') {
            context.onToolEnd?.(
              update.progress.data.toolName as string,
              update.progress.toolUseID,
              update.progress.data
            );
          }
        }
      }

      // 重置 max_output_tokens 恢复计数
      state.maxOutputTokensRecoveryCount = 0;

      // 通知轮次完成
      context.onTurnComplete?.(state.turnCount, state.messages);
    }
  } finally {
    context.abortController.signal.removeEventListener('abort', abortHandler);
  }
}

// ==================== API 请求处理 ====================

async function* sendRequestAndStream(
  messages: Message[],
  systemPrompt: string,
  model: string,
  context: QueryContext
): AsyncGenerator<StreamEvent, { assistantMessage: AssistantMessage | null; toolUseBlocks: ToolUseBlock[] }> {
  // 这里需要根据实际的 API 实现
  // 目前使用简化的实现

  // 构建请求消息
  const apiMessages = convertMessagesToAPIFormat(messages, systemPrompt);

  // 创建流处理器
  let fullText = '';
  const toolCalls: Array<{ tool: string; input: unknown }> = [];

  const streamHandler = createSimpleTextHandler((delta, text) => {
    fullText = text;
    context.onTextDelta?.(delta, text);
  });

  try {
    // 发送请求（这里需要实际的 API 调用实现）
    // 暂时返回空实现，等待与 Electron 主进程集成
    
    yield { type: 'stream_request_start' };

    // 解析工具调用
    const extractedToolCalls = extractToolCallsFromText(fullText);

    // 构建助手消息
    const assistantMessage = buildAssistantMessage(fullText, extractedToolCalls);

    return {
      assistantMessage,
      toolUseBlocks: extractToolUseBlocks(assistantMessage),
    };

  } catch (error) {
    console.error('API request failed:', error);
    return {
      assistantMessage: null,
      toolUseBlocks: [],
    };
  }
}

// ==================== 辅助函数 ====================

function convertMessagesToAPIFormat(
  messages: Message[],
  systemPrompt: string
): Array<{ role: string; parts: Array<{ type: string; text?: string }> }> {
  const apiMessages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }> = [];

  for (const msg of messages) {
    if (msg.type === 'user') {
      const userMsg = msg as UserMessage;
      const content = userMsg.message.content;
      
      if (typeof content === 'string') {
        apiMessages.push({
          role: 'user',
          parts: [{ type: 'text', text: content }],
        });
      } else if (Array.isArray(content)) {
        const parts = content.map(block => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          } else if (block.type === 'tool_result') {
            return { type: 'text', text: `[Tool Result: ${block.tool_use_id}]\n${block.content}` };
          }
          return { type: 'text', text: '' };
        });
        apiMessages.push({ role: 'user', parts });
      }
    } else if (msg.type === 'assistant') {
      const assistantMsg = msg as AssistantMessage;
      const textParts = assistantMsg.message.content
        .filter(block => block.type === 'text')
        .map(block => ({ type: 'text', text: (block as { text: string }).text }));
      
      if (textParts.length > 0) {
        apiMessages.push({ role: 'assistant', parts: textParts });
      }
    }
  }

  // 在第一条用户消息中注入系统提示
  if (apiMessages.length > 0 && apiMessages[0].role === 'user') {
    const firstPart = apiMessages[0].parts[0];
    if (firstPart?.text) {
      firstPart.text = systemPrompt + '\n\n---\n\n' + firstPart.text;
    }
  }

  return apiMessages;
}

function extractToolCallsFromText(text: string): Array<{ tool: string; input: Record<string, unknown> }> {
  const toolCalls: Array<{ tool: string; input: Record<string, unknown> }> = [];
  const regex = /```tool\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool && parsed.input) {
        toolCalls.push({
          tool: parsed.tool,
          input: parsed.input as Record<string, unknown>,
        });
      }
    } catch {
      // 忽略解析错误
    }
  }

  return toolCalls;
}

function buildAssistantMessage(
  text: string,
  toolCalls: Array<{ tool: string; input: Record<string, unknown> }>
): AssistantMessage {
  const content: Array<{ type: 'text'; text: string } | ToolUseBlock> = [];

  // 添加文本内容
  if (text) {
    content.push({ type: 'text', text });
  }

  // 添加工具调用
  for (const call of toolCalls) {
    content.push({
      type: 'tool_use',
      id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: call.tool,
      input: call.input,
    });
  }

  return {
    uuid: `msg_${Date.now()}`,
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      content,
    },
  };
}

// ==================== 简化的单次查询 ====================

/**
 * 执行单次查询（不进入循环）
 */
export async function singleQuery(
  userMessage: string,
  systemPrompt: string,
  model: string,
  options: {
    images?: string[];
    context?: Message[];
    onDelta?: (delta: string, fullText: string) => void;
  } = {}
): Promise<{
  response: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
}> {
  let response = '';
  const toolCalls: Array<{ tool: string; input: unknown }> = [];

  // 这里需要实际的 API 调用实现
  // 暂时返回空实现

  return { response, toolCalls };
}

// ==================== 查询管理器 ====================

export class QueryManager {
  private context: QueryContext;
  private currentQuery: AsyncGenerator<Message | StreamEvent, TerminalResult> | null = null;

  constructor(tools: Tool[], config: Partial<QueryConfig> = {}) {
    const fullConfig = { ...DEFAULT_QUERY_CONFIG, ...config };
    
    this.context = {
      tools,
      toolExecutor: new ToolExecutor(tools),
      config: fullConfig,
      abortController: new AbortController(),
    };
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: {
    onStreamStart?: () => void;
    onTextDelta?: (delta: string, fullText: string) => void;
    onToolStart?: (toolName: string, toolId: string) => void;
    onToolEnd?: (toolName: string, toolId: string, result: unknown) => void;
    onMessage?: (message: Message) => void;
    onTurnComplete?: (turnCount: number, messages: Message[]) => void;
  }): void {
    Object.assign(this.context, callbacks);
  }

  /**
   * 开始新查询
   */
  async *query(params: QueryParams): AsyncGenerator<Message | StreamEvent, TerminalResult> {
    // 取消之前的查询
    this.abort();
    
    // 创建新的中止控制器
    this.context.abortController = new AbortController();
    this.context.toolExecutor.reset();

    // 开始查询循环
    this.currentQuery = queryLoop(params, this.context);

    try {
      return yield* this.currentQuery;
    } finally {
      this.currentQuery = null;
    }
  }

  /**
   * 中止当前查询
   */
  abort(): void {
    this.context.abortController.abort();
    this.context.toolExecutor.abort();
    this.currentQuery = null;
  }

  /**
   * 检查是否正在查询
   */
  isQuerying(): boolean {
    return this.currentQuery !== null;
  }
}
