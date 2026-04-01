/**
 * 文件搜索工具 (Glob 模式匹配)
 * 参考 Claude Code CLI 的 GlobTool
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface GlobInput {
  pattern: string;
  path?: string;
}

export interface GlobOutput {
  files: string[];
  count: number;
  truncated: boolean;
}

const MAX_RESULTS = 1000;

export const GlobTool = buildTool<GlobInput, GlobOutput>({
  name: 'Glob',
  description: '使用 glob 模式搜索文件。快速查找匹配特定模式的文件路径。',
  
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'glob 模式。例如: "**/*.ts", "src/**/*.js", "*.json"',
      },
      path: {
        type: 'string',
        description: '搜索的根目录。默认为当前工作目录',
        optional: true,
      },
    },
    required: ['pattern'],
  },
  
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  
  async checkPermissions(input: GlobInput, context: ToolUseContext): Promise<PermissionResult> {
    return { behavior: 'allow' };
  },
  
  async validateInput(input: GlobInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.pattern || !input.pattern.trim()) {
      return { valid: false, error: 'glob 模式不能为空' };
    }
    
    return { valid: true };
  },
  
  async call(input: GlobInput, context: ToolUseContext): Promise<ToolResult<GlobOutput>> {
    return {
      success: true,
      data: {
        files: [],
        count: 0,
        truncated: false,
      },
    };
  },
  
  userFacingName: () => 'Glob',
  
  getToolUseSummary: (input) => {
    return input?.pattern || null;
  },
});
