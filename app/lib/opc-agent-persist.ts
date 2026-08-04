// OPC 创作助手对话持久化 — 服务端 SQLite + localStorage 缓存
// 本地缓存按数据归属分仓（tszh:v2:opc:<owner>:*），与服务端按用户隔离对齐

import type { OpcAgentMessage } from "@/app/components/opc-agent/types";
import {
  apiCreateSession, apiListSessions, apiDeleteSession,
  apiGetMessages, apiAddMessage, apiBatchAddMessages,
} from "./opc-agent-api";
import { currentDataOwner, ownerScope, type DataOwner } from "./data-owner";

const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

const LEGACY_SESSIONS_KEY = "tszh_opc_agent_sessions";
const LEGACY_ACTIVE_KEY = "tszh_opc_agent_active";
const LEGACY_MESSAGES_PREFIX = "tszh_opc_msg_";
const MIGRATION_MARKER_PREFIX = "tszh:v2:opc:migrated:";

export type OpcAgentSession = {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
};

const isBrowser = typeof window !== "undefined";

// ── key 生成（按数据归属分仓）──

function opcKey(scope: string, kind: "sessions" | "active"): string;
function opcKey(scope: string, kind: "messages", sessionId: string): string;
function opcKey(scope: string, kind: "sessions" | "active" | "messages", sessionId?: string): string {
  const prefix = `tszh:v2:opc:${scope}`;
  if (kind === "messages") return `${prefix}:msg_${sessionId}`;
  return `${prefix}:${kind}`;
}

function currentOwner(): DataOwner {
  return isBrowser ? currentDataOwner(localStorage) : { kind: "guest" };
}

// 旧格式数据复制迁移到访客仓（不删除旧 key）
export function migrateLegacyOpcData(storage: Pick<Storage, "length" | "key" | "getItem" | "setItem">): void {
  const owner = currentDataOwner(storage);
  const marker = `${MIGRATION_MARKER_PREFIX}${ownerScope(owner)}`;
  if (storage.getItem(marker) === "1") return;

  const targetSessions = opcKey(ownerScope(owner), "sessions");
  const targetActive = opcKey(ownerScope(owner), "active");

  const sessions = storage.getItem(LEGACY_SESSIONS_KEY);
  if (sessions !== null && storage.getItem(targetSessions) === null) {
    storage.setItem(targetSessions, sessions);
  }
  const active = storage.getItem(LEGACY_ACTIVE_KEY);
  if (active !== null && storage.getItem(targetActive) === null) {
    storage.setItem(targetActive, active);
  }

  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key));
  for (const key of keys) {
    if (!key.startsWith(LEGACY_MESSAGES_PREFIX)) continue;
    const sessionId = key.slice(LEGACY_MESSAGES_PREFIX.length);
    const value = storage.getItem(key);
    const target = opcKey(ownerScope(owner), "messages", sessionId);
    if (value !== null && storage.getItem(target) === null) {
      storage.setItem(target, value);
    }
  }

  storage.setItem(marker, "1");
}

// ── 活跃会话（纯 localStorage，快速读写）──

export function getActiveSessionId(): string {
  if (!isBrowser) return "";
  return localStorage.getItem(opcKey(ownerScope(currentOwner()), "active")) || "";
}

export function setActiveSessionId(id: string): void {
  if (!isBrowser) return;
  localStorage.setItem(opcKey(ownerScope(currentOwner()), "active"), id);
}

// ── 会话列表（服务端优先 + localStorage 缓存）──

function getLocalSessions(): OpcAgentSession[] {
  if (!isBrowser) return [];
  const key = opcKey(ownerScope(currentOwner()), "sessions");
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}

function saveLocalSessions(sessions: OpcAgentSession[]): void {
  if (!isBrowser) return;
  localStorage.setItem(opcKey(ownerScope(currentOwner()), "sessions"), JSON.stringify(sessions));
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
    const key = opcKey(ownerScope(currentOwner()), "messages", sessionId);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalMessages(sessionId: string, messages: OpcAgentMessage[]): void {
  if (!isBrowser || !sessionId) return;
  const trimmed = messages.slice(-MAX_MESSAGES_PER_SESSION);
  localStorage.setItem(
    opcKey(ownerScope(currentOwner()), "messages", sessionId),
    JSON.stringify(trimmed),
  );
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

  const localMessages = getLocalMessages(sessionId);
  const localIds = new Set(localMessages.map((m) => m.id));

  // 立即写 localStorage（快速）
  saveLocalMessages(sessionId, messages);

  // 异步写服务端（不阻塞）
  try {
    // 只同步新增的消息（对比 localStorage 缓存的最后一条）
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
  localStorage.removeItem(opcKey(ownerScope(currentOwner()), "messages", sessionId));
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
    removed.forEach((s) => localStorage.removeItem(opcKey(ownerScope(currentOwner()), "messages", s.id)));
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
  localStorage.removeItem(opcKey(ownerScope(currentOwner()), "messages", sessionId));
  // 服务端消息保留（用户可能想恢复）
}
