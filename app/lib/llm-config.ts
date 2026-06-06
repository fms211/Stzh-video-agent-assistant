// LLM 配置持久化 — 服务端 SQLite + localStorage 缓存

import type { LLMProvider } from "./llm-providers";
import { saveProviderToServer, deleteProviderFromServer, activateProviderOnServer } from "./server-sync";

const PROVIDERS_KEY = "tszh_llm_providers";
const ACTIVE_KEY = "tszh_llm_active";

const isBrowser = typeof window !== "undefined";

// 简单 XOR 混淆（防止 localStorage 被直接读取明文 key）
const OBFUSCATE_SEED = "tszh_opc_v1";
function obfuscate(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ OBFUSCATE_SEED.charCodeAt(i % OBFUSCATE_SEED.length));
  }
  return btoa(result);
}
function deobfuscate(encoded: string): string {
  const str = atob(encoded);
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ OBFUSCATE_SEED.charCodeAt(i % OBFUSCATE_SEED.length));
  }
  return result;
}

// ── Provider 管理 ──

export function getProviders(): LLMProvider[] {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // 兼容旧格式（直接数组）和新格式（混淆后的字符串）
    if (Array.isArray(parsed)) {
      // 旧格式：明文数组，迁移为混淆格式
      saveProviders(parsed);
      return parsed;
    }
    if (typeof parsed === "string") {
      return JSON.parse(deobfuscate(parsed));
    }
    return [];
  } catch {
    return [];
  }
}

export function saveProviders(providers: LLMProvider[]): void {
  if (!isBrowser) return;
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(obfuscate(JSON.stringify(providers))));
}

export function addProvider(provider: LLMProvider): void {
  const all = getProviders();
  all.push(provider);
  saveProviders(all);
  // 同步到服务端
  saveProviderToServer(provider).catch(() => {});
}

export function updateProvider(id: string, updates: Partial<LLMProvider>): void {
  const all = getProviders();
  const idx = all.findIndex((p) => p.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates };
    saveProviders(all);
  }
}

export function removeProvider(id: string): void {
  const all = getProviders().filter((p) => p.id !== id);
  saveProviders(all);
  if (getActiveProviderId() === id) {
    setActiveProviderId(all.length > 0 ? all[0].id : "");
  }
  deleteProviderFromServer(id).catch(() => {});
}

// ── 激活模型 ──

export function getActiveProviderId(): string {
  if (!isBrowser) return "";
  return localStorage.getItem(ACTIVE_KEY) || "";
}

export function setActiveProviderId(id: string): void {
  if (!isBrowser) return;
  localStorage.setItem(ACTIVE_KEY, id);
  activateProviderOnServer(id).catch(() => {});
}

export function getActiveProvider(): LLMProvider | null {
  const activeId = getActiveProviderId();
  if (activeId) {
    const found = getProviders().find((p) => p.id === activeId);
    if (found) return found;
  }
  // 回退到第一个
  const all = getProviders();
  return all.length > 0 ? all[0] : null;
}

// ── 测试连接 ──

export async function testConnection(provider: LLMProvider): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000); // 10s 超时
  try {
    const url = provider.protocol === "anthropic"
      ? `${provider.baseUrl}/v1/messages`
      : `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const body: Record<string, unknown> = {
      model: provider.model,
      max_tokens: 10,
      messages: [{ role: "user", content: "Hi" }],
    };
    if (provider.protocol === "anthropic") {
      headers["x-api-key"] = provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return { ok: true, message: "连接成功" };
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) return { ok: false, message: "API Key 无效" };
    if (res.status === 429) return { ok: false, message: "请求过于频繁" };
    return { ok: false, message: msg };
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") return { ok: false, message: "连接超时（10秒）" };
    return { ok: false, message: e instanceof Error ? e.message : "网络错误" };
  }
}
