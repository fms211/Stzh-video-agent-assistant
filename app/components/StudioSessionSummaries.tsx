"use client";
import { useEffect, useRef, useState } from "react";
import { captureCreativeApi } from "@/app/lib/creative-agent-api";

type Summary = { id: string; revision: number; createdAt: string; algorithm: string; state?: "current" | "stale"; range: { count: number; firstId: string; lastId: string }; text?: string; excerpts?: Array<{ messageId: string; role: string; content: string }>; omittedMessages?: number };
type Source = { id: string; role: string; content: string };

/** Parent keys this component by account and session. The captured API also
 * rejects account changes before and after every request. */
export function StudioSessionSummaries({ sessionId, mode, disabled, prepare }: { sessionId: string; mode: "assistant" | "workflow"; disabled: boolean; prepare: () => Promise<void> }) {
  const [api] = useState(() => captureCreativeApi());
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<Summary | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceOffset, setSourceOffset] = useState<number | null>(null);
  const [keepRecent, setKeepRecent] = useState(10);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const live = useRef(true), locked = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const act = async (work: () => Promise<void>) => {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { if (live.current && !(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "读取失败"); }
    finally { locked.current = false; if (live.current) setBusy(false); }
  };
  const load = async (more = false) => {
    const result = await api<{ items: Summary[]; nextCursor: number | null }>(`/api/studio/summaries?mode=${mode}&sessionId=${encodeURIComponent(sessionId)}${more && cursor ? `&before=${cursor}` : ""}`);
    if (live.current) { setRows(previous => more ? [...previous, ...result.items.filter(item => !previous.some(row => row.id === item.id))] : result.items); setCursor(result.nextCursor); }
  };
  const choose = (value: Summary | null) => { setSelected(value); setSources([]); setSourceOffset(null); setDeleting(false); };
  const readSources = async (offset = 0) => {
    if (!selected) return;
    const result = await api<{ items: Source[]; nextOffset: number | null }>(`/api/studio/summaries/${encodeURIComponent(selected.id)}/sources?offset=${offset}`);
    if (live.current) { setSources(previous => offset ? [...previous, ...result.items] : result.items); setSourceOffset(result.nextOffset); }
  };
  return <section className="studio-session-history" aria-label="会话摘要管理">
    <button type="button" disabled={disabled || busy} aria-expanded={open} onClick={() => {
      if (open) { setOpen(false); return; }
      setOpen(true); void act(async () => { await prepare(); if (live.current) await load(); });
    }}>会话摘要</button>
    {open && <div className="studio-disclosure-content" aria-busy={busy}>
      <p>按需整理历史片段，原始对话完整保留。摘要中的陈述不会自动成为已确认记忆。</p>
      <div className="studio-session-tools"><label>保留最近消息 <input aria-label="摘要保留最近消息数" type="number" min={0} max={200} value={keepRecent} disabled={busy || disabled} onChange={event => setKeepRecent(Number(event.target.value))} style={{ width: 65 }} /></label>
        <label>关注内容 <input aria-label="摘要关注内容" maxLength={8000} value={query} disabled={busy || disabled} onChange={event => setQuery(event.target.value)} placeholder="可选，如构图与未确认事项" /></label>
        <button type="button" disabled={busy || disabled || !Number.isInteger(keepRecent) || keepRecent < 0 || keepRecent > 200} onClick={() => void act(async () => {
          await prepare(); if (!live.current) return;
          const result = await api<{ item: Summary | null; created: boolean }>("/api/studio/summaries", { method: "POST", body: JSON.stringify({ mode, sessionId, keepRecent, query }) });
          if (!live.current) return;
          choose(result.item); setNotice(result.item ? result.created ? "摘要已建立，原文未修改。" : "已读取相同范围的现有摘要。" : "没有需要整理的较早消息，可减少保留数量。"); await load();
        })}>整理历史片段</button>
        <button type="button" disabled={busy || disabled} onClick={() => void act(() => load())}>刷新摘要</button>
      </div>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="studio-session-tools">{rows.map(item => <button type="button" key={item.id} disabled={busy || disabled} aria-pressed={selected?.id === item.id} onClick={() => void act(async () => {
        const result = await api<{ item: Summary }>(`/api/studio/summaries/${encodeURIComponent(item.id)}`); if (live.current) choose(result.item);
      })}>版本 {item.revision} · {item.range.count} 条 · {item.state === "stale" ? "来源已变化" : "来源有效"}</button>)}
        {cursor && <button type="button" disabled={busy || disabled} onClick={() => void act(() => load(true))}>更多摘要</button>}</div>
      {selected && <article><h4>摘要版本 {selected.revision}</h4><p>{selected.algorithm === "user-supplied-v1" ? "用户提供的总结，未经事实核验" : "完整原文摘录，未涵盖全部历史"} · {new Date(selected.createdAt).toLocaleString()}</p>
        {selected.state === "stale" && <p role="status">来源已变化，请重新整理；旧摘要保留供核对。</p>}
        {selected.text && <p style={{ whiteSpace: "pre-wrap" }}>{selected.text}</p>}
        {selected.excerpts?.map(entry => <blockquote key={entry.messageId} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><small>{entry.role === "user" ? "用户" : "助手"}</small><p>{entry.content}</p></blockquote>)}
        <div className="studio-session-tools"><button type="button" disabled={busy || disabled || selected.state === "stale"} onClick={() => void act(() => readSources())}>核对原始消息</button>
          <button type="button" disabled={busy || disabled} onClick={() => setDeleting(true)}>删除这份摘要</button>
          {deleting && <><span>仅删除摘要，原始消息保留。</span><button type="button" disabled={busy || disabled} onClick={() => void act(async () => { await api(`/api/studio/summaries/${encodeURIComponent(selected.id)}`, { method: "DELETE" }); if (live.current) { choose(null); setNotice("摘要已删除，原文保留。"); await load(); } })}>确认删除摘要</button><button type="button" disabled={busy} onClick={() => setDeleting(false)}>取消</button></>}</div>
        {sources.length > 0 && <div aria-label="摘要原始消息" style={{ maxHeight: 300, overflow: "auto" }}>{sources.map(source => <pre key={source.id} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{source.role}: {source.content}</pre>)}</div>}
        {sourceOffset !== null && <button type="button" disabled={busy || disabled} onClick={() => void act(() => readSources(sourceOffset))}>继续读取原文</button>}
      </article>}
    </div>}
  </section>;
}
