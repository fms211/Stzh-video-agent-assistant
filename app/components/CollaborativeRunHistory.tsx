"use client";

import { useEffect, useRef, useState } from "react";
import { captureCreativeApi, type AgentRun } from "@/app/lib/creative-agent-api";
import { collaborativeStatus } from "@/app/lib/collaborative-history";

export default function CollaborativeRunHistory({ disabled, selectedId, revision, onSelect }: {
  disabled: boolean; selectedId?: string; revision: number; onSelect: (id: string) => void;
}) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const id = ++sequence.current;
    const api = captureCreativeApi();
    loadingRef.current = true; setLoading(true); setError(""); setRuns([]); setCursor(null);
    const search = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : "";
    void api<{ runs: AgentRun[]; nextCursor: string | null }>(`/api/agent-runs?limit=20${search}`)
      .then(data => { if (id === sequence.current) { setRuns(data.runs); setCursor(data.nextCursor); } })
      .catch(cause => { if (id === sequence.current) setError(cause instanceof Error ? cause.message : "读取历史失败"); })
      .finally(() => { if (id === sequence.current) { loadingRef.current = false; setLoading(false); } });
    return () => { sequence.current++; };
  }, [revision, reload, searchQuery]);

  async function more() {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setError("");
    const id = ++sequence.current;
    try {
      const search = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : "";
      const data = await captureCreativeApi()<{ runs: AgentRun[]; nextCursor: string | null }>(`/api/agent-runs?limit=20${search}&cursor=${encodeURIComponent(cursor)}`);
      if (id !== sequence.current) return;
      if (data.nextCursor === cursor) throw new Error("历史分页未前进，请刷新列表");
      setRuns(current => [...new Map([...current, ...data.runs].map(run => [run.id, run])).values()]);
      setCursor(data.nextCursor);
    } catch (cause) { if (id === sequence.current) setError(cause instanceof Error ? cause.message : "读取历史失败"); }
    finally { if (id === sequence.current) { loadingRef.current = false; setLoading(false); } }
  }

  return <details className="collab-history">
    <summary>协作历史 · 已加载 {runs.length} 条{searchQuery ? "搜索结果" : ""}</summary>
    <div className="collab-history__toolbar">
      <input aria-label="搜索全部协作历史" placeholder="搜索全部任务或项目名称" value={query} onChange={event => setQuery(event.target.value)} />
      <button type="button" disabled={disabled} aria-disabled={loading || disabled} onClick={() => { if (!loadingRef.current && !disabled) { loadingRef.current = true; setReload(value => value + 1); } }}>刷新列表</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">正在读取历史…</p>}
    {!loading && !error && !runs.length && <p>{searchQuery ? "没有匹配的协作历史" : "暂无协作历史"}</p>}
    <ul>{runs.map(run => <li key={run.id}><button type="button" disabled={disabled} aria-current={run.id === selectedId ? "true" : undefined} onClick={() => onSelect(run.id)}>
      <span>{run.task}</span><small>{collaborativeStatus(run)}{run.createdAt ? ` · ${new Date(run.createdAt * 1000).toLocaleString("zh-CN")}` : ""}</small>
    </button></li>)}</ul>
    {cursor && <button type="button" disabled={disabled} aria-disabled={loading || disabled} onClick={() => void more()}>加载更早记录</button>}
    <style>{`
      .collab-history { margin-bottom: 14px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: var(--shape-control); background: var(--space-panel); color: var(--foreground); font-size: var(--text-label-size); line-height: var(--text-label-line); }
      .collab-history summary { cursor: pointer; min-height: 44px; align-content: center; overflow-wrap: anywhere; }
      .collab-history__toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .collab-history input { min-width: min(160px, 100%); flex: 1; padding: 8px; color: var(--foreground); background: var(--space-surface); border: 1px solid var(--border-subtle); border-radius: var(--shape-control); }
      .collab-history button { min-height: 44px; padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: var(--shape-control); color: var(--foreground); background: var(--space-surface); cursor: pointer; }
      .collab-history ul { list-style: none; padding: 0; display: grid; gap: 6px; max-height: 300px; overflow-y: auto; }
      .collab-history li { min-width: 0; }
      .collab-history li button { width: 100%; max-width: 100%; text-align: left; }
      .collab-history li span { display: block; overflow-wrap: anywhere; white-space: normal; font-size: var(--text-body-size); line-height: var(--text-body-line); }
      .collab-history button[aria-disabled=true] { opacity: .5; cursor: wait; }
      .collab-history small { display: block; color: var(--foreground-muted); margin-top: 5px; overflow-wrap: anywhere; }
      .collab-history p[role="alert"] { overflow-wrap: anywhere; }
      .collab-history [aria-current=true] { border-color: var(--glow-warm); }
    `}</style>
  </details>;
}
