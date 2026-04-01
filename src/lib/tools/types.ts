/**
 * 工具系统类型定义
 * 参考 Claude Code CLI 的架构设计
 */

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    optional?: boolean;
    enum?: string[];
  }>;
  required?: string[];
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  contextModifier?: (context: ToolUseContext) => ToolUseContext;
  newMessages?: unknown[];
}

export interface ToolCallProgress {
  type: 'progress';
  toolName: string;
  message: string;
  percentage?: number;
}

export interface ToolPermissionContext {
  mode: 'default' | 'auto' | 'plan';
  workingDirectory: string;
  allowedTools: string[];
  deniedTools: string[];
  allowedPaths: string[];
  deniedPaths: string[];
}

export interface ToolUseContext {
  workingDirectory: string;
  permissionContext: ToolPermissionContext;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ToolCallProgress) => void;
  toolUseId?: string;
  messages?: unknown[];
  userModified?: boolean;
}

export type PermissionResult = 
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string }
  | { behavior: 'ask'; message: string };

export interface Tool<Input = any, Output = any> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  
  isEnabled(): boolean;
  isReadOnly(input: Input): boolean;
  isConcurrencySafe(input: Input): boolean;
  
  checkPermissions(input: Input, context: ToolUseContext): Promise<PermissionResult>;
  validateInput(input: Input, context: ToolUseContext): Promise<{ valid: boolean; error?: string }>;
  call(input: Input, context: ToolUseContext): Promise<ToolResult<Output>>;
  
  userFacingName(input?: Partial<Input>): string;
  getToolUseSummary?(input?: Partial<Input>): string | null;
}

export type Tools = Tool<any, any>[];

export interface ToolCallRequest {
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string;
}

export interface ToolCallResult {
  toolUseId: string;
  toolName: string;
  success: boolean;
  output?: unknown;
  error?: string;
  isBackgrounded?: boolean;
}

export const DEFAULT_PERMISSION_CONTEXT: ToolPermissionContext = {
  mode: 'default',
  workingDirectory: '',
  allowedTools: [],
  deniedTools: [],
  allowedPaths: [],
  deniedPaths: [],
};

// 简化的输入输出基类型
export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}
