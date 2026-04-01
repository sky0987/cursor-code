/**
 * 工具构建器
 * 参考 Claude Code CLI 的 buildTool 函数
 */

import { Tool, ToolInputSchema, ToolResult, ToolUseContext, PermissionResult } from './types';

export interface ToolDefinition<Input = Record<string, unknown>, Output = unknown> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  
  isEnabled?: () => boolean;
  isReadOnly?: (input: Input) => boolean;
  isConcurrencySafe?: (input: Input) => boolean;
  
  checkPermissions?: (input: Input, context: ToolUseContext) => Promise<PermissionResult>;
  validateInput?: (input: Input, context: ToolUseContext) => Promise<{ valid: boolean; error?: string }>;
  call: (input: Input, context: ToolUseContext) => Promise<ToolResult<Output> | Output>;
  
  userFacingName?: (input?: Partial<Input>) => string;
  getToolUseSummary?: (input?: Partial<Input>) => string | null;
  formatOutput?: (output: Output) => string;
}

const DEFAULT_METHODS = {
  isEnabled: () => true,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  checkPermissions: async (): Promise<PermissionResult> => ({ behavior: 'allow' }),
  validateInput: async () => ({ valid: true }),
  userFacingName: function(this: { name: string }) { return this.name; },
  getToolUseSummary: () => null,
};

export function buildTool<Input = Record<string, unknown>, Output = unknown>(
  def: ToolDefinition<Input, Output>
): Tool<Input, Output> {
  return {
    ...DEFAULT_METHODS,
    ...def,
    userFacingName: def.userFacingName || (() => def.name),
  } as Tool<Input, Output>;
}
