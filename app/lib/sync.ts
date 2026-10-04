import { getToken, resolveApiBase } from "./auth";
import { currentDataOwner, workspaceDataKey, ownerScope, type DataOwner } from "./data-owner";
import { assertHistoryAvailable, isHistoryRetired } from "./history-retirement.ts";

const API_BASE = typeof window !== "undefined"
  ? resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location)
  : "";

type HistorySession = {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text?: string;
  payload?: any;
  contextTrace?: unknown;
  textIsPayload?: boolean;
  isError?: boolean;
  errorText?: string;
};

// === localStorage 工具 ===
function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, value: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function owner(): DataOwner {
  if (typeof window === "undefined") return { kind: "guest" };
  return currentDataOwner(localStorage);
}

function sessionsKey(dataOwner = owner()) {
  return workspaceDataKey(dataOwner, "sessions");
}

function activeKey(dataOwner = owner()) {
  return workspaceDataKey(dataOwner, "active");
}

function messagesKey(id: string, dataOwner = owner()) {
  return workspaceDataKey(dataOwner, "messages", id);
}

function captureSyncOwner() {
  const token = getToken();
  const dataOwner = owner();
  const key = sessionsKey(dataOwner);
  return { token, dataOwner, isCurrent: () => getToken() === token && sessionsKey() === key };
}

// === 会话管理 ===
export function loadSessions(): HistorySession[] {
  if (typeof window === "undefined") return [];
  return lsGet<HistorySession[]>(sessionsKey(), []).filter(session => !isHistoryRetired(ownerScope(owner()), session.id));
}

export async function saveSessions(sessions: HistorySession[], { localOnly = false }: { localOnly?: boolean } = {}) {
  sessions = sessions.filter(session => !isHistoryRetired(ownerScope(owner()), session.id));
  const previous = new Map(loadSessions().map(session => [session.id, session]));
  lsSet(sessionsKey(), sessions);
  if (localOnly) return;

  // 如果有 token，同步到服务端
  const token = getToken();
  if (!token) return;

  try {
    // 并行发送所有请求（而非串行等待）
    // Message writes update their own conversation; do not touch other titles/times.
    const requests = sessions.filter(session => !previous.has(session.id) || previous.get(session.id)!.title !== session.title).map((session) =>
      fetch(`${API_BASE}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: session.id, title: session.title }),
      }).catch(() => {})
    );
    await Promise.all(requests);
  } catch {}
}

// === 消息管理 ===
export function loadMessages(id: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  if (isHistoryRetired(ownerScope(owner()), id)) return [];
  return lsGet<ChatMessage[]>(messagesKey(id), []);
}

export async function saveMessages(id: string, messages: ChatMessage[]) {
  if (isHistoryRetired(ownerScope(owner()), id)) return;
  lsSet(messagesKey(id), messages);

  // 如果有 token，同步到服务端
  const token = getToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE}/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          payload: m.payload,
          contextTrace: m.contextTrace,
          isError: m.isError,
          errorText: m.errorText,
        })),
      }),
    }).catch(() => {});
  } catch {}
}

export function removeMessages(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(messagesKey(id));

  const token = getToken();
  if (!token) return;
  fetch(`${API_BASE}/api/conversations/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

// === 活跃会话 ===
export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(activeKey());
}

export function setActiveSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) assertHistoryAvailable(ownerScope(owner()), id);
  if (id) localStorage.setItem(activeKey(), id);
  else localStorage.removeItem(activeKey());
  window.dispatchEvent(new Event("tszh_active_session_changed"));
}

// === 从服务端拉取会话列表（登录后首次加载） ===
export async function fetchServerSessions({ strict = false }: { strict?: boolean } = {}): Promise<HistorySession[]> {
  const { token, dataOwner, isCurrent } = captureSyncOwner();
  if (!token) return [];

  try {
    const res = await fetch(`${API_BASE}/api/conversations?mode=coze`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`会话读取失败（${res.status}），请重试`);
    const data = await res.json();
    if (!isCurrent()) return [];
    if (!Array.isArray(data?.conversations) || data.conversations.some((item: unknown) => !item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id)) {
      throw new Error("会话响应格式不正确，请重试");
    }
    return data.conversations.filter((c: { id: string }) => !isHistoryRetired(ownerScope(dataOwner), c.id)).map((c: any) => ({
      id: c.id,
      title: c.title,
      timestamp: new Date(c.updated_at).getTime(),
      messageCount: c.messageCount || 0,
    }));
  } catch (cause) {
    if (strict) throw cause;
    return [];
  }
}

// === 从服务端拉取消息 ===
export async function fetchServerMessages(convId: string, { strict = false }: { strict?: boolean } = {}): Promise<ChatMessage[]> {
  const { token, dataOwner, isCurrent } = captureSyncOwner();
  if (!token) return [];

  try {
    assertHistoryAvailable(ownerScope(dataOwner), convId);
    const res = await fetch(`${API_BASE}/api/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`消息读取失败（${res.status}），请重试`);
    const data = await res.json();
    assertHistoryAvailable(ownerScope(dataOwner), convId);
    if (!isCurrent()) {
      if (strict) throw new DOMException("账户已切换", "AbortError");
      return [];
    }
    if (!Array.isArray(data?.messages) || data.messages.some((item: unknown) => !item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string" || !(item as { id: string }).id)) {
      throw new Error("消息响应格式不正确，请重试");
    }
    return data.messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      payload: m.payload,
      contextTrace: m.contextTrace,
      textIsPayload: !m.content && m.payload,
      isError: !!m.is_error,
      errorText: m.error_text,
    }));
  } catch (cause) {
    if (strict) throw cause;
    return [];
  }
}

// === 用户设置同步 ===
export async function fetchServerSettings({ strict = false }: { strict?: boolean } = {}): Promise<Record<string, any> | null> {
  try {
    const { token, isCurrent } = captureSyncOwner();
    if (!token) return null;
    const res = await fetch(`${API_BASE}/api/settings`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`读取账户设置失败（${res.status}）`);
    const settings: unknown = await res.json();
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("账户设置响应格式不正确");
    if (!isCurrent()) throw new DOMException("账户已切换", "AbortError");
    return settings as Record<string, any>;
  } catch (cause) {
    if (strict) throw cause;
    return null;
  }
}

export async function saveServerSettings(settings: Record<string, any>): Promise<{ ok: boolean; stale?: boolean }> {
  try {
    const { token, isCurrent } = captureSyncOwner();
    if (!token) return { ok: false };
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(settings),
    });
    if (!isCurrent()) return { ok: false, stale: true };
    if (!res.ok) return { ok: false };
    const result: unknown = await res.json();
    if (!isCurrent()) return { ok: false, stale: true };
    return { ok: !!result && typeof result === "object" && (result as { ok?: unknown }).ok === true };
  } catch { return { ok: false }; }
}

// === 登录后合并 localStorage 到服务端 ===
export async function mergeLocalToServer(): Promise<{ ok: boolean; failed: number }> {
  const { token, dataOwner, isCurrent } = captureSyncOwner();
  if (!token) return { ok: true, failed: 0 };

  let failed = 0;
  const attempt = async (url: string, body: unknown, sessionId: string) => {
    if (!isCurrent()) throw new Error("账户已切换，停止旧账户同步");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!isCurrent()) throw new Error("账户已切换，停止旧账户同步");
      if (res.status === 410) {
        const result = await res.json().catch(() => null);
        if (!isCurrent()) throw new Error("账户已切换，停止旧账户同步");
        if (result?.error?.code === "HISTORY_EXPIRED") {
          // Explicit server retirement is authoritative; an empty index or a
          // generic transport error is not permission to delete local history.
          const current = lsGet<HistorySession[]>(sessionsKey(dataOwner), []);
          lsSet(sessionsKey(dataOwner), current.filter(session => session.id !== sessionId));
          localStorage.removeItem(messagesKey(sessionId, dataOwner));
          if (localStorage.getItem(activeKey(dataOwner)) === sessionId) localStorage.removeItem(activeKey(dataOwner));
          window.dispatchEvent?.(new Event("tszh_history_retention_changed"));
          return false;
        }
      }
      if (!res.ok) failed += 1;
      return res.ok;
    } catch {
      failed += 1;
      return false;
    }
  };

  try {
    const localSessions = lsGet<HistorySession[]>(sessionsKey(dataOwner), []);
    if (!localSessions.length) return { ok: true, failed: 0 };
    // A login/refresh is a read unless this account has unsynchronized changes.
    const remoteSessions = new Map((await fetchServerSessions({ strict: true })).map(s => [s.id, s]));
    if (!isCurrent()) throw new Error("账户已切换，停止旧账户同步");
    const messageInput = (m: ChatMessage) => ({
      id: m.id, role: m.role, text: m.text ?? "", payload: m.payload,
      contextTrace: m.contextTrace, isError: !!m.isError, errorText: m.errorText ?? "",
    });
    for (const s of localSessions) {
      if (!isCurrent()) throw new Error("账户已切换，停止旧账户同步");
      const remote = remoteSessions.get(s.id);
      if (!remote || remote.title !== s.title) {
        if (!await attempt(`${API_BASE}/api/conversations`, { id: s.id, title: s.title }, s.id)) continue;
      }
      const msgs = lsGet<ChatMessage[]>(messagesKey(s.id, dataOwner), []);
      if (!msgs.length) continue;
      let changed = msgs.map(messageInput);
      if (remote) {
        let remoteMessages: ChatMessage[];
        try { remoteMessages = await fetchServerMessages(s.id, { strict: true }); }
        catch { failed += 1; continue; }
        if (!isCurrent()) throw new Error("账户已切换，停止旧账户同步");
        const remoteById = new Map(remoteMessages.map(m => [m.id, JSON.stringify(messageInput(m))]));
        changed = changed.filter(m => remoteById.get(m.id) !== JSON.stringify(m));
      }
      if (changed.length) {
        await attempt(`${API_BASE}/api/conversations/${s.id}/messages`, { messages: changed }, s.id);
      }
    }

    // 旧 tszh_theme 没有账户归属；主题由账户设置界面单独读取和保存。
  } catch {
    failed += 1;
  }

  return { ok: failed === 0, failed };
}

// === 登录后从服务端读取当前账户会话 ===
export async function syncServerToLocal(): Promise<{ ok: boolean; failed: number }> {
  const { token, dataOwner, isCurrent } = captureSyncOwner();
  if (!token) return { ok: true, failed: 0 };
  try {
    const serverSessions = await fetchServerSessions({ strict: true });
    if (!isCurrent()) return { ok: false, failed: 0 };
    const available = serverSessions.filter(session => !isHistoryRetired(ownerScope(dataOwner), session.id));
    if (serverSessions.length > 0) lsSet(sessionsKey(dataOwner), available);
    // An empty server response keeps the existing local copy; it does not delete history.
    return { ok: true, failed: 0 };
  } catch {
    return { ok: false, failed: 1 };
  }
}
