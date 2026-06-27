import { getToken } from "./auth";

const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin)
  : "";

const SESSIONS_KEY = "tszh_sessions";
const ACTIVE_KEY = "tszh_active";
const MESSAGES_PREFIX = "tszh_msgs_";

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

// === 会话管理 ===
export function loadSessions(): HistorySession[] {
  if (typeof window === "undefined") return [];
  return lsGet<HistorySession[]>(SESSIONS_KEY, []);
}

export async function saveSessions(sessions: HistorySession[]) {
  lsSet(SESSIONS_KEY, sessions);

  // 如果有 token，同步到服务端
  const token = getToken();
  if (!token) return;

  try {
    // 并行发送所有请求（而非串行等待）
    const requests = sessions.map((session) =>
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
  return lsGet<ChatMessage[]>(`${MESSAGES_PREFIX}${id}`, []);
}

export async function saveMessages(id: string, messages: ChatMessage[]) {
  lsSet(`${MESSAGES_PREFIX}${id}`, messages);

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
          isError: m.isError,
          errorText: m.errorText,
        })),
      }),
    }).catch(() => {});
  } catch {}
}

export function removeMessages(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${MESSAGES_PREFIX}${id}`);

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
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

// === 从服务端拉取会话列表（登录后首次加载） ===
export async function fetchServerSessions(): Promise<HistorySession[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.conversations || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      timestamp: new Date(c.updated_at).getTime(),
      messageCount: c.messageCount || 0,
    }));
  } catch {
    return [];
  }
}

// === 从服务端拉取消息 ===
export async function fetchServerMessages(convId: string): Promise<ChatMessage[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      payload: m.payload,
      textIsPayload: !m.content && m.payload,
      isError: !!m.is_error,
      errorText: m.error_text,
    }));
  } catch {
    return [];
  }
}

// === 用户设置同步 ===
export async function fetchServerSettings(): Promise<Record<string, any> | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveServerSettings(settings: Record<string, any>) {
  const token = getToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(settings),
    }).catch(() => {});
  } catch {}
}

// === 登录后合并 localStorage 到服务端 ===
export async function mergeLocalToServer() {
  const token = getToken();
  if (!token) return;

  try {
    // 合并会话
    const localSessions = lsGet<HistorySession[]>(SESSIONS_KEY, []);
    if (localSessions.length > 0) {
      for (const s of localSessions) {
        await fetch(`${API_BASE}/api/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: s.id, title: s.title }),
        }).catch(() => {});
      }
    }

    // 合并消息
    for (const s of localSessions) {
      const msgs = lsGet<ChatMessage[]>(`${MESSAGES_PREFIX}${s.id}`, []);
      if (msgs.length > 0) {
        await fetch(`${API_BASE}/api/conversations/${s.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messages: msgs.map((m) => ({
              id: m.id, role: m.role, text: m.text,
              payload: m.payload, isError: m.isError, errorText: m.errorText,
            })),
          }),
        }).catch(() => {});
      }
    }

    // 合并主题
    const theme = lsGet<string>("tszh_theme", "");
    if (theme) {
      await saveServerSettings({ theme });
    }
  } catch {}
}

// === 登录后从服务端覆盖 localStorage ===
export async function syncServerToLocal() {
  const token = getToken();
  if (!token) return;

  try {
    // 拉取会话
    const serverSessions = await fetchServerSessions();
    if (serverSessions.length > 0) {
      lsSet(SESSIONS_KEY, serverSessions);
    }

    // 拉取设置
    const settings = await fetchServerSettings();
    if (settings) {
      if (settings.theme) lsSet("tszh_theme", settings.theme);
    }
  } catch {}
}
