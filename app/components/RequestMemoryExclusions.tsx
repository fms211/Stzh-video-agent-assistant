"use client";
import SquishSwitch from "@/app/components/SquishSwitch";
import { useEffect, useRef, useState } from "react";
import { captureStudioMemoryClient, type MemoryRow } from "@/app/lib/studio-memory-client";
import type { StudioMode } from "../../shared/studio-context/index.cjs";

export function useRequestMemoryExclusions(scope: string) {
  const [value, setValue] = useState({ scope, ids: [] as string[] });
  if (value.scope !== scope) setValue({ scope, ids: [] });
  const ids = value.scope === scope ? value.ids : [];
  return { ids, setIds: (next: string[]) => setValue(previous => previous.scope === scope ? { scope, ids: next } : previous),
    consumed: (sent: string[]) => setValue(previous => previous.scope === scope ? { scope, ids: previous.ids.filter(id => !sent.includes(id)) } : previous) };
}

export function RequestMemoryExclusions({ mode, sessionId, projectId, runId, value, onChange, disabled = false, presentation = "section" }: {
  mode: StudioMode; sessionId?: string; projectId?: string; runId?: string; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; presentation?: "section" | "panel";
}) {
  const [client] = useState(() => captureStudioMemoryClient());
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<MemoryRow[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const live = useRef(true), locked = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const load = async (more = false) => {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const page = await client.list(more ? cursor || "" : "");
      if (live.current) { setRows(previous => more ? [...previous, ...page.items.filter(item => !previous.some(row => row.id === item.id))] : page.items); setCursor(page.nextCursor); }
    } catch (cause) { if (live.current && !(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "记忆读取失败"); }
    finally { locked.current = false; if (live.current) setBusy(false); }
  };
  const panelLoaded = useRef(false);
  useEffect(() => {
    if (presentation !== "panel" || disabled || panelLoaded.current) return;
    panelLoaded.current = true;
    void load();
    // A panel loads once per mount; pagination is still explicitly requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, disabled]);
  const eligible = rows.filter(item => item.enabled && item.status === "confirmed" && item.sourceAvailable !== false && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now())
    && (item.scope.kind === "user" || (item.scope.kind === "project" && item.scope.projectId === projectId)
      || (item.scope.kind === "session" && item.scope.mode === mode && item.scope.sessionId === sessionId)
      || (item.scope.kind === "run" && item.scope.mode === mode && item.scope.runId === runId)));
  return <section className={presentation === "panel" ? "coze-memory-panel" : "studio-session-history"} aria-label="本次记忆选择">
    {presentation === "section" && <button type="button" disabled={disabled || busy} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}>本次不使用的记忆{value.length ? `（${value.length}）` : ""}</button>}
    {(open || presentation === "panel") && <div className="studio-disclosure-content"><p>勾选仅影响本次发送或新运行，不会停用长期记忆。实际引用仍取决于本次输入的相关性。</p>
      {error && <p role="alert">{error}</p>}{busy && <p role="status">正在读取…</p>}
      {!busy && !eligible.length && <p>已载入条目中没有适用于当前范围的已确认记忆。</p>}
      <div style={{ maxHeight: 220, overflow: "auto" }}>{eligible.map(item => <label key={item.id} style={{ display: "flex", gap: 8, padding: 6, alignItems: "start" }}><SquishSwitch disabled={disabled || busy || (!value.includes(item.id) && value.length >= 100)} checked={value.includes(item.id)} onChange={event => onChange(event.target.checked ? [...new Set([...value, item.id])] : value.filter(id => id !== item.id))} /><span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.content}</span></label>)}</div>
      <div className="studio-session-tools"><button type="button" disabled={disabled || busy} onClick={() => void load()}>刷新</button>{cursor && <button type="button" disabled={disabled || busy} onClick={() => void load(true)}>加载更多</button>}{value.length > 0 && <button type="button" disabled={disabled || busy} onClick={() => onChange([])}>清空临时排除</button>}</div>
    </div>}
  </section>;
}
