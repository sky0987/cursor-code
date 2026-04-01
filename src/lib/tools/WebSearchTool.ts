/**
 * WebSearchTool - 网络搜索工具
 * 参考 Claude Code CLI 源码实现
 * 
 * 功能：
 * - 搜索网络获取最新信息
 * - 支持域名过滤（白名单/黑名单）
 * - 返回搜索结果和摘要
 */

import { buildTool } from './buildTool';
import type { ToolInput, ToolOutput } from './types';

export interface WebSearchInput extends ToolInput {
    query: string;
    allowed_domains?: string | string[];
    blocked_domains?: string | string[];
    max_results?: number;
}

export interface SearchResult {
    title: string;
    url: string;
    snippet?: string;
}

export interface WebSearchOutput extends ToolOutput {
    query: string;
    results: SearchResult[];
    summary?: string;
    durationSeconds: number;
    success: boolean;
    error?: string;
}

const WEB_SEARCH_TOOL_NAME = 'WebSearch';

function getLocalMonthYear(): string {
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'long' });
    const year = now.getFullYear();
    return `${month} ${year}`;
}

export function getWebSearchPrompt(): string {
    const currentMonthYear = getLocalMonthYear();
    return `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Domain filtering is supported to include or block specific websites

IMPORTANT - Use the correct year in search queries:
  - The current month is ${currentMonthYear}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If the user asks for "latest React docs", search for "React documentation" with the current year, NOT last year
`;
}

export const WebSearchTool = buildTool<WebSearchInput, WebSearchOutput>({
    name: WEB_SEARCH_TOOL_NAME,
    description: '搜索网络获取最新信息。支持域名过滤。',
    
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '搜索查询关键词',
            },
            allowed_domains: {
                type: 'string',
                description: '只包含这些域名的搜索结果（逗号分隔）',
            },
            blocked_domains: {
                type: 'string',
                description: '排除这些域名的搜索结果（逗号分隔）',
            },
            max_results: {
                type: 'number',
                description: '最大返回结果数，默认 10',
            },
        },
        required: ['query'],
    },
    
    isReadOnly() { return true; },
    isConcurrencySafe() { return true; },
    
    async validateInput(input: WebSearchInput) {
        if (!input.query || input.query.trim().length < 2) {
            return {
                valid: false,
                error: 'Error: Missing or too short query (minimum 2 characters)',
            };
        }
        const allowed = typeof input.allowed_domains === 'string' 
            ? input.allowed_domains.split(',').filter(Boolean)
            : input.allowed_domains;
        const blocked = typeof input.blocked_domains === 'string'
            ? input.blocked_domains.split(',').filter(Boolean)
            : input.blocked_domains;
        if (allowed?.length && blocked?.length) {
            return {
                valid: false,
                error: 'Error: Cannot specify both allowed_domains and blocked_domains',
            };
        }
        return { valid: true };
    },
    
    async call(input: WebSearchInput, context): Promise<WebSearchOutput> {
        const startTime = performance.now();
        const { query, max_results = 10 } = input;
        
        // 处理域名参数（支持字符串或数组）
        const allowed_domains = typeof input.allowed_domains === 'string' 
            ? input.allowed_domains.split(',').map(d => d.trim()).filter(Boolean)
            : input.allowed_domains;
        const blocked_domains = typeof input.blocked_domains === 'string'
            ? input.blocked_domains.split(',').map(d => d.trim()).filter(Boolean)
            : input.blocked_domains;
        
        // 使用 DuckDuckGo HTML 搜索（免费，无需 API key）
        const searchUrl = buildDuckDuckGoUrl(query, allowed_domains, blocked_domains);
        
        try {
            const response = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
                },
            });
            
            if (!response.ok) {
                throw new Error(`Search failed: HTTP ${response.status}`);
            }
            
            const html = await response.text();
            const results = parseDuckDuckGoResults(html, max_results, allowed_domains, blocked_domains);
            
            const endTime = performance.now();
            const durationSeconds = (endTime - startTime) / 1000;
            
            // 生成摘要
            const summary = results.length > 0
                ? `Found ${results.length} results for "${query}"`
                : `No results found for "${query}"`;
            
            return {
                success: true,
                query,
                results,
                summary,
                durationSeconds,
            };
        } catch (error) {
            const endTime = performance.now();
            const durationSeconds = (endTime - startTime) / 1000;
            
            return {
                success: false,
                error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
                query,
                results: [],
                durationSeconds,
            };
        }
    },
    
    formatOutput(output: WebSearchOutput): string {
        if (!output.success) {
            return `❌ 搜索失败: ${output.error}`;
        }
        
        let result = `🔍 Web Search Results for: "${output.query}"\n`;
        result += `⏱️ Completed in ${output.durationSeconds.toFixed(2)}s\n\n`;
        
        if (output.results.length === 0) {
            result += 'No results found.\n';
        } else {
            output.results.forEach((item, index) => {
                result += `${index + 1}. **${item.title}**\n`;
                result += `   ${item.url}\n`;
                if (item.snippet) {
                    result += `   ${item.snippet}\n`;
                }
                result += '\n';
            });
        }
        
        result += '\nREMINDER: Include sources with markdown hyperlinks in your response.';
        
        return result;
    },
});

function buildDuckDuckGoUrl(
    query: string,
    allowedDomains?: string[],
    blockedDomains?: string[]
): string {
    let searchQuery = query;
    
    // 添加域名过滤
    if (allowedDomains?.length) {
        const siteFilter = allowedDomains.map(d => `site:${d}`).join(' OR ');
        searchQuery = `${query} (${siteFilter})`;
    }
    if (blockedDomains?.length) {
        const excludeFilter = blockedDomains.map(d => `-site:${d}`).join(' ');
        searchQuery = `${query} ${excludeFilter}`;
    }
    
    return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
}

function parseDuckDuckGoResults(
    html: string,
    maxResults: number,
    allowedDomains?: string[],
    blockedDomains?: string[]
): SearchResult[] {
    const results: SearchResult[] = [];
    
    // 简单的 HTML 解析提取搜索结果
    // DuckDuckGo HTML 版本的结果在 class="result" 的 div 中
    const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/gi;
    
    let match;
    let snippetMatch;
    const snippets: string[] = [];
    
    // 提取所有 snippets
    while ((snippetMatch = snippetPattern.exec(html)) !== null) {
        snippets.push(cleanHtmlText(snippetMatch[1]));
    }
    
    let index = 0;
    while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
        let url = match[1];
        const title = cleanHtmlText(match[2]);
        
        // DuckDuckGo 使用重定向 URL，需要提取真实 URL
        if (url.includes('uddg=')) {
            const uddgMatch = url.match(/uddg=([^&]*)/);
            if (uddgMatch) {
                url = decodeURIComponent(uddgMatch[1]);
            }
        }
        
        // 跳过无效 URL
        if (!url.startsWith('http')) {
            index++;
            continue;
        }
        
        // 检查域名过滤
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace(/^www\./, '');
            
            if (allowedDomains?.length) {
                const isAllowed = allowedDomains.some(d => 
                    domain === d || domain.endsWith('.' + d)
                );
                if (!isAllowed) {
                    index++;
                    continue;
                }
            }
            
            if (blockedDomains?.length) {
                const isBlocked = blockedDomains.some(d => 
                    domain === d || domain.endsWith('.' + d)
                );
                if (isBlocked) {
                    index++;
                    continue;
                }
            }
        } catch {
            index++;
            continue;
        }
        
        results.push({
            title: title || url,
            url,
            snippet: snippets[index] || undefined,
        });
        
        index++;
    }
    
    return results;
}

function cleanHtmlText(text: string): string {
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

export default WebSearchTool;
