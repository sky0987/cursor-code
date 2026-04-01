/**
 * Bash/Shell 命令执行工具
 * 参考 Claude Code CLI 的 BashTool
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

export interface BashInput {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
}

export interface BashOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  interrupted: boolean;
  backgroundTaskId?: string;
  duration?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMEOUT_MS = 300000;

const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
];

const SAFE_COMMANDS = [
  'ls', 'pwd', 'echo', 'cat', 'head', 'tail', 'grep', 'find',
  'git status', 'git log', 'git diff', 'git branch',
  'npm list', 'npm outdated', 'npm --version',
  'node --version', 'python --version',
  'which', 'whereis', 'type',
  'date', 'whoami', 'hostname',
];

function isDangerousCommand(command: string): boolean {
  const lowerCmd = command.toLowerCase().trim();
  return DANGEROUS_COMMANDS.some(dc => lowerCmd.includes(dc.toLowerCase()));
}

function isSafeCommand(command: string): boolean {
  const lowerCmd = command.toLowerCase().trim();
  return SAFE_COMMANDS.some(sc => lowerCmd.startsWith(sc.toLowerCase()));
}

export const BashTool = buildTool<BashInput, BashOutput>({
  name: 'Bash',
  description: '执行 shell 命令。使用此工具运行系统命令、脚本或与文件系统交互。',
  
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的命令',
      },
      timeout: {
        type: 'number',
        description: `可选的超时时间（毫秒）。默认 ${DEFAULT_TIMEOUT_MS}ms，最大 ${MAX_TIMEOUT_MS}ms`,
        optional: true,
      },
      description: {
        type: 'string',
        description: '命令的简短描述（5-10个词）',
        optional: true,
      },
      run_in_background: {
        type: 'boolean',
        description: '是否在后台运行此命令',
        optional: true,
      },
    },
    required: ['command'],
  },
  
  isReadOnly: (input) => {
    return isSafeCommand(input.command);
  },
  
  isConcurrencySafe: (input) => {
    return isSafeCommand(input.command);
  },
  
  async checkPermissions(input: BashInput, context: ToolUseContext): Promise<PermissionResult> {
    const { command } = input;
    const { permissionContext } = context;
    
    // 检查是否是危险命令
    if (isDangerousCommand(command)) {
      return {
        behavior: 'deny',
        message: `命令 "${command}" 被视为危险命令，已被拒绝`,
      };
    }
    
    // 安全命令自动允许
    if (isSafeCommand(command)) {
      return { behavior: 'allow' };
    }
    
    // 其他命令需要用户确认
    if (permissionContext.mode === 'default') {
      return {
        behavior: 'ask',
        message: `是否允许执行命令: ${command}？`,
      };
    }
    
    return { behavior: 'allow' };
  },
  
  async validateInput(input: BashInput): Promise<{ valid: boolean; error?: string }> {
    if (!input.command || !input.command.trim()) {
      return { valid: false, error: '命令不能为空' };
    }
    
    if (input.timeout !== undefined) {
      if (input.timeout < 0) {
        return { valid: false, error: '超时时间不能为负数' };
      }
      if (input.timeout > MAX_TIMEOUT_MS) {
        return { valid: false, error: `超时时间不能超过 ${MAX_TIMEOUT_MS}ms` };
      }
    }
    
    return { valid: true };
  },
  
  async call(input: BashInput, context: ToolUseContext): Promise<ToolResult<BashOutput>> {
    return {
      success: true,
      data: {
        stdout: '',
        stderr: '',
        exitCode: 0,
        interrupted: false,
      },
    };
  },
  
  userFacingName: (input) => {
    if (input?.command) {
      const parts = input.command.split(/\s+/);
      return parts[0] || 'Bash';
    }
    return 'Bash';
  },
  
  getToolUseSummary: (input) => {
    if (input?.description) {
      return input.description;
    }
    if (input?.command) {
      const maxLen = 50;
      if (input.command.length <= maxLen) {
        return input.command;
      }
      return input.command.substring(0, maxLen - 3) + '...';
    }
    return null;
  },
});
