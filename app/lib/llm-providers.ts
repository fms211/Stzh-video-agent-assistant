// 预置 LLM 厂商模板

export type Protocol = "openai" | "anthropic";

/** 思考程度 — 控制 LLM 推理深度 */
export type ThinkingLevel = "quick" | "standard" | "deep";

export const THINKING_LEVELS: { key: ThinkingLevel; label: string; desc: string }[] = [
  { key: "quick", label: "快速", desc: "简短直接，适合简单问答" },
  { key: "standard", label: "标准", desc: "平衡质量与速度" },
  { key: "deep", label: "深度", desc: "详细分析，适合创作和推理" },
];

export interface LLMProvider {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  maxTokens: number;
  temperature: number;
  /** 是否启用联网搜索（部分厂商支持） */
  searchEnabled?: boolean;
  /** 上下文窗口大小（token 数），影响消息历史截取 */
  contextWindow?: number;
}

export interface ProviderPreset {
  name: string;
  protocol: Protocol;
  baseUrl: string;
  defaultModel: string;
  thinkingLevel: ThinkingLevel;
  description: string;
  searchEnabled?: boolean;
  contextWindow?: number;
}

// 预置厂商
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "DeepSeek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    thinkingLevel: "standard",
    description: "国产高性价比，中文能力强，支持联网搜索",
    searchEnabled: true,
    contextWindow: 65536,
  },
  {
    name: "通义千问",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
    thinkingLevel: "standard",
    description: "阿里云大模型，支持联网搜索",
    searchEnabled: true,
    contextWindow: 131072,
  },
  {
    name: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    thinkingLevel: "standard",
    description: "GPT-4o，综合能力最强",
    searchEnabled: false,
    contextWindow: 128000,
  },
  {
    name: "智谱 GLM",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4",
    thinkingLevel: "standard",
    description: "清华系大模型，中文理解优秀",
    searchEnabled: false,
    contextWindow: 128000,
  },
  {
    name: "月之暗面 Kimi",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-128k",
    thinkingLevel: "standard",
    description: "Kimi 128K 长上下文，自动联网搜索",
    searchEnabled: true,
    contextWindow: 1048576,
  },
  {
    name: "Anthropic Claude",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5-20250514",
    thinkingLevel: "standard",
    description: "Claude Sonnet，推理与创作并重",
    searchEnabled: false,
    contextWindow: 200000,
  },
  {
    name: "小米 mimo",
    protocol: "openai",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5-pro",
    thinkingLevel: "standard",
    description: "小米 mimo v2.5 Pro（Token Plan），知识截止 2024.12，按量付费请改为 api.xiaomimimo.com",
    searchEnabled: false,
    contextWindow: 131072,
  },
  {
    name: "Ollama 本地",
    protocol: "openai",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3",
    thinkingLevel: "quick",
    description: "本地部署，无需 API Key",
    searchEnabled: false,
    contextWindow: 8192,
  },
];

// 生成唯一 ID
export function createProviderId(): string {
  return `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 从预置创建 Provider
export function createFromPreset(preset: ProviderPreset, apiKey: string = ""): LLMProvider {
  return {
    id: createProviderId(),
    name: preset.name,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    apiKey,
    model: preset.defaultModel,
    thinkingLevel: preset.thinkingLevel,
    maxTokens: 2048,
    temperature: 0.7,
    searchEnabled: preset.searchEnabled ?? false,
    contextWindow: preset.contextWindow ?? 8192,
  };
}
