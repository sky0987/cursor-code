# Sparks - AI Coding Assistant

<p align="center">
  <img src="public/sparks-icon.png" alt="Sparks Logo" width="128" height="128">
</p>

<p align="center">
  <strong>一款强大的本地 AI 编程助手，支持多种 AI 提供商</strong>
</p>

<p align="center">
  <a href="https://github.com/sky0987/cursor-code/releases">
    <img src="https://img.shields.io/github/v/release/sky0987/cursor-code?style=flat-square" alt="Release">
  </a>
  <a href="https://github.com/sky0987/cursor-code/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/sky0987/cursor-code?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/sky0987/cursor-code">
    <img src="https://img.shields.io/github/stars/sky0987/cursor-code?style=flat-square" alt="Stars">
  </a>
</p>

---

## ✨ 功能特性

### 🤖 多 AI 提供商支持
- **OpenAI** - GPT-4o, GPT-5.4, o3, o4-mini 等
- **Anthropic** - Claude Sonnet 4, Claude Opus 4
- **Google** - Gemini 2.5 Pro, Gemini 3 Flash
- **DeepSeek** - DeepSeek Chat, DeepSeek Coder
- **通义千问** - Qwen Max, Qwen Plus
- **cursor2api** - 本地代理支持

### 🛠️ 强大的工具系统
- **文件操作** - 读取、写入、编辑文件
- **命令执行** - 运行 Shell/Bash 命令
- **代码搜索** - Glob 文件匹配、Grep 内容搜索
- **网络请求** - WebFetch API 调用、WebSearch 网页搜索

### 🔐 安全与权限
- **权限确认模式** - 危险操作需用户确认
- **自动模式** - 信任所有操作，适合熟练用户
- **本地运行** - 数据不上传，隐私安全

### 🎨 现代化界面
- **深色/浅色主题** - 自动适应系统主题
- **Markdown 渲染** - 代码高亮、表格支持
- **实时流式输出** - 打字机效果展示 AI 回复
- **工具调用可视化** - 直观展示工具执行过程

### 📁 文件管理
- **本地文件浏览** - 可视化文件树
- **SSH 远程连接** - 支持远程服务器文件操作
- **拖拽上传** - 支持图片拖拽发送

---

## 📦 安装

### Windows
从 [Releases](https://github.com/sky0987/cursor-code/releases) 下载最新的 `Sparks-Setup-x.x.x.exe` 安装包。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/sky0987/cursor-code.git
cd cursor-code

# 安装依赖
npm install

# 开发模式运行
npm run electron:dev

# 构建安装包
npm run electron:build
```

---

## 🚀 快速开始

### 1. 配置 AI 提供商

点击右上角设置图标，配置你的 API Key：

| 提供商 | 获取 API Key |
|--------|-------------|
| OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| Google | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |

### 2. 选择工作目录

点击左侧文件夹图标，选择你的项目目录。

### 3. 开始对话

在输入框中输入你的问题或指令：

```
读取 package.json 文件
```

```
帮我创建一个 React 组件
```

```
执行 npm install axios
```

---

## 💡 使用技巧

### 斜杠命令
- `/read <文件路径>` - 读取文件
- `/bash <命令>` - 执行命令
- `/glob <模式>` - 搜索文件
- `/grep <关键词>` - 搜索内容
- `/help` - 查看帮助

### 自然语言
- "读取 src 目录下所有 ts 文件"
- "帮我修改 App.tsx，添加一个按钮"
- "运行 git status"
- "搜索包含 TODO 的文件"

### 快捷键
- `Ctrl + Enter` - 发送消息
- `Ctrl + L` - 清空对话
- `Ctrl + ,` - 打开设置

---

## 🔧 配置项

### 代理设置
如果需要使用代理访问 API：

1. 在设置中启用"使用代理"
2. 填入代理地址，如 `http://127.0.0.1:7890`

### cursor2api 集成
如果使用 cursor2api 本地代理：

1. 启动 cursor2api 服务
2. 在 Sparks 中选择 cursor2api 提供商
3. 确保 baseUrl 为 `http://localhost:3010`

---

## 📝 开发

### 技术栈
- **前端**: React 19 + TypeScript
- **桌面**: Electron 41
- **AI SDK**: OpenAI SDK, Anthropic SDK
- **构建**: electron-builder

### 项目结构
```
cursor-react/
├── public/
│   ├── electron.js      # Electron 主进程
│   └── icons/           # 应用图标
├── src/
│   ├── App.tsx          # 主界面组件
│   ├── App.css          # 样式文件
│   └── lib/
│       ├── tools/       # 工具定义
│       ├── messages/    # 消息类型
│       └── query/       # 查询循环
└── package.json
```

### 开发命令
```bash
npm start           # 启动 React 开发服务器
npm run electron    # 启动 Electron（需先启动 React）
npm run electron:dev  # 同时启动 React 和 Electron
npm run build       # 构建 React 生产版本
npm run electron:build  # 构建 Windows 安装包
```

---

## 📄 许可证

[MIT License](LICENSE) © 2024 Long

---

## 🙏 致谢

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [OpenAI](https://openai.com/)
- [Anthropic](https://www.anthropic.com/)
- [cursor2api](https://github.com/cursor2api)

---

## 📬 联系

- **作者**: Long
- **邮箱**: sky8923587@163.com
- **GitHub**: [@sky0987](https://github.com/sky0987)
- **问题反馈**: [Issues](https://github.com/sky0987/cursor-code/issues)
