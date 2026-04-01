/**
 * 配置管理系统
 * 参考 Claude Code CLI 的配置架构
 */

export interface AppConfig {
  // 模型设置
  model: string;
  maxTokens: number;
  temperature: number;
  
  // 工具设置
  toolTimeout: number;
  autoApproveReadOnly: boolean;
  
  // 安全设置
  permissionMode: 'default' | 'auto' | 'plan';
  allowedPaths: string[];
  deniedPaths: string[];
  
  // UI 设置
  theme: 'light' | 'dark' | 'system';
  showToolResults: boolean;
  streamResponse: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.7,
  
  toolTimeout: 60000,
  autoApproveReadOnly: true,
  
  permissionMode: 'default',
  allowedPaths: [],
  deniedPaths: ['node_modules', '.git', '.env'],
  
  theme: 'light',
  showToolResults: true,
  streamResponse: true,
};

const CONFIG_KEY = 'cursor-code-config';

export function loadConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const updated = { ...current, ...config };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
  return updated;
}

export function resetConfig(): AppConfig {
  localStorage.removeItem(CONFIG_KEY);
  return { ...DEFAULT_CONFIG };
}

export { DEFAULT_CONFIG };
