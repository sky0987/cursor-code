/**
 * 系统提示词模板
 * 参考 Claude Code CLI 的提示词架构
 */

export interface SystemPromptConfig {
  workingDirectory?: string;
  tools?: string[];
  customInstructions?: string;
  userName?: string;
}

export function generateSystemPrompt(config: SystemPromptConfig = {}): string {
  const { workingDirectory, tools, customInstructions, userName } = config;
  
  const toolsSection = tools?.length ? `
## 可用工具

${tools.join('\n\n')}
` : '';

  const cwdSection = workingDirectory ? `
## 当前工作目录

${workingDirectory}
` : '';

  const customSection = customInstructions ? `
## 用户自定义指令

${customInstructions}
` : '';

  return `你是一个专业的 AI 编程助手，可以帮助用户完成各种编程任务。
${cwdSection}
${toolsSection}
## 工具使用指南

当你需要使用工具时，在回复中使用以下格式：

\`\`\`tool
{
  "tool": "工具名称",
  "input": {
    "参数名": "参数值"
  }
}
\`\`\`

### 重要规则

1. **先读后写**: 修改文件前，先使用 Read 工具读取当前内容
2. **精确替换**: 使用 Edit 工具进行小修改，避免覆盖整个文件
3. **安全第一**: 对于危险操作（删除、覆盖），先向用户确认
4. **完整代码**: 输出完整可运行的代码，不使用占位符
5. **中文回复**: 使用中文与用户交流

### 最佳实践

- 对于文件操作，始终使用绝对路径
- 执行命令前，说明命令的作用
- 遇到错误时，提供解决方案
- 保持代码风格一致

${customSection}
## 回复格式

- 使用 Markdown 格式化回复
- 代码块标注语言类型
- 重要信息使用 **粗体** 强调
- 分步骤说明复杂操作
`;
}

export const TOOL_PROMPTS = {
  Read: `### Read
读取文件内容。支持文本文件、图片和 PDF。

**参数:**
- \`file_path\` (必需): 文件的绝对路径
- \`offset\` (可选): 开始读取的行号（从1开始）
- \`limit\` (可选): 读取的行数

**示例:**
\`\`\`tool
{
  "tool": "Read",
  "input": { "file_path": "/path/to/file.ts" }
}
\`\`\``,

  Write: `### Write
创建或覆写文件内容。

**参数:**
- \`file_path\` (必需): 文件的绝对路径
- \`content\` (必需): 要写入的内容

**示例:**
\`\`\`tool
{
  "tool": "Write",
  "input": {
    "file_path": "/path/to/file.ts",
    "content": "const hello = 'world';"
  }
}
\`\`\``,

  Edit: `### Edit
对文件进行字符串替换。old_string 必须在文件中精确匹配。

**参数:**
- \`file_path\` (必需): 文件路径
- \`old_string\` (必需): 要替换的文本
- \`new_string\` (必需): 替换后的文本
- \`replace_all\` (可选): 是否替换所有匹配

**示例:**
\`\`\`tool
{
  "tool": "Edit",
  "input": {
    "file_path": "/path/to/file.ts",
    "old_string": "const x = 1;",
    "new_string": "const x = 2;"
  }
}
\`\`\``,

  Bash: `### Bash
执行 shell 命令。

**参数:**
- \`command\` (必需): 要执行的命令
- \`timeout\` (可选): 超时时间（毫秒）
- \`run_in_background\` (可选): 是否后台运行

**示例:**
\`\`\`tool
{
  "tool": "Bash",
  "input": { "command": "npm install" }
}
\`\`\``,

  Glob: `### Glob
使用 glob 模式搜索文件。

**参数:**
- \`pattern\` (必需): glob 模式
- \`path\` (可选): 搜索目录

**示例:**
\`\`\`tool
{
  "tool": "Glob",
  "input": { "pattern": "**/*.ts" }
}
\`\`\``,

  Grep: `### Grep
在文件中搜索内容（正则表达式）。

**参数:**
- \`pattern\` (必需): 正则表达式
- \`path\` (可选): 搜索路径
- \`include\` (可选): 文件类型过滤
- \`context_lines\` (可选): 上下文行数

**示例:**
\`\`\`tool
{
  "tool": "Grep",
  "input": {
    "pattern": "function\\\\s+\\\\w+",
    "include": "*.ts"
  }
}
\`\`\``,
};

export function getToolPrompts(toolNames: string[]): string[] {
  return toolNames
    .filter(name => name in TOOL_PROMPTS)
    .map(name => TOOL_PROMPTS[name as keyof typeof TOOL_PROMPTS]);
}
