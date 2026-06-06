// OPC 创作助手对话持久化 — 服务端 SQLite + localStorage 缓存

import type { OpcAgentMessage } from "@/app/components/opc-agent/types";
import {
  apiCreateSession, apiListSessions, apiDeleteSession,
  apiGetMessages, apiAddMessage, apiBatchAddMessages,
} from "./opc-agent-api";

const SESSIONS_KEY = "tszh_opc_agent_sessions";
const ACTIVE_KEY = "tszh_opc_agent_active";
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

export type OpcAgentSession = {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
};

const isBrowser = typeof window !== "undefined";

// ── 活跃会话（纯 localStorage，快速读写）──

export function getActiveSessionId(): string {
  if (!isBrowser) return "";
  return localStorage.getItem(ACTIVE_KEY) || "";
}

export function setActiveSessionId(id: string): void {
  if (!isBrowser) return;
  localStorage.setItem(ACTIVE_KEY, id);
}

// ── 会话列表（服务端优先 + localStorage 缓存）──

function getLocalSessions(): OpcAgentSession[] {
  if (!isBrowser) return [];
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]"); } catch { return []; }
}

function saveLocalSessions(sessions: OpcAgentSession[]): void {
  if (!isBrowser) return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function getSessions(): Promise<OpcAgentSession[]> {
  // 尝试从服务端获取
  try {
    const serverSessions = await apiListSessions();
    if (serverSessions.length > 0) {
      const mapped: OpcAgentSession[] = serverSessions.map((s) => ({
        id: s.id,
        title: s.title,
        timestamp: s.updated_at * 1000,
        messageCount: s.message_count,
      }));
      saveLocalSessions(mapped); // 更新缓存
      return mapped;
    }
  } catch { /* 离线 */ }

  // 回退到 localStorage
  return getLocalSessions();
}

// 同步版本（用于侧边栏等不需要等待的场景）
export function getSessionsSync(): OpcAgentSession[] {
  return getLocalSessions();
}

// ── 消息（服务端优先 + localStorage 缓存）──

function getLocalMessages(sessionId: string): OpcAgentMessage[] {
  if (!isBrowser || !sessionId) return [];
  try {
    const raw = localStorage.getItem(`tszh_opc_msg_${sessionId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalMessages(sessionId: string, messages: OpcAgentMessage[]): void {
  if (!isBrowser || !sessionId) return;
  const trimmed = messages.slice(-MAX_MESSAGES_PER_SESSION);
  localStorage.setItem(`tszh_opc_msg_${sessionId}`, JSON.stringify(trimmed));
}

export async function loadMessages(sessionId: string): Promise<OpcAgentMessage[]> {
  if (!sessionId) return [];

  // 尝试从服务端获取
  try {
    const serverMessages = await apiGetMessages(sessionId);
    if (serverMessages.length > 0) {
      saveLocalMessages(sessionId, serverMessages); // 更新缓存
      return serverMessages;
    }
  } catch { /* 离线 */ }

  // 回退到 localStorage
  return getLocalMessages(sessionId);
}

// 同步版本
export function loadMessagesSync(sessionId: string): OpcAgentMessage[] {
  return getLocalMessages(sessionId);
}

// 保存消息（双写：服务端 + localStorage）
export async function saveMessages(sessionId: string, messages: OpcAgentMessage[]): Promise<void> {
  if (!sessionId) return;

  // 立即写 localStorage（快速）
  saveLocalMessages(sessionId, messages);

  // 异步写服务端（不阻塞）
  try {
    // 只同步新增的消息（对比 localStorage 缓存的最后一条）
    const localMessages = getLocalMessages(sessionId);
    const localIds = new Set(localMessages.map((m) => m.id));
    const newMessages = messages.filter((m) => !localIds.has(m.id));

    if (newMessages.length > 0) {
      await apiBatchAddMessages(sessionId, newMessages.map((m) => ({
        role: m.role,
        content: m.content,
        metadata: {
          isError: m.isError,
          workflowId: m.workflowId,
          workflowName: m.workflowName,
          stepName: m.stepName,
          cards: m.cards,
        },
      })));
    }
  } catch { /* 离线时数据已在 localStorage */ }
}

// ── 删除操作 ──

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isBrowser) return;

  // 删除 localStorage
  localStorage.removeItem(`tszh_opc_msg_${sessionId}`);
  const sessions = getLocalSessions().filter((s) => s.id !== sessionId);
  saveLocalSessions(sessions);
  if (getActiveSessionId() === sessionId) {
    setActiveSessionId(sessions.length > 0 ? sessions[0].id : "");
  }

  // 删除服务端
  try { await apiDeleteSession(sessionId); } catch { /* 离线 */ }
}

// ── 创建/更新会话 ──

export async function upsertSession(sessionId: string, messages: OpcAgentMessage[]): Promise<void> {
  if (!isBrowser || !sessionId) return;

  const firstUserMsg = messages.find((m) => m.role === "user");
  const title = firstUserMsg?.content?.slice(0, 30) || "新对话";
  const count = messages.filter((m) => m.role === "user").length;

  // 更新 localStorage
  const sessions = getLocalSessions();
  const existing = sessions.find((s) => s.id === sessionId);
  const session: OpcAgentSession = { id: sessionId, title, timestamp: Date.now(), messageCount: count };

  let next: OpcAgentSession[];
  if (existing) {
    next = sessions.map((s) => (s.id === sessionId ? session : s));
  } else {
    next = [session, ...sessions];
  }

  if (next.length > MAX_SESSIONS) {
    const removed = next.slice(MAX_SESSIONS);
    next = next.slice(0, MAX_SESSIONS);
    removed.forEach((s) => localStorage.removeItem(`tszh_opc_msg_${s.id}`));
  }

  saveLocalSessions(next);
  setActiveSessionId(sessionId);

  // 同步到服务端
  try { await apiCreateSession(sessionId, title); } catch { /* 离线 */ }
}

// ── 新建会话 ID ──

export function createSessionId(): string {
  return `opc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── 清空当前会话消息 ──

export function clearSessionMessages(sessionId: string): void {
  if (!isBrowser || !sessionId) return;
  localStorage.removeItem(`tszh_opc_msg_${sessionId}`);
  // 服务端消息保留（用户可能想恢复）
}
