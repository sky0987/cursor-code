/**
 * Shell 工具 - 增强版命令执行
 * 参考 Claude Code CLI 的 BashTool 源码实现
 * 
 * 特性:
 * - 命令分类（搜索、读取、静默命令）
 * - 后台任务支持
 * - 超时控制
 * - 安全检查
 * - 进度报告
 */

import { buildTool } from './buildTool';
import { ToolResult, ToolUseContext, PermissionResult } from './types';

// ==================== 类型定义 ====================

export interface ShellInput {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
  working_directory?: string;
}

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  interrupted: boolean;
  backgroundTaskId?: string;
  duration?: number;
  isRemote?: boolean;
  noOutputExpected?: boolean;
  returnCodeInterpretation?: string;
}

export interface ShellProgress {
  type: 'shell_progress';
  output: string;
  fullOutput: string;
  elapsedTimeSeconds: number;
  totalLines: number;
  totalBytes: number;
  taskId?: string;
  timeoutMs?: number;
}

// ==================== 常量定义 ====================

const DEFAULT_TIMEOUT_MS = 60000; // 1分钟
const MAX_TIMEOUT_MS = 30 * 60 * 1000; // 30分钟
const PROGRESS_THRESHOLD_MS = 2000; // 2秒后显示进度

// 搜索命令 - 用于可折叠显示
const SHELL_SEARCH_COMMANDS = new Set([
  'find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis', 'fd'
]);

// 读取/查看命令 - 用于可折叠显示
const SHELL_READ_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more',
  'wc', 'stat', 'file', 'strings',
  'jq', 'awk', 'cut', 'sort', 'uniq', 'tr'
]);

// 目录列表命令
const SHELL_LIST_COMMANDS = new Set(['ls', 'dir', 'tree', 'du', 'df']);

// 语义中性命令 - 不改变操作性质
const SHELL_NEUTRAL_COMMANDS = new Set(['echo', 'printf', 'true', 'false', ':']);

// 静默命令 - 成功时通常无输出
const SHELL_SILENT_COMMANDS = new Set([
  'mv', 'cp', 'rm', 'mkdir', 'rmdir', 'chmod', 'chown', 'chgrp',
  'touch', 'ln', 'cd', 'export', 'unset', 'wait', 'clear'
]);

// 常见后台命令
const COMMON_BACKGROUND_COMMANDS = [
  'npm', 'yarn', 'pnpm', 'node', 'python', 'python3', 'go', 'cargo',
  'make', 'docker', 'docker-compose', 'terraform', 'webpack', 'vite',
  'jest', 'pytest', 'curl', 'wget', 'build', 'test', 'serve', 'watch', 'dev'
];

// 危险命令模式
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,
  /rm\s+-rf\s+\*/,
  /mkfs\./,
  /dd\s+if=/,
  /:[()\s]*{.*};/,  // Fork bomb
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777\s+\//,
  /:(){ :|:& };:/,
];

// 需要确认的命令前缀
const NEEDS_CONFIRMATION_PREFIXES = [
  'rm', 'rmdir', 'sudo', 'kill', 'pkill', 'killall',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'format', 'fdisk', 'parted',
  'npm publish', 'yarn publish',
  'git push --force', 'git reset --hard',
  'docker rm', 'docker rmi', 'docker system prune',
];

// 安全命令 - 自动允许
const SAFE_COMMAND_PREFIXES = [
  'ls', 'pwd', 'echo', 'cat', 'head', 'tail', 'grep', 'find', 'which',
  'git status', 'git log', 'git diff', 'git branch', 'git show',
  'npm list', 'npm outdated', 'npm --version', 'npm run',
  'node --version', 'python --version', 'pip list',
  'date', 'whoami', 'hostname', 'uname', 'env', 'printenv',
  'docker ps', 'docker images', 'docker logs',
  'systemctl status', 'service status',
  'ping', 'curl', 'wget', 'nc', 'netstat', 'ss', 'ip addr',
];

// ==================== 辅助函数 ====================

/**
 * 分割命令为子命令（处理管道、分号、&&、||）
 */
function splitCommandParts(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0; // 括号深度
  let inQuote = '';
  
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const prevChar = i > 0 ? command[i - 1] : '';
    
    // 处理引号
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inQuote) {
        inQuote = char;
      } else if (inQuote === char) {
        inQuote = '';
      }
      current += char;
      continue;
    }
    
    // 在引号内，直接添加字符
    if (inQuote) {
      current += char;
      continue;
    }
    
    // 处理括号
    if (char === '(' || char === '{' || char === '[') {
      depth++;
      current += char;
      continue;
    }
    if (char === ')' || char === '}' || char === ']') {
      depth--;
      current += char;
      continue;
    }
    
    // 在括号内，直接添加字符
    if (depth > 0) {
      current += char;
      continue;
    }
    
    // 处理操作符
    if (char === '|' || char === '&' || char === ';') {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      
      // 跳过双字符操作符
      if ((char === '|' || char === '&') && command[i + 1] === char) {
        i++;
      }
      continue;
    }
    
    current += char;
  }
  
  if (current.trim()) {
    parts.push(current.trim());
  }
  
  return parts;
}

/**
 * 获取命令的基础名称
 */
function getBaseCommand(command: string): string {
  const trimmed = command.trim();
  // 跳过环境变量赋值
  const parts = trimmed.split(/\s+/);
  for (const part of parts) {
    if (!part.includes('=')) {
      return part;
    }
  }
  return parts[0] || '';
}

/**
 * 检查命令是否是搜索或读取操作
 */
export function isSearchOrReadCommand(command: string): {
  isSearch: boolean;
  isRead: boolean;
  isList: boolean;
} {
  const parts = splitCommandParts(command);
  
  if (parts.length === 0) {
    return { isSearch: false, isRead: false, isList: false };
  }
  
  let hasSearch = false;
  let hasRead = false;
  let hasList = false;
  let hasNonNeutral = false;
  
  for (const part of parts) {
    const baseCmd = getBaseCommand(part);
    if (!baseCmd) continue;
    
    if (SHELL_NEUTRAL_COMMANDS.has(baseCmd)) {
      continue;
    }
    
    hasNonNeutral = true;
    
    const isSearch = SHELL_SEARCH_COMMANDS.has(baseCmd);
    const isRead = SHELL_READ_COMMANDS.has(baseCmd);
    const isList = SHELL_LIST_COMMANDS.has(baseCmd);
    
    if (!isSearch && !isRead && !isList) {
      return { isSearch: false, isRead: false, isList: false };
    }
    
    if (isSearch) hasSearch = true;
    if (isRead) hasRead = true;
    if (isList) hasList = true;
  }
  
  if (!hasNonNeutral) {
    return { isSearch: false, isRead: false, isList: false };
  }
  
  return { isSearch: hasSearch, isRead: hasRead, isList: hasList };
}

/**
 * 检查命令是否预期无输出
 */
export function isSilentCommand(command: string): boolean {
  const parts = splitCommandParts(command);
  
  if (parts.length === 0) return false;
  
  for (const part of parts) {
    const baseCmd = getBaseCommand(part);
    if (!baseCmd) continue;
    
    if (!SHELL_SILENT_COMMANDS.has(baseCmd) && !SHELL_NEUTRAL_COMMANDS.has(baseCmd)) {
      return false;
    }
  }
  
  return true;
}

/**
 * 检查是否是危险命令
 */
function isDangerousCommand(command: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

/**
 * 检查是否是安全命令
 */
function isSafeCommand(command: string): boolean {
  const lowerCmd = command.toLowerCase().trim();
  return SAFE_COMMAND_PREFIXES.some(prefix => 
    lowerCmd.startsWith(prefix.toLowerCase())
  );
}

/**
 * 检查是否需要确认
 */
function needsConfirmation(command: string): boolean {
  const lowerCmd = command.toLowerCase().trim();
  return NEEDS_CONFIRMATION_PREFIXES.some(prefix => 
    lowerCmd.startsWith(prefix.toLowerCase())
  );
}

/**
 * 获取命令类型（用于分析）
 */
export function getCommandType(command: string): string {
  const baseCmd = getBaseCommand(command);
  
  if (COMMON_BACKGROUND_COMMANDS.includes(baseCmd)) {
    return baseCmd;
  }
  
  return 'other';
}

/**
 * 检测 sleep 模式（应使用后台运行）
 */
export function detectBlockingSleepPattern(command: string): string | null {
  const parts = splitCommandParts(command);
  if (parts.length === 0) return null;
  
  const first = parts[0]?.trim() || '';
  const match = /^sleep\s+(\d+)\s*$/.exec(first);
  
  if (!match) return null;
  
  const secs = parseInt(match[1], 10);
  if (secs < 2) return null; // 短睡眠是允许的
  
  const rest = parts.slice(1).join(' ').trim();
  return rest 
    ? `sleep ${secs} followed by: ${rest}` 
    : `standalone sleep ${secs}`;
}

/**
 * 格式化执行时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

// ==================== Shell 工具定义 ====================

export const ShellTool = buildTool<ShellInput, ShellOutput>({
  name: 'Shell',
  description: `执行 shell 命令。支持后台运行、超时控制、进度报告。

常用参数:
- command: 要执行的命令（必需）
- timeout: 超时时间（毫秒），默认 ${DEFAULT_TIMEOUT_MS / 1000}秒，最大 ${MAX_TIMEOUT_MS / 1000 / 60}分钟
- description: 命令的简短描述
- run_in_background: 是否在后台运行
- working_directory: 工作目录（可选）

示例:
- ls -la: 列出文件
- git status: 查看 Git 状态
- npm install: 安装依赖（建议后台运行）
- docker ps: 查看容器`,

  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令',
      },
      timeout: {
        type: 'number',
        description: `超时时间（毫秒）。默认 ${DEFAULT_TIMEOUT_MS}，最大 ${MAX_TIMEOUT_MS}`,
        optional: true,
      },
      description: {
        type: 'string',
        description: '命令的简短描述（5-10 词），便于理解命令目的',
        optional: true,
      },
      run_in_background: {
        type: 'boolean',
        description: '是否在后台运行。适合长时间运行的命令（npm install, docker build 等）',
        optional: true,
      },
      working_directory: {
        type: 'string',
        description: '命令执行的工作目录。默认为当前目录',
        optional: true,
      },
    },
    required: ['command'],
  },
  
  isReadOnly(input) {
    const { isSearch, isRead, isList } = isSearchOrReadCommand(input.command);
    return isSearch || isRead || isList;
  },
  
  isConcurrencySafe(input) {
    return this.isReadOnly?.(input) ?? false;
  },
  
  async validateInput(input: ShellInput): Promise<{ valid: boolean; error?: string }> {
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
    
    // 检测阻塞的 sleep 模式
    if (!input.run_in_background) {
      const sleepPattern = detectBlockingSleepPattern(input.command);
      if (sleepPattern) {
        return {
          valid: false,
          error: `检测到阻塞的 sleep 模式: ${sleepPattern}。请使用 run_in_background: true 在后台运行，或保持 sleep 时间在 2 秒以内。`,
        };
      }
    }
    
    return { valid: true };
  },
  
  async checkPermissions(input: ShellInput, context: ToolUseContext): Promise<PermissionResult> {
    const { command } = input;
    const { permissionContext } = context;
    
    // 危险命令直接拒绝
    if (isDangerousCommand(command)) {
      return {
        behavior: 'deny',
        message: `命令包含危险操作，已被拒绝: ${command}`,
      };
    }
    
    // 安全命令自动允许
    if (isSafeCommand(command)) {
      return { behavior: 'allow' };
    }
    
    // 自动模式下允许
    if (permissionContext?.mode === 'auto') {
      return { behavior: 'allow' };
    }
    
    // 需要确认的命令
    if (needsConfirmation(command)) {
      return {
        behavior: 'ask',
        message: `此命令可能有风险，是否允许执行？\n\n${command}`,
      };
    }
    
    // 默认模式下询问
    if (permissionContext?.mode === 'default') {
      return {
        behavior: 'ask',
        message: `是否允许执行命令？\n\n${command}`,
      };
    }
    
    return { behavior: 'allow' };
  },
  
  async call(input: ShellInput, context: ToolUseContext): Promise<ToolResult<ShellOutput>> {
    // 实际执行逻辑在 electron.js 中的 handleToolCall 实现
    // 这里只是类型定义
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
  
  userFacingName(input) {
    if (!input?.command) return 'Shell';
    
    const baseCmd = getBaseCommand(input.command);
    
    // 常见命令使用友好名称
    const friendlyNames: Record<string, string> = {
      'npm': 'npm',
      'yarn': 'yarn',
      'pnpm': 'pnpm',
      'git': 'Git',
      'docker': 'Docker',
      'python': 'Python',
      'python3': 'Python',
      'node': 'Node',
      'make': 'Make',
      'cargo': 'Cargo',
      'go': 'Go',
    };
    
    return friendlyNames[baseCmd] || 'Shell';
  },
  
  getToolUseSummary(input) {
    if (!input?.command) return null;
    
    // 优先使用描述
    if (input.description) {
      return input.description;
    }
    
    const command = input.command;
    const maxLen = 60;
    
    if (command.length <= maxLen) {
      return command;
    }
    
    return command.substring(0, maxLen - 3) + '...';
  },
  
  formatOutput(output: ShellOutput): string {
    const parts: string[] = [];
    
    if (output.stdout) {
      parts.push(output.stdout);
    }
    
    if (output.stderr) {
      parts.push(`stderr: ${output.stderr}`);
    }
    
    if (output.interrupted) {
      parts.push('(命令被中断)');
    }
    
    if (output.backgroundTaskId) {
      parts.push(`后台任务 ID: ${output.backgroundTaskId}`);
    }
    
    if (output.duration !== undefined) {
      parts.push(`耗时: ${formatDuration(output.duration)}`);
    }
    
    if (output.exitCode !== 0) {
      parts.push(`退出码: ${output.exitCode}`);
    }
    
    if (output.returnCodeInterpretation) {
      parts.push(output.returnCodeInterpretation);
    }
    
    return parts.join('\n') || (output.noOutputExpected ? '(完成)' : '(无输出)');
  },
});

export default ShellTool;
