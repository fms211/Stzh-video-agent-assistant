// OPC 创作助手 — 服务端 API 客户端
// 优先使用服务端 SQLite，localStorage 作为缓存/离线回退

import type { OpcAgentMessage } from "@/app/components/opc-agent/types";

const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || "http://localhost:8080")
  : "";

const isBrowser = typeof window !== "undefined";

// ── 会话管理 ──

export async function apiCreateSession(id: string, title?: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
  } catch { /* 离线时忽略 */ }
}

export async function apiListSessions(): Promise<{ id: string; title: string; updated_at: number; message_count: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/opc/sessions`);
    if (res.ok) {
      const data = await res.json();
      return data.sessions || [];
    }
  } catch { /* 离线 */ }
  return [];
}

export async function apiDeleteSession(id: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/sessions/${id}`, { method: "DELETE" });
  } catch { /* 离线 */ }
}

// ── 消息管理 ──

export async function apiGetMessages(sessionId: string, limit = 200): Promise<OpcAgentMessage[]> {
  try {
    const res = await fetch(`${API_BASE}/api/opc/sessions/${sessionId}/messages?limit=${limit}`);
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
    await fetch(`${API_BASE}/api/opc/messages/${id}`, { method: "DELETE" });
  } catch { /* 离线 */ }
}

// ── 对话压缩 ──

export async function apiCompressSession(sessionId: string, summary: string, keepRecent = 10): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/opc/sessions/${sessionId}/compress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary, keepRecent }),
    });
  } catch { /* 离线 */ }
}

// ── 跨会话记忆 ──

export async function apiGetMemory(category?: string): Promise<{ key: string; value: string; category: string }[]> {
  try {
    const url = category ? `${API_BASE}/api/opc/memory?category=${category}` : `${API_BASE}/api/opc/memory`;
    const res = await fetch(url);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, category }),
    });
  } catch { /* 离线 */ }
}

// ── 工具函数 ──

function parseMetadata(metaStr: string | null): Record<string, unknown> {
  if (!metaStr) return {};
  try { return JSON.parse(metaStr); } catch { return {}; }
}
