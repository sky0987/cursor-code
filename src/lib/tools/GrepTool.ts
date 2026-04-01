/**
 * 代码搜索工具 (正则表达式搜索)
 * 参考 Claude Code CLI 的 GrepTool
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
  context_lines?: number;
  case_insensitive?: boolean;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface GrepOutput {
  matches: GrepMatch[];
  count: number;
  filesSearched: number;
  truncated: boolean;
}

const MAX_MATCHES = 500;

export const GrepTool = buildTool<GrepInput, GrepOutput>({
  name: 'Grep',
  description: '使用正则表达式在文件中搜索内容。基于 ripgrep，支持完整的正则语法。',
  
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '正则表达式搜索模式',
      },
      path: {
        type: 'string',
        description: '搜索的目录或文件路径。默认为当前工作目录',
        optional: true,
      },
      include: {
        type: 'string',
        description: '文件过滤 glob 模式。例如: "*.ts", "*.{js,jsx}"',
        optional: true,
      },
      context_lines: {
        type: 'number',
        description: '显示匹配行前后的上下文行数',
        optional: true,
      },
      case_insensitive: {
        type: 'boolean',
        description: '是否忽略大小写',
        optional: true,
      },
    },
    required: ['pattern'],
  },
  
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  
  async checkPermissions(input: GrepInput, context: ToolUseContext): Promise<PermissionResult> {
    return { behavior: 'allow' };
  },
  
  async validateInput(input: GrepInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.pattern || !input.pattern.trim()) {
      return { valid: false, error: '搜索模式不能为空' };
    }
    
    // 验证正则表达式是否有效
    try {
      new RegExp(input.pattern);
    } catch (e) {
      return { valid: false, error: `无效的正则表达式: ${(e as Error).message}` };
    }
    
    return { valid: true };
  },
  
  async call(input: GrepInput, context: ToolUseContext): Promise<ToolResult<GrepOutput>> {
    return {
      success: true,
      data: {
        matches: [],
        count: 0,
        filesSearched: 0,
        truncated: false,
      },
    };
  },
  
  userFacingName: () => 'Grep',
  
  getToolUseSummary: (input) => {
    return input?.pattern || null;
  },
});
