// 创意助手会话持久化：本地先写、登录后增量同步到 OPC SQLite API。

import type { OpcAgentMessage } from "@/app/components/opc-agent/types";
import {
  apiBatchAddMessages,
  captureOpcRequestContext,
  apiCreateSession,
  apiDeleteSession,
  apiGetMessages,
  apiListSessions,
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
  mode?: "chat" | "workflow" | "coze";
};

const isBrowser = typeof window !== "undefined";

function opcKey(scope: string, kind: "sessions" | "active"): string;
function opcKey(scope: string, kind: "messages", sessionId: string): string;
function opcKey(scope: string, kind: "sessions" | "active" | "messages", sessionId?: string): string {
  const prefix = `tszh:v2:opc:${scope}`;
  return kind === "messages" ? `${prefix}:msg_${sessionId}` : `${prefix}:${kind}`;
}

function owner(): DataOwner {
  return isBrowser ? currentDataOwner(localStorage) : { kind: "guest" };
}

function hasAuthenticatedOwner() {
  return owner().kind === "account";
}

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function localSessions(scope = ownerScope(owner())): OpcAgentSession[] {
  if (!isBrowser) return [];
  return parse(localStorage.getItem(opcKey(scope, "sessions")), []);
}

function saveLocalSessions(sessions: OpcAgentSession[], scope = ownerScope(owner())) {
  if (!isBrowser) return;
  localStorage.setItem(opcKey(scope, "sessions"), JSON.stringify(sessions));
}

function localMessages(sessionId: string, scope = ownerScope(owner())): OpcAgentMessage[] {
  if (!isBrowser || !sessionId) return [];
  return parse(localStorage.getItem(opcKey(scope, "messages", sessionId)), []);
}

function saveLocalMessages(sessionId: string, messages: OpcAgentMessage[], scope = ownerScope(owner())) {
  if (!isBrowser || !sessionId) return;
  localStorage.setItem(
    opcKey(scope, "messages", sessionId),
    JSON.stringify(messages.slice(-MAX_MESSAGES_PER_SESSION)),
  );
}

export function migrateLegacyOpcData(storage: Pick<Storage, "length" | "key" | "getItem" | "setItem">) {
  const dataOwner = currentDataOwner(storage);
  const scope = ownerScope(dataOwner);
  const marker = `${MIGRATION_MARKER_PREFIX}${scope}`;
  if (storage.getItem(marker) === "1") return;
  const copy = (from: string, to: string) => {
    const value = storage.getItem(from);
    if (value !== null && storage.getItem(to) === null) storage.setItem(to, value);
  };
  copy(LEGACY_SESSIONS_KEY, opcKey(scope, "sessions"));
  copy(LEGACY_ACTIVE_KEY, opcKey(scope, "active"));
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(LEGACY_MESSAGES_PREFIX)) continue;
    copy(key, opcKey(scope, "messages", key.slice(LEGACY_MESSAGES_PREFIX.length)));
  }
  storage.setItem(marker, "1");
}

export function getActiveSessionId(mode: "chat" | "workflow" = "chat"): string {
  return isBrowser ? localStorage.getItem(`${opcKey(ownerScope(owner()), "active")}${mode === "workflow" ? ":workflow" : ""}`) || "" : "";
}

export function setActiveSessionId(id: string, mode: "chat" | "workflow" = "chat") {
  if (isBrowser) localStorage.setItem(`${opcKey(ownerScope(owner()), "active")}${mode === "workflow" ? ":workflow" : ""}`, id);
}

export function createSessionId(mode: "chat" | "workflow" = "chat") {
  return `opc_${mode === "workflow" ? "workflow_" : ""}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const queues = new Map<string, Promise<void>>();
const syncKey = (scope: string, sessionId: string) => `${opcKey(scope, "messages", sessionId)}:synced`;
const fingerprints = (scope: string, sessionId: string) => parse<Record<string, string>>(localStorage.getItem(syncKey(scope, sessionId)), {});
const fingerprint = (message: OpcAgentMessage) => JSON.stringify(message);

export async function loadMessages(sessionId: string, strict = false): Promise<OpcAgentMessage[]> {
  if (!sessionId) return [];
  const scope = ownerScope(owner());
  if (hasAuthenticatedOwner()) {
    const context = captureOpcRequestContext();
    try {
      let remote: OpcAgentMessage[] = [];
      const seen = new Set<string>();
      for (let offset = 0; ; offset += 200) {
        const page = await apiGetMessages(sessionId, 200, context, offset);
        if (scope !== ownerScope(owner())) return [];
        if (page.length && page.every(message => seen.has(message.id))) throw new Error("对话分页重复，请重试");
        remote = [...page.filter(message => !seen.has(message.id)), ...remote];
        page.forEach(message => seen.add(message.id));
        if (page.length < 200) break;
      }
      if (scope !== ownerScope(owner())) return [];
      const ack = fingerprints(scope, sessionId);
      const pending = localMessages(sessionId, scope).filter(message => ack[message.id] !== fingerprint(message));
      const merged = new Map(remote.map(message => [message.id, message]));
      for (const message of pending) merged.set(message.id, message);
      const messages = [...merged.values()].sort((a, b) => a.timestamp - b.timestamp);
      saveLocalMessages(sessionId, messages, scope);
      return messages;
    } catch (error) { if (strict) throw error; /* Preserve the original owner's local outbox while offline. */ }
  }
  return scope === ownerScope(owner()) ? localMessages(sessionId, scope) : [];
}

export async function saveMessages(sessionId: string, messages: OpcAgentMessage[]): Promise<void> {
  if (!sessionId || !isBrowser) return;
  const scope = ownerScope(owner());
  const snapshot = JSON.parse(JSON.stringify(messages.slice(-MAX_MESSAGES_PER_SESSION))) as OpcAgentMessage[];
  saveLocalMessages(sessionId, snapshot, scope);
  if (!hasAuthenticatedOwner()) return;
  const context = captureOpcRequestContext();
  const key = syncKey(scope, sessionId);
  const title = messages.find(message => message.role === "user")?.content.slice(0, 30) || messages.find(message => message.workflowName)?.workflowName || "新对话";
  const work = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    if (scope !== ownerScope(owner())) return;
    const ack = fingerprints(scope, sessionId);
    const changed = snapshot.filter(message => ack[message.id] !== fingerprint(message));
    if (!changed.length) return;
    await apiCreateSession(sessionId, title, context);
    if (scope !== ownerScope(owner())) return;
    const count = await apiBatchAddMessages(sessionId, changed.map(message => ({
      id: message.id, timestamp: message.timestamp || Date.now(), role: message.role, content: message.content,
      metadata: Object.fromEntries(Object.entries(message).filter(([field]) => !["id", "timestamp", "role", "content"].includes(field))),
    })), context);
    if (count !== changed.length) throw new Error("部分对话未同步，请重试");
    for (const message of changed) ack[message.id] = fingerprint(message);
    // Pin acknowledgement to its original owner even if the UI switched while the request was pending.
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(snapshot.filter(message => ack[message.id]).map(message => [message.id, ack[message.id]]))));
  });
  queues.set(key, work);
  try { await work; } finally { if (queues.get(key) === work) queues.delete(key); }
}

export async function upsertSession(sessionId: string, messages: OpcAgentMessage[], mode: "chat" | "workflow" = "chat") {
  if (!isBrowser || !sessionId) return;
  const title = messages.find((message) => message.role === "user")?.content?.slice(0, 30) || messages.find(message => message.workflowName)?.workflowName || "新对话";
  const nextSession: OpcAgentSession = {
    id: sessionId,
    title,
    timestamp: Date.now(),
    messageCount: messages.filter((message) => message.role === "user").length,
    mode,
  };
  const existing = localSessions();
  const merged = [nextSession, ...existing.filter((session) => session.id !== sessionId)].slice(0, MAX_SESSIONS);
  saveLocalSessions(merged);
  setActiveSessionId(sessionId, mode);
  // saveMessages creates the remote session before syncing its messages.
}

export const getLocalSessions = () => localSessions();

export async function getSessions(strict = false): Promise<OpcAgentSession[]> {
  const scope = ownerScope(owner());
  if (hasAuthenticatedOwner()) {
    try {
      const context = captureOpcRequestContext();
      const remote: Awaited<ReturnType<typeof apiListSessions>> = [];
      const seen = new Set<string>();
      for (let offset = 0; ; offset += 100) {
        const page = await apiListSessions(context, offset);
        if (scope !== ownerScope(owner())) return [];
        if (page.length && page.every(session => seen.has(session.id))) throw new Error("会话分页重复，请重试");
        remote.push(...page.filter(session => !seen.has(session.id)));
        page.forEach(session => seen.add(session.id));
        if (page.length < 100) break;
      }
      if (scope !== ownerScope(owner())) return [];
      const merged = new Map(localSessions(scope).map(session => [session.id, session]));
      for (const session of remote) {
        const mapped = { id: session.id, title: session.title, timestamp: session.updated_at * 1000, messageCount: session.message_count, mode: session.mode || "chat" as const };
        if (!merged.has(session.id) || merged.get(session.id)!.timestamp < mapped.timestamp) merged.set(session.id, mapped);
        else if (session.mode || !merged.get(session.id)!.mode) merged.set(session.id, { ...merged.get(session.id)!, mode: mapped.mode });
      }
      const sessions = [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
      saveLocalSessions(sessions.slice(0, MAX_SESSIONS), scope);
      return sessions;
    } catch (error) { if (strict) throw error; /* Offline sessions remain available locally. */ }
  }
  return scope === ownerScope(owner()) ? localSessions(scope) : [];
}

export async function deleteSession(sessionId: string) {
  if (!isBrowser) return;
  localStorage.removeItem(opcKey(ownerScope(owner()), "messages", sessionId));
  localStorage.removeItem(syncKey(ownerScope(owner()), sessionId));
  saveLocalSessions(localSessions().filter((session) => session.id !== sessionId));
  if (getActiveSessionId() === sessionId) setActiveSessionId("");
  if (hasAuthenticatedOwner()) await apiDeleteSession(sessionId).catch(() => {});
}
