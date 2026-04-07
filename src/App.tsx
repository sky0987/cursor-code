import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// 安全获取 electron ipcRenderer，在浏览器环境中返回 mock
const getIpcRenderer = () => {
  try {
    if (typeof window !== 'undefined' && window.require) {
      return window.require('electron').ipcRenderer;
    }
  } catch (e) {
    console.warn('Not running in Electron environment');
  }
  // 返回一个 mock 对象，避免在浏览器中报错
  return {
    invoke: async (channel: string, ...args: unknown[]) => {
      console.log(`[Mock IPC] invoke: ${channel}`, args);
      return null;
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      console.log(`[Mock IPC] on: ${channel}`);
      return { removeListener: () => {} };
    },
    removeListener: () => {},
    removeAllListeners: () => {},
    send: (channel: string, ...args: unknown[]) => {
      console.log(`[Mock IPC] send: ${channel}`, args);
    },
  };
};

const ipcRenderer = getIpcRenderer();

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

// ==================== API 厂商配置 ====================

// 支持的 API 厂商
type ApiProvider = 'cursor2api' | 'openai' | 'anthropic' | 'google' | 'deepseek' | 'qwen' | 'mimo' | 'openrouter' | 'custom';

// 厂商信息
const API_PROVIDERS: Record<ApiProvider, {
  name: string;
  icon: string;
  needsProxy: boolean;
  defaultBaseUrl: string;
  models: { id: string; name: string; group?: string }[];
}> = {
  cursor2api: {
    name: 'Cursor2API',
    icon: '🤖',
    needsProxy: false,
    defaultBaseUrl: 'http://localhost:3010',
    models: [
      { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', group: 'Gemini' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', group: 'Claude' },
      { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', group: 'Claude' },
      { id: 'openai/gpt-5.4', name: 'GPT-5.4', group: 'OpenAI' },
    ],
  },
  openai: {
    name: 'OpenAI',
    icon: '🧠',
    needsProxy: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      // GPT-5.4 系列 (最新)
      { id: 'gpt-5.4', name: 'GPT-5.4 (最新旗舰)', group: 'GPT-5.4 系列' },
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', group: 'GPT-5.4 系列' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', group: 'GPT-5.4 系列' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', group: 'GPT-5.4 系列' },
      // GPT-5.3 系列
      { id: 'gpt-5.3-chat-latest', name: 'GPT-5.3 Chat', group: 'GPT-5.3 系列' },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', group: 'GPT-5.3 系列' },
      // GPT-5.2 系列
      { id: 'gpt-5.2', name: 'GPT-5.2', group: 'GPT-5.2 系列' },
      { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', group: 'GPT-5.2 系列' },
      { id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Chat', group: 'GPT-5.2 系列' },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', group: 'GPT-5.2 系列' },
      // GPT-5.1 系列
      { id: 'gpt-5.1', name: 'GPT-5.1', group: 'GPT-5.1 系列' },
      { id: 'gpt-5.1-chat-latest', name: 'GPT-5.1 Chat', group: 'GPT-5.1 系列' },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', group: 'GPT-5.1 系列' },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', group: 'GPT-5.1 系列' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', group: 'GPT-5.1 系列' },
      // GPT-5 系列
      { id: 'gpt-5', name: 'GPT-5', group: 'GPT-5 系列' },
      { id: 'gpt-5-pro', name: 'GPT-5 Pro', group: 'GPT-5 系列' },
      { id: 'gpt-5-chat-latest', name: 'GPT-5 Chat', group: 'GPT-5 系列' },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', group: 'GPT-5 系列' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', group: 'GPT-5 系列' },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano', group: 'GPT-5 系列' },
      { id: 'gpt-5-search-api', name: 'GPT-5 Search', group: 'GPT-5 系列' },
      // O 推理系列
      { id: 'o4-mini', name: 'O4 Mini (最新)', group: 'O 推理系列' },
      { id: 'o3', name: 'O3', group: 'O 推理系列' },
      { id: 'o3-mini', name: 'O3 Mini', group: 'O 推理系列' },
      { id: 'o1', name: 'O1', group: 'O 推理系列' },
      { id: 'o1-pro', name: 'O1 Pro', group: 'O 推理系列' },
      // GPT-4.1 系列
      { id: 'gpt-4.1', name: 'GPT-4.1', group: 'GPT-4.1 系列' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', group: 'GPT-4.1 系列' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', group: 'GPT-4.1 系列' },
      // GPT-4o 系列
      { id: 'gpt-4o', name: 'GPT-4o', group: 'GPT-4o 系列' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', group: 'GPT-4o 系列' },
      { id: 'gpt-4o-search-preview', name: 'GPT-4o Search', group: 'GPT-4o 系列' },
      { id: 'gpt-4o-mini-search-preview', name: 'GPT-4o Mini Search', group: 'GPT-4o 系列' },
      // GPT-4 系列
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', group: 'GPT-4 系列' },
      { id: 'gpt-4', name: 'GPT-4', group: 'GPT-4 系列' },
      // GPT-3.5 系列
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', group: 'GPT-3.5 系列' },
      { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K', group: 'GPT-3.5 系列' },
      { id: 'gpt-3.5-turbo-instruct', name: 'GPT-3.5 Instruct', group: 'GPT-3.5 系列' },
      // 音频模型
      { id: 'gpt-audio-1.5', name: 'GPT Audio 1.5', group: '音频模型' },
      { id: 'gpt-audio', name: 'GPT Audio', group: '音频模型' },
      { id: 'gpt-audio-mini', name: 'GPT Audio Mini', group: '音频模型' },
      { id: 'gpt-4o-audio-preview', name: 'GPT-4o Audio', group: '音频模型' },
      { id: 'gpt-4o-mini-audio-preview', name: 'GPT-4o Mini Audio', group: '音频模型' },
      // 实时模型
      { id: 'gpt-realtime-1.5', name: 'GPT Realtime 1.5', group: '实时模型' },
      { id: 'gpt-realtime', name: 'GPT Realtime', group: '实时模型' },
      { id: 'gpt-realtime-mini', name: 'GPT Realtime Mini', group: '实时模型' },
      { id: 'gpt-4o-realtime-preview', name: 'GPT-4o Realtime', group: '实时模型' },
      { id: 'gpt-4o-mini-realtime-preview', name: 'GPT-4o Mini Realtime', group: '实时模型' },
      // 语音转文字
      { id: 'whisper-1', name: 'Whisper 1', group: '语音识别' },
      { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe', group: '语音识别' },
      { id: 'gpt-4o-transcribe-diarize', name: 'GPT-4o Transcribe Diarize', group: '语音识别' },
      { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', group: '语音识别' },
      // 文字转语音
      { id: 'tts-1', name: 'TTS-1', group: '语音合成' },
      { id: 'tts-1-hd', name: 'TTS-1 HD', group: '语音合成' },
      { id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS', group: '语音合成' },
      // 图像生成
      { id: 'dall-e-3', name: 'DALL-E 3', group: '图像生成' },
      { id: 'dall-e-2', name: 'DALL-E 2', group: '图像生成' },
      { id: 'gpt-image-1.5', name: 'GPT Image 1.5', group: '图像生成' },
      { id: 'gpt-image-1', name: 'GPT Image 1', group: '图像生成' },
      { id: 'gpt-image-1-mini', name: 'GPT Image 1 Mini', group: '图像生成' },
      { id: 'chatgpt-image-latest', name: 'ChatGPT Image', group: '图像生成' },
      // 视频生成
      { id: 'sora-2', name: 'Sora 2', group: '视频生成' },
      { id: 'sora-2-pro', name: 'Sora 2 Pro', group: '视频生成' },
      // Embedding 模型
      { id: 'text-embedding-3-large', name: 'Embedding 3 Large', group: 'Embedding' },
      { id: 'text-embedding-3-small', name: 'Embedding 3 Small', group: 'Embedding' },
      { id: 'text-embedding-ada-002', name: 'Embedding Ada 002', group: 'Embedding' },
      // 内容审核
      { id: 'omni-moderation-latest', name: 'Omni Moderation', group: '内容审核' },
      // 基础模型
      { id: 'davinci-002', name: 'Davinci 002', group: '基础模型' },
      { id: 'babbage-002', name: 'Babbage 002', group: '基础模型' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    icon: '🟣',
    needsProxy: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    models: [
      // Claude 4.6 系列 (最新)
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (最强)', group: 'Claude 4.6' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (均衡)', group: 'Claude 4.6' },
      // Claude 4.5 系列
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (快速)', group: 'Claude 4.5' },
      { id: 'claude-opus-4-5-20251001', name: 'Claude Opus 4.5', group: 'Claude 4.5' },
      { id: 'claude-sonnet-4-5-20251001', name: 'Claude Sonnet 4.5', group: 'Claude 4.5' },
      // Claude 4 系列
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', group: 'Claude 4' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', group: 'Claude 4' },
      // Claude 3.5 系列
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', group: 'Claude 3.5' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', group: 'Claude 3.5' },
      // Claude 3 系列
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', group: 'Claude 3' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', group: 'Claude 3' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', group: 'Claude 3' },
    ],
  },
  google: {
    name: 'Google Gemini',
    icon: '🔷',
    needsProxy: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      // Gemini 3 系列 (最新)
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview (最新)', group: 'Gemini 3 系列' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', group: 'Gemini 3 系列' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', group: 'Gemini 3 系列' },
      { id: 'gemini-3.1-flash-live', name: 'Gemini 3.1 Flash Live', group: 'Gemini 3 系列' },
      // Gemini 2.5 系列
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', group: 'Gemini 2.5 系列' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', group: 'Gemini 2.5 系列' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', group: 'Gemini 2.5 系列' },
      { id: 'gemini-2.5-flash-live-preview', name: 'Gemini 2.5 Flash Live', group: 'Gemini 2.5 系列' },
      // Gemini 2.0 系列
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', group: 'Gemini 2.0 系列' },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp', group: 'Gemini 2.0 系列' },
      // Gemini 1.5 系列
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', group: 'Gemini 1.5 系列' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', group: 'Gemini 1.5 系列' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash-8B', group: 'Gemini 1.5 系列' },
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    icon: '🐋',
    needsProxy: false,
    defaultBaseUrl: 'https://api.deepseek.com',
    models: [
      // V3 系列 (最新)
      { id: 'deepseek-chat', name: 'DeepSeek V3.2 Chat (最新)', group: 'V3 系列' },
      { id: 'deepseek-reasoner', name: 'DeepSeek V3.2 Reasoner', group: 'V3 系列' },
      // R1 推理系列
      { id: 'deepseek-r1', name: 'DeepSeek R1 (671B)', group: 'R1 推理系列' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'R1-Distill Llama 70B', group: 'R1 推理系列' },
      { id: 'deepseek-r1-distill-qwen-32b', name: 'R1-Distill Qwen 32B', group: 'R1 推理系列' },
      { id: 'deepseek-r1-distill-qwen-14b', name: 'R1-Distill Qwen 14B', group: 'R1 推理系列' },
      { id: 'deepseek-r1-distill-qwen-7b', name: 'R1-Distill Qwen 7B', group: 'R1 推理系列' },
      { id: 'deepseek-r1-distill-qwen-1.5b', name: 'R1-Distill Qwen 1.5B', group: 'R1 推理系列' },
      // Coder 系列
      { id: 'deepseek-coder', name: 'DeepSeek Coder', group: 'Coder 系列' },
      { id: 'deepseek-coder-33b', name: 'DeepSeek Coder 33B', group: 'Coder 系列' },
      { id: 'deepseek-coder-6.7b', name: 'DeepSeek Coder 6.7B', group: 'Coder 系列' },
    ],
  },
  qwen: {
    name: '通义千问',
    icon: '🟢',
    needsProxy: false,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      // Qwen 3.5 系列 (最新)
      { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus (最新)', group: 'Qwen 3.5 系列' },
      { id: 'qwen3.5-flash', name: 'Qwen 3.5 Flash', group: 'Qwen 3.5 系列' },
      // Qwen 3 系列
      { id: 'qwen3-max', name: 'Qwen 3 Max (最强)', group: 'Qwen 3 系列' },
      { id: 'qwen3-max-thinking', name: 'Qwen 3 Max Thinking', group: 'Qwen 3 系列' },
      // 通用系列
      { id: 'qwen-max', name: 'Qwen Max', group: '通用系列' },
      { id: 'qwen-plus', name: 'Qwen Plus', group: '通用系列' },
      { id: 'qwen-turbo', name: 'Qwen Turbo', group: '通用系列' },
      { id: 'qwen-long', name: 'Qwen Long (长文本)', group: '通用系列' },
      // 推理增强
      { id: 'qwq-plus', name: 'QWQ Plus (推理增强)', group: '推理系列' },
      { id: 'qwq-32b', name: 'QWQ 32B', group: '推理系列' },
      // 视觉系列
      { id: 'qwen-vl-max', name: 'Qwen VL Max (视觉)', group: '视觉系列' },
      { id: 'qwen-vl-plus', name: 'Qwen VL Plus', group: '视觉系列' },
      // 代码系列
      { id: 'qwen-coder-plus', name: 'Qwen Coder Plus', group: '代码系列' },
      { id: 'qwen-coder-turbo', name: 'Qwen Coder Turbo', group: '代码系列' },
      // 多模态
      { id: 'qwen-omni', name: 'Qwen Omni (全模态)', group: '多模态' },
    ],
  },
  mimo: {
    name: '小米 MiMo',
    icon: '🟠',
    needsProxy: false,
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    models: [
      // MiMo-V2 系列
      { id: 'mimo-v2-pro', name: 'MiMo-V2 Pro (1M上下文)', group: 'MiMo-V2 系列' },
      { id: 'mimo-v2-omni', name: 'MiMo-V2 Omni (多模态)', group: 'MiMo-V2 系列' },
      { id: 'mimo-v2-flash', name: 'MiMo-V2 Flash (快速)', group: 'MiMo-V2 系列' },
      // 语音系列
      { id: 'mimo-v2-tts', name: 'MiMo-V2 TTS (语音合成)', group: '语音系列' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    icon: '🌐',
    needsProxy: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    models: [
      // Claude 系列
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', group: 'Claude' },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', group: 'Claude' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', group: 'Claude' },
      { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', group: 'Claude' },
      // GPT 系列
      { id: 'openai/gpt-4o', name: 'GPT-4o', group: 'OpenAI' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', group: 'OpenAI' },
      { id: 'openai/o1', name: 'O1', group: 'OpenAI' },
      { id: 'openai/o1-mini', name: 'O1 Mini', group: 'OpenAI' },
      { id: 'openai/o3-mini', name: 'O3 Mini', group: 'OpenAI' },
      // Gemini 系列
      { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', group: 'Google' },
      { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', group: 'Google' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', group: 'Google' },
      // 小米 MiMo
      { id: 'xiaomi/mimo-v2-pro', name: 'MiMo-V2 Pro', group: '小米' },
      // DeepSeek
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', group: 'DeepSeek' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', group: 'DeepSeek' },
      // Qwen (通义千问) - 2026年4月最新
      { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (免费/1M上下文)', group: '通义千问' },
      { id: 'qwen/qwen3-235b-a22b-instruct-2507', name: 'Qwen3 235B A22B (262K上下文)', group: '通义千问' },
      { id: 'qwen/qwen3.5-flash', name: 'Qwen 3.5 Flash (1M上下文)', group: '通义千问' },
      { id: 'qwen/qwq-32b', name: 'QWQ 32B (推理)', group: '通义千问' },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', group: '通义千问' },
      // Meta Llama
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', group: 'Meta' },
      { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', group: 'Meta' },
      // Mistral
      { id: 'mistralai/mistral-large', name: 'Mistral Large', group: 'Mistral' },
      { id: 'mistralai/codestral', name: 'Codestral', group: 'Mistral' },
      // 免费模型 (2026年4月最新)
      { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (1M上下文)', group: '免费模型' },
      { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash (256K)', group: '免费模型' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (262K)', group: '免费模型' },
      { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large 400B (131K)', group: '免费模型' },
      { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air (131K)', group: '免费模型' },
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B (256K)', group: '免费模型' },
      { id: 'minimax/minimax-m2.5:free', name: 'MiniMax M2.5 (197K)', group: '免费模型' },
      { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini 26B (131K)', group: '免费模型' },
      { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B VL (128K)', group: '免费模型' },
      { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (131K)', group: '免费模型' },
      { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B (262K)', group: '免费模型' },
      { id: 'liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM 2.5 Thinking (32K)', group: '免费模型' },
      { id: 'liquid/lfm-2.5-1.2b-instruct:free', name: 'LFM 2.5 Instruct (32K)', group: '免费模型' },
      { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B', group: '免费模型' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', group: '免费模型' },
    ],
  },
  custom: {
    name: '自定义中转站',
    icon: '🔧',
    needsProxy: false,
    defaultBaseUrl: '',
    models: [],
  },
};

// 厂商配置接口
interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  useProxy: boolean;
  proxyUrl: string;
  selectedModel: string;
  customModels?: string; // 自定义模型列表，逗号分隔
}

// 所有厂商配置
type AllProvidersConfig = Record<ApiProvider, ProviderConfig>;

// 默认配置
const getDefaultProviderConfig = (provider: ApiProvider): ProviderConfig => ({
  apiKey: '',
  baseUrl: API_PROVIDERS[provider].defaultBaseUrl,
  enabled: false,
  useProxy: API_PROVIDERS[provider].needsProxy,
  proxyUrl: 'http://127.0.0.1:7890',
  selectedModel: API_PROVIDERS[provider].models[0]?.id || '',
  customModels: '',
});

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
  const streamTextRef = useRef('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [cwd, setCwd] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const [permissionMode, setPermissionMode] = useState<'default' | 'auto'>(() => {
    return (localStorage.getItem('permission-mode') as 'default' | 'auto') || 'default';
  });
  const [toolConfirmation, setToolConfirmation] = useState<{
    show: boolean;
    toolName: string;
    toolInput: Record<string, unknown>;
    requestId: string;
    description: string;
  } | null>(null);
  // 当前选择的厂商
  const [currentProvider, setCurrentProvider] = useState<ApiProvider>(() => {
    return (localStorage.getItem('current-provider') as ApiProvider) || 'cursor2api';
  });
  
  // 所有厂商配置
  const [providersConfig, setProvidersConfig] = useState<AllProvidersConfig>(() => {
    // 先构建默认配置
    const defaults: AllProvidersConfig = {} as AllProvidersConfig;
    (Object.keys(API_PROVIDERS) as ApiProvider[]).forEach(p => {
      defaults[p] = getDefaultProviderConfig(p);
    });
    // cursor2api 默认启用
    defaults.cursor2api.enabled = true;
    defaults.cursor2api.apiKey = 'sk-cursor2api';
    
    // 从 localStorage 加载并合并
    const saved = localStorage.getItem('providers-config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 合并保存的配置到默认配置
        (Object.keys(API_PROVIDERS) as ApiProvider[]).forEach(p => {
          if (parsed[p]) {
            defaults[p] = { ...defaults[p], ...parsed[p] };
          }
        });
      } catch (e) {
        console.error('Failed to parse providers config:', e);
      }
    }
    return defaults;
  });
  
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [cursor2apiStatus, setCursor2apiStatus] = useState<Cursor2ApiStatus>({ running: false });
  
  // 当前厂商配置的快捷访问（带安全检查）
  const currentConfig = providersConfig[currentProvider] || getDefaultProviderConfig(currentProvider);
  const currentProviderInfo = API_PROVIDERS[currentProvider];
  
  // 更新单个厂商配置
  const updateProviderConfig = (provider: ApiProvider, updates: Partial<ProviderConfig>) => {
    setProvidersConfig(prev => {
      const existing = prev[provider] || getDefaultProviderConfig(provider);
      return {
        ...prev,
        [provider]: { ...existing, ...updates }
      };
    });
  };
  
  // SSH 远程管理状态
  const [showSSHManager, setShowSSHManager] = useState(false);
  const [sshConfigs, setSSHConfigs] = useState<SSHConfig[]>([]);
  const [sshStatus, setSSHStatus] = useState<SSHStatus>({ connected: false });
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileItem[]>([]);
  const [remoteCwd, setRemoteCwd] = useState('/');
  const [editingSSH, setEditingSSH] = useState<SSHConfig | null>(null);
  const [sshConnecting, setSSHConnecting] = useState(false);
  
  // 输入历史功能
  const [inputHistory, setInputHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('input-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState(''); // 保存当前输入（未发送时）
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 保存厂商选择和配置
  useEffect(() => {
    localStorage.setItem('current-provider', currentProvider);
  }, [currentProvider]);

  useEffect(() => {
    localStorage.setItem('providers-config', JSON.stringify(providersConfig));
    // 通知后端配置变更
    ipcRenderer.invoke('set-provider-config', { provider: currentProvider, config: providersConfig[currentProvider] });
  }, [providersConfig, currentProvider]);

  // 保存权限模式
  useEffect(() => {
    localStorage.setItem('permission-mode', permissionMode);
    ipcRenderer.invoke('set-permission-mode', permissionMode);
  }, [permissionMode]);

  // 主题切换
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 监听工具确认请求
  useEffect(() => {
    const handleToolConfirm = (_: any, data: { 
      toolName: string; 
      toolInput: Record<string, unknown>; 
      requestId: string;
      description: string;
    }) => {
      setToolConfirmation({
        show: true,
        ...data
      });
    };

    ipcRenderer.on('tool-confirm-request', handleToolConfirm);
    return () => {
      ipcRenderer.removeListener('tool-confirm-request', handleToolConfirm);
    };
  }, []);

  // 处理工具确认响应
  const handleToolConfirmResponse = (approved: boolean) => {
    if (toolConfirmation) {
      ipcRenderer.invoke('tool-confirm-response', {
        requestId: toolConfirmation.requestId,
        approved
      });
      setToolConfirmation(null);
    }
  };

  // 全局禁用拖拽默认行为，防止文件被浏览器打开
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    // 在 document 级别阻止默认行为
    document.addEventListener('dragover', preventDefault);
    document.addEventListener('drop', preventDefault);
    
    return () => {
      document.removeEventListener('dragover', preventDefault);
      document.removeEventListener('drop', preventDefault);
    };
  }, []);

  // 获取 cursor2api 状态
  useEffect(() => {
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
    if (window.confirm('确定要删除此连接配置吗？')) {
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

  useEffect(() => {
    loadCwd();
    
    const handleStream = (_: any, text: string) => {
      if (text) {
        setStreamText(prev => {
          const updated = prev + text;
          streamTextRef.current = updated;
          return updated;
        });
      }
    };
    
    const handleEnd = (_: any, data: { response: string; savedFiles: any[]; toolResults?: ToolResult[] }) => {
      console.log('[App] chat-end received:', data);
      
      // 优先用 streamTextRef（包含工具标记），没有才用 data.response
      let response = streamTextRef.current || data?.response || '';
      
      if (!response.trim()) {
        response = '抱歉，没有收到有效响应，请重试。';
      }
      
      // 处理工具调用结果（仅通知）
      const results = data?.toolResults || [];
      if (results.length > 0) {
        setToolResults(results);
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
      }]);
      setStreamText('');
      streamTextRef.current = '';
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
      if (streamTextRef.current) {
        setMessages(prev => [...prev, { role: 'assistant', content: streamTextRef.current + '\n\n*(已停止)*' }]);
      }
      setStreamText('');
      streamTextRef.current = '';
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
    
    // 保存到输入历史
    if (userMsg) {
      const newHistory = [userMsg, ...inputHistory.filter(h => h !== userMsg)].slice(0, 50);
      setInputHistory(newHistory);
      localStorage.setItem('input-history', JSON.stringify(newHistory));
    }
    setHistoryIndex(-1);
    setTempInput('');
    
    setInput('');
    setSelectedImages([]);
    setMessages(prev => [...prev, { role: 'user', content: userMsg, images: imagesToSend.length > 0 ? imagesToSend : undefined }]);
    setLoading(true);
    setStreamText('');

    try {
      // 统一的 chat 调用，使用当前选择的厂商配置
      await ipcRenderer.invoke('chat-with-provider', {
        provider: currentProvider,
        config: currentConfig,
        userText: userMsg,
        images: imagesToSend,
        model: currentConfig.selectedModel,
        isRemoteMode,
        remoteCwd: isRemoteMode ? remoteCwd : undefined,
      });
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${err.message}` }]);
      setLoading(false);
    }
  };

  // 保存 cursor2api 配置 (已移至 provider 配置系统)

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

  // 处理输入框键盘事件（上下键浏览历史）
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (inputHistory.length === 0) return;
      
      if (historyIndex === -1) {
        // 保存当前输入
        setTempInput(input);
        setHistoryIndex(0);
        setInput(inputHistory[0]);
      } else if (historyIndex < inputHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(inputHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      
      if (historyIndex === 0) {
        // 恢复到当前输入
        setHistoryIndex(-1);
        setInput(tempInput);
      } else {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(inputHistory[newIndex]);
      }
    } else if (e.key === 'Escape') {
      // 取消历史浏览，恢复原始输入
      if (historyIndex >= 0) {
        e.preventDefault();
        setHistoryIndex(-1);
        setInput(tempInput);
      }
    } else if (e.key === 'Enter' && !loading) {
      sendMessage();
    }
  };

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 检查是否有文件
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 确保是离开了拖拽区域，而不是进入子元素
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // 获取文件列表
    const files = Array.from(e.dataTransfer.files);
    console.log('[Drop] Files:', files);
    
    if (files.length > 0) {
      // Electron 环境下，File 对象有 path 属性
      const paths: string[] = [];
      for (const file of files) {
        // Electron 的 File 对象有 path 属性
        const filePath = (file as any).path;
        console.log('[Drop] File path:', filePath, 'name:', file.name);
        if (filePath) {
          paths.push(filePath);
        } else {
          // 备用：使用文件名
          paths.push(file.name);
        }
      }
      
      if (paths.length > 0) {
        const pathsStr = paths.join(' ');
        setInput(prev => {
          const prefix = prev.trim() ? prev.trim() + ' ' : '';
          return prefix + pathsStr;
        });
        showNotification(`📁 已添加 ${paths.length} 个文件路径`);
        inputRef.current?.focus();
        return;
      }
    }

    // 处理纯文本拖拽
    const text = e.dataTransfer.getData('text/plain');
    console.log('[Drop] Text:', text);
    if (text) {
      setInput(prev => {
        const prefix = prev.trim() ? prev.trim() + ' ' : '';
        return prefix + text;
      });
      showNotification(`📝 已添加文本`);
      inputRef.current?.focus();
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
    
    // 存储工具块数据
    const toolBlocks: Record<string, any> = {};
    
    // 解析工具块 - 新格式 TOOL_BLOCK
    html = html.replace(/<!--TOOL_BLOCK:(.*?)-->/g, (match, jsonStr) => {
      try {
        const data = JSON.parse(jsonStr);
        toolBlocks[data.id] = data;
        return `<!--TOOL_PLACEHOLDER:${data.id}-->`;
      } catch {
        return '';
      }
    });
    
    // 解析工具更新 - TOOL_UPDATE
    html = html.replace(/<!--TOOL_UPDATE:(.*?)-->/g, (match, jsonStr) => {
      try {
        const update = JSON.parse(jsonStr);
        if (toolBlocks[update.id]) {
          toolBlocks[update.id] = { ...toolBlocks[update.id], ...update };
        }
        return '';
      } catch {
        return '';
      }
    });
    
    // 渲染工具块占位符 - 使用原生 <details> 实现折叠
    html = html.replace(/<!--TOOL_PLACEHOLDER:([^>]+)-->/g, (match, id) => {
      const data = toolBlocks[id];
      if (!data) return '';
      
      const isRunning = data.status === 'running';
      const isSuccess = data.status === 'success';
      const isError = data.status === 'error';
      const statusClass = isRunning ? 'running' : (isSuccess ? 'success' : 'error');
      
      const esc = (str: string) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      const inputEsc = esc(data.input || '');
      const outputEsc = esc(data.output || '');
      const descEsc = esc(data.desc || data.tool);
      const cmdPreview = inputEsc.split('\n')[0].slice(0, 50);
      const statusHtml = isRunning ? '<span class="tb-spin"></span>' : `<span class="tb-st ${statusClass}">${isSuccess ? '✓' : '✕'}</span>`;
      const outputBlock = data.output ? `<pre class="tb-out ${isError ? 'error' : ''}">${outputEsc}</pre>` : '';
      
      return `<details class="tb ${statusClass}"><summary class="tb-sum">${data.icon || '⚡'} <b>${descEsc}</b> <code>${cmdPreview}</code>${statusHtml}</summary><pre class="tb-cmd">$ ${inputEsc}</pre>${outputBlock}</details>`;
    });
    
    // 兼容旧格式 - 完成的工具
    html = html.replace(/<!--TOOL_START:(\w+):([^:]*):(.*)-->\s*<!--TOOL_END:(success|error):(\d+)(?::(.*?))?-->/g, 
      (match, toolName, icon, summary, status) => {
        if (!toolName || toolName === 'undefined') return '';
        const desc = (summary || '').split('|')[0] || toolName;
        const details = (summary || '').split('|')[1] || '';
        return `<details class="tb ${status}"><summary class="tb-sum">${icon || '⚡'} <b>${desc}</b> <code>${details.slice(0, 50)}</code><span class="tb-st ${status}">${status === 'success' ? '✓' : '✕'}</span></summary></details>`;
      }
    );
    
    // 兼容旧格式 - 正在执行的工具
    html = html.replace(/<!--TOOL_START:(\w+):([^:]*):(.*)-->/g, 
      (match, toolName, icon, summary) => {
        if (!toolName || toolName === 'undefined') return '';
        const desc = (summary || '').split('|')[0] || toolName;
        const details = (summary || '').split('|')[1] || '';
        return `<details class="tb running"><summary class="tb-sum">${icon || '⚡'} <b>${desc}</b> <code>${details.slice(0, 50)}</code><span class="tb-spin"></span></summary></details>`;
      }
    );

    // 处理被拒绝的工具
    html = html.replace(/<!--TOOL_DENIED:([^>]+)-->/g, 
      (_, toolName) => `<span class="tool-denied">⊘ ${toolName}</span>`
    );

    // 移除孤立的工具标记
    html = html.replace(/<!--TOOL_(?:END|START|DENIED|BLOCK|UPDATE|PLACEHOLDER)[^>]*-->/g, '');
    
    // 完整代码块处理
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = blockIndex++;
      codeBlocksRef.current[idx] = { code: code.trim(), lang: lang || '' };
      const canRun = isExecutableLang(lang);
      const langDisplay = lang || 'code';
      return `<div class="code-block ${canRun ? 'executable' : ''}">
        <div class="code-header">
          <span class="code-lang">${langDisplay}</span>
          <div class="code-actions">
            ${canRun ? `<button class="run-btn" data-index="${idx}">▶ 运行</button>` : ''}
            <button class="copy-btn" data-index="${idx}">📋 复制</button>
          </div>
        </div>
        <pre><code>${escapeHtml(code.trim())}</code></pre>
      </div>`;
    });
    
    // 流式输出时处理未完成的代码块
    if (isStreaming) {
      html = html.replace(/```(\w*)\n([\s\S]*)$/g, (_, lang, code) => {
        const langDisplay = lang || 'code';
        return `<div class="code-block streaming">
          <div class="code-header">
            <span class="code-lang">${langDisplay}</span>
            <span class="streaming-hint">✨ 生成中...</span>
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
    
    // 行内代码
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
    // 粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 链接 [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li class="ul-item">$1</li>');
    html = html.replace(/^• (.+)$/gm, '<li class="ul-item">$1</li>');
    html = html.replace(/(<li class="ul-item">.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ol-item">$1</li>');
    html = html.replace(/(<li class="ol-item">.*<\/li>\n?)+/g, '<ol>$&</ol>');
    // 分隔线
    html = html.replace(/^---$/gm, '<hr>');
    // 清理工具块前后的空行
    html = html.replace(/\n*(<details class="tb)/g, '$1');
    html = html.replace(/(<\/details>)\n*/g, '$1');
    // 换行
    html = html.replace(/\n/g, '<br>');
    
    return html;
  };

  const escapeHtml = (text: string) => {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  // 获取工具的中文描述、图标和详情
  const getToolInfo = (tool: string, input: any, data: any): { icon: string; desc: string; details: string } => {
    switch (tool) {
      case 'Read':
        return { icon: '📄', desc: '读取文件', details: data?.file?.filePath || input?.file_path || '' };
      case 'Write':
        return { icon: '✏️', desc: '写入文件', details: data?.filePath || input?.file_path || '' };
      case 'Edit':
      case 'StrReplace':
        return { icon: '🔧', desc: '编辑文件', details: data?.filePath || input?.file_path || input?.path || '' };
      case 'Delete':
        return { icon: '🗑️', desc: '删除文件', details: data?.filePath || input?.file_path || '' };
      case 'Bash': {
        const cmd = (input?.command || '').toLowerCase();
        let desc = '执行命令';
        if (cmd.startsWith('git ')) desc = 'Git 操作';
        else if (cmd.startsWith('npm ') || cmd.startsWith('yarn ')) desc = '包管理';
        else if (cmd.startsWith('cd ')) desc = '切换目录';
        return { icon: '💻', desc, details: input?.command?.substring(0, 50) || '' };
      }
      case 'Shell':
        return { icon: '⚙️', desc: input?.description || '执行命令', details: input?.command?.substring(0, 50) || '' };
      case 'Glob':
        return { icon: '🔍', desc: '搜索文件', details: `${input?.pattern || ''} (${data?.count || 0} 个)` };
      case 'Grep':
        return { icon: '🔎', desc: '搜索内容', details: `${input?.pattern || ''} (${data?.count || 0} 个匹配)` };
      case 'WebFetch':
        return { icon: '🌐', desc: '获取网页', details: input?.url || '' };
      case 'WebSearch':
        return { icon: '🔍', desc: '网络搜索', details: input?.query || '' };
      case 'Task':
        return { icon: '📋', desc: '执行子任务', details: input?.description || '' };
      case 'TodoWrite':
        return { icon: '✅', desc: '更新任务', details: `${input?.todos?.length || 0} 个任务` };
      case 'SemanticSearch':
        return { icon: '🧠', desc: '语义搜索', details: input?.query?.substring(0, 40) || '' };
      case 'ReadLints':
        return { icon: '⚠️', desc: '检查代码', details: input?.paths?.join(', ') || '全部文件' };
      default:
        return { icon: '🔧', desc: tool, details: '' };
    }
  };

  const renderToolResult = (result: ToolResult) => {
    const { tool, input, success, data, error } = result;
    const { icon, desc, details } = getToolInfo(tool, input, data);
    
    // 错误状态
    if (!success) {
      return (
        <div className="tool-card-cursor error">
          <span className="tool-card-icon">{icon}</span>
          <div className="tool-card-content">
            <span className="tool-card-desc">{desc}</span>
            <span className="tool-card-details tool-error-text">{error}</span>
          </div>
          <span className="tool-card-status-icon error">✗</span>
        </div>
      );
    }

    // 特殊处理：图片预览
    if (tool === 'Read') {
      const readData = data as any;
      if (readData?.type === 'image') {
        return (
          <div className="tool-card-cursor-expanded">
            <div className="tool-card-cursor success">
              <span className="tool-card-icon">🖼️</span>
              <div className="tool-card-content">
                <span className="tool-card-desc">读取图片</span>
                <span className="tool-card-details">{readData.file?.filePath}</span>
              </div>
              <span className="tool-card-status-icon success">✓</span>
            </div>
            <img 
              src={`data:${readData.file?.mimeType};base64,${readData.file?.base64}`}
              alt={readData.file?.filePath}
              className="tool-image"
            />
          </div>
        );
      }
    }

    // 统一的 Cursor 风格卡片
    return (
      <div className="tool-card-cursor success">
        <span className="tool-card-icon">{icon}</span>
        <div className="tool-card-content">
          <span className="tool-card-desc">{desc}</span>
          <span className="tool-card-details">{details}</span>
        </div>
        <span className="tool-card-status-icon success">✓</span>
      </div>
    );
  };

  // 处理复制、执行按钮和工具块展开点击
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const index = parseInt(target.getAttribute('data-index') || '0');
      const block = codeBlocksRef.current[index];
      
      // 处理工具块展开/收起
      const toolHeader = target.closest('.tool-block-header');
      if (toolHeader) {
        const toolBlock = toolHeader.closest('.tool-block');
        if (toolBlock) {
          toolBlock.classList.toggle('expanded');
          return;
        }
      }
      
      if (target.classList.contains('copy-btn') && block) {
        navigator.clipboard.writeText(block.code);
        target.innerHTML = '✅ 已复制';
        target.classList.add('copied');
        setTimeout(() => { 
          target.innerHTML = '📋 复制'; 
          target.classList.remove('copied');
        }, 1500);
      }
      
      if (target.classList.contains('run-btn') && block) {
        target.innerHTML = '⏳ 执行中...';
        target.setAttribute('disabled', 'true');
        runCommand(block.code).finally(() => {
          target.innerHTML = '▶ 运行';
          target.removeAttribute('disabled');
        });
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="app">
      {/* 工具确认弹窗 */}
      {toolConfirmation?.show && (
        <div className="modal-overlay tool-confirm-overlay">
          <div className="modal tool-confirm-modal">
            <div className="modal-header">
              <h3>⚠️ 确认执行</h3>
            </div>
            <div className="modal-body">
              <div className="confirm-content">
                <span className="tool-icon">
                  {toolConfirmation.toolName === 'Bash' || toolConfirmation.toolName === 'Shell' ? '⚙️' :
                   toolConfirmation.toolName === 'Write' ? '📝' :
                   toolConfirmation.toolName === 'Delete' ? '🗑️' : '🔧'}
                </span>
                <div className="tool-info">
                  <h4>{toolConfirmation.toolName}</h4>
                  <p className="tool-desc">{toolConfirmation.description}</p>
                </div>
              </div>
              
              <div className="confirm-actions">
                <button className="confirm-btn deny" onClick={() => handleToolConfirmResponse(false)}>
                  拒绝
                </button>
                <button className="confirm-btn approve" onClick={() => handleToolConfirmResponse(true)}>
                  允许
                </button>
              </div>
              
              <div className="confirm-hint">
                <label>
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPermissionMode('auto');
                        handleToolConfirmResponse(true);
                      }
                    }}
                  />
                  <span>不再询问</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API 配置弹窗 */}
      {showApiConfig && (
        <div className="modal-overlay" onClick={() => setShowApiConfig(false)}>
          <div className="modal api-config-modal multi-provider" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ 多厂商 API 配置</h3>
              <button className="close-btn" onClick={() => setShowApiConfig(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* 厂商选项卡 */}
              <div className="provider-tabs">
                {(Object.keys(API_PROVIDERS) as ApiProvider[]).map(provider => (
                  <button
                    key={provider}
                    className={`provider-tab ${currentProvider === provider ? 'active' : ''}`}
                    onClick={() => setCurrentProvider(provider)}
                  >
                    <span className="tab-icon">{API_PROVIDERS[provider].icon}</span>
                    <span className="tab-name">{API_PROVIDERS[provider].name}</span>
                    {providersConfig[provider].enabled && (
                      <span className="tab-enabled">✓</span>
                    )}
                  </button>
                ))}
              </div>

              {/* 当前厂商配置 */}
              <div className="provider-config">
                <div className="config-header">
                  <h4>{currentProviderInfo.icon} {currentProviderInfo.name}</h4>
                  <label className="enable-switch">
                    <input
                      type="checkbox"
                      checked={currentConfig.enabled}
                      onChange={e => updateProviderConfig(currentProvider, { enabled: e.target.checked })}
                    />
                    <span className="switch-slider"></span>
                    <span className="switch-label">{currentConfig.enabled ? '已启用' : '未启用'}</span>
                  </label>
                </div>

                {/* cursor2api 特殊状态显示 */}
                {currentProvider === 'cursor2api' && (
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
                )}

                {/* API Key */}
                <label className="input-label">API Key</label>
                <input
                  type="password"
                  placeholder={currentProvider === 'cursor2api' ? 'sk-cursor2api' : '输入 API Key'}
                  value={currentConfig.apiKey}
                  onChange={e => updateProviderConfig(currentProvider, { apiKey: e.target.value })}
                  className="api-key-input"
                />

                {/* Base URL */}
                <label className="input-label">Base URL</label>
                <input
                  type="text"
                  placeholder={currentProviderInfo.defaultBaseUrl}
                  value={currentConfig.baseUrl}
                  onChange={e => updateProviderConfig(currentProvider, { baseUrl: e.target.value })}
                  className="api-key-input"
                />

                {/* 代理配置（仅国外厂商显示） */}
                {currentProviderInfo.needsProxy && (
                  <div className="proxy-config">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={currentConfig.useProxy}
                        onChange={e => updateProviderConfig(currentProvider, { useProxy: e.target.checked })}
                      />
                      <span>🌐 使用 Clash 代理（国外服务需要）</span>
                    </label>
                    
                    {currentConfig.useProxy && (
                      <input
                        type="text"
                        placeholder="http://127.0.0.1:7890"
                        value={currentConfig.proxyUrl}
                        onChange={e => updateProviderConfig(currentProvider, { proxyUrl: e.target.value })}
                        className="api-key-input proxy-input"
                      />
                    )}
                  </div>
                )}

                {/* 模型选择 */}
                <label className="input-label">选择模型</label>
                {currentProvider === 'custom' ? (
                  <>
                    <textarea
                      placeholder="输入自定义模型列表，每行一个模型ID"
                      value={currentConfig.customModels || ''}
                      onChange={e => updateProviderConfig(currentProvider, { customModels: e.target.value })}
                      className="custom-models-input"
                      rows={4}
                    />
                    {currentConfig.customModels && (
                      <select
                        value={currentConfig.selectedModel}
                        onChange={e => updateProviderConfig(currentProvider, { selectedModel: e.target.value })}
                        className="model-select"
                      >
                        {currentConfig.customModels.split('\n').filter(m => m.trim()).map(model => (
                          <option key={model.trim()} value={model.trim()}>{model.trim()}</option>
                        ))}
                      </select>
                    )}
                  </>
                ) : (
                  <select
                    value={currentConfig.selectedModel}
                    onChange={e => updateProviderConfig(currentProvider, { selectedModel: e.target.value })}
                    className="model-select"
                  >
                    {(() => {
                      const groups = new Map<string, typeof currentProviderInfo.models>();
                      currentProviderInfo.models.forEach(model => {
                        const group = model.group || '默认';
                        if (!groups.has(group)) groups.set(group, []);
                        groups.get(group)!.push(model);
                      });
                      return Array.from(groups.entries()).map(([groupName, models]) => (
                        <optgroup key={groupName} label={groupName}>
                          {models.map(model => (
                            <option key={model.id} value={model.id}>{model.name}</option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                )}

                {/* 厂商说明 */}
                <div className="provider-hints">
                  {currentProvider === 'cursor2api' && (
                    <p className="hint info">
                      💡 免费使用 Cursor 的 AI 模型，需要运行本地 cursor2api 服务
                    </p>
                  )}
                  {currentProvider === 'openai' && (
                    <p className="hint info">
                      💡 OpenAI 官方 API，需要付费，支持 GPT-4o、O1 等模型
                    </p>
                  )}
                  {currentProvider === 'anthropic' && (
                    <p className="hint info">
                      💡 Anthropic 官方 API，需要付费，支持 Claude Opus/Sonnet 等
                    </p>
                  )}
                  {currentProvider === 'google' && (
                    <p className="hint info">
                      💡 Google AI Studio API，部分模型免费，支持 Gemini 系列
                    </p>
                  )}
                  {currentProvider === 'deepseek' && (
                    <p className="hint info">
                      💡 DeepSeek 国产 API，性价比高，无需代理
                    </p>
                  )}
                  {currentProvider === 'qwen' && (
                    <p className="hint info">
                      💡 阿里通义千问 API，国产模型，无需代理
                    </p>
                  )}
                  {currentProvider === 'custom' && (
                    <p className="hint info">
                      💡 自定义 API 中转站，兼容 OpenAI 格式的第三方服务
                    </p>
                  )}
                </div>

                {/* 保存按钮 */}
                <button 
                  className={`save-btn provider-save ${currentProvider}`}
                  onClick={() => {
                    localStorage.setItem('providers-config', JSON.stringify(providersConfig));
                    ipcRenderer.invoke('set-provider-config', { 
                      provider: currentProvider, 
                      config: currentConfig 
                    });
                    showNotification(`✅ ${currentProviderInfo.name} 配置已保存`);
                  }}
                >
                  <span>💾</span> 保存配置
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
            <span className="logo">✨ Sparks</span>
          </div>
          <div className="header-right">
            {/* API 模式切换 - 只能启用一个 */}
            <div className="api-mode-toggle">
              {/* 厂商选择下拉 */}
              <select
                className="provider-select"
                value={currentProvider}
                onChange={async (e) => {
                  const newProvider = e.target.value as ApiProvider;
                  const newConfig = providersConfig[newProvider];
                  
                  // 检查是否已配置
                  if (!newConfig.enabled || !newConfig.apiKey) {
                    setCurrentProvider(newProvider);
                    setShowApiConfig(true);
                    return;
                  }
                  
                  // cursor2api 特殊检查
                  if (newProvider === 'cursor2api' && !cursor2apiStatus.running) {
                    setCurrentProvider(newProvider);
                    setShowApiConfig(true);
                    return;
                  }
                  
                  // 切换厂商，清空对话历史
                  setCurrentProvider(newProvider);
                  setMessages([]);
                  setToolResults([]);
                  localStorage.removeItem('chat-history');
                  await ipcRenderer.invoke('clear-history');
                  showNotification(`${API_PROVIDERS[newProvider].icon} 已切换到 ${API_PROVIDERS[newProvider].name}`);
                }}
              >
                {(Object.keys(API_PROVIDERS) as ApiProvider[]).map(provider => (
                  <option key={provider} value={provider}>
                    {API_PROVIDERS[provider].icon} {API_PROVIDERS[provider].name}
                  </option>
                ))}
              </select>
              
              {/* 模型选择下拉 */}
              <select
                className="model-select-header"
                value={currentConfig.selectedModel}
                onChange={e => updateProviderConfig(currentProvider, { selectedModel: e.target.value })}
              >
                {currentProvider === 'custom' ? (
                  (currentConfig.customModels || '').split('\n').filter(m => m.trim()).map(model => (
                    <option key={model.trim()} value={model.trim()}>{model.trim()}</option>
                  ))
                ) : (
                  (() => {
                    const groups = new Map<string, typeof currentProviderInfo.models>();
                    currentProviderInfo.models.forEach(model => {
                      const group = model.group || '默认';
                      if (!groups.has(group)) groups.set(group, []);
                      groups.get(group)!.push(model);
                    });
                    return Array.from(groups.entries()).map(([groupName, models]) => (
                      <optgroup key={groupName} label={groupName}>
                        {models.map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </optgroup>
                    ));
                  })()
                )}
              </select>
              
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
              className={`mode-btn permission-btn ${permissionMode === 'auto' ? 'auto-mode' : 'safe-mode'}`}
              onClick={() => {
                const newMode = permissionMode === 'default' ? 'auto' : 'default';
                setPermissionMode(newMode);
                showNotification(newMode === 'auto' ? '⚡ 自动模式：工具将自动执行' : '🔒 安全模式：危险操作需确认');
              }}
              title={permissionMode === 'auto' ? '⚡ 自动模式 - 点击切换到安全模式' : '🔒 安全模式 - 点击切换到自动模式'}
            >
              {permissionMode === 'auto' ? '⚡ 自动' : '🔒 安全'}
            </button>
            <button 
              className="theme-btn" 
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              title={theme === 'light' ? '切换到暗色主题' : '切换到亮色主题'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button 
              className="clear-btn" 
              onClick={async () => { 
                setMessages([]); 
                setToolResults([]);
                localStorage.removeItem('chat-history');
                await ipcRenderer.invoke('clear-history');
                showNotification('✅ 对话已清空');
              }}
              title="清空历史"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* 聊天区域 */}
        <div className="chat" ref={chatRef}>
          {messages.length === 0 && !loading && (
            <div className="welcome">
              <h1>✨ Sparks</h1>
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
        <div 
          className={`input-area ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="drag-overlay">
              <div className="drag-hint">
                📁 拖放文件到此处添加路径
              </div>
            </div>
          )}
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
            <button 
              className="file-btn" 
              onClick={async () => {
                const paths = await ipcRenderer.invoke('select-files');
                if (paths && paths.length > 0) {
                  setInput(prev => {
                    const prefix = prev.trim() ? prev.trim() + ' ' : '';
                    return prefix + paths.join(' ');
                  });
                  showNotification(`📁 已添加 ${paths.length} 个文件`);
                }
              }}
              disabled={loading}
              title="添加文件路径"
            >
              📁
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onPaste={handlePaste}
              placeholder="输入消息... ↑↓ 浏览历史"
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
          {historyIndex >= 0 && (
            <div className="history-hint">
              📜 历史 {historyIndex + 1}/{inputHistory.length} (↑↓ 切换, Esc 取消)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
