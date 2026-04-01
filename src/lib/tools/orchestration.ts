/**
 * 工具执行编排器 - 参考 Claude Code CLI 的工具执行架构
 * 支持串行和并行执行，以及流式进度报告
 */

import type {
  ToolUseBlock,
  AssistantMessage,
  UserMessage,
  ToolCallResult,
  ProgressMessage,
  Message,
} from '../messages/types';
import {
  createUserMessage,
  createToolResultMessage,
  createProgressMessage,
} from '../messages/types';
import type { Tool, ToolUseContext } from './types';

// ==================== 类型定义 ====================

export interface ToolExecutionUpdate {
  type: 'message' | 'progress' | 'context_update';
  message?: Message;
  progress?: ProgressMessage;
  contextModifier?: (context: ToolUseContext) => ToolUseContext;
}

export interface ToolBatch {
  isConcurrencySafe: boolean;
  blocks: ToolUseBlock[];
}

export interface ToolExecutorConfig {
  maxConcurrency?: number;
  onProgress?: (progress: ProgressMessage) => void;
}

// ==================== 工具分区 ====================

/**
 * 将工具调用分区为可并行和串行批次
 * - 只读工具可以并行执行
 * - 写入工具必须串行执行
 */
export function partitionToolCalls(
  toolUseBlocks: ToolUseBlock[],
  tools: Map<string, Tool>,
  context: ToolUseContext
): ToolBatch[] {
  const batches: ToolBatch[] = [];
  
  for (const block of toolUseBlocks) {
    const tool = tools.get(block.name);
    const isConcurrencySafe = tool ? isSafeForConcurrency(tool, block.input, context) : false;
    
    const lastBatch = batches[batches.length - 1];
    
    if (lastBatch && lastBatch.isConcurrencySafe === isConcurrencySafe && isConcurrencySafe) {
      // 合并到上一个并发批次
      lastBatch.blocks.push(block);
    } else {
      // 创建新批次
      batches.push({
        isConcurrencySafe,
        blocks: [block],
      });
    }
  }
  
  return batches;
}

function isSafeForConcurrency(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext
): boolean {
  try {
    return tool.isConcurrencySafe?.(input) ?? tool.isReadOnly?.(input) ?? false;
  } catch {
    return false;
  }
}

// ==================== 工具执行器 ====================

export class ToolExecutor {
  private tools: Map<string, Tool>;
  private config: ToolExecutorConfig;
  private abortController: AbortController;
  private inProgressToolIds: Set<string> = new Set();

  constructor(
    tools: Map<string, Tool> | Tool[],
    config: ToolExecutorConfig = {}
  ) {
    if (Array.isArray(tools)) {
      this.tools = new Map(tools.map(t => [t.name, t]));
    } else {
      this.tools = tools;
    }
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 10,
      ...config,
    };
    this.abortController = new AbortController();
  }

  /**
   * 执行一批工具调用
   */
  async *runTools(
    toolUseBlocks: ToolUseBlock[],
    assistantMessage: AssistantMessage,
    context: ToolUseContext
  ): AsyncGenerator<ToolExecutionUpdate, void> {
    const batches = partitionToolCalls(toolUseBlocks, this.tools, context);
    let currentContext = context;

    for (const batch of batches) {
      if (this.abortController.signal.aborted) {
        // 为中断的工具生成错误结果
        for (const block of batch.blocks) {
          yield {
            type: 'message',
            message: createToolResultMessage(
              block.id,
              'Execution interrupted by user',
              true,
              assistantMessage.uuid
            ),
          };
        }
        break;
      }

      if (batch.isConcurrencySafe) {
        // 并行执行只读工具
        yield* this.runToolsConcurrently(batch.blocks, assistantMessage, currentContext);
      } else {
        // 串行执行写入工具
        for await (const update of this.runToolsSerially(batch.blocks, assistantMessage, currentContext)) {
          if (update.contextModifier) {
            currentContext = update.contextModifier(currentContext);
          }
          yield update;
        }
      }
    }
  }

  /**
   * 并行执行工具
   */
  private async *runToolsConcurrently(
    blocks: ToolUseBlock[],
    assistantMessage: AssistantMessage,
    context: ToolUseContext
  ): AsyncGenerator<ToolExecutionUpdate, void> {
    const maxConcurrency = this.config.maxConcurrency!;
    const pending: Promise<ToolExecutionUpdate[]>[] = [];
    const results: ToolExecutionUpdate[] = [];

    for (const block of blocks) {
      if (pending.length >= maxConcurrency) {
        // 等待一个完成
        const completed = await Promise.race(pending);
        results.push(...completed);
        pending.splice(pending.indexOf(Promise.resolve(completed)), 1);
      }

      pending.push(this.executeToolAndCollect(block, assistantMessage, context));
    }

    // 等待所有剩余的完成
    const remaining = await Promise.all(pending);
    for (const updates of remaining) {
      results.push(...updates);
    }

    // 按顺序 yield 结果
    for (const update of results) {
      yield update;
    }
  }

  private async executeToolAndCollect(
    block: ToolUseBlock,
    assistantMessage: AssistantMessage,
    context: ToolUseContext
  ): Promise<ToolExecutionUpdate[]> {
    const updates: ToolExecutionUpdate[] = [];
    for await (const update of this.runSingleTool(block, assistantMessage, context)) {
      updates.push(update);
    }
    return updates;
  }

  /**
   * 串行执行工具
   */
  private async *runToolsSerially(
    blocks: ToolUseBlock[],
    assistantMessage: AssistantMessage,
    context: ToolUseContext
  ): AsyncGenerator<ToolExecutionUpdate, void> {
    for (const block of blocks) {
      if (this.abortController.signal.aborted) {
        yield {
          type: 'message',
          message: createToolResultMessage(
            block.id,
            'Execution interrupted by user',
            true,
            assistantMessage.uuid
          ),
        };
        break;
      }

      yield* this.runSingleTool(block, assistantMessage, context);
    }
  }

  /**
   * 执行单个工具
   */
  private async *runSingleTool(
    block: ToolUseBlock,
    assistantMessage: AssistantMessage,
    context: ToolUseContext
  ): AsyncGenerator<ToolExecutionUpdate, void> {
    const { id: toolUseId, name: toolName, input } = block;
    const startTime = Date.now();

    this.inProgressToolIds.add(toolUseId);

    try {
      const tool = this.tools.get(toolName);

      if (!tool) {
        yield {
          type: 'message',
          message: createToolResultMessage(
            toolUseId,
            `Unknown tool: ${toolName}`,
            true,
            assistantMessage.uuid
          ),
        };
        return;
      }

      // 验证输入
      const validation = await tool.validateInput?.(input, context);
      if (validation && !validation.valid) {
        yield {
          type: 'message',
          message: createToolResultMessage(
            toolUseId,
            `Input validation error: ${validation.error}`,
            true,
            assistantMessage.uuid
          ),
        };
        return;
      }

      // 检查权限
      const permission = await tool.checkPermissions(input, context);
      if (permission.behavior !== 'allow') {
        yield {
          type: 'message',
          message: createToolResultMessage(
            toolUseId,
            permission.message || 'Permission denied',
            true,
            assistantMessage.uuid
          ),
        };
        return;
      }

      // 发送进度开始
      yield {
        type: 'progress',
        progress: createProgressMessage({
          toolUseID: toolUseId,
          data: { type: 'start', toolName },
        }),
      };

      // 执行工具
      const result = await tool.call(input, {
        ...context,
        toolUseId,
        abortSignal: this.abortController.signal,
      });

      const durationMs = Date.now() - startTime;

      // 发送进度完成
      yield {
        type: 'progress',
        progress: createProgressMessage({
          toolUseID: toolUseId,
          data: { type: 'complete', toolName, durationMs, success: true },
        }),
      };

      // 格式化结果
      const resultContent = this.formatToolResult(toolName, result);

      yield {
        type: 'message',
        message: createToolResultMessage(
          toolUseId,
          resultContent,
          false,
          assistantMessage.uuid
        ),
      };

      // 如果工具返回了 context modifier
      if (result.contextModifier) {
        yield {
          type: 'context_update',
          contextModifier: result.contextModifier,
        };
      }

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 发送进度失败
      yield {
        type: 'progress',
        progress: createProgressMessage({
          toolUseID: toolUseId,
          data: { type: 'error', toolName, durationMs, error: errorMessage },
        }),
      };

      yield {
        type: 'message',
        message: createToolResultMessage(
          toolUseId,
          errorMessage,
          true,
          assistantMessage.uuid
        ),
      };
    } finally {
      this.inProgressToolIds.delete(toolUseId);
    }
  }

  /**
   * 格式化工具结果为字符串
   */
  private formatToolResult(toolName: string, result: unknown): string {
    if (result === null || result === undefined) {
      return 'Tool executed successfully';
    }

    if (typeof result === 'string') {
      return result;
    }

    if (typeof result === 'object') {
      const data = (result as { data?: unknown }).data ?? result;
      
      // 特殊处理某些工具的输出格式
      if (toolName === 'Read' && typeof data === 'object') {
        const readResult = data as { type: string; file?: { content?: string } };
        if (readResult.type === 'text' && readResult.file?.content) {
          return readResult.file.content;
        }
      }

      if (toolName === 'Bash' && typeof data === 'object') {
        const bashResult = data as { stdout?: string; stderr?: string; exitCode?: number };
        let output = '';
        if (bashResult.stdout) output += bashResult.stdout;
        if (bashResult.stderr) output += '\n[stderr]\n' + bashResult.stderr;
        if (bashResult.exitCode !== 0) {
          output += `\n[exit code: ${bashResult.exitCode}]`;
        }
        return output.trim() || 'Command executed successfully';
      }

      if (toolName === 'Glob' && typeof data === 'object') {
        const globResult = data as { files?: string[]; count?: number };
        if (globResult.files) {
          return globResult.files.slice(0, 100).join('\n') + 
            (globResult.count && globResult.count > 100 ? `\n... and ${globResult.count - 100} more` : '');
        }
      }

      if (toolName === 'Grep' && typeof data === 'object') {
        const grepResult = data as { matches?: Array<{ file: string; line: number; content: string }> };
        if (grepResult.matches) {
          return grepResult.matches.slice(0, 50).map(m => 
            `${m.file}:${m.line}: ${m.content}`
          ).join('\n');
        }
      }

      return JSON.stringify(data, null, 2);
    }

    return String(result);
  }

  /**
   * 中止所有正在执行的工具
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * 重置中止控制器
   */
  reset(): void {
    this.abortController = new AbortController();
    this.inProgressToolIds.clear();
  }

  /**
   * 获取正在执行的工具 ID
   */
  getInProgressToolIds(): Set<string> {
    return new Set(this.inProgressToolIds);
  }
}

// ==================== 辅助函数 ====================

/**
 * 创建工具 Map
 */
export function createToolsMap(tools: Tool[]): Map<string, Tool> {
  return new Map(tools.map(tool => [tool.name, tool]));
}

/**
 * 运行工具并收集所有结果
 */
export async function runToolsAndCollect(
  executor: ToolExecutor,
  toolUseBlocks: ToolUseBlock[],
  assistantMessage: AssistantMessage,
  context: ToolUseContext
): Promise<{ messages: Message[]; results: ToolCallResult[] }> {
  const messages: Message[] = [];
  const results: ToolCallResult[] = [];

  for await (const update of executor.runTools(toolUseBlocks, assistantMessage, context)) {
    if (update.message) {
      messages.push(update.message);
      
      // 从消息中提取结果
      if (update.message.type === 'user') {
        const userMsg = update.message as UserMessage;
        const content = userMsg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const toolBlock = toolUseBlocks.find(t => t.id === block.tool_use_id);
              if (toolBlock) {
                results.push({
                  toolUseId: block.tool_use_id,
                  toolName: toolBlock.name,
                  input: toolBlock.input,
                  success: !block.is_error,
                  data: block.is_error ? undefined : block.content,
                  error: block.is_error ? block.content : undefined,
                });
              }
            }
          }
        }
      }
    }
  }

  return { messages, results };
}
