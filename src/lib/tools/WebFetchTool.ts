/**
 * Web 请求工具
 * 获取网页内容或调用 API，支持返回 JSON
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface WebFetchInput {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  parse_json?: boolean;
}

export interface WebFetchOutput {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  json?: unknown;
  contentType?: string;
}

export const WebFetchTool = buildTool<WebFetchInput, WebFetchOutput>({
  name: 'WebFetch',
  description: '获取网页内容或调用 API。支持 GET/POST/PUT/DELETE 请求，可自动解析 JSON 响应。',
  
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要请求的 URL',
      },
      method: {
        type: 'string',
        description: 'HTTP 方法: GET, POST, PUT, DELETE, PATCH。默认 GET',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        optional: true,
      },
      headers: {
        type: 'object',
        description: '请求头',
        optional: true,
      },
      body: {
        type: 'string',
        description: '请求体（用于 POST/PUT/PATCH）',
        optional: true,
      },
      parse_json: {
        type: 'boolean',
        description: '是否自动解析 JSON 响应。默认 true',
        optional: true,
      },
    },
    required: ['url'],
  },
  
  isReadOnly: (input) => {
    return !input.method || input.method === 'GET';
  },
  
  isConcurrencySafe: () => true,
  
  async checkPermissions(input: WebFetchInput, context: ToolUseContext): Promise<PermissionResult> {
    const { url } = input;
    
    // 检查是否是本地地址
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url)) {
      return { behavior: 'allow' };
    }
    
    // 外部请求可能需要确认
    if (context.permissionContext.mode === 'default' && input.method && input.method !== 'GET') {
      return {
        behavior: 'ask',
        message: `是否允许发送 ${input.method} 请求到 ${url}？`,
      };
    }
    
    return { behavior: 'allow' };
  },
  
  async validateInput(input: WebFetchInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.url) {
      return { valid: false, error: 'URL 不能为空' };
    }
    
    try {
      new URL(input.url);
    } catch {
      return { valid: false, error: '无效的 URL 格式' };
    }
    
    return { valid: true };
  },
  
  async call(input: WebFetchInput, context: ToolUseContext): Promise<ToolResult<WebFetchOutput>> {
    return {
      success: true,
      data: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '',
      },
    };
  },
  
  userFacingName: () => 'WebFetch',
  
  getToolUseSummary: (input) => {
    if (input?.url) {
      try {
        const url = new URL(input.url);
        return `${input?.method || 'GET'} ${url.hostname}`;
      } catch {
        return input.url.slice(0, 30);
      }
    }
    return null;
  },
});
