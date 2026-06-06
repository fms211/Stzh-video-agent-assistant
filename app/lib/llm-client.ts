// 统一 LLM 流式调用层 — 支持 OpenAI 和 Anthropic 协议

import type { LLMProvider } from "./llm-providers";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── 思考程度 → 厂商特定参数 ──

function buildThinkingExtras(provider: LLMProvider): Record<string, unknown> {
  const level = provider.thinkingLevel;
  const name = provider.name.toLowerCase();

  // Anthropic: thinking.budget_tokens
  if (provider.protocol === "anthropic") {
    if (level === "deep") {
      return {
        thinking: { type: "enabled", budget_tokens: 10000 },
        temperature: 1, // Anthropic thinking 模式要求 temperature=1
      };
    }
    // quick 和 standard 不启用 thinking
    return {};
  }

  // DeepSeek: deep 模式切换到 deepseek-reasoner
  if (name.includes("deepseek")) {
    if (level === "deep") {
      return { model: "deepseek-reasoner" };
    }
    return {};
  }

  // OpenAI: reasoning_effort（仅 o1/o3 模型支持）
  if (name.includes("openai") || name.includes("gpt")) {
    if (level === "quick") return { reasoning_effort: "low" };
    if (level === "deep") return { reasoning_effort: "high" };
    return {};
  }

  // 通用方案：通过 system prompt 指令控制（在外部处理）
  return {};
}

// 思考程度 → system prompt 后缀（通用兜底方案）
export function getThinkingSuffix(level: LLMProvider["thinkingLevel"]): string {
  switch (level) {
    case "quick": return "\n\n[指令：请快速简洁地回答，不需要过多分析。]";
    case "deep": return "\n\n[指令：请深入思考后再回答，从多个角度分析，给出详细且有深度的回复。]";
    default: return "";
  }
}

// ── 厂商特定搜索参数 ──

function buildSearchExtras(provider: LLMProvider): Record<string, unknown> {
  if (!provider.searchEnabled) return {};
  const name = provider.name.toLowerCase();

  // DeepSeek: 通过 tools 启用联网搜索
  if (name.includes("deepseek")) {
    return {
      tools: [{
        type: "function",
        function: {
          name: "web_search",
          description: "搜索互联网获取最新信息",
          parameters: {
            type: "object",
            properties: { query: { type: "string", description: "搜索关键词" } },
            required: ["query"],
          },
        },
      }],
      tool_choice: "auto",
    };
  }

  // 通义千问: enable_search 参数
  if (name.includes("通义") || name.includes("qwen")) {
    return { enable_search: true };
  }

  // Kimi / 月之暗面: 长上下文模型自动联网，无需额外参数
  if (name.includes("kimi") || name.includes("月之暗面") || name.includes("moonshot")) {
    return {};
  }

  // 小米 mimo: 不支持内置联网搜索（支持自定义 tools，但无自动搜索）

  return {};
}

// 合并所有 extras
function buildAllExtras(provider: LLMProvider): Record<string, unknown> {
  return {
    ...buildSearchExtras(provider),
    ...buildThinkingExtras(provider),
  };
}

// ── 统一流式入口 ──

export async function* streamChat(
  provider: LLMProvider,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (provider.protocol === "anthropic") {
    yield* streamAnthropic(provider, messages, signal);
  } else {
    yield* streamOpenAI(provider, messages, signal);
  }
}

// ── OpenAI 兼容格式 ──
// 兼容: DeepSeek, 通义千问, OpenAI, 智谱, 月之暗面, 小米 mimo, Ollama

async function* streamOpenAI(
  provider: LLMProvider,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const extras = buildAllExtras(provider);

  // DeepSeek deep 模式可能切换模型
  const actualModel = (extras.model as string) || provider.model;
  delete extras.model; // model 不是 extras 的一部分

  const url = provider.baseUrl.endsWith("/chat/completions")
    ? provider.baseUrl
    : `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: actualModel,
      messages,
      stream: true,
      max_tokens: provider.maxTokens,
      temperature: provider.temperature,
      ...extras,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 (${res.status}): ${err.slice(0, 200)}`);
  }

  if (!res.body) throw new Error("无响应流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 忽略解析错误
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Anthropic 原生格式 ──

async function* streamAnthropic(
  provider: LLMProvider,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  // Anthropic 抽出 system 单独传
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const extras = buildAllExtras(provider);
  const thinking = extras.thinking;
  delete extras.thinking;

  const url = provider.baseUrl.endsWith("/messages")
    ? provider.baseUrl
    : `${provider.baseUrl.replace(/\/$/, "")}/v1/messages`;

  const body: Record<string, unknown> = {
    model: provider.model,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    messages: chatMessages,
    stream: true,
    max_tokens: provider.maxTokens,
    temperature: provider.temperature,
    ...extras,
  };

  // Anthropic thinking 模式
  if (thinking) {
    body.thinking = thinking;
    body.temperature = 1; // thinking 模式强制 temperature=1
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic 请求失败 (${res.status}): ${err.slice(0, 200)}`);
  }

  if (!res.body) throw new Error("无响应流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();

        try {
          const json = JSON.parse(data);
          // Anthropic SSE 事件类型
          if (json.type === "content_block_delta" && json.delta?.text) {
            yield json.delta.text;
          }
          if (json.type === "message_stop") return;
        } catch {
          // 忽略解析错误
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
