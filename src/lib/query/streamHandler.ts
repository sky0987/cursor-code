/**
 * 流式响应处理器 - 参考 Claude Code CLI 的流式处理架构
 * 处理 API 响应流，累积内容块，并发出消息事件
 */

import { v4 as uuid } from 'uuid';
import type {
  AssistantMessage,
  AssistantContentBlock,
  TextBlock,
  ToolUseBlock,
  StreamEvent,
} from '../messages/types';
import { createAssistantMessage } from '../messages/types';

// ==================== 流事件类型 ====================

export interface RawStreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: {
    type: 'text' | 'tool_use';
    id?: string;
    name?: string;
    text?: string;
    input?: string;
  };
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  usage?: {
    output_tokens: number;
  };
  delta?: {
    stop_reason?: string;
  };
}

export interface MessageStopEvent {
  type: 'message_stop';
}

export type APIStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent;

// ==================== 流处理器状态 ====================

interface StreamState {
  messageId: string | null;
  requestId: string | null;
  contentBlocks: Map<number, MutableContentBlock>;
  completedBlocks: AssistantContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
  stopReason: string | null;
  ttftMs: number | null;
  startTime: number;
}

interface MutableContentBlock {
  type: 'text' | 'tool_use';
  id?: string;
  name?: string;
  text: string;
  input: string;
}

// ==================== 流处理器 ====================

export class StreamHandler {
  private state: StreamState;
  private onTextDelta?: (text: string, fullText: string) => void;
  private onToolUseStart?: (toolUseId: string, toolName: string) => void;
  private onToolInputDelta?: (toolUseId: string, delta: string) => void;
  private onMessage?: (message: AssistantMessage) => void;
  private onComplete?: (message: AssistantMessage) => void;

  constructor(options: {
    requestId?: string;
    onTextDelta?: (text: string, fullText: string) => void;
    onToolUseStart?: (toolUseId: string, toolName: string) => void;
    onToolInputDelta?: (toolUseId: string, delta: string) => void;
    onMessage?: (message: AssistantMessage) => void;
    onComplete?: (message: AssistantMessage) => void;
  } = {}) {
    this.state = this.createInitialState(options.requestId);
    this.onTextDelta = options.onTextDelta;
    this.onToolUseStart = options.onToolUseStart;
    this.onToolInputDelta = options.onToolInputDelta;
    this.onMessage = options.onMessage;
    this.onComplete = options.onComplete;
  }

  private createInitialState(requestId?: string): StreamState {
    return {
      messageId: null,
      requestId: requestId ?? null,
      contentBlocks: new Map(),
      completedBlocks: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      stopReason: null,
      ttftMs: null,
      startTime: Date.now(),
    };
  }

  /**
   * 处理单个流事件
   */
  processEvent(event: APIStreamEvent): void {
    switch (event.type) {
      case 'message_start':
        this.handleMessageStart(event);
        break;
      case 'content_block_start':
        this.handleContentBlockStart(event);
        break;
      case 'content_block_delta':
        this.handleContentBlockDelta(event);
        break;
      case 'content_block_stop':
        this.handleContentBlockStop(event);
        break;
      case 'message_delta':
        this.handleMessageDelta(event);
        break;
      case 'message_stop':
        this.handleMessageStop();
        break;
    }
  }

  private handleMessageStart(event: MessageStartEvent): void {
    this.state.messageId = event.message.id;
    if (event.message.usage) {
      this.state.usage = {
        input_tokens: event.message.usage.input_tokens,
        output_tokens: event.message.usage.output_tokens,
      };
    }
    // 记录首字节时间
    if (this.state.ttftMs === null) {
      this.state.ttftMs = Date.now() - this.state.startTime;
    }
  }

  private handleContentBlockStart(event: ContentBlockStartEvent): void {
    const block: MutableContentBlock = {
      type: event.content_block.type as 'text' | 'tool_use',
      id: event.content_block.id,
      name: event.content_block.name,
      text: event.content_block.text || '',
      input: event.content_block.input || '',
    };

    this.state.contentBlocks.set(event.index, block);

    // 触发工具使用开始回调
    if (block.type === 'tool_use' && block.id && block.name) {
      this.onToolUseStart?.(block.id, block.name);
    }
  }

  private handleContentBlockDelta(event: ContentBlockDeltaEvent): void {
    const block = this.state.contentBlocks.get(event.index);
    if (!block) {
      console.warn(`Content block not found at index ${event.index}`);
      return;
    }

    switch (event.delta.type) {
      case 'text_delta':
        if (event.delta.text) {
          block.text += event.delta.text;
          this.onTextDelta?.(event.delta.text, block.text);
        }
        break;
      case 'input_json_delta':
        if (event.delta.partial_json) {
          block.input += event.delta.partial_json;
          if (block.id) {
            this.onToolInputDelta?.(block.id, event.delta.partial_json);
          }
        }
        break;
    }
  }

  private handleContentBlockStop(event: ContentBlockStopEvent): void {
    const block = this.state.contentBlocks.get(event.index);
    if (!block) {
      console.warn(`Content block not found at index ${event.index}`);
      return;
    }

    // 转换为完成的内容块
    const completedBlock = this.finalizeContentBlock(block);
    this.state.completedBlocks.push(completedBlock);

    // 发出中间消息
    const message = this.buildCurrentMessage();
    this.onMessage?.(message);
  }

  private handleMessageDelta(event: MessageDeltaEvent): void {
    if (event.usage?.output_tokens) {
      this.state.usage.output_tokens = event.usage.output_tokens;
    }
    if (event.delta?.stop_reason) {
      this.state.stopReason = event.delta.stop_reason;
    }
  }

  private handleMessageStop(): void {
    const message = this.buildFinalMessage();
    this.onComplete?.(message);
  }

  private finalizeContentBlock(block: MutableContentBlock): AssistantContentBlock {
    if (block.type === 'text') {
      return {
        type: 'text',
        text: block.text,
      } as TextBlock;
    } else {
      // 解析 tool_use 的 input
      let parsedInput: Record<string, unknown> = {};
      try {
        if (block.input) {
          parsedInput = JSON.parse(block.input);
        }
      } catch (e) {
        console.warn('Failed to parse tool input:', e);
        parsedInput = { _raw: block.input };
      }

      return {
        type: 'tool_use',
        id: block.id || uuid(),
        name: block.name || 'unknown',
        input: parsedInput,
      } as ToolUseBlock;
    }
  }

  private buildCurrentMessage(): AssistantMessage {
    return createAssistantMessage({
      content: [...this.state.completedBlocks],
      usage: { ...this.state.usage },
      stop_reason: this.state.stopReason || undefined,
      requestId: this.state.requestId || undefined,
    });
  }

  private buildFinalMessage(): AssistantMessage {
    return createAssistantMessage({
      content: [...this.state.completedBlocks],
      usage: { ...this.state.usage },
      stop_reason: this.state.stopReason || 'end_turn',
      requestId: this.state.requestId || undefined,
    });
  }

  /**
   * 获取当前累积的文本
   */
  getCurrentText(): string {
    let text = '';
    for (const block of this.state.completedBlocks) {
      if (block.type === 'text') {
        text += (block as TextBlock).text;
      }
    }
    // 也包含正在进行的文本块
    this.state.contentBlocks.forEach((block) => {
      if (block.type === 'text') {
        text += block.text;
      }
    });
    return text;
  }

  /**
   * 获取工具使用块
   */
  getToolUseBlocks(): ToolUseBlock[] {
    return this.state.completedBlocks.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );
  }

  /**
   * 检查是否有工具使用
   */
  hasToolUse(): boolean {
    return this.state.completedBlocks.some(block => block.type === 'tool_use');
  }

  /**
   * 获取首字节时间
   */
  getTTFT(): number | null {
    return this.state.ttftMs;
  }

  /**
   * 重置处理器状态
   */
  reset(requestId?: string): void {
    this.state = this.createInitialState(requestId);
  }
}

// ==================== 流解析工具函数 ====================

/**
 * 解析 SSE 数据行
 */
export function parseSSELine(line: string): APIStreamEvent | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const data = line.slice(6);
  if (data === '[DONE]') {
    return null;
  }

  try {
    return JSON.parse(data) as APIStreamEvent;
  } catch {
    return null;
  }
}

/**
 * 处理流式响应
 */
export async function* processStreamResponse(
  response: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  handler: StreamHandler
): AsyncGenerator<StreamEvent, AssistantMessage | null> {
  const decoder = new TextDecoder();
  let buffer = '';

  const iterable = 'getReader' in response
    ? readableStreamToAsyncIterable(response)
    : response;

  for await (const chunk of iterable) {
    buffer += decoder.decode(chunk, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = parseSSELine(trimmed);
      if (event) {
        handler.processEvent(event);

        // 转换为前端事件
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta' && delta.text) {
            yield {
              type: 'text_delta',
              delta: delta.text,
              index: event.index,
            };
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            const block = handler['state'].contentBlocks.get(event.index);
            if (block?.id) {
              yield {
                type: 'tool_input_delta',
                toolUseId: block.id,
                delta: delta.partial_json,
              };
            }
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            yield {
              type: 'tool_use_start',
              toolUseId: event.content_block.id || '',
              toolName: event.content_block.name || '',
            };
          }
        } else if (event.type === 'message_delta') {
          yield {
            type: 'message_end',
            usage: handler['state'].usage,
            stop_reason: event.delta?.stop_reason,
          };
        }
      }
    }
  }

  // 处理缓冲区中剩余的数据
  if (buffer.trim()) {
    const event = parseSSELine(buffer.trim());
    if (event) {
      handler.processEvent(event);
    }
  }

  return handler['buildFinalMessage']();
}

/**
 * 将 ReadableStream 转换为 AsyncIterable
 */
async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// ==================== 简化的文本流处理 ====================

/**
 * 简化的文本 delta 流处理（用于 Cursor API）
 */
export function createSimpleTextHandler(
  onDelta: (delta: string, fullText: string) => void
): { 
  processChunk: (chunk: string) => void;
  getText: () => string;
  getToolCalls: () => Array<{ tool: string; input: unknown }>;
} {
  let fullText = '';
  const toolCalls: Array<{ tool: string; input: unknown }> = [];

  return {
    processChunk(chunk: string) {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) {
          continue;
        }

        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text-delta' && event.delta) {
            fullText += event.delta;
            onDelta(event.delta, fullText);
          }
        } catch {
          // 忽略解析错误
        }
      }
    },

    getText() {
      return fullText;
    },

    getToolCalls() {
      // 从文本中提取工具调用
      const regex = /```tool\n([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        try {
          const toolCall = JSON.parse(match[1].trim());
          if (toolCall.tool && toolCall.input) {
            toolCalls.push(toolCall);
          }
        } catch {
          // 忽略解析错误
        }
      }
      return toolCalls;
    },
  };
}
