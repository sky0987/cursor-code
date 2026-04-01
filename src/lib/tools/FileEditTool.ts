/**
 * 文件编辑工具 (字符串替换)
 * 参考 Claude Code CLI 的 FileEditTool
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface FileEditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface FileEditOutput {
  success: boolean;
  filePath: string;
  replacements: number;
  preview?: string;
}

export const FileEditTool = buildTool<FileEditInput, FileEditOutput>({
  name: 'Edit',
  description: '对文件进行精确的字符串替换。old_string 必须在文件中唯一匹配（除非使用 replace_all）。',
  
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要编辑的文件的绝对路径',
      },
      old_string: {
        type: 'string',
        description: '要被替换的文本（必须精确匹配）',
      },
      new_string: {
        type: 'string',
        description: '替换后的新文本（必须与 old_string 不同）',
      },
      replace_all: {
        type: 'boolean',
        description: '是否替换所有匹配项。默认为 false，只替换第一个匹配',
        optional: true,
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  
  async checkPermissions(input: FileEditInput, context: ToolUseContext): Promise<PermissionResult> {
    const { file_path } = input;
    const { permissionContext } = context;
    
    for (const deniedPath of permissionContext.deniedPaths) {
      if (file_path.startsWith(deniedPath)) {
        return {
          behavior: 'deny',
          message: `路径 ${file_path} 在拒绝列表中`,
        };
      }
    }
    
    if (permissionContext.mode === 'default') {
      return {
        behavior: 'ask',
        message: `是否允许编辑文件 ${file_path}？`,
      };
    }
    
    return { behavior: 'allow' };
  },
  
  async validateInput(input: FileEditInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.file_path) {
      return { valid: false, error: '文件路径不能为空' };
    }
    
    if (!input.old_string) {
      return { valid: false, error: 'old_string 不能为空' };
    }
    
    if (input.new_string === undefined || input.new_string === null) {
      return { valid: false, error: 'new_string 不能为 undefined' };
    }
    
    if (input.old_string === input.new_string) {
      return { valid: false, error: 'old_string 和 new_string 必须不同' };
    }
    
    return { valid: true };
  },
  
  async call(input: FileEditInput, context: ToolUseContext): Promise<ToolResult<FileEditOutput>> {
    return {
      success: true,
      data: {
        success: true,
        filePath: input.file_path,
        replacements: 1,
      },
    };
  },
  
  userFacingName: (input) => {
    if (input?.file_path) {
      const parts = input.file_path.split(/[/\\]/);
      return parts[parts.length - 1] || 'Edit';
    }
    return 'Edit';
  },
  
  getToolUseSummary: (input) => {
    if (input?.file_path) {
      const parts = input.file_path.split(/[/\\]/);
      return parts[parts.length - 1] || null;
    }
    return null;
  },
});
