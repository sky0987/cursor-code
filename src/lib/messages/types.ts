/**
 * 消息类型系统 - 参考 Claude Code CLI 的消息架构
 */

import { v4 as uuid } from 'uuid';

// ==================== 基础消息类型 ====================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface BaseMessage {
  uuid: string;
  type: string;
  timestamp: string;
}

// ==================== 用户消息 ====================

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  image: string;
  mimeType: string;
}

export type UserMessageContent = TextContent | ImageContent | ToolResultContent;

export interface UserMessage extends BaseMessage {
  type: 'user';
  message: {
    role: 'user';
    content: UserMessageContent[] | string;
  };
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  isMeta?: boolean;
}

// ==================== 助手消息 ====================

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export type AssistantContentBlock = TextBlock | ToolUseBlock | ThinkingBlock;

export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: AssistantContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    stop_reason?: string;
  };
  requestId?: string;
  isApiErrorMessage?: boolean;
  apiError?: string;
}

// ==================== 系统消息 ====================

export type SystemMessageLevel = 'info' | 'warning' | 'error';

export interface SystemMessage extends BaseMessage {
  type: 'system';
  level: SystemMessageLevel;
  message: string;
}

// ==================== 进度消息 ====================

export interface ToolProgressData {
  type: string;
  content?: string;
  [key: string]: unknown;
}

export interface ProgressMessage extends BaseMessage {
  type: 'progress';
  toolUseID: string;
  parentToolUseID?: string;
  data: ToolProgressData;
}

// ==================== 附件消息 ====================

export interface FileAttachment {
  type: 'file';
  filePath: string;
  content: string;
}

export interface ImageAttachment {
  type: 'image';
  filePath: string;
  base64: string;
  mimeType: string;
}

export interface HookStoppedAttachment {
  type: 'hook_stopped_continuation';
  message: string;
  hookName: string;
  toolUseID: string;
}

export type Attachment = FileAttachment | ImageAttachment | HookStoppedAttachment;

export interface AttachmentMessage extends BaseMessage {
  type: 'attachment';
  attachment: Attachment;
}

// ==================== 流事件 ====================

export interface StreamRequestStart {
  type: 'stream_request_start';
}

export interface StreamTextDelta {
  type: 'text_delta';
  delta: string;
  index: number;
}

export interface StreamToolUse {
  type: 'tool_use_start';
  toolUseId: string;
  toolName: string;
}

export interface StreamToolInputDelta {
  type: 'tool_input_delta';
  toolUseId: string;
  delta: string;
}

export interface StreamMessageEnd {
  type: 'message_end';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string;
}

export type StreamEvent = 
  | StreamRequestStart
  | StreamTextDelta
  | StreamToolUse
  | StreamToolInputDelta
  | StreamMessageEnd;

// ==================== 联合类型 ====================

export type Message = 
  | UserMessage 
  | AssistantMessage 
  | SystemMessage 
  | ProgressMessage 
  | AttachmentMessage;

// ==================== 工具调用结果 ====================

export interface ToolCallResult {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

// ==================== 查询参数 ====================

export interface QueryParams {
  messages: Message[];
  systemPrompt: string;
  model: string;
  maxTurns?: number;
  signal?: AbortSignal;
}

// ==================== 查询终止原因 ====================

export type TerminalReason = 
  | 'completed'
  | 'max_turns'
  | 'aborted'
  | 'error'
  | 'hook_stopped';

export interface TerminalResult {
  reason: TerminalReason;
  error?: Error;
  turnCount?: number;
}

// ==================== 消息创建辅助函数 ====================

export function createUserMessage(params: {
  content: UserMessageContent[] | string;
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  isMeta?: boolean;
}): UserMessage {
  return {
    uuid: uuid(),
    type: 'user',
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: params.content,
    },
    toolUseResult: params.toolUseResult,
    sourceToolAssistantUUID: params.sourceToolAssistantUUID,
    isMeta: params.isMeta,
  };
}

export function createAssistantMessage(params: {
  content: AssistantContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
  requestId?: string;
}): AssistantMessage {
  return {
    uuid: uuid(),
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: params.content,
      usage: params.usage,
      stop_reason: params.stop_reason,
    },
    requestId: params.requestId,
  };
}

export function createSystemMessage(
  message: string,
  level: SystemMessageLevel = 'info'
): SystemMessage {
  return {
    uuid: uuid(),
    type: 'system',
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

export function createProgressMessage(params: {
  toolUseID: string;
  parentToolUseID?: string;
  data: ToolProgressData;
}): ProgressMessage {
  return {
    uuid: uuid(),
    type: 'progress',
    timestamp: new Date().toISOString(),
    toolUseID: params.toolUseID,
    parentToolUseID: params.parentToolUseID,
    data: params.data,
  };
}

export function createToolResultMessage(
  toolUseId: string,
  content: string,
  isError: boolean = false,
  sourceAssistantUUID?: string
): UserMessage {
  return createUserMessage({
    content: [{
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: isError ? `<tool_use_error>${content}</tool_use_error>` : content,
      is_error: isError,
    }],
    toolUseResult: content,
    sourceToolAssistantUUID: sourceAssistantUUID,
  });
}

// ==================== 工具调用提取 ====================

export function extractToolUseBlocks(message: AssistantMessage): ToolUseBlock[] {
  return message.message.content.filter(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );
}

export function hasToolUse(message: AssistantMessage): boolean {
  return message.message.content.some(block => block.type === 'tool_use');
}
