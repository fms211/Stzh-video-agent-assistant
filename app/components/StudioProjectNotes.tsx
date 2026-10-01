"use client";
import SquishSwitch from "@/app/components/SquishSwitch";
import { useEffect, useRef, useState } from "react";
import { captureCreativeApi } from "@/app/lib/creative-agent-api";
import { ApiRequestError } from "@/app/lib/auth";
import { useAuth } from "./AuthProvider";

const labels = { taskState: "任务状态", conclusion: "结论与决定", blocker: "阻塞与未知", action: "下一步", reference: "参考资料" };
type Fields = Record<keyof typeof labels, string>;
type Note = { projectId: string; revision: number; enabled: boolean; fields: Fields; updatedAt: string | null; verification: string };
type Draft = { base: Note; fields: Fields; enabled: boolean };
const empty = (): Fields => ({ taskState: "", conclusion: "", blocker: "", action: "", reference: "" });

export function StudioProjectNotes({ projectId, disabled = false }: { projectId: string; disabled?: boolean }) {
  const { user } = useAuth();
  const storageKey = `tszh:v2:project-note-draft:${user?.id}:${projectId}`;
  const [api] = useState(() => captureCreativeApi());
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [base, setBase] = useState<Note | null>(null), [latest, setLatest] = useState<Note | null>(null);
  const [fields, setFields] = useState<Fields>(empty), [enabled, setEnabled] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const [conflict, setConflict] = useState(false), [deleting, setDeleting] = useState(false);
  const live = useRef(true), locked = useRef(false);
  const path = `/api/studio/project-notes/${encodeURIComponent(projectId)}`;
  const dirty = Boolean(base && (base.enabled !== enabled || JSON.stringify(base.fields) !== JSON.stringify(fields)));
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!base) return;
    try { if (dirty) sessionStorage.setItem(storageKey, JSON.stringify({ base, fields, enabled })); else sessionStorage.removeItem(storageKey); setDraftWarning(""); }
    catch { setDraftWarning("本机无法保留改稿，请在切换项目前保存到服务器。"); }
  }, [storageKey, base, fields, enabled, dirty]);
  const assign = (item: Note) => { setBase(item); setFields(item.fields); setEnabled(item.enabled); setLatest(null); setConflict(false); setDeleting(false); };
  const act = async (job: () => Promise<void>) => {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await job(); }
    catch (cause) { if (live.current && !(cause instanceof DOMException && cause.name === "AbortError")) { setError(cause instanceof Error ? cause.message : "笔记操作失败"); if (cause instanceof ApiRequestError && cause.status === 409) setConflict(true); } }
    finally { locked.current = false; if (live.current) setBusy(false); }
  };
  const load = async () => {
    const result = await api<{ item: Note }>(path); if (!live.current) return;
    if (base) { setLatest(result.item); if (result.item.revision !== base.revision) setConflict(true); return; }
    let draft: Draft | null = null;
    try { draft = JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { /* Ignore an invalid local draft. */ }
    if (draft?.base?.projectId === projectId && Number.isInteger(draft.base.revision) && typeof draft.enabled === "boolean" && Object.keys(labels).every(key => typeof draft?.fields?.[key as keyof Fields] === "string")) {
      setBase(draft.base); setFields(draft.fields); setEnabled(draft.enabled); setNotice("已恢复本标签页未保存的改稿。");
      if (draft.base.revision !== result.item.revision) { setLatest(result.item); setConflict(true); }
    } else assign(result.item);
  };
  return <section className="studio-session-history" aria-label="项目笔记">
    <button type="button" disabled={disabled || busy} aria-expanded={open} onClick={() => { setOpen(!open); if (!open && !base) void act(load); }}>项目笔记{dirty ? " · 未保存" : ""}</button>
    {open && <div className="studio-disclosure-content"><p>笔记由你维护，不能代替运行结果或人工审批。未保存改稿按账户和项目保留在当前标签页。</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {draftWarning && <p role="alert">{draftWarning}</p>}
      {!base ? <button type="button" disabled={disabled || busy} onClick={() => void act(load)}>{busy ? "正在读取…" : "重新读取"}</button> : <>
        <fieldset disabled={disabled || busy} style={{ display: "grid", gap: 10 }}>{Object.entries(labels).map(([key, label]) => <label key={key}>{label}<textarea rows={2} maxLength={4000} value={fields[key as keyof Fields]} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))} style={{ display: "block", width: "100%", resize: "vertical" }} /></label>)}
          <label><SquishSwitch checked={enabled} onChange={event => setEnabled(event.target.checked)} />允许作为本项目对话的参考</label></fieldset>
        <div className="studio-session-tools"><button type="button" disabled={disabled || busy || conflict || !dirty} onClick={() => void act(async () => {
          const result = await api<{ item: Note }>(path, { method: "PUT", body: JSON.stringify({ expectedRevision: base.revision, fields, enabled }) });
          if (live.current) { assign(result.item); setNotice("项目笔记已保存；不改变运行或审批状态。"); }
        })}>保存笔记</button><button type="button" disabled={disabled || busy} onClick={() => void act(load)}>读取服务器版本</button>
          <button type="button" disabled={disabled || busy || base.revision === 0} onClick={() => setDeleting(true)}>删除笔记</button></div>
        {conflict && <p role="alert">服务器笔记已经变化，本地改稿仍保留。请核对服务器版本后决定。</p>}
        {latest && <details open={conflict}><summary>服务器版本 {latest.revision}</summary>{Object.entries(labels).map(([key,label]) => <p key={key} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><b>{label}：</b>{latest.fields[key as keyof Fields]}</p>)}<button type="button" disabled={disabled || busy} onClick={() => assign(latest)}>放弃本地改稿，载入服务器版本</button></details>}
        {deleting && <div role="group" aria-label="确认删除项目笔记"><p>删除这份笔记及当前改稿？原始会话、任务和产物会保留。</p><button type="button" disabled={disabled || busy} onClick={() => void act(async () => { const result = await api<{ item: Note }>(path, { method: "DELETE", body: JSON.stringify({ expectedRevision: base.revision }) }); if (live.current) { assign(result.item); setNotice("笔记已清空，原始记录保留。"); } })}>确认删除笔记</button><button type="button" disabled={busy} onClick={() => setDeleting(false)}>取消删除</button></div>}
      </>}
    </div>}
  </section>;
}
