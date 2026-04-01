/**
 * RemoteTool - 远程会话管理工具
 * 参考 Claude Code CLI 源码实现
 * 
 * 功能：
 * - 创建远程会话
 * - 连接到远程会话
 * - 发送消息到远程会话
 * - 管理远程会话状态
 */

import { buildTool } from './buildTool';
import type { ToolInput, ToolOutput } from './types';

// ==================== 类型定义 ====================

export type RemoteAction = 
    | 'create'      // 创建新的远程会话
    | 'connect'     // 连接到现有会话
    | 'disconnect'  // 断开连接
    | 'send'        // 发送消息
    | 'status'      // 获取会话状态
    | 'list';       // 列出所有会话

export interface RemoteInput extends ToolInput {
    action: RemoteAction;
    session_id?: string;
    message?: string;
    config?: RemoteSessionConfig;
    host?: string;
    port?: number;
}

export interface RemoteSessionConfig {
    host?: string;
    port?: number;
    secure?: boolean;
    auth_token?: string;
}

export interface RemoteSession {
    id: string;
    status: 'connected' | 'disconnected' | 'connecting' | 'error';
    host: string;
    port: number;
    created_at: string;
    last_activity?: string;
    error?: string;
}

export interface RemoteOutput extends ToolOutput {
    action: RemoteAction;
    session?: RemoteSession;
    sessions?: RemoteSession[];
    message_sent?: boolean;
    response?: string;
    success: boolean;
    error?: string;
}

// ==================== 会话管理 ====================

const activeSessions: Map<string, RemoteSession> = new Map();
const sessionWebSockets: Map<string, WebSocket | null> = new Map();

function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ==================== RemoteTool 定义 ====================

export const RemoteTool = buildTool<RemoteInput, RemoteOutput>({
    name: 'Remote',
    description: '管理远程会话。支持创建、连接、断开、发送消息和查看状态。',
    
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['create', 'connect', 'disconnect', 'send', 'status', 'list'],
                description: '要执行的操作：create/connect/disconnect/send/status/list',
            },
            session_id: {
                type: 'string',
                description: '会话 ID（connect/disconnect/send/status 时需要）',
            },
            message: {
                type: 'string',
                description: '要发送的消息（send 时需要）',
            },
            host: {
                type: 'string',
                description: '远程主机地址',
            },
            port: {
                type: 'number',
                description: '端口号',
            },
        },
        required: ['action'],
    },
    
    isReadOnly() { return false; },
    isConcurrencySafe() { return false; },
    
    async validateInput(input: RemoteInput) {
        const { action, session_id, message } = input;
        const config = input.config || (input.host || input.port ? { host: input.host, port: input.port } : undefined);
        
        if (!action) {
            return { valid: false, error: 'Action is required' };
        }
        
        if (['connect', 'disconnect', 'send', 'status'].includes(action) && !session_id) {
            return { valid: false, error: `session_id is required for action: ${action}` };
        }
        
        if (action === 'send' && !message) {
            return { valid: false, error: 'message is required for send action' };
        }
        
        if (action === 'create' && config) {
            if (config.port && (config.port < 1 || config.port > 65535)) {
                return { valid: false, error: 'Invalid port number' };
            }
        }
        
        return { valid: true };
    },
    
    async call(input: RemoteInput, context): Promise<RemoteOutput> {
        const { action, session_id, message } = input;
        const config = input.config || (input.host || input.port ? { host: input.host, port: input.port } : undefined);
        
        switch (action) {
            case 'create':
                return handleCreate(config);
            case 'connect':
                return handleConnect(session_id!, config);
            case 'disconnect':
                return handleDisconnect(session_id!);
            case 'send':
                return handleSend(session_id!, message!);
            case 'status':
                return handleStatus(session_id!);
            case 'list':
                return handleList();
            default:
                return {
                    success: false,
                    error: `Unknown action: ${action}`,
                    action,
                };
        }
    },
    
    formatOutput(output: RemoteOutput): string {
        if (!output.success) {
            return `❌ Remote ${output.action} failed: ${output.error}`;
        }
        
        switch (output.action) {
            case 'create':
            case 'connect':
                return formatSessionInfo('📡', output.action, output.session!);
            case 'disconnect':
                return `✅ Disconnected from session: ${output.session?.id}`;
            case 'send':
                return output.response 
                    ? `📤 Message sent\n📥 Response: ${output.response}`
                    : '📤 Message sent';
            case 'status':
                return formatSessionInfo('ℹ️', 'status', output.session!);
            case 'list':
                return formatSessionList(output.sessions || []);
            default:
                return `✅ ${output.action} completed`;
        }
    },
});

// ==================== Action Handlers ====================

async function handleCreate(config?: RemoteSessionConfig): Promise<RemoteOutput> {
    const sessionId = generateSessionId();
    const host = config?.host || 'localhost';
    const port = config?.port || 8080;
    
    const session: RemoteSession = {
        id: sessionId,
        status: 'disconnected',
        host,
        port,
        created_at: new Date().toISOString(),
    };
    
    activeSessions.set(sessionId, session);
    
    return {
        success: true,
        action: 'create',
        session,
    };
}

async function handleConnect(
    sessionId: string,
    config?: RemoteSessionConfig
): Promise<RemoteOutput> {
    let session = activeSessions.get(sessionId);
    
    if (!session && config) {
        // 创建新会话并连接
        const createResult = await handleCreate(config);
        if (!createResult.success) return createResult;
        session = createResult.session!;
        sessionId = session.id;
    }
    
    if (!session) {
        return {
            success: false,
            error: `Session not found: ${sessionId}`,
            action: 'connect',
        };
    }
    
    // 更新状态为连接中
    session.status = 'connecting';
    session.last_activity = new Date().toISOString();
    
    try {
        // 模拟 WebSocket 连接（实际实现需要真实的 WebSocket）
        const wsProtocol = config?.secure ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${session.host}:${session.port}`;
        
        // 在浏览器环境中使用 WebSocket
        if (typeof WebSocket !== 'undefined') {
            const ws = new WebSocket(wsUrl);
            
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);
                
                ws.onopen = () => {
                    clearTimeout(timeout);
                    session!.status = 'connected';
                    sessionWebSockets.set(sessionId, ws);
                    resolve();
                };
                
                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    reject(new Error('WebSocket connection failed'));
                };
            });
        } else {
            // Node.js 环境，模拟连接成功
            session.status = 'connected';
        }
        
        activeSessions.set(sessionId, session);
        
        return {
            success: true,
            action: 'connect',
            session,
        };
    } catch (error) {
        session.status = 'error';
        session.error = error instanceof Error ? error.message : String(error);
        activeSessions.set(sessionId, session);
        
        return {
            success: false,
            error: session.error,
            action: 'connect',
            session,
        };
    }
}

async function handleDisconnect(sessionId: string): Promise<RemoteOutput> {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return {
            success: false,
            error: `Session not found: ${sessionId}`,
            action: 'disconnect',
        };
    }
    
    // 关闭 WebSocket
    const ws = sessionWebSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    sessionWebSockets.delete(sessionId);
    
    // 更新状态
    session.status = 'disconnected';
    session.last_activity = new Date().toISOString();
    activeSessions.set(sessionId, session);
    
    return {
        success: true,
        action: 'disconnect',
        session,
    };
}

async function handleSend(sessionId: string, message: string): Promise<RemoteOutput> {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return {
            success: false,
            error: `Session not found: ${sessionId}`,
            action: 'send',
        };
    }
    
    if (session.status !== 'connected') {
        return {
            success: false,
            error: `Session is not connected (status: ${session.status})`,
            action: 'send',
        };
    }
    
    const ws = sessionWebSockets.get(sessionId);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', content: message }));
        session.last_activity = new Date().toISOString();
        activeSessions.set(sessionId, session);
        
        return {
            success: true,
            action: 'send',
            message_sent: true,
            session,
        };
    }
    
    // 模拟发送（当没有真实 WebSocket 时）
    session.last_activity = new Date().toISOString();
    activeSessions.set(sessionId, session);
    
    return {
        success: true,
        action: 'send',
        message_sent: true,
        response: `[Simulated] Echo: ${message}`,
        session,
    };
}

async function handleStatus(sessionId: string): Promise<RemoteOutput> {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return {
            success: false,
            error: `Session not found: ${sessionId}`,
            action: 'status',
        };
    }
    
    return {
        success: true,
        action: 'status',
        session,
    };
}

async function handleList(): Promise<RemoteOutput> {
    const sessions = Array.from(activeSessions.values());
    
    return {
        success: true,
        action: 'list',
        sessions,
    };
}

// ==================== Formatters ====================

function formatSessionInfo(icon: string, action: string, session: RemoteSession): string {
    let result = `${icon} Session ${action}:\n`;
    result += `  ID: ${session.id}\n`;
    result += `  Status: ${session.status}\n`;
    result += `  Host: ${session.host}:${session.port}\n`;
    result += `  Created: ${session.created_at}\n`;
    if (session.last_activity) {
        result += `  Last Activity: ${session.last_activity}\n`;
    }
    if (session.error) {
        result += `  Error: ${session.error}\n`;
    }
    return result;
}

function formatSessionList(sessions: RemoteSession[]): string {
    if (sessions.length === 0) {
        return '📋 No active sessions';
    }
    
    let result = `📋 Active Sessions (${sessions.length}):\n\n`;
    
    sessions.forEach((session, index) => {
        const statusIcon = session.status === 'connected' ? '🟢' : 
                          session.status === 'connecting' ? '🟡' : 
                          session.status === 'error' ? '🔴' : '⚪';
        result += `${index + 1}. ${statusIcon} ${session.id}\n`;
        result += `   ${session.host}:${session.port}\n`;
        result += `   Status: ${session.status}\n\n`;
    });
    
    return result;
}

// ==================== 导出工具函数 ====================

export function getActiveSession(sessionId: string): RemoteSession | undefined {
    return activeSessions.get(sessionId);
}

export function getAllSessions(): RemoteSession[] {
    return Array.from(activeSessions.values());
}

export function clearAllSessions(): void {
    // 关闭所有 WebSocket
    sessionWebSockets.forEach((ws) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    });
    sessionWebSockets.clear();
    activeSessions.clear();
}

export default RemoteTool;
