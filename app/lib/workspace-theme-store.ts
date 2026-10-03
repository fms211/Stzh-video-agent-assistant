import { DEFAULT_THEME, THEMES, type ThemeId } from "./theme-registry";

type ThemeStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type WorkspaceThemeSnapshot = {
  theme: ThemeId; phase: "idle" | "loading" | "saving" | "error";
  message: string; retry: "load" | "save" | null;
};
type Options = {
  scope: string; storage: ThemeStorage; current(): boolean;
  readRemote(): Promise<unknown>; writeRemote(theme: ThemeId): Promise<{ ok: boolean }>;
};
function validTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some(theme => theme.id === value);
}

/** Account-scoped cache; a pending save is never overwritten by an older cloud read. */
export function createWorkspaceThemeStore(options: Options) {
  const key = `tszh:v2:${options.scope}:theme`;
  const guest = options.scope === "guest";
  let snapshot: WorkspaceThemeSnapshot = Object.freeze({ theme: DEFAULT_THEME, phase: "idle", message: "", retry: null });
  let pending = false, disposed = false, revision = 0;
  const listeners = new Set<() => void>();
  const active = () => { try { return !disposed && options.current(); } catch { return false; } };
  const publish = (patch: Partial<WorkspaceThemeSnapshot>) => {
    if (!active()) return;
    snapshot = Object.freeze({ ...snapshot, ...patch }); for (const listener of listeners) listener();
  };
  // Operation handlers can report denied identity storage; render-time checks stay side-effect free.
  const operationCurrent = () => {
    if (disposed) return false;
    try { return options.current(); }
    catch {
      snapshot = Object.freeze({ ...snapshot, phase: "error", message: "本机账户存储暂不可用；请恢复存储后重新检查账户或刷新页面。", retry: null });
      for (const listener of listeners) listener();
      return false;
    }
  };
  const writeLocal = (theme: ThemeId, waiting: boolean) => {
    if (!active()) throw new Error("账户已切换");
    options.storage.setItem(key, JSON.stringify({ theme, pending: waiting }));
  };
  const readLocal = () => {
    const raw = options.storage.getItem(key);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (raw) {
      if (!saved || typeof saved !== "object" || !validTheme((saved as { theme?: unknown }).theme)) throw new Error("主题缓存无效");
      const record = saved as { theme: ThemeId; pending?: unknown };
      return { theme: record.theme, pending: !guest && record.pending === true };
    }
    // Legacy global theme belongs only to the guest fallback, never to a new account.
    const legacy = guest ? options.storage.getItem("theme") : null;
    return { theme: validTheme(legacy) ? legacy : DEFAULT_THEME, pending: false };
  };
  if (active()) try {
    const saved = readLocal(); pending = saved.pending;
    snapshot = Object.freeze({ ...snapshot, theme: saved.theme, phase: pending ? "error" : "idle",
      message: pending ? "本机主题已保留，云端保存尚未确认；可重试同步。" : "", retry: pending ? "save" : null });
  } catch { snapshot = Object.freeze({ ...snapshot, phase: "error", message: "本机主题缓存暂不可用；可恢复存储后重新读取。", retry: "load" }); }

  async function load() {
    if (!operationCurrent() || pending || snapshot.phase === "saving") return;
    const request = ++revision;
    if (guest) {
      try { const saved = readLocal(); publish({ theme: saved.theme, phase: "idle", message: "已读取本机访客主题。", retry: null }); }
      catch { publish({ phase: "error", message: "本机访客主题暂不可用；可恢复存储后重新读取。", retry: "load" }); }
      return;
    }
    publish({ phase: "loading", message: "正在读取账户主题…", retry: null });
    try {
      const settings = await options.readRemote();
      if (request !== revision || !operationCurrent()) return;
      const remoteTheme = settings && typeof settings === "object" ? (settings as { theme?: unknown }).theme : null;
      // The original account table still defaults to "dark". Recognize that
      // documented legacy default without accepting arbitrary invalid themes
      // or writing a migration over the user's server setting during a read.
      const theme = remoteTheme === "dark" ? DEFAULT_THEME : remoteTheme;
      if (!validTheme(theme)) throw new Error("主题响应无效");
      try { writeLocal(theme, false); }
      catch { publish({ theme, phase: "error", message: "云端主题已读取，但本机缓存未保存；可恢复存储后重试。", retry: "load" }); return; }
      publish({ theme, phase: "idle", message: remoteTheme === "dark" ? "已读取旧版深色主题，按当前默认主题显示。" : "已读取账户主题。", retry: null });
    } catch {
      if (request === revision && operationCurrent()) publish({ phase: "error", message: "账户主题读取未完成，当前本机主题保留；可重试读取。", retry: "load" });
    }
  }
  async function choose(theme: string) {
    if (!operationCurrent() || !validTheme(theme) || snapshot.phase === "saving") return;
    const request = ++revision;
    try { writeLocal(theme, !guest); }
    catch { publish({ phase: "error", message: "本机主题保存失败，当前主题未切换；请恢复存储后重新选择。", retry: pending ? "save" : null }); return; }
    pending = !guest;
    publish({ theme, phase: guest ? "idle" : "saving", message: guest ? "主题已保存在本机访客空间。" : "本机主题已保存，正在确认云端…", retry: null });
    if (guest) return;
    try {
      const result = await options.writeRemote(theme);
      if (request !== revision || !operationCurrent()) return;
      if (!result.ok) throw new Error("云端保存未确认");
      try { writeLocal(theme, false); pending = false; }
      catch { publish({ phase: "error", message: "云端已确认主题，但本机同步标记未更新；可恢复存储后重试。", retry: "save" }); return; }
      publish({ phase: "idle", message: "主题已在本机和账户保存。", retry: null });
    } catch {
      if (request === revision && operationCurrent()) publish({ phase: "error", message: "本机主题已保存，云端结果尚未确认；可重试同步相同主题。", retry: "save" });
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load, choose,
    retry: () => snapshot.retry === "save" ? choose(snapshot.theme) : load(),
    activate() { disposed = false; },
    dispose() { disposed = true; revision++; },
  };
}
