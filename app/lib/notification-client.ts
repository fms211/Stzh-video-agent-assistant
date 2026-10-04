import { getCachedUser, getToken, resolveApiBase } from "./auth";

export type NotificationRow = { id: string; title: string; message: string; type: string; read: number | boolean; created_at?: number; time?: string | Date };
export function notificationTaskId(id: string): string | null {
  return /^task:(.+):(completed|failed|cancelled)$/.exec(id)?.[1] || null;
}
export function notificationCacheKey() {
  const user = getCachedUser();
  return `tszh:v2:${getToken() && user ? `user:${user.id}` : "guest"}:notifications`;
}

// Pin credentials and cache ownership for the lifetime of a mounted feed.
export function captureNotificationClient() {
  const token = getToken(), user = getCachedUser();
  const owner = token && user ? `user:${user.id}` : "guest";
  const key = `tszh:v2:${owner}:notifications`;
  const base = typeof window === "undefined" ? "" : resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location);
  const current = () => getToken() === token && notificationCacheKey() === key;
  const assertCurrent = () => { if (!current()) throw new DOMException("通知账户已切换", "AbortError"); };
  const cached = (): NotificationRow[] => {
    if (typeof window === "undefined") return [];
    try { const rows = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(rows) ? rows : []; } catch { return []; }
  };
  const save = (rows: NotificationRow[]) => { assertCurrent(); localStorage.setItem(key, JSON.stringify(rows)); };
  async function request(path = "", method = "GET", body?: unknown) {
    assertCurrent();
    const response = await fetch(`${base}/api/notifications${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assertCurrent();
    if (!response.ok) throw new Error(`通知同步失败（${response.status}），请重试`);
    return response;
  }
  return {
    owner, current, cached,
    async read() {
      assertCurrent();
      if (!token) return cached();
      const data = await (await request()).json(); assertCurrent();
      if (!Array.isArray(data.notifications)) throw new Error("通知响应格式不正确");
      return data.notifications as NotificationRow[];
    },
    save,
    async mutate(action: "read" | "clear", rows: NotificationRow[]) {
      assertCurrent();
      if (token) await request(action === "read" ? "/read-all" : "", action === "read" ? "POST" : "DELETE", action === "read" ? {} : undefined);
      const updated = action === "clear" ? [] : rows.map(row => ({ ...row, read: true }));
      save(updated); return updated;
    },
  };
}

export function createNotificationFeed(client: ReturnType<typeof captureNotificationClient>, changed: (state: { rows: NotificationRow[]; busy: boolean; loading: boolean; error: string }) => void) {
  let rows = client.cached(), busy = false, loading = true, disposed = false, revision = 0;
  const emit = (error = "") => { if (!disposed && client.current()) changed({ rows, busy, loading, error }); };
  const refresh = async () => {
    if (disposed || busy || !client.current()) return;
    const version = ++revision;
    const current = () => !disposed && version === revision && client.current();
    loading = true; emit();
    let message = "";
    try {
      const result = await client.read();
      if (!current()) return;
      rows = result;
      try { client.save(rows); }
      catch { message = "通知已读取，但本机缓存未保存；重新打开时需再次联网读取。"; }
    } catch (error) { message = error instanceof Error ? error.message : "读取通知失败"; }
    finally { if (current()) { loading = false; emit(message); } }
  };
  return {
    current: () => !disposed && client.current(),
    refresh,
    async mutate(action: "read" | "clear") {
      if (disposed || busy || !client.current()) return;
      ++revision; loading = false; busy = true; emit();
      try {
        const result = await client.mutate(action, rows);
        if (disposed || !client.current()) return;
        rows = result; busy = false; emit();
        // Catch notifications arriving while the mutation was in flight.
        await refresh();
      } catch (error) { busy = false; emit(error instanceof Error ? error.message : "更新通知失败"); }
    },
    start() { emit(); void refresh(); },
    dispose() { disposed = true; revision++; },
  };
}
