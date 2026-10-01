// 服务端同步 API — LLM 配置、偏好、通知、主题
// 服务端优先 + localStorage 缓存

import { getToken, resolveApiBase } from "./auth";
import { captureNotificationClient } from "./notification-client";

const API_BASE = typeof window !== "undefined"
  ? resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location)
  : "";

const isBrowser = typeof window !== "undefined";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (isBrowser) {
    const token = getToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (res.ok) return await res.json();
  } catch { /* 离线 */ }
  return null;
}

async function apiPost(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}

async function apiDelete(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
    return res.ok;
  } catch { return false; }
}

// ══════════════════════════════════════════
// LLM 模型配置
// ══════════════════════════════════════════

import type { LLMProvider } from "./llm-providers";

const LLM_KEY = "tszh_llm_providers";
const LLM_ACTIVE_KEY = "tszh_llm_active";

function getLocalProviders(): LLMProvider[] {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(LLM_KEY);
    if (!raw) return [];
    // 兼容混淆格式
    try { return JSON.parse(deobfuscate(raw)); } catch { return JSON.parse(raw); }
  } catch { return []; }
}

function saveLocalProviders(providers: LLMProvider[]) {
  if (!isBrowser) return;
  localStorage.setItem(LLM_KEY, obfuscate(JSON.stringify(providers)));
}

function obfuscate(str: string): string {
  const seed = "tszh_opc_v1";
  let r = "";
  for (let i = 0; i < str.length; i++) r += String.fromCharCode(str.charCodeAt(i) ^ seed.charCodeAt(i % seed.length));
  return btoa(r);
}

function deobfuscate(encoded: string): string {
  const seed = "tszh_opc_v1";
  const str = atob(encoded);
  let r = "";
  for (let i = 0; i < str.length; i++) r += String.fromCharCode(str.charCodeAt(i) ^ seed.charCodeAt(i % seed.length));
  return r;
}

export async function syncProviders(): Promise<LLMProvider[]> {
  // 服务端优先
  const data = await apiGet<{ providers: { id: string; config: LLMProvider; is_active: number }[] }>("/api/llm/providers");
  if (data && data.providers.length > 0) {
    const providers = data.providers.map((p) => p.config);
    saveLocalProviders(providers);
    const active = data.providers.find((p) => p.is_active);
    if (active) localStorage.setItem(LLM_ACTIVE_KEY, active.id);
    return providers;
  }
  return getLocalProviders();
}

export async function saveProviderToServer(provider: LLMProvider, isActive = false) {
  await apiPost("/api/llm/providers", { id: provider.id, config: provider, isActive });
}

export async function deleteProviderFromServer(id: string) {
  await apiDelete(`/api/llm/providers/${id}`);
}

export async function activateProviderOnServer(id: string) {
  await apiPost(`/api/llm/providers/${id}/activate`, {});
}

// ══════════════════════════════════════════
// 用户偏好
// ══════════════════════════════════════════

const PREFS_KEY = "tszh_preferences";

export async function syncPrefs(): Promise<Record<string, unknown>> {
  const data = await apiGet<{ prefs: Record<string, unknown> }>("/api/prefs");
  if (data && Object.keys(data.prefs).length > 0) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(data.prefs));
    return data.prefs;
  }
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; }
}

export async function savePrefToServer(key: string, value: unknown) {
  await apiPost("/api/prefs", { key, value });
}

export async function savePrefsBatchToServer(prefs: Record<string, unknown>) {
  await apiPost("/api/prefs/batch", { prefs });
}

// ══════════════════════════════════════════
// 通知
// ══════════════════════════════════════════

export async function syncNotifications() {
  const client = captureNotificationClient();
  const rows = await client.read(); client.save(rows); return rows;
}

export async function addNotificationToServer(id: string, title: string, message: string, type = "info") {
  await apiPost("/api/notifications", { id, title, message, type });
}

export async function markAllReadOnServer() {
  const client = captureNotificationClient();
  return client.mutate("read", client.cached());
}

export async function clearNotificationsOnServer() {
  const client = captureNotificationClient();
  return client.mutate("clear", client.cached());
}

// ══════════════════════════════════════════
// 应用设置（主题等）
// ══════════════════════════════════════════

export async function syncSettings(): Promise<Record<string, string>> {
  const data = await apiGet<{ settings: Record<string, string> }>("/api/app-settings");
  if (data && Object.keys(data.settings).length > 0) {
    for (const [key, value] of Object.entries(data.settings)) {
      localStorage.setItem(key, value);
    }
    return data.settings;
  }
  return {};
}

export async function saveSettingToServer(key: string, value: string) {
  await apiPost("/api/app-settings", { key, value });
}

export async function saveSettingsBatchToServer(settings: Record<string, string>) {
  await apiPost("/api/app-settings/batch", { settings });
}
