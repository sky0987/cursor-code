import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const { ipcRenderer } = window.require('electron');

interface ToolResult {
  tool: string;
  input: Record<string, unknown>;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  toolResults?: ToolResult[];
}

interface FileItem {
  name: string;
  isDir: boolean;
  path: string;
}

const MODELS = [
  // Claude 最新版
  { id: 'claude-sonnet-4-6', name: '💜 Sonnet 4.6', desc: '最新' },
  { id: 'claude-opus-4-6', name: '🧠 Opus 4.6', desc: '最强' },
  { id: 'claude-haiku-4-5-20251001', name: '🚀 Haiku 4.5', desc: '极速' },
  // Claude 经典版
  { id: 'claude-3-7-sonnet-20250219', name: '⚡ Sonnet 3.7', desc: '稳定' },
  { id: 'claude-3-5-sonnet-20241022', name: '💎 Sonnet 3.5', desc: '经典' },
  { id: 'claude-3-5-haiku-20241022', name: '✨ Haiku 3.5', desc: '快速' },
  // GPT 系列
  { id: 'gpt-5.4', name: '🤖 GPT-5.4', desc: '最新' },
  { id: 'gpt-5', name: '🔮 GPT-5', desc: '强大' },
  // Gemini 系列
  { id: 'gemini-3.1-pro', name: '🌟 Gemini 3.1 Pro', desc: '最新' },
  { id: 'gemini-3-pro', name: '💫 Gemini 3 Pro', desc: '强大' },
  { id: 'gemini-3-flash', name: '⚡ Gemini 3 Flash', desc: '快速' },
  // 其他
  { id: 'grok-4.20', name: '🦾 Grok 4.20', desc: 'xAI' },
  { id: 'composer-2', name: '🎨 Composer 2', desc: 'Cursor' },
];

// API 模式
type ApiMode = 'openai' | 'claude';

interface ClaudeConfig {
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  clientReady: boolean;
}

interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  useProxy: boolean;
  proxyUrl: string;
}

interface Cursor2ApiStatus {
  running: boolean;
  version?: string;
  error?: string;
}

// SSH 配置接口
interface SSHConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  remotePath?: string;
}

interface SSHStatus {
  connected: boolean;
  host?: string;
  remotePath?: string;
}

interface RemoteFileItem {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modifyTime: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    // 从 localStorage 恢复历史消息
    const saved = localStorage.getItem('chat-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // OpenAI 模型选择（独立于 Claude 模型）
  const [openaiModel, setOpenaiModel] = useState(() => {
    return localStorage.getItem('selected-openai-model') || 'gpt-4o';
  });
  const [cwd, setCwd] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [permissionMode, setPermissionMode] = useState<'default' | 'auto'>('default');
  const [apiMode, setApiMode] = useState<ApiMode>(() => {
    return (localStorage.getItem('api-mode') as ApiMode) || 'claude';
  });
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig>({ 
    baseUrl: 'http://localhost:3010', 
    apiKey: 'sk-cursor2api', 
    enabled: true,
    clientReady: false 
  });
  const [cursor2apiStatus, setCursor2apiStatus] = useState<Cursor2ApiStatus>({ running: false });
  const [openaiConfig, setOpenaiConfig] = useState<OpenAIConfig>(() => {
    const saved = localStorage.getItem('openai-config');
    return saved ? JSON.parse(saved) : { 
      apiKey: '', 
      baseUrl: 'https://api.openai.com/v1', 
      enabled: false,
      useProxy: false,
      proxyUrl: 'http://127.0.0.1:7890',
    };
  });
  const [baseUrlInput, setBaseUrlInput] = useState('http://localhost:3010');
  const [selectedClaudeModel] = useState('google/gemini-3-flash');
  
  // SSH 远程管理状态
  const [showSSHManager, setShowSSHManager] = useState(false);
  const [sshConfigs, setSSHConfigs] = useState<SSHConfig[]>([]);
  const [sshStatus, setSSHStatus] = useState<SSHStatus>({ connected: false });
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileItem[]>([]);
  const [remoteCwd, setRemoteCwd] = useState('/');
  const [editingSSH, setEditingSSH] = useState<SSHConfig | null>(null);
  const [sshConnecting, setSSHConnecting] = useState(false);
  
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 保存 API 模式
  useEffect(() => {
    localStorage.setItem('api-mode', apiMode);
  }, [apiMode]);

  // 获取 Claude 配置和 cursor2api 状态
  useEffect(() => {
    ipcRenderer.invoke('get-claude-config').then((config: ClaudeConfig) => {
      setClaudeConfig(config);
      setBaseUrlInput(config.baseUrl);
    });
    checkCursor2api();
  }, []);

  const checkCursor2api = async () => {
    const status = await ipcRenderer.invoke('check-cursor2api');
    setCursor2apiStatus(status);
  };

  // ==================== SSH 远程管理功能 ====================
  
  // 加载 SSH 配置
  useEffect(() => {
    loadSSHConfigs();
    checkSSHStatus();
    
    // 监听 SSH 状态变化
    const handleSSHStatus = (_: any, status: SSHStatus) => {
      setSSHStatus(status);
      setIsRemoteMode(status.connected);
      if (status.remotePath) {
        setRemoteCwd(status.remotePath);
        loadRemoteFiles(status.remotePath);
      }
    };
    
    ipcRenderer.on('ssh-status', handleSSHStatus);
    return () => {
      ipcRenderer.removeListener('ssh-status', handleSSHStatus);
    };
  }, []);

  const loadSSHConfigs = async () => {
    const result = await ipcRenderer.invoke('ssh-get-configs');
    setSSHConfigs(result.connections || []);
  };

  const checkSSHStatus = async () => {
    const status = await ipcRenderer.invoke('ssh-status');
    setSSHStatus(status);
    setIsRemoteMode(status.connected);
    if (status.connected && status.remotePath) {
      setRemoteCwd(status.remotePath);
      loadRemoteFiles(status.remotePath);
    }
  };

  const loadRemoteFiles = async (path?: string) => {
    const targetPath = path || remoteCwd;
    const result = await ipcRenderer.invoke('ssh-list-dir', targetPath);
    if (result.success) {
      setRemoteFiles(result.items);
      setRemoteCwd(result.path);
    } else {
      showNotification(`❌ ${result.error}`);
    }
  };

  const connectSSH = async (config: SSHConfig) => {
    setSSHConnecting(true);
    try {
      const result = await ipcRenderer.invoke('ssh-connect', config);
      if (result.success) {
        showNotification(`✅ 已连接到 ${config.host}`);
        setShowSSHManager(false);
        setIsRemoteMode(true);
        if (result.remotePath) {
          setRemoteCwd(result.remotePath);
          loadRemoteFiles(result.remotePath);
        }
      } else {
        showNotification(`❌ 连接失败: ${result.error}`);
      }
    } catch (err: any) {
      showNotification(`❌ 连接失败: ${err.message}`);
    } finally {
      setSSHConnecting(false);
    }
  };

  const disconnectSSH = async () => {
    await ipcRenderer.invoke('ssh-disconnect');
    setIsRemoteMode(false);
    setRemoteFiles([]);
    setRemoteCwd('/');
    showNotification('✅ 已断开远程连接');
    loadFiles(); // 切回本地文件
  };

  const saveSSHConfig = async (config: SSHConfig) => {
    await ipcRenderer.invoke('ssh-save-config', config);
    await loadSSHConfigs();
    setEditingSSH(null);
    showNotification('✅ 配置已保存');
  };

  const deleteSSHConfig = async (configId: string) => {
    if (confirm('确定要删除此连接配置吗？')) {
      await ipcRenderer.invoke('ssh-delete-config', configId);
      await loadSSHConfigs();
      showNotification('✅ 配置已删除');
    }
  };

  const navigateRemote = async (item: RemoteFileItem) => {
    if (item.isDirectory) {
      const newPath = remoteCwd === '/' 
        ? `/${item.name}` 
        : `${remoteCwd}/${item.name}`;
      const result = await ipcRenderer.invoke('ssh-cd', newPath);
      if (result.success) {
        setRemoteCwd(result.path);
        loadRemoteFiles(result.path);
      }
    } else {
      // 读取远程文件
      const filePath = `${remoteCwd}/${item.name}`;
      const result = await ipcRenderer.invoke('ssh-read-file', filePath);
      if (result.success) {
        // 显示文件内容
        const previewMsg = `## 📄 ${item.name}\n\n\`\`\`\n${result.content.substring(0, 2000)}${result.content.length > 2000 ? '\n...(内容过长，已截断)' : ''}\n\`\`\``;
        setMessages(prev => [...prev, { role: 'assistant', content: previewMsg }]);
      } else {
        showNotification(`❌ ${result.error}`);
      }
    }
  };

  const navigateRemoteUp = async () => {
    if (remoteCwd === '/') return;
    const parentPath = remoteCwd.split('/').slice(0, -1).join('/') || '/';
    const result = await ipcRenderer.invoke('ssh-cd', parentPath);
    if (result.success) {
      setRemoteCwd(result.path);
      loadRemoteFiles(result.path);
    }
  };

  // 保存消息到 localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat-history', JSON.stringify(messages.slice(-50))); // 保留最近50条
    }
  }, [messages]);

  // 保存选中的 OpenAI 模型
  useEffect(() => {
    localStorage.setItem('selected-openai-model', openaiModel);
  }, [openaiModel]);

  useEffect(() => {
    loadCwd();
    
    const handleStream = (_: any, text: string) => {
      if (text) {
        // 追加文本而不是覆盖，实现真正的流式输出
        setStreamText(prev => prev + text);
      }
    };
    
    const handleEnd = (_: any, data: { response: string; savedFiles: any[]; toolResults?: ToolResult[] }) => {
      console.log('[App] chat-end received:', data);
      
      let response = data?.response || streamText || '';
      
      if (!response.trim()) {
        response = '抱歉，没有收到有效响应，请重试。';
      }
      
      // 处理工具调用结果
      const results = data?.toolResults || [];
      if (results.length > 0) {
        setToolResults(results);
        results.forEach(r => {
          if (r.success) {
            showNotification(`✅ ${r.tool} 执行成功`);
          } else {
            showNotification(`❌ ${r.tool}: ${r.error}`);
          }
        });
      }
      
      if (data?.savedFiles?.length > 0) {
        data.savedFiles.forEach(f => {
          const action = f.action || '已创建';
          response += `\n\n---\n\n✅ **${action}文件:** ${f.name}`;
          showNotification(`✅ ${action}: ${f.name}`);
        });
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response,
        toolResults: results.length > 0 ? results : undefined,
      }]);
      setStreamText('');
      setLoading(false);
      loadFiles();
    };

    // 处理工具进度事件
    const handleToolProgress = (_: any, data: { type: string; toolName: string; toolUseId?: string; durationMs?: number; error?: string }) => {
      console.log('[App] tool-progress:', data);
      // 工具进度会通过 chat-stream 流式显示，这里可以用于更新 UI 状态
    };

    ipcRenderer.on('chat-stream', handleStream);
    ipcRenderer.on('chat-end', handleEnd);
    ipcRenderer.on('tool-progress', handleToolProgress);

    return () => {
      ipcRenderer.removeListener('chat-stream', handleStream);
      ipcRenderer.removeListener('chat-end', handleEnd);
      ipcRenderer.removeListener('tool-progress', handleToolProgress);
    };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages, streamText]);

  const loadCwd = async () => {
    const dir = await ipcRenderer.invoke('get-cwd');
    if (dir) {
      setCwd(dir);
      loadFiles();
    }
  };

  const loadFiles = async () => {
    const items = await ipcRenderer.invoke('list-files');
    setFiles(items);
  };

  const selectDirectory = async () => {
    const dir = await ipcRenderer.invoke('select-directory');
    if (dir) {
      setCwd(dir);
      loadFiles();
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const showNotification = (msg: string) => {
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };

  // 停止当前请求
  const stopRequest = async () => {
    try {
      await ipcRenderer.invoke('chat-stop');
      if (streamText) {
        // 保存已有的流式输出
        setMessages(prev => [...prev, { role: 'assistant', content: streamText + '\n\n*(已停止)*' }]);
      }
      setStreamText('');
      setLoading(false);
      showNotification('⏹️ 已停止');
    } catch (err) {
      console.error('Stop error:', err);
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && selectedImages.length === 0) || loading) return;
    
    const userMsg = input.trim();
    const imagesToSend = [...selectedImages];
    setInput('');
    setSelectedImages([]);
    setMessages(prev => [...prev, { role: 'user', content: userMsg, images: imagesToSend.length > 0 ? imagesToSend : undefined }]);
    setLoading(true);
    setStreamText('');

    try {
      if (apiMode === 'claude') {
        // 使用 Claude API via cursor2api（原生 tool_use + 流式输出）
        await ipcRenderer.invoke('chat-claude', {
          userText: userMsg,
          images: imagesToSend,
          model: selectedClaudeModel,
          isRemoteMode,
          remoteCwd: isRemoteMode ? remoteCwd : undefined,
        });
      } else if (apiMode === 'openai') {
        // 使用 OpenAI API
        await ipcRenderer.invoke('chat-openai', {
          userText: userMsg,
          images: imagesToSend,
          model: openaiModel,
          isRemoteMode,
          remoteCwd: isRemoteMode ? remoteCwd : undefined,
        });
      } else {
        // 备用：使用本地解析
        await ipcRenderer.invoke('chat', {
          model: openaiModel,
          messages: [...messages, { role: 'user', content: userMsg, images: imagesToSend }],
          userText: userMsg,
          images: imagesToSend
        });
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${err.message}` }]);
      setLoading(false);
    }
  };

  // 保存 cursor2api 配置
  const saveCursor2apiConfig = async () => {
    const result = await ipcRenderer.invoke('set-claude-config', { 
      baseUrl: baseUrlInput,
      apiKey: 'sk-cursor2api',
    });
    if (result.success) {
      showNotification('✅ 配置已保存');
      setClaudeConfig(prev => ({ ...prev, baseUrl: baseUrlInput }));
      checkCursor2api();
      setShowApiConfig(false);
    } else {
      showNotification('❌ 保存失败');
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setSelectedImages(prev => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      }
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // 处理粘贴截图
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setSelectedImages(prev => [...prev, base64]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const openFile = async (filePath: string) => {
    await ipcRenderer.invoke('open-file', filePath);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // 执行命令
  const runCommand = async (command: string) => {
    showNotification(`⏳ 执行中: ${command.slice(0, 30)}...`);
    try {
      const result = await ipcRenderer.invoke('run-command', command);
      if (result.success) {
        const output = result.stdout || '(无输出)';
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `✅ **命令执行成功**\n\`\`\`\n${command}\n\`\`\`\n\n**输出:**\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\`` 
        }]);
        showNotification('✅ 命令执行成功');
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ **命令执行失败**\n\`\`\`\n${command}\n\`\`\`\n\n**错误:**\n\`\`\`\n${result.stderr || result.error}\n\`\`\`` 
        }]);
        showNotification('❌ 命令执行失败');
      }
    } catch (err: any) {
      showNotification(`❌ 错误: ${err.message}`);
    }
  };

  // 存储代码块用于复制和执行
  const codeBlocksRef = useRef<{ code: string; lang: string }[]>([]);

  // 判断是否为可执行的命令语言
  const isExecutableLang = (lang: string) => {
    return ['bash', 'shell', 'sh', 'cmd', 'powershell', 'bat', 'ps1'].includes(lang?.toLowerCase());
  };

  const formatContent = (text: string, isStreaming: boolean = false) => {
    codeBlocksRef.current = [];
    let blockIndex = 0;
    let html = text;
    
    // 完整代码块处理
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = blockIndex++;
      codeBlocksRef.current[idx] = { code: code.trim(), lang: lang || '' };
      const canRun = isExecutableLang(lang);
      return `<div class="code-block ${canRun ? 'executable' : ''}">
        <div class="code-header">
          <span>${lang || 'code'}</span>
          <div class="code-actions">
            ${canRun ? `<button class="run-btn" data-index="${idx}">▶ 执行</button>` : ''}
            <button class="copy-btn" data-index="${idx}">复制</button>
          </div>
        </div>
        <pre><code>${escapeHtml(code.trim())}</code></pre>
      </div>`;
    });
    
    // 流式输出时处理未完成的代码块
    if (isStreaming) {
      html = html.replace(/```(\w*)\n([\s\S]*)$/g, (_, lang, code) => {
        return `<div class="code-block streaming">
          <div class="code-header">
            <span>${lang || 'code'}</span>
            <span class="streaming-hint">生成中...</span>
          </div>
          <pre><code>${escapeHtml(code)}</code></pre>
        </div>`;
      });
    }
    
    // Markdown 表格处理
    html = html.replace(/(\|[^\n]+\|\n)(\|[-:| ]+\|\n)((?:\|[^\n]+\|\n?)+)/g, (match) => {
      const lines = match.trim().split('\n');
      if (lines.length < 2) return match;
      
      const headerCells = lines[0].split('|').filter(c => c.trim());
      const rows = lines.slice(2).map(row => row.split('|').filter(c => c.trim()));
      
      let table = '<table class="md-table"><thead><tr>';
      headerCells.forEach(cell => {
        table += `<th>${cell.trim()}</th>`;
      });
      table += '</tr></thead><tbody>';
      rows.forEach(row => {
        table += '<tr>';
        row.forEach(cell => {
          table += `<td>${cell.trim()}</td>`;
        });
        table += '</tr>';
      });
      table += '</tbody></table>';
      return table;
    });
    
    // 行内代码（避免匹配代码块内的反引号）
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
    // 粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // 列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    
    return html;
  };

  const escapeHtml = (text: string) => {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const renderToolResult = (result: ToolResult) => {
    const { tool, input, success, data, error } = result;
    
    if (!success) {
      return (
        <div className="tool-result error">
          <div className="tool-header">
            <span className="tool-icon">❌</span>
            <span className="tool-name">{tool}</span>
          </div>
          <div className="tool-error">{error}</div>
        </div>
      );
    }

    switch (tool) {
      case 'Read':
        const readData = data as any;
        if (readData?.type === 'image') {
          return (
            <div className="tool-result">
              <div className="tool-header">
                <span className="tool-icon">🖼️</span>
                <span className="tool-name">Read: {readData.file?.filePath}</span>
              </div>
              <img 
                src={`data:${readData.file?.mimeType};base64,${readData.file?.base64}`}
                alt={readData.file?.filePath}
                className="tool-image"
              />
            </div>
          );
        }
        return (
          <div className="tool-result">
            <div className="tool-header">
              <span className="tool-icon">📄</span>
              <span className="tool-name">Read: {readData?.file?.filePath}</span>
              <span className="tool-meta">
                行 {readData?.file?.startLine}-{readData?.file?.startLine + readData?.file?.numLines - 1} / {readData?.file?.totalLines}
              </span>
            </div>
          </div>
        );
      
      case 'Write':
        const writeData = data as any;
        return (
          <div className="tool-result success">
            <div className="tool-header">
              <span className="tool-icon">✏️</span>
              <span className="tool-name">Write: {writeData?.filePath}</span>
              <span className="tool-meta">{writeData?.bytesWritten} bytes</span>
            </div>
          </div>
        );
      
      case 'Edit':
        const editData = data as any;
        return (
          <div className="tool-result success">
            <div className="tool-header">
              <span className="tool-icon">🔧</span>
              <span className="tool-name">Edit: {editData?.filePath}</span>
              <span className="tool-meta">{editData?.replacements} 处替换</span>
            </div>
          </div>
        );
      
      case 'Bash':
        const bashData = data as any;
        return (
          <div className="tool-result">
            <div className="tool-header">
              <span className="tool-icon">💻</span>
              <span className="tool-name">Bash</span>
              <span className={`tool-exit-code ${bashData?.exitCode === 0 ? 'success' : 'error'}`}>
                退出码: {bashData?.exitCode}
              </span>
            </div>
            {bashData?.stdout && (
              <pre className="tool-output">{bashData.stdout.slice(0, 500)}</pre>
            )}
            {bashData?.stderr && (
              <pre className="tool-output stderr">{bashData.stderr.slice(0, 300)}</pre>
            )}
          </div>
        );
      
      case 'Glob':
        const globData = data as any;
        return (
          <div className="tool-result">
            <div className="tool-header">
              <span className="tool-icon">🔍</span>
              <span className="tool-name">Glob</span>
              <span className="tool-meta">找到 {globData?.count} 个文件</span>
            </div>
            {globData?.files?.length > 0 && (
              <div className="tool-files">
                {globData.files.slice(0, 10).map((f: string, i: number) => (
                  <div key={i} className="file-item">📄 {f}</div>
                ))}
                {globData.files.length > 10 && (
                  <div className="file-more">... 还有 {globData.files.length - 10} 个文件</div>
                )}
              </div>
            )}
          </div>
        );
      
      case 'Grep':
        const grepData = data as any;
        return (
          <div className="tool-result">
            <div className="tool-header">
              <span className="tool-icon">🔎</span>
              <span className="tool-name">Grep</span>
              <span className="tool-meta">{grepData?.count} 个匹配</span>
            </div>
            {grepData?.matches?.length > 0 && (
              <div className="tool-matches">
                {grepData.matches.slice(0, 5).map((m: any, i: number) => (
                  <div key={i} className="match-item">
                    <span className="match-file">{m.file}:{m.line}</span>
                    <span className="match-content">{m.content.slice(0, 100)}</span>
                  </div>
                ))}
                {grepData.matches.length > 5 && (
                  <div className="match-more">... 还有 {grepData.matches.length - 5} 个匹配</div>
                )}
              </div>
            )}
          </div>
        );
      
      default:
        return (
          <div className="tool-result">
            <div className="tool-header">
              <span className="tool-icon">🔧</span>
              <span className="tool-name">{tool}</span>
            </div>
            <pre className="tool-output">{JSON.stringify(data, null, 2)}</pre>
          </div>
        );
    }
  };

  // 处理复制和执行按钮点击
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const index = parseInt(target.getAttribute('data-index') || '0');
      const block = codeBlocksRef.current[index];
      
      if (target.classList.contains('copy-btn') && block) {
        navigator.clipboard.writeText(block.code);
        target.textContent = '已复制!';
        setTimeout(() => { target.textContent = '复制'; }, 1500);
      }
      
      if (target.classList.contains('run-btn') && block) {
        target.textContent = '执行中...';
        target.setAttribute('disabled', 'true');
        runCommand(block.code).finally(() => {
          target.textContent = '▶ 执行';
          target.removeAttribute('disabled');
        });
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="app">
      {/* API 配置弹窗 */}
      {showApiConfig && (
        <div className="modal-overlay" onClick={() => setShowApiConfig(false)}>
          <div className="modal api-config-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ API 配置</h3>
              <button className="close-btn" onClick={() => setShowApiConfig(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* OpenAI 配置区域 */}
              <div className="config-section">
                <h4>🤖 OpenAI API</h4>
                <p className="section-desc">使用 OpenAI 官方 API，需要付费 API Key</p>
                
                <label className="input-label">API Key</label>
                <input
                  type="password"
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  value={openaiConfig.apiKey}
                  onChange={e => setOpenaiConfig({...openaiConfig, apiKey: e.target.value})}
                  className="api-key-input"
                />
                
                <label className="input-label">Base URL（可选）</label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={openaiConfig.baseUrl}
                  onChange={e => setOpenaiConfig({...openaiConfig, baseUrl: e.target.value})}
                  className="api-key-input"
                />
                
                {/* 代理配置 */}
                <div className="proxy-config">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={openaiConfig.useProxy}
                      onChange={e => setOpenaiConfig({...openaiConfig, useProxy: e.target.checked})}
                    />
                    <span>使用 Clash 代理</span>
                  </label>
                  
                  {openaiConfig.useProxy && (
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:7890"
                      value={openaiConfig.proxyUrl}
                      onChange={e => setOpenaiConfig({...openaiConfig, proxyUrl: e.target.value})}
                      className="api-key-input proxy-input"
                    />
                  )}
                </div>
                
                <p className="hint info">
                  💡 也可通过环境变量配置：<br/>
                  <code>OPENAI_USE_PROXY=true</code><br/>
                  <code>OPENAI_PROXY=http://127.0.0.1:7890</code>
                </p>
                
                <button 
                  className="primary save-btn"
                  onClick={() => {
                    localStorage.setItem('openai-config', JSON.stringify(openaiConfig));
                    ipcRenderer.invoke('set-openai-config', openaiConfig);
                    showNotification('✅ OpenAI 配置已保存');
                  }}
                >
                  保存 OpenAI 配置
                </button>
              </div>
              
              <div className="config-divider"></div>
              
              {/* cursor2api 配置区域 */}
              <div className="config-section">
                <h4>💜 Claude via cursor2api</h4>
                <p className="section-desc">免费使用 Claude，需要运行本地 cursor2api 服务</p>
                
                <div className={`status-box ${cursor2apiStatus.running ? 'success' : 'error'}`}>
                  <span className="status-icon">{cursor2apiStatus.running ? '✅' : '❌'}</span>
                  <span className="status-text">
                    {cursor2apiStatus.running 
                      ? `cursor2api 运行中${cursor2apiStatus.version ? ` (v${cursor2apiStatus.version})` : ''}`
                      : 'cursor2api 未运行'
                    }
                  </span>
                  <button className="refresh-btn" onClick={checkCursor2api}>🔄</button>
                </div>
                
                {!cursor2apiStatus.running && (
                  <p className="hint warning">
                    请先启动 cursor2api：<br/>
                    <code>cd cursor2api && npm start</code>
                  </p>
                )}
                
                <label className="input-label">Base URL</label>
                <input
                  type="text"
                  placeholder="http://localhost:3010"
                  value={baseUrlInput}
                  onChange={e => setBaseUrlInput(e.target.value)}
                  className="api-key-input"
                />
                
                <button className="primary save-btn" onClick={saveCursor2apiConfig}>
                  保存 cursor2api 配置
                </button>
              </div>
              
              <div className="modal-actions">
                <button onClick={() => setShowApiConfig(false)}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SSH 远程管理弹窗 */}
      {showSSHManager && (
        <div className="modal-overlay" onClick={() => !editingSSH && setShowSSHManager(false)}>
          <div className="modal ssh-manager-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📡 远程连接管理</h3>
              <button className="close-btn" onClick={() => { setShowSSHManager(false); setEditingSSH(null); }}>×</button>
            </div>
            <div className="modal-body">
              {editingSSH ? (
                /* 编辑/新建连接表单 */
                <div className="ssh-form">
                  <div className="form-group">
                    <label>连接名称</label>
                    <input 
                      type="text" 
                      value={editingSSH.name || ''} 
                      onChange={e => setEditingSSH({...editingSSH, name: e.target.value})}
                      placeholder="我的服务器"
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>主机地址</label>
                      <input 
                        type="text" 
                        value={editingSSH.host || ''} 
                        onChange={e => setEditingSSH({...editingSSH, host: e.target.value})}
                        placeholder="192.168.1.100"
                      />
                    </div>
                    <div className="form-group" style={{width: '100px'}}>
                      <label>端口</label>
                      <input 
                        type="number" 
                        value={editingSSH.port || 22} 
                        onChange={e => setEditingSSH({...editingSSH, port: parseInt(e.target.value) || 22})}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>用户名</label>
                    <input 
                      type="text" 
                      value={editingSSH.username || ''} 
                      onChange={e => setEditingSSH({...editingSSH, username: e.target.value})}
                      placeholder="root"
                    />
                  </div>
                  <div className="form-group">
                    <label>密码</label>
                    <input 
                      type="password" 
                      value={editingSSH.password || ''} 
                      onChange={e => setEditingSSH({...editingSSH, password: e.target.value})}
                      placeholder="留空使用密钥认证"
                    />
                  </div>
                  <div className="form-group">
                    <label>私钥路径（可选）</label>
                    <input 
                      type="text" 
                      value={editingSSH.privateKey || ''} 
                      onChange={e => setEditingSSH({...editingSSH, privateKey: e.target.value})}
                      placeholder="C:\Users\你\.ssh\id_rsa"
                    />
                  </div>
                  <div className="form-group">
                    <label>远程目录</label>
                    <input 
                      type="text" 
                      value={editingSSH.remotePath || ''} 
                      onChange={e => setEditingSSH({...editingSSH, remotePath: e.target.value})}
                      placeholder="/home/user"
                    />
                  </div>
                  <div className="modal-actions">
                    <button onClick={() => setEditingSSH(null)}>取消</button>
                    <button 
                      className="primary" 
                      onClick={() => saveSSHConfig(editingSSH)}
                      disabled={!editingSSH.host || !editingSSH.username}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                /* 连接列表 */
                <div className="ssh-list">
                  <button 
                    className="add-ssh-btn"
                    onClick={() => setEditingSSH({ 
                      id: '', 
                      name: '', 
                      host: '', 
                      port: 22, 
                      username: '',
                      remotePath: '/home'
                    })}
                  >
                    ➕ 添加新连接
                  </button>
                  
                  {sshConfigs.length === 0 ? (
                    <div className="empty-hint">暂无保存的连接</div>
                  ) : (
                    sshConfigs.map(config => (
                      <div key={config.id} className="ssh-item">
                        <div className="ssh-item-info">
                          <div className="ssh-item-name">{config.name || config.host}</div>
                          <div className="ssh-item-detail">
                            {config.username}@{config.host}:{config.port}
                          </div>
                        </div>
                        <div className="ssh-item-actions">
                          <button 
                            className="connect-btn"
                            onClick={() => connectSSH(config)}
                            disabled={sshConnecting}
                          >
                            {sshConnecting ? '连接中...' : '🔗 连接'}
                          </button>
                          <button 
                            className="edit-btn"
                            onClick={() => setEditingSSH(config)}
                          >
                            ✏️
                          </button>
                          <button 
                            className="delete-btn"
                            onClick={() => deleteSSHConfig(config.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 侧边栏 */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span>{isRemoteMode ? '🌐 远程文件' : '📁 文件'}</span>
          <button onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        
        {isRemoteMode ? (
          <>
            {/* 远程模式 */}
            <div className="cwd remote-cwd">
              <span className="remote-badge">SSH</span>
              <span className="remote-path" title={remoteCwd}>
                {remoteCwd.length > 20 ? '...' + remoteCwd.slice(-20) : remoteCwd}
              </span>
            </div>
            <div className="file-list">
              {/* 返回上级目录 */}
              {remoteCwd !== '/' && (
                <div 
                  className="file-item dir parent-dir"
                  onClick={navigateRemoteUp}
                >
                  📁 ..
                </div>
              )}
              {remoteFiles.map((file, i) => (
                <div 
                  key={i} 
                  className={`file-item ${file.isDirectory ? 'dir' : ''}`}
                  onClick={() => navigateRemote(file)}
                  title={`${file.name} (${formatFileSize(file.size)})`}
                >
                  {file.isDirectory ? '📁' : '📄'} {file.name}
                </div>
              ))}
              {remoteFiles.length === 0 && (
                <div className="empty-hint">目录为空</div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 本地模式 */}
            <div className="cwd" onClick={selectDirectory}>
              {cwd ? cwd.split('\\').pop() : '选择目录...'}
            </div>
            <div className="file-list">
              {files.map((file, i) => (
                <div 
                  key={i} 
                  className={`file-item ${file.isDir ? 'dir' : ''}`}
                  onClick={() => !file.isDir && openFile(file.path)}
                >
                  {file.isDir ? '📁' : '📄'} {file.name}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 主区域 */}
      <div className="main">
        {/* 头部 */}
        <div className="header">
          <div className="header-left">
            {!sidebarOpen && (
              <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
            )}
            <span className="logo">⚡ Cursor Code</span>
          </div>
          <div className="header-right">
            {/* API 模式切换 - 只能启用一个 */}
            <div className="api-mode-toggle">
              <button 
                className={`api-mode-btn ${apiMode === 'openai' ? 'active' : ''}`}
                onClick={async () => {
                  if (apiMode === 'openai') return; // 已经是当前模式
                  if (!openaiConfig.apiKey) {
                    setShowApiConfig(true);
                    return;
                  }
                  // 切换到 OpenAI 模式，清空对话历史
                  setApiMode('openai');
                  setMessages([]);
                  setToolResults([]);
                  localStorage.removeItem('chat-history');
                  await ipcRenderer.invoke('clear-history');
                  showNotification('🤖 已切换到 OpenAI 模式');
                }}
                title="OpenAI API（需要配置 API Key）"
              >
                🤖 OpenAI {apiMode === 'openai' ? '✓' : ''}
              </button>
              <button 
                className={`api-mode-btn ${apiMode === 'claude' ? 'active' : ''}`}
                onClick={async () => {
                  if (apiMode === 'claude') return; // 已经是当前模式
                  if (!cursor2apiStatus.running) {
                    setShowApiConfig(true);
                    return;
                  }
                  // 切换到 Claude 模式，清空对话历史
                  setApiMode('claude');
                  setMessages([]);
                  setToolResults([]);
                  localStorage.removeItem('chat-history');
                  await ipcRenderer.invoke('clear-history');
                  showNotification('💜 已切换到 Claude 模式');
                }}
                title="Claude API via cursor2api（免费，需运行 cursor2api）"
              >
                💜 Claude {apiMode === 'claude' ? '✓' : ''}
              </button>
              <button 
                className="config-btn"
                onClick={() => { setShowApiConfig(true); checkCursor2api(); }}
                title="API 配置"
              >
                ⚙️
              </button>
            </div>
            {/* SSH 远程连接按钮 */}
            <button 
              className={`ssh-btn ${isRemoteMode ? 'connected' : ''}`}
              onClick={() => isRemoteMode ? disconnectSSH() : setShowSSHManager(true)}
              title={isRemoteMode ? `已连接: ${sshStatus.host} - 点击断开` : '远程连接管理'}
            >
              {isRemoteMode ? '🌐' : '📡'} {isRemoteMode ? '远程' : '本地'}
            </button>
            <button 
              className={`mode-btn ${permissionMode === 'auto' ? 'active' : ''}`}
              onClick={() => setPermissionMode(prev => prev === 'default' ? 'auto' : 'default')}
              title={permissionMode === 'auto' ? '自动模式（自动批准工具）' : '默认模式（需要确认）'}
            >
              {permissionMode === 'auto' ? '⚡' : '🔒'}
            </button>
            <button 
              className="clear-btn" 
              onClick={async () => { 
                setMessages([]); 
                setToolResults([]);
                localStorage.removeItem('chat-history');
                // 同时清空后端对话历史
                await ipcRenderer.invoke('clear-history');
                showNotification('✅ 对话已清空');
              }}
              title="清空历史"
            >
              🗑️
            </button>
            {apiMode === 'openai' ? (
              <select value={openaiModel} onChange={e => setOpenaiModel(e.target.value)}>
                <optgroup label="GPT-5 系列 (最新)">
                  <option value="gpt-5.4">🚀 GPT-5.4</option>
                  <option value="gpt-5.4-mini">⚡ GPT-5.4 Mini</option>
                  <option value="gpt-5.4-pro">💎 GPT-5.4 Pro</option>
                  <option value="gpt-5.2">🧠 GPT-5.2</option>
                  <option value="gpt-5.1">📊 GPT-5.1</option>
                </optgroup>
                <optgroup label="O3 推理系列">
                  <option value="o3">🔮 O3</option>
                  <option value="o3-pro">💫 O3 Pro</option>
                  <option value="o3-mini">✨ O3 Mini</option>
                </optgroup>
                <optgroup label="O1 推理系列">
                  <option value="o1">🎯 O1</option>
                  <option value="o1-pro">🏆 O1 Pro</option>
                  <option value="o1-mini">⭐ O1 Mini</option>
                </optgroup>
                <optgroup label="GPT-4o 系列">
                  <option value="gpt-4o">🧠 GPT-4o</option>
                  <option value="gpt-4o-mini">⚡ GPT-4o Mini</option>
                </optgroup>
                <optgroup label="GPT-4 系列">
                  <option value="gpt-4-turbo">💎 GPT-4 Turbo</option>
                  <option value="gpt-4">🔷 GPT-4</option>
                </optgroup>
                <optgroup label="GPT-3.5 系列">
                  <option value="gpt-3.5-turbo">🚀 GPT-3.5 Turbo</option>
                </optgroup>
              </select>
            ) : (
              <select 
                value={selectedClaudeModel} 
                disabled
                className="claude-model-select"
                title="当前 cursor2api 仅支持此模型"
              >
                <option value="google/gemini-3-flash">⚡ gemini-3-flash</option>
              </select>
            )}
          </div>
        </div>

        {/* 聊天区域 */}
        <div className="chat" ref={chatRef}>
          {messages.length === 0 && !loading && (
            <div className="welcome">
              <h1>⚡ Cursor Code</h1>
              <p>AI 编程助手，基于 Electron + React + cursor2api</p>
              <div className="examples">
                <div onClick={() => setInput('读取 package.json 看看项目信息')}>查看项目配置</div>
                <div onClick={() => setInput('帮我分析 src/App.tsx 的代码结构')}>分析主组件</div>
                <div onClick={() => setInput('执行 npm run build 打包项目')}>打包项目</div>
                <div onClick={() => setInput('帮我优化 electron.js 的代码')}>优化后端代码</div>
              </div>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="content">
                {msg.images && msg.images.length > 0 && (
                  <div className="message-images">
                    {msg.images.map((img, imgIdx) => (
                      <img key={imgIdx} src={img} alt={`发送的图片 ${imgIdx + 1}`} className="sent-image" />
                    ))}
                  </div>
                )}
                {msg.toolResults && msg.toolResults.length > 0 && (
                  <div className="tool-results">
                    {msg.toolResults.map((result, idx) => (
                      <div key={idx}>{renderToolResult(result)}</div>
                    ))}
                  </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="message assistant streaming">
              <div className="avatar">{isRemoteMode ? '🌐' : '🤖'}</div>
              <div className="content streaming-content">
                {streamText ? (
                  <>
                    <div 
                      className="stream-text"
                      dangerouslySetInnerHTML={{ 
                        __html: formatContent(streamText, true)
                      }}
                    />
                    <span className="cursor"></span>
                  </>
                ) : (
                  <div className="typing-indicator">
                    <div className="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="typing-text">{isRemoteMode ? '远程执行中' : '思考中'}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="input-area">
          {selectedImages.length > 0 && (
            <div className="image-preview-bar">
              {selectedImages.map((img, idx) => (
                <div key={idx} className="preview-item">
                  <img src={img} alt={`预览 ${idx + 1}`} />
                  <button className="remove-btn" onClick={() => removeImage(idx)}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="input-row">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <button 
              className="image-btn" 
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="添加图片"
            >
              🖼️
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && !loading && sendMessage()}
              onPaste={handlePaste}
              placeholder="输入消息，可粘贴截图 (Ctrl+V) 或点击 🖼️ 添加图片..."
              disabled={loading}
            />
            {loading ? (
              <button className="stop-btn" onClick={stopRequest} title="停止生成">
                ⏹️ 停止
              </button>
            ) : (
              <button onClick={sendMessage} disabled={!input.trim() && selectedImages.length === 0}>
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
