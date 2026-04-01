/**
 * 文件读取工具
 * 参考 Claude Code CLI 的 FileReadTool
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface FileReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface FileReadOutput {
  type: 'text' | 'image' | 'binary';
  file: {
    filePath: string;
    content?: string;
    base64?: string;
    numLines?: number;
    startLine?: number;
    totalLines?: number;
    size?: number;
    mimeType?: string;
  };
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'];
const BINARY_EXTENSIONS = ['pdf', 'zip', 'rar', 'tar', 'gz', '7z', 'exe', 'dll', 'so', 'dylib'];

export const FileReadTool = buildTool<FileReadInput, FileReadOutput>({
  name: 'Read',
  description: '读取文件内容。支持文本文件、图片和 PDF。对于大文件，可以使用 offset 和 limit 参数分段读取。',
  
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要读取的文件的绝对路径',
      },
      offset: {
        type: 'number',
        description: '开始读取的行号（从1开始）。仅在文件过大时使用',
        optional: true,
      },
      limit: {
        type: 'number',
        description: '要读取的行数。仅在文件过大时使用',
        optional: true,
      },
    },
    required: ['file_path'],
  },
  
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  
  async checkPermissions(input: FileReadInput, context: ToolUseContext): Promise<PermissionResult> {
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
    
    return { behavior: 'allow' };
  },
  
  async validateInput(input: FileReadInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.file_path) {
      return { valid: false, error: '文件路径不能为空' };
    }
    
    if (input.offset !== undefined && input.offset < 0) {
      return { valid: false, error: 'offset 必须大于等于 0' };
    }
    
    if (input.limit !== undefined && input.limit <= 0) {
      return { valid: false, error: 'limit 必须大于 0' };
    }
    
    return { valid: true };
  },
  
  async call(input: FileReadInput, context: ToolUseContext): Promise<ToolResult<FileReadOutput>> {
    // 这个函数将在 Electron 主进程中被调用
    // 返回的是占位符，实际实现在 electron.js 中
    return {
      success: true,
      data: {
        type: 'text',
        file: {
          filePath: input.file_path,
          content: '',
          numLines: 0,
          startLine: input.offset || 1,
          totalLines: 0,
        },
      },
    };
  },
  
  userFacingName: (input) => {
    if (input?.file_path) {
      const parts = input.file_path.split(/[/\\]/);
      return parts[parts.length - 1] || 'Read';
    }
    return 'Read';
  },
  
  getToolUseSummary: (input) => {
    if (input?.file_path) {
      const parts = input.file_path.split(/[/\\]/);
      return parts[parts.length - 1] || null;
    }
    return null;
  },
});
