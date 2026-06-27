// OPC 创作助手 — 服务端 API 客户端
// 优先使用服务端 SQLite，localStorage 作为缓存/离线回退

import type { OpcAgentMessage } from "@/app/components/opc-agent/types";
import { getToken } from "./auth";

const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin)
  : "";

const isBrowser = typeof window !== "undefined";

// 构建带 JWT 的请求头
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (isBrowser) {
    const token = getToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

// ── 会话管理 ──

export async function apiCreateSession(id: string, title?: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id, title }),
    });
  } catch { /* 离线时忽略 */ }
}

export async function apiListSessions(): Promise<{ id: string; title: string; updated_at: number; message_count: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/opc/sessions`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      return data.sessions || [];
    }
  } catch { /* 离线 */ }
  return [];
}

export async function apiDeleteSession(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/sessions/${id}`, { method: "DELETE", headers: authHeaders() });
  } catch { /* 离线 */ }
}

// ── 消息管理 ──

export async function apiGetMessages(sessionId: string, limit = 200): Promise<OpcAgentMessage[]> {
  try {
    const res = await fetch(`${API_BASE}/api/opc/sessions/${sessionId}/messages?limit=${limit}`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      return (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp * 1000, // SQLite unixepoch → JS ms
        ...parseMetadata(m.metadata),
      }));
    }
  } catch { /* 离线 */ }
  return [];
}

export async function apiAddMessage(sessionId: string, role: string, content: string, metadata?: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/opc/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role, content, metadata }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.id;
    }
  } catch { /* 离线 */ }
  return null;
}

export async function apiBatchAddMessages(sessionId: string, messages: { role: string; content: string; metadata?: Record<string, unknown> }[]): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/api/opc/sessions/${sessionId}/messages/batch`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ messages }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.count || 0;
    }
  } catch { /* 离线 */ }
  return 0;
}

export async function apiDeleteMessage(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/messages/${id}`, { method: "DELETE", headers: authHeaders() });
  } catch { /* 离线 */ }
}

// ── 对话压缩 ──

export async function apiCompressSession(sessionId: string, summary: string, keepRecent = 10): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/sessions/${sessionId}/compress`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ summary, keepRecent }),
    });
  } catch { /* 离线 */ }
}

// ── 跨会话记忆 ──

export async function apiGetMemory(category?: string): Promise<{ key: string; value: string; category: string }[]> {
  try {
    const url = category ? `${API_BASE}/api/opc/memory?category=${category}` : `${API_BASE}/api/opc/memory`;
    const res = await fetch(url, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      return data.memory || [];
    }
  } catch { /* 离线 */ }
  return [];
}

export async function apiSetMemory(key: string, value: string, category?: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/memory`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ key, value, category }),
    });
  } catch { /* 离线 */ }
}

// ── 工具函数 ──

function parseMetadata(metaStr: string | null): Record<string, unknown> {
  if (!metaStr) return {};
  try { return JSON.parse(metaStr); } catch { return {}; }
}
