"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Brain, Download, Plus, RefreshCw, X } from "lucide-react";
import type { StudioMode } from "../../shared/studio-context/index.cjs";
import { ApiRequestError } from "@/app/lib/auth";
import { captureStudioMemoryClient, createMemorySaveAttempt, draftFromMemory, emptyMemoryDraft, memoryState, type MemoryDraft, type MemoryRow, type MemorySourcePreview } from "@/app/lib/studio-memory-client";
import "./StudioMemoryManager.css";

function sourceOverview(raw: string) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    let metadata: Record<string, unknown> | null = null;
    try {
      const parsed = typeof source.metadata === "string" ? JSON.parse(source.metadata) : source.metadata;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch { /* Keep the original metadata available below. */ }
    const body = [source.content, source.task, source.final_instruction].find(item => typeof item === "string" && item.trim()) as string | undefined;
    const fields = [
      ["消息角色", source.role === "action-cards" ? "结果卡片" : source.role === "assistant" ? "创意助手" : source.role === "user" ? "用户" : source.role], ["运行状态", source.status],
      ["工作流", metadata?.workflowName], ["运行编号", metadata?.workflowRunId],
    ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()));
    if (!body && !fields.length) return null;
    return { body, fields };
  } catch { return null; }
}

function MemoryDialog({ label, onClose, busy = false, children, compact = false }: { label: string; onClose: () => void; busy?: boolean; children: ReactNode; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} aria-label={label} className={`studio-memory-dialog${compact ? " is-compact" : ""}`} tabIndex={-1}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]')).filter(node => node.getClientRects().length && !node.closest("[inert]"));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>{children}</dialog>;
}

export function StudioMemoryManager({ mode, onClose }: { mode: StudioMode; onClose: () => void }) {
  const [client] = useState(() => captureStudioMemoryClient());
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemoryRow | null>(null);
  const [draft, setDraft] = useState<MemoryDraft>(emptyMemoryDraft);
  const [latest, setLatest] = useState<MemoryRow | null>(null);
  const [sourcePreview, setSourcePreview] = useState<MemorySourcePreview | null>(null);
  const [conflict, setConflict] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rollout, setRollout] = useState<"off" | "shadow" | "enforce" | null>(null);
  const [discard, setDiscard] = useState<"close" | "new" | MemoryRow | null>(null);
  const [deleting, setDeleting] = useState<MemoryRow | null>(null);
  const [exportUrl, setExportUrl] = useState("");
  const live = useRef(true), locked = useRef(false);
  const attempt = useRef<ReturnType<typeof createMemorySaveAttempt> | null>(null);
  const baseline = selected ? draftFromMemory(selected) : emptyMemoryDraft();
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => () => { live.current = false; }, []);
  useEffect(() => () => { if (exportUrl) URL.revokeObjectURL(exportUrl); }, [exportUrl]);

  const act = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) {
      if (live.current && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "操作失败，请重试");
        if (cause instanceof ApiRequestError && cause.code === "MEMORY_REVISION_CONFLICT") setConflict(true);
      }
    } finally { locked.current = false; if (live.current) setBusy(false); }
  };
  const load = async (more = false) => {
    if (!more) {
      try {
        const status = await client.contextStatus();
        if (live.current) setRollout(["off", "shadow", "enforce"].includes(status.rollout) ? status.rollout : null);
      } catch { if (live.current) setRollout(null); }
    }
    const page = await client.list(more ? nextCursor || "" : "");
    if (!live.current) return;
    setRows(previous => more ? [...previous, ...page.items.filter(item => !previous.some(row => row.id === item.id))] : page.items);
    setNextCursor(page.nextCursor); setLoaded(true);
    if (selected) {
      const fresh = page.items.find(item => item.id === selected.id);
      if (fresh && fresh.revision !== selected.revision) { setConflict(true); setLatest(fresh); }
      if (fresh) setSelected(previous => previous ? { ...previous, sourceAvailable: fresh.sourceAvailable, sourceState: fresh.sourceState } : previous);
    }
  };
  useEffect(() => {
    live.current = true;
    void act(async () => {
      await load();
      try { const result = await client.projects(); if (live.current) { setProjects(result.projects); setProjectError(""); } }
      catch { if (live.current) setProjectError("项目列表未能读取，仍可保存账户记忆。关闭后重新打开可重试。"); }
    });
    return () => { live.current = false; };
    // One client per mounted account dialog; requests cannot migrate to another account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  const upsert = (item: MemoryRow) => setRows(previous => {
    const old = previous.find(row => row.id === item.id);
    const next = { ...old, ...item };
    return old ? previous.map(row => row.id === item.id ? next : row) : [next, ...previous];
  });
  const choose = (item: MemoryRow | null) => { setSelected(item); setDraft(item ? draftFromMemory(item) : emptyMemoryDraft()); setConflict(false); setLatest(null); setSourcePreview(null); setError(""); attempt.current = null; };
  const navigate = (target: "close" | "new" | MemoryRow) => {
    if (locked.current) return;
    if (dirty) { setDiscard(target); return; }
    if (target === "close") onClose(); else choose(target === "new" ? null : target);
  };
  const changeDraft = (patch: Partial<MemoryDraft>) => { setDraft(previous => ({ ...previous, ...patch })); attempt.current = null; };
  const scopeLabel = (item: MemoryRow) => item.scope.kind === "user" ? "账户通用" : item.scope.kind === "project" ? projects.find(project => project.id === (item.scope.kind === "project" ? item.scope.projectId : ""))?.name || "项目记忆" : item.scope.kind === "session" ? "会话记忆" : "运行记忆";
  const scopeValue = draft.scope.kind === "user" ? "user" : draft.scope.kind === "project" ? draft.scope.projectId : "existing";
  const shown = rows.filter(item => !query.trim() || `${item.content} ${memoryState(item)} ${scopeLabel(item)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const save = () => void act(async () => {
    if (!draft.content.trim()) return;
    const result = selected ? await client.edit(selected, draft) : await client.create(attempt.current ||= createMemorySaveAttempt(mode, draft));
    if (!live.current) return;
    upsert(result.item); choose(result.item); setNotice(result.item.status === "candidate" ? "已保存为待确认记忆。核对后点击「确认使用」。" : "记忆已保存。");
  });
  const currentInvalid = selected && ["来源已失效", "来源待复核", "已过期"].includes(memoryState(selected));
  const preview = sourcePreview ? sourceOverview(sourcePreview.content) : null;

  return <>
    <MemoryDialog label="创意记忆" onClose={() => navigate("close")} busy={busy}>
      <div className="studio-memory-panel">
        <header className="studio-memory-head"><div><span className="studio-memory-eyebrow"><Brain size={15} /> CREATIVE MEMORY</span><h2>创意记忆</h2><p>保存你愿意复用的偏好与约定，由你决定是否使用。</p></div><button type="button" className="studio-memory-icon" aria-label="关闭创意记忆" disabled={busy} onClick={() => navigate("close")} autoFocus><X size={18} /></button></header>
        <p className="studio-memory-stage" role="status">{rollout === "enforce" ? "记忆引用已开启：已确认且相关的条目可参与四模式请求，以每次回答的上下文记录为准。" : rollout === "shadow" ? "当前为匹配预览：记忆可以保存和管理，但匹配结果尚未用于模型回答。" : rollout === "off" ? "当前已关闭记忆引用：已保存的记忆仍可管理，不会自动加入新请求。" : "暂时无法确认记忆引用状态。可继续管理记忆，点击刷新重新读取。"}</p>
        <div className="studio-memory-toolbar"><label className="studio-memory-search"><span className="sr-only">筛选已载入记忆</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="查找内容或状态" /></label><button type="button" disabled={busy} onClick={() => void act(() => load())}><RefreshCw size={14} /> 刷新</button><button type="button" disabled={busy} onClick={() => navigate("new")}><Plus size={14} /> 新增</button><button type="button" disabled={busy} onClick={() => void act(async () => {
          const data = await client.export(); if (!live.current) return;
          setExportUrl(URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))); setNotice("导出已准备好，点击下载链接保存。");
        })}><Download size={14} /> 导出</button>{exportUrl && <a href={exportUrl} download="creative-memories.json">下载记忆 JSON</a>}</div>
        {error && <div className="studio-memory-error" role="alert">{error}</div>}
        {notice && <p className="studio-memory-notice" role="status">{notice}</p>}
        <div className="studio-memory-columns" aria-busy={busy}>
          <section className="studio-memory-list" aria-label="已保存记忆"><div className="studio-memory-list-heading">已载入 {rows.length} 条 <span>仅筛选已载入条目</span></div>
            {!loaded ? <p className="studio-memory-empty">{busy ? "正在读取记忆…" : "暂时无法读取，点击刷新重试。"}</p> : !shown.length ? <p className="studio-memory-empty">{query ? "没有匹配的记忆。" : "还没有记忆。从右侧写下第一条偏好。"}</p> : shown.map(item => <button type="button" className={`studio-memory-card${selected?.id === item.id ? " is-selected" : ""}`} aria-pressed={selected?.id === item.id} disabled={busy} onClick={() => navigate(item)} key={item.id}><span className="studio-memory-card-meta"><span>{scopeLabel(item)}</span><span className={`studio-memory-state${memoryState(item) === "已确认" ? " is-confirmed" : ""}`}>{memoryState(item)}</span></span><span className="studio-memory-card-content">{item.content}</span></button>)}
            {nextCursor && <button type="button" disabled={busy} onClick={() => void act(() => load(true))}>加载更多记忆</button>}
          </section>
          <section className="studio-memory-editor" aria-label={selected ? "编辑记忆" : "新增记忆"}><h3>{selected ? "编辑记忆" : "写下一条记忆"}</h3><form onSubmit={event => { event.preventDefault(); if (!busy && !conflict) save(); }}>
            <fieldset disabled={busy}><label>记忆内容<textarea aria-label="记忆内容" rows={6} maxLength={4000} value={draft.content} onChange={event => changeDraft({ content: event.target.value })} placeholder="例如：产品介绍偏好工业极简风格，正文保持简洁。" required /></label><span className="studio-memory-count">{draft.content.length}/4000</span>
              <div className="studio-memory-fields"><label>使用范围<select aria-label="记忆使用范围" value={scopeValue} onChange={event => changeDraft({ scope: event.target.value === "user" ? { kind: "user" } : { kind: "project", projectId: event.target.value } })}><option value="user">账户通用</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}{draft.scope.kind === "project" && !projects.some(project => project.id === (draft.scope.kind === "project" ? draft.scope.projectId : "")) && <option value={draft.scope.projectId}>原项目（当前不可用）</option>}{scopeValue === "existing" && <option value="existing">保留原会话／运行范围</option>}</select></label><label>对应参数<select aria-label="记忆对应参数" value={draft.slot} onChange={event => changeDraft({ slot: event.target.value })}><option value="">一般背景</option><option value="style">风格</option><option value="aspect">画幅</option><option value="duration">时长</option><option value="camera">运镜</option><option value="composition">构图</option>{draft.slot && !["style", "aspect", "duration", "camera", "composition"].includes(draft.slot) && <option value={draft.slot}>{draft.slot}</option>}</select></label></div>
              {projectError && <p className="studio-memory-help">{projectError}</p>}
              <label>内容类型<select aria-label="记忆内容类型" disabled={Boolean(selected) || busy} value={draft.claimKind} onChange={event => changeDraft({ claimKind: event.target.value as MemoryDraft["claimKind"] })}><option value="preference">个人偏好</option><option value="constraint">创作约定</option><option value="observation">待核实的陈述</option>{selected && !["preference", "constraint", "observation"].includes(selected.claimKind) && <option value={selected.claimKind}>{selected.claimKind === "mechanism" ? "机制说明" : "待验证假说"}</option>}</select></label>
            </fieldset>
            <p className="studio-memory-help">保存后需确认才能参与检索。确认使用不代表事实已经核验；当前对话中的明确要求优先。</p>
            {selected && !selected.source.recordId.startsWith("manual:") && <div className="studio-memory-source">
              <button type="button" disabled={busy} onClick={() => void act(async () => { const value = await client.source(selected.id); if (live.current) setSourcePreview(value); })}>查看当前来源</button>
              {sourcePreview && <><div className="studio-memory-source-preview">
                {preview ? <>{preview.body && <p className="studio-memory-server-copy">{preview.body}</p>}{preview.fields.length > 0 && <dl>{preview.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}<details><summary>查看完整原始记录</summary><pre className="studio-memory-server-copy">{sourcePreview.content}</pre></details></>
                  : <pre className="studio-memory-server-copy">{sourcePreview.content}</pre>}
              </div>
                {sourcePreview.truncated && <p>来源较长，此处仅显示前 20000 字符；请核对完整原始记录后再继续。</p>}
                {["changed", "untracked"].includes(sourcePreview.state || "") && <button type="button" disabled={busy || dirty || conflict || !sourcePreview.fingerprint} onClick={() => void act(async () => {
                  const result = await client.refreshSource(selected, sourcePreview.fingerprint!);
                  if (live.current) { upsert(result.item); choose(result.item); setNotice("已更新来源版本，记忆重新待确认。请核对正文后确认使用。"); }
                })}>已核对来源，重新进入待确认</button>}
              </>}
            </div>}
            {selected && <details className="studio-memory-source"><summary>来源与状态</summary><dl><dt>状态</dt><dd>{memoryState(selected)}</dd><dt>来源</dt><dd>{selected.source.recordId.startsWith("manual:") ? "手动记录" : selected.source.artifactIds?.length ? "研究产物" : selected.source.sessionId ? "会话消息" : "运行记录"}</dd><dt>事实核验</dt><dd>{selected.verification.state === "verified" ? "已核验" : selected.verification.state === "stale" ? "已过期，需复核" : selected.verification.state === "conflicted" ? "存在冲突" : "未核验"}</dd><dt>更新时间</dt><dd>{new Date(selected.updatedAt).toLocaleString()}</dd><dt>原始来源</dt><dd><code>{selected.source.recordId}</code></dd>{selected.expiresAt && <><dt>有效期至</dt><dd>{new Date(selected.expiresAt).toLocaleString()}</dd></>}</dl></details>}
            {conflict && selected && <div className="studio-memory-conflict" role="alert"><p>服务器版本已经变化。本地改稿仍保留，读取最新内容后再决定。</p><button type="button" disabled={busy} onClick={() => void act(async () => { const result = await client.get(selected.id); if (live.current) setLatest(result.item); })}>读取最新版本</button>{latest && <><p className="studio-memory-server-copy">{latest.content}</p><button type="button" onClick={() => { upsert(latest); choose(latest); }}>载入最新版本并放弃改稿</button></>}</div>}
            <div className="studio-memory-editor-actions"><button type="submit" className="is-primary" disabled={busy || conflict || !dirty || !draft.content.trim()}>保存记忆</button>{selected && <><button type="button" disabled={busy || dirty || conflict || Boolean(currentInvalid) || selected.status === "confirmed"} onClick={() => void act(async () => { const result = await client.confirm(selected); if (live.current) { upsert(result.item); choose(result.item); setNotice("已确认使用；事实核验状态保持不变。"); } })}>确认使用</button><button type="button" disabled={busy || dirty || conflict || (Boolean(currentInvalid) && !selected.enabled)} onClick={() => void act(async () => { const result = await client.toggle(selected); if (live.current) { upsert(result.item); choose(result.item); setNotice(result.item.enabled ? "已恢复使用。" : "已停用，后续检索不再使用这条记忆。"); } })}>{selected.enabled ? "停用" : "恢复使用"}</button><button type="button" className="is-danger" disabled={busy} onClick={() => setDeleting(selected)}>删除</button></>}</div>
          </form></section>
        </div>
      </div>
    </MemoryDialog>
    {discard && <MemoryDialog label="放弃未保存的记忆" compact onClose={() => setDiscard(null)}><h3>有尚未保存的改稿</h3><p>继续操作会放弃这次修改。</p><div className="studio-memory-editor-actions"><button type="button" autoFocus onClick={() => setDiscard(null)}>继续编辑</button><button type="button" onClick={() => { const target = discard; setDiscard(null); if (target === "close") onClose(); else choose(target === "new" ? null : target); }}>放弃修改并继续</button></div></MemoryDialog>}
    {deleting && <MemoryDialog label="删除这条记忆" compact busy={busy} onClose={() => setDeleting(null)}><h3>删除这条记忆？</h3><p>删除后不会再参与检索，原始会话记录仍保留。</p><p className="studio-memory-server-copy">{deleting.content}</p><div className="studio-memory-editor-actions"><button type="button" autoFocus disabled={busy} onClick={() => setDeleting(null)}>取消删除</button><button type="button" className="is-danger" disabled={busy} onClick={() => void act(async () => { await client.remove(deleting); if (live.current) { setRows(previous => previous.filter(row => row.id !== deleting.id)); choose(null); setDeleting(null); setNotice("记忆已删除。"); } }).finally(() => { if (live.current) setDeleting(null); })}>确认删除</button></div></MemoryDialog>}
  </>;
}
