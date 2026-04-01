/**
 * 工具系统索引
 * 导出所有可用工具和类型
 */

// 类型导出
export * from './types';
export { buildTool } from './buildTool';

// 工具导出
export { FileReadTool } from './FileReadTool';
export { FileWriteTool } from './FileWriteTool';
export { FileEditTool } from './FileEditTool';
export { BashTool } from './BashTool';
export { ShellTool } from './ShellTool';
export { GlobTool } from './GlobTool';
export { GrepTool } from './GrepTool';
export { WebFetchTool } from './WebFetchTool';
export { WebSearchTool } from './WebSearchTool';
export { RemoteTool } from './RemoteTool';

// 工具列表
import { FileReadTool } from './FileReadTool';
import { FileWriteTool } from './FileWriteTool';
import { FileEditTool } from './FileEditTool';
import { BashTool } from './BashTool';
import { ShellTool } from './ShellTool';
import { GlobTool } from './GlobTool';
import { GrepTool } from './GrepTool';
import { WebFetchTool } from './WebFetchTool';
import { WebSearchTool } from './WebSearchTool';
import { RemoteTool } from './RemoteTool';
import { Tool, Tools } from './types';

export const ALL_TOOLS: Tools = [
  FileReadTool as Tool,
  FileWriteTool as Tool,
  FileEditTool as Tool,
  BashTool as Tool,
  ShellTool as Tool,
  GlobTool as Tool,
  GrepTool as Tool,
  WebFetchTool as Tool,
  WebSearchTool as Tool,
  RemoteTool as Tool,
];

export function getToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find(tool => tool.name === name || tool.name.toLowerCase() === name.toLowerCase());
}

export function getEnabledTools(): Tools {
  return ALL_TOOLS.filter(tool => tool.isEnabled());
}

/**
 * 生成工具描述，用于系统提示词
 */
export function generateToolsPrompt(tools: Tools = ALL_TOOLS): string {
  const enabledTools = tools.filter(t => t.isEnabled());
  
  const toolDescriptions = enabledTools.map(tool => {
    const props = tool.inputSchema.properties;
    const params = Object.entries(props).map(([name, prop]) => {
      const required = tool.inputSchema.required?.includes(name) ? '' : '(可选)';
      return `  - ${name}${required}: ${prop.description || prop.type}`;
    }).join('\n');
    
    return `### ${tool.name}
${tool.description}

参数:
${params}`;
  });
  
  return `# 可用工具

你可以使用以下工具来完成任务：

${toolDescriptions.join('\n\n')}

## 工具使用格式

当你需要使用工具时，请使用以下 JSON 格式：

\`\`\`json
{
  "tool": "工具名称",
  "input": {
    "参数名": "参数值"
  }
}
\`\`\`
`;
}
