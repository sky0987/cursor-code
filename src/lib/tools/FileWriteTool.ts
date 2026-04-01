/**
 * 文件写入工具
 * 参考 Claude Code CLI 的 FileWriteTool
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface FileWriteInput {
  file_path: string;
  content: string;
  create_directories?: boolean;
}

export interface FileWriteOutput {
  success: boolean;
  filePath: string;
  bytesWritten: number;
  created: boolean;
}

export const FileWriteTool = buildTool<FileWriteInput, FileWriteOutput>({
  name: 'Write',
  description: '创建或覆写文件内容。如果文件已存在，将被完全覆盖。对于小修改，请使用 Edit 工具。',
  
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要写入的文件的绝对路径',
      },
      content: {
        type: 'string',
        description: '要写入的文件内容',
      },
      create_directories: {
        type: 'boolean',
        description: '如果父目录不存在，是否自动创建',
        optional: true,
      },
    },
    required: ['file_path', 'content'],
  },
  
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  
  async checkPermissions(input: FileWriteInput, context: ToolUseContext): Promise<PermissionResult> {
    const { file_path } = input;
    const { permissionContext } = context;
    
    // 检查路径是否在拒绝列表中
    for (const deniedPath of permissionContext.deniedPaths) {
      if (file_path.startsWith(deniedPath)) {
        return {
          behavior: 'deny',
          message: `路径 ${file_path} 在拒绝列表中`,
        };
      }
    }
    
    // 检查是否需要用户确认
    if (permissionContext.mode === 'default') {
      return {
        behavior: 'ask',
        message: `是否允许写入文件 ${file_path}？`,
      };
    }
    
    return { behavior: 'allow' };
  },
  
  async validateInput(input: FileWriteInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.file_path) {
      return { valid: false, error: '文件路径不能为空' };
    }
    
    if (input.content === undefined || input.content === null) {
      return { valid: false, error: '文件内容不能为空' };
    }
    
    return { valid: true };
  },
  
  async call(input: FileWriteInput, context: ToolUseContext): Promise<ToolResult<FileWriteOutput>> {
    return {
      success: true,
      data: {
        success: true,
        filePath: input.file_path,
        bytesWritten: Buffer.byteLength(input.content, 'utf8'),
        created: true,
      },
    };
  },
  
  userFacingName: (input) => {
    if (input?.file_path) {
      const parts = input.file_path.split(/[/\\]/);
      return parts[parts.length - 1] || 'Write';
    }
    return 'Write';
  },
  
  getToolUseSummary: (input) => {
    if (input?.file_path) {
      const parts = input.file_path.split(/[/\\]/);
      return parts[parts.length - 1] || null;
    }
    return null;
  },
});
