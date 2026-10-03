"use client";

import SquishSwitch from "@/app/components/SquishSwitch";
import { StudioContextTrace } from "./StudioContextTrace";
import { DialogueLatticeLoader } from "./DialogueLatticeLoader";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CircleDotDashed, Play, Send, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { captureCreativeApi, creativeApi, type AgentRole, type AgentRun } from "@/app/lib/creative-agent-api";
import { saveFileDownload } from "@/app/lib/media-download";
import { collaborativeStatus, exportCollaborativeRun, openCollaborativeHistory, saveCollaborativeDraft, type CollaborativeDetail, type CollaborativeEvent } from "@/app/lib/collaborative-history";
import { useAuth } from "./AuthProvider";
import CollaborativeRunHistory from "./CollaborativeRunHistory";
import { RequestMemoryExclusions, useRequestMemoryExclusions } from "./RequestMemoryExclusions";
import { StudioProjectNotes } from "./StudioProjectNotes";
import { StudioSelect } from "./StudioSelect";
import type { CollaborationInspectorState } from "@/app/lib/studio-inspector-state";

type Project = { id: string; name: string };
type Props = { currentConstraints?: Record<string, string>; onDispatch: (taskId: string) => void; onAuthRequired: () => void; signedIn: boolean; compact?: boolean; onRunningChange?: (running: boolean) => void; onInspection?: (state: CollaborationInspectorState) => void; draftValue?: string; onDraftChange?: (value: string) => void };
const budgetOptions = [{ key: "economy", label: "节省", copy: "更快的首稿" }, { key: "standard", label: "标准", copy: "四角色 + 一次审校" }, { key: "deep", label: "深入", copy: "更充分的产物空间" }] as const;

export default function CollaborativeRunPanel(props: Props) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">正在确认协作账户…</p>;
  return <CollaborativeRunView key={user?.id ?? "guest"} {...props} />;
}

function CollaborativeRunView({ currentConstraints, onDispatch, onAuthRequired, signedIn, compact = false, onRunningChange, onInspection, draftValue, onDraftChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(signedIn);
  const [catalogError, setCatalogError] = useState("");
  const [projectId, setProjectId] = useState("");
  const memoryExclusions = useRequestMemoryExclusions(projectId);
  const [localTask, setLocalTask] = useState("");
  const task = draftValue ?? localTask;
  const setTask = (value: string) => { setLocalTask(value); onDraftChange?.(value); };
  const [budget, setBudget] = useState<"economy" | "standard" | "deep">("standard");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [instruction, setInstruction] = useState("");
  const [events, setEvents] = useState<CollaborativeEvent[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [teamRoleIds, setTeamRoleIds] = useState<string[]>([]);
  const [teamDataProject, setTeamDataProject] = useState("");
  const [teamReadyProject, setTeamReadyProject] = useState("");
  const [teamRevision, setTeamRevision] = useState(0);
  const [teamDirty, setTeamDirty] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const epoch = useRef(0);
  const inspectionProjectName = run ? projects.find(project => project.id === run.projectId)?.name || run.projectId : "";
  useEffect(() => {
    onInspection?.({
      projectName: inspectionProjectName, roleCount: run?.teamSnapshot?.length ?? 0,
      stage: run ? collaborativeStatus(run) : "", runId: run?.id || null, risks: run?.risks || "",
      active: run?.status === "running" || run?.status === "queued",
    });
  }, [onInspection, inspectionProjectName, run]);
  useEffect(() => {
    epoch.current++; busy.current = false; setRunning(false);
    return () => { epoch.current++; };
  }, []);
  useEffect(() => { onRunningChange?.(running); }, [running, onRunningChange]);
  useEffect(() => () => { onRunningChange?.(false); }, [onRunningChange]);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    setCatalogLoading(true); setCatalogError("");
    void Promise.all([
      creativeApi<{ projects: Project[] }>("/api/creative-projects"),
      creativeApi<{ roles: AgentRole[] }>("/api/agent-roles"),
    ]).then(([projectData, roleData]) => {
      if (!current) return;
      setProjects(projectData.projects); setProjectId(previous => previous || projectData.projects[0]?.id || ""); setRoles(roleData.roles);
    }).catch(cause => { if (current) setCatalogError(cause instanceof Error ? cause.message : "读取项目与角色失败"); })
      .finally(() => { if (current) setCatalogLoading(false); });
    return () => { current = false; };
  }, [signedIn, catalogRevision]);
  useEffect(() => {
    setTeamReadyProject(""); setTeamError("");
    if (!signedIn || !projectId) { setTeamRoleIds([]); setTeamDataProject(""); setTeamDirty(false); setTeamLoading(false); return; }
    let current = true;
    setTeamLoading(true);
    void creativeApi<{ team: AgentRole[] }>(`/api/creative-projects/${encodeURIComponent(projectId)}/team`)
      .then(({ team }) => { if (current) { setTeamRoleIds(team.map(role => role.id)); setTeamDataProject(projectId); setTeamReadyProject(projectId); setTeamDirty(false); } })
      .catch(cause => { if (current) setTeamError(cause instanceof Error ? cause.message : "读取编队失败，请重新加载"); })
      .finally(() => { if (current) setTeamLoading(false); });
    return () => { current = false; };
  }, [projectId, signedIn, teamRevision]);

  const applyDetail = (detail: CollaborativeDetail) => { setRun(detail.run); setInstruction(detail.run.finalInstruction || ""); setEvents(detail.events); };
  const flush = (api: ReturnType<typeof captureCreativeApi>) => saveCollaborativeDraft(run, instruction, async (current, value) => {
    const data = await api<{ run: AgentRun }>(`/api/agent-runs/${current.id}/finalize`, { method: "POST", body: JSON.stringify({ finalInstruction: value, expectedFinalInstruction: current.finalInstruction, rationale: current.rationale, risks: current.risks }) });
    return data.run;
  });
  async function operate(job: (api: ReturnType<typeof captureCreativeApi>, current: () => boolean) => Promise<void>) {
    if (busy.current) return;
    if (!signedIn) { onAuthRequired(); return; }
    busy.current = true; setRunning(true); setError(""); setNotice("");
    const generation = epoch.current;
    const current = () => generation === epoch.current;
    try { await job(captureCreativeApi(), current); }
    catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "协作操作失败"); }
    finally { if (current()) { busy.current = false; setRunning(false); setHistoryRevision(value => value + 1); } }
  }
  const openRun = (id: string) => operate(async (api, current) => {
    await openCollaborativeHistory({
      flush: async () => { const saved = await flush(api); if (current()) { setRun(saved); setInstruction(saved?.finalInstruction || ""); } },
      read: () => api<CollaborativeDetail>(`/api/agent-runs/${encodeURIComponent(id)}`),
      isCurrent: current, commit: applyDetail,
    });
  });
  const clearRun = (copy = false) => operate(async (api, current) => {
    await flush(api);
    if (!current()) return;
    if (copy && run) { setTask(run.task); setProjectId(run.projectId); setBudget(run.budget); }
    else setTask("");
    setRun(null); setInstruction(""); setEvents([]);
  });
  const saveInstruction = () => operate(async (api, current) => {
    const saved = await flush(api);
    if (current()) { setRun(saved); setInstruction(saved?.finalInstruction || ""); setNotice("最终指令已保存，仍需人工确认后才会加入生成队列。"); }
  });
  const readLatestKeepingDraft = () => operate(async (api, current) => {
    if (!run) return;
    const detail = await api<CollaborativeDetail>(`/api/agent-runs/${run.id}`);
    if (current()) { setRun(detail.run); setEvents(detail.events); }
  });
  const execute = (existing?: AgentRun) => operate(async (api, current) => {
    const excludedMemoryIds = [...memoryExclusions.ids];
    if (!existing && (catalogLoading || catalogError)) throw new Error("请先成功读取项目与角色，再开始讨论。");
    if (!existing && projectId && teamReadyProject !== projectId) throw new Error("项目编队尚未读取成功，请先重新加载编队。");
    if (!existing && teamDirty) throw new Error("请先保存修改后的项目编队，再开始讨论");
    await flush(api);
    if (!current()) return;
    let target = existing;
    if (!target) {
      let targetProject = projectId;
      if (!targetProject) {
        const { project } = await api<{ project: Project }>("/api/creative-projects", { method: "POST", body: JSON.stringify({ name: "未命名创作项目" }) });
        if (!current()) return;
        setProjects(previous => [project, ...previous]); setProjectId(project.id); targetProject = project.id;
      }
      const created = await api<{ run: AgentRun }>("/api/agent-runs", { method: "POST", body: JSON.stringify({ projectId: targetProject, task, budget, currentConstraints }) });
      target = created.run;
    }
    if (!current()) return;
    setRun(target); setInstruction(target.finalInstruction || ""); setEvents([]);
    try {
      await api<{ run: AgentRun }>(`/api/agent-runs/${target.id}/start`, { method: "POST", body: JSON.stringify({ excludedMemoryIds: target.projectId === projectId || !projectId ? excludedMemoryIds : [] }) });
      if (!current()) return;
      memoryExclusions.consumed(excludedMemoryIds);
      const detail = await api<CollaborativeDetail>(`/api/agent-runs/${target.id}`);
      if (current()) applyDetail(detail);
    } catch (cause) {
      if (current()) {
        try { const detail = await api<CollaborativeDetail>(`/api/agent-runs/${target.id}`); if (current()) applyDetail(detail); } catch { /* Keep the last known run so it remains recoverable. */ }
      }
      throw cause;
    }
  });
  const start = (event: FormEvent) => { event.preventDefault(); if (task.trim()) void execute(); };
  const saveTeam = () => operate(async (api, current) => {
    if (!projectId || teamReadyProject !== projectId) return;
    await api(`/api/creative-projects/${encodeURIComponent(projectId)}/team`, { method: "PUT", body: JSON.stringify({ team: teamRoleIds.map(roleId => ({ roleId })) }) });
    if (current()) { setTeamDirty(false); setNotice("项目编队已保存，之后的新讨论使用这份编队。"); }
  });
  const confirmAndDispatch = () => operate(async (api, current) => {
    if (!run || run.status !== "awaiting_confirmation" || !instruction.trim()) return;
    const confirmed = await api<{ run: AgentRun; task: { id: string } }>(`/api/agent-runs/${run.id}/confirm-coze`, {
      method: "POST", body: JSON.stringify({ finalInstruction: instruction, expectedFinalInstruction: run.finalInstruction }),
    });
    if (current()) { setRun(confirmed.run); setInstruction(confirmed.run.finalInstruction || ""); onDispatch(confirmed.task.id); }
  });
  const exportRun = () => {
    if (!run) return;
    setError(""); setNotice("");
    try {
      const blob = new Blob([exportCollaborativeRun(run, events, instruction)], { type: "text/markdown;charset=utf-8" });
      saveFileDownload({ blob, filename: `协作记录-${run.id}.md` });
      setNotice("协作记录已交给浏览器保存，请在下载列表核对。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导出暂未完成，请重试。"); }
  };

  // Recover a running history entry with read-only requests; never restart it automatically.
  useEffect(() => {
    if (!signedIn || running || !run || !["running", "queued", "paused"].includes(run.status)) return;
    const id = run.id;
    const api = captureCreativeApi();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const detail = await api<CollaborativeDetail>(`/api/agent-runs/${id}`); if (!cancelled) applyDetail(detail); }
      catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "状态刷新失败"); }
      finally { if (!cancelled) timer = setTimeout(poll, 5000); }
    };
    timer = setTimeout(poll, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signedIn, running, run?.id, run?.status]);

  return <section className={`collab-panel${compact ? " collab-panel--compact" : ""}`} aria-label="多角色协作编排">
    <style>{`.collab-panel__feedback{font-size:var(--text-label-size);line-height:var(--text-label-line);color:var(--text-muted);overflow-wrap:anywhere;margin:12px 0}.collab-panel__feedback p{margin:0 0 8px}.collab-panel__feedback button{min-height:40px;max-width:100%;white-space:normal}`}</style>
    {!compact && <div className="collab-panel__heading"><div><span><Sparkles size={14} /> 协作编排</span><h2>先把创作想清楚，再交给 Coze。</h2></div><div className="collab-panel__guard"><ShieldCheck size={16} /> 最终指令必须人工确认</div></div>}
    {signedIn && <CollaborativeRunHistory selectedId={run?.id} disabled={running} revision={historyRevision} onSelect={id => void openRun(id)} />}
    {signedIn && catalogLoading && <p className="collab-panel__feedback" role="status">正在读取项目与角色…</p>}
    {signedIn && catalogError && <div className="collab-panel__feedback" role="alert"><p>{catalogError}</p><button type="button" className="studio-context-action" disabled={running || catalogLoading} onClick={() => setCatalogRevision(value => value + 1)}>重新读取项目与角色</button></div>}
    <form onSubmit={start} className="collab-panel__form">
      <textarea disabled={running} className="collab-border-flow" value={task} onChange={event => setTask(event.target.value)} placeholder="描述这次要讨论的创作任务" aria-label="多角色协作任务" />
      <div className="collab-panel__controls">
        <StudioSelect disabled={running || teamDirty || (signedIn && (catalogLoading || Boolean(catalogError)))} value={projectId} onChange={value => { setProjectId(value); setNotice(""); }} label="选择创作项目"
          className="studio-select--collab-project" options={[{ value: "", label: "新建未命名项目" }, ...projects.map(project => ({ value: project.id, label: project.name }))]} />
        <div className="collab-panel__budgets">{budgetOptions.map(option => <label key={option.key} className={`collab-border-flow${budget === option.key ? " is-active" : ""}`}><input disabled={running} type="radio" name="budget" value={option.key} checked={budget === option.key} onChange={() => setBudget(option.key)} /><b>{option.label}</b><small>{option.copy}</small></label>)}</div>
        <button type="submit" disabled={running || !task.trim() || (signedIn && (catalogLoading || Boolean(catalogError) || teamDirty || Boolean(projectId && teamReadyProject !== projectId)))}>{running ? <CircleDotDashed className="spin" size={17} /> : <Play size={17} />}{signedIn ? "新建并开始讨论" : "登录后开始"}</button>
      </div>
    </form>
    {signedIn && <RequestMemoryExclusions key={`exclusions:${projectId}`} mode="collaboration" projectId={projectId} value={memoryExclusions.ids} onChange={memoryExclusions.setIds} disabled={running} />}
    {signedIn && projectId && <StudioProjectNotes key={`notes:${projectId}`} projectId={projectId} disabled={running} />}
    {signedIn && projectId && roles.length > 0 && <section className="collab-team" aria-label="项目编队">
      <header><h3>项目编队</h3><p>修改后请保存，已停用角色不参与新运行。</p></header>
      <div className="collab-team__roles">{roles.map(role => <label key={role.id} className={`collab-team__role${role.enabled ? "" : " is-disabled"}`}>
        <SquishSwitch disabled={running || teamReadyProject !== projectId || (!role.enabled && !teamRoleIds.includes(role.id))} checked={teamDataProject === projectId && teamRoleIds.includes(role.id)} onChange={() => { setTeamDirty(true); setNotice(""); setTeamRoleIds(current => current.includes(role.id) ? current.filter(id => id !== role.id) : [...current, role.id]); }} />
        <span>{role.name}</span>{!role.enabled && <small>已停用，可移出</small>}
      </label>)}</div>
      <div className="collab-team__actions"><button type="button" className="studio-context-action studio-context-action--primary" onClick={() => void saveTeam()} disabled={running || teamReadyProject !== projectId}>保存编队</button>{teamDirty && <button type="button" className="studio-context-action" disabled={running} onClick={() => setTeamRevision(value => value + 1)}>放弃编队修改</button>}</div>
    </section>}
    {signedIn && projectId && teamLoading && <p className="collab-panel__feedback" role="status">正在读取项目编队…</p>}
    {signedIn && projectId && teamError && <div className="collab-panel__feedback" role="alert"><p>{teamError}</p>{teamDirty && <p>本地编队修改仍保留；重新加载成功后会替换为服务器版本。</p>}<button type="button" className="studio-context-action" disabled={running || teamLoading} onClick={() => setTeamRevision(value => value + 1)}>重新加载编队</button></div>}
    {error && <p className="collab-panel__error" role="alert"><XCircle size={14} /> {error}</p>}
    {notice && <p className="collab-panel__feedback" role="status">{notice}</p>}
    {running && (!run || !["running", "queued"].includes(run.status)) && <DialogueLatticeLoader label="正在处理协作请求…" />}
    {run && <div className="collab-result">
      {["running", "queued"].includes(run.status)
        ? <DialogueLatticeLoader className="collab-result__status" label={collaborativeStatus(run)} />
        : <div className="collab-result__status" role="status">{collaborativeStatus(run)}</div>}
      <p className="collab-run-task">{run.task}</p>
      {run.error && <p role="alert">{run.error}</p>}
      <div className="collab-history__toolbar">
        <button type="button" disabled={running} onClick={() => void openRun(run.id)}>刷新当前记录</button>
        <button type="button" disabled={running} onClick={exportRun}>导出 Markdown</button>
        <button type="button" disabled={running || teamDirty} onClick={() => void clearRun(true)}>复制任务到新讨论</button>
        <button type="button" disabled={running} onClick={() => void clearRun()}>新讨论</button>
        {run.status === "draft" && <button type="button" disabled={running} onClick={() => void execute(run)}>继续此草稿的原始讨论</button>}
        {run.taskId && <span>关联任务：{run.taskId}（可在任务中心查看）</span>}
      </div>
      {run.currentConstraints && Object.keys(run.currentConstraints).length > 0 && <details><summary>创建时创作参数</summary><p>以下参数随本次运行保存；修改顶部参数只影响新讨论。</p><dl>{Object.entries(run.currentConstraints).map(([key,value])=><div key={key}><dt>{({style:"风格",camera:"运镜",composition:"构图",duration:"时长（秒）",aspect:"画幅"} as Record<string,string>)[key] || key}</dt><dd>{value}</dd></div>)}</dl></details>}
      {events.filter(event => event.type === "context.prepared").map(event => <StudioContextTrace key={event.id} trace={event.payload} label={event.payload.stage ? `${event.payload.stage} · 上下文` : "角色上下文"} />)}
      {events.length > 0 && <details className="collab-result__timeline"><summary>运行事件 · {events.length} 条</summary>{events.map(event => <article key={event.id}><b>{event.payload.stage || event.type}</b><pre>{event.payload.output || JSON.stringify(event.payload, null, 2)}</pre></article>)}</details>}
      <label>最终指令<textarea value={instruction} onChange={event => { setInstruction(event.target.value); setNotice(""); }} disabled={running || run.status !== "awaiting_confirmation"} /></label>
      {instruction !== (run.finalInstruction || "") && <div className="collab-history__toolbar"><button type="button" disabled={running} onClick={() => void readLatestKeepingDraft()}>读取最新版本，保留当前编辑</button><button type="button" disabled={running} onClick={() => setInstruction(run.finalInstruction || "")}>放弃当前编辑</button><details><summary>对照服务器已保存指令</summary><p className="collab-run-task">{run.finalInstruction || "尚无指令"}</p></details></div>}
      {run.status === "awaiting_confirmation" && <div className="collab-history__toolbar"><button type="button" disabled={running || instruction === (run.finalInstruction || "")} onClick={() => void saveInstruction()}>保存最终指令</button><span>{instruction === (run.finalInstruction || "") ? "已保存" : "有未保存修改，切换记录前会先保存"}</span></div>}
      <div className="collab-result__notes"><p><b>决策依据</b>{run.rationale || "尚无记录"}</p><p><b>风险/未决项</b>{run.risks || "尚无记录"}</p></div>
      {run.status === "awaiting_confirmation" && <button type="button" onClick={() => void confirmAndDispatch()} disabled={running || !instruction.trim()}><Send size={16} />确认并加入服务器队列</button>}
    </div>}
    <style>{`.collab-run-task{white-space:pre-wrap;overflow-wrap:anywhere}.collab-result__timeline pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 var(--font-sans)}.collab-result .collab-history__toolbar button{padding:8px 10px;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-panel);color:var(--foreground);cursor:pointer}.collab-result .collab-history__toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.collab-result .collab-history__toolbar span{font-size: var(--text-caption-size);color: var(--text-muted); line-height: var(--text-caption-line); }`}</style>
    <style>{`.collab-panel{position:relative;width:min(1040px,calc(100% - 40px));margin:24px auto 18px;padding:22px;border:1px solid color-mix(in srgb,var(--glow-warm) 25%,var(--border-subtle));border-radius: var(--shape-panel);background:linear-gradient(120deg,color-mix(in srgb,var(--glow-warm) 9%,var(--space-panel)),var(--space-panel) 48%,color-mix(in srgb,var(--glow-cool) 5%,var(--space-panel)));box-shadow:0 18px 54px rgba(0,0,0,.16)}.collab-panel__heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.collab-panel__heading span{display:flex;align-items:center;gap:6px;color:var(--glow-warm);font: var(--weight-regular) var(--text-caption-size)/var(--text-caption-line) var(--font-ui);letter-spacing:.08em}.collab-panel h2{margin:8px 0 0;color:var(--foreground);font-size:clamp(20px,2.6vw,28px);letter-spacing:-.03em}.collab-panel__guard{font-size: var(--text-caption-size);color: var(--text-muted);display:flex;gap:6px;align-items:center;white-space:nowrap; line-height: var(--text-caption-line); }.collab-panel__guard svg{color:var(--glow-cool)}.collab-panel__form{margin-top:18px}.collab-panel__form>textarea{width:100%;min-height:82px;box-sizing:border-box;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-surface);color:var(--foreground);padding:12px;font: var(--weight-regular) var(--text-body-size)/var(--text-body-line) var(--font-ui);resize:vertical}.collab-panel__controls{display:flex;gap:10px;align-items:stretch;margin-top:10px}.collab-panel__controls select{max-width:170px;background:var(--space-surface);border:1px solid var(--border-subtle);border-radius: var(--shape-control);color:var(--foreground);padding:0 9px}.collab-panel__budgets{display:flex;flex:1;gap:7px}.collab-panel__budgets label{flex:1;min-width:0;padding:7px 9px;border:1px solid var(--border-subtle);border-radius: var(--shape-control);color:var(--foreground-muted);cursor:pointer}.collab-panel__budgets label.is-active{border-color:var(--glow-warm);background:color-mix(in srgb,var(--glow-warm) 10%,transparent);color:var(--foreground)}.collab-panel__budgets input{position:absolute;opacity:0}.collab-panel__budgets b,.collab-panel__budgets small{display:block}.collab-panel__budgets b{font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.collab-panel__budgets small{margin-top:2px;font-size: var(--text-caption-size);opacity:.75; line-height: var(--text-caption-line); }.collab-panel__controls>button,.collab-result>button{border:0;border-radius: var(--shape-control);background:var(--glow-warm);color:var(--space-deep);padding:0 15px;display:flex;align-items:center;justify-content:center;gap:7px;font-weight: var(--weight-bold);cursor:pointer;white-space:nowrap}.collab-panel button:disabled{opacity:.5;cursor:not-allowed}.collab-panel__error{margin:11px 0 0;color:var(--error);font-size: var(--text-caption-size);display:flex;gap:6px;align-items:center; line-height: var(--text-caption-line); }.collab-result{margin-top:16px;padding:15px;border:1px solid color-mix(in srgb,var(--glow-cool) 20%,var(--border-subtle));border-radius: var(--shape-card);background:color-mix(in srgb,var(--glow-cool) 5%,var(--space-surface))}.collab-result__status{display:flex;gap:7px;align-items:center;color:var(--glow-cool);font-size: var(--text-caption-size);margin-bottom:11px; line-height: var(--text-caption-line); }.collab-result__timeline{margin:0 0 12px;padding:10px;border-left:2px solid var(--glow-cool);background:color-mix(in srgb,var(--glow-cool) 4%,transparent)}.collab-result__timeline>b{font-size: var(--text-caption-size);color:var(--foreground); line-height: var(--text-caption-line); }.collab-result__timeline ol{display:flex;gap:7px;flex-wrap:wrap;padding:0;margin:8px 0 0;list-style:none}.collab-result__timeline li{padding:5px 7px;border-radius: var(--shape-control);background:var(--space-panel);color: var(--text-muted);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.collab-result__timeline li span{color:var(--glow-cool);margin-right:4px}.collab-result__timeline li small{display:block;max-width:165px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}.collab-result label{display:flex;flex-direction:column;gap:6px;color: var(--text-muted);font-size: var(--text-label-size); line-height: var(--text-label-line); }.collab-result textarea{min-height:92px;resize:vertical;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-panel);color:var(--foreground);padding:10px;font:13px/1.65 var(--font-sans)}.collab-result__notes{display:grid;grid-template-columns:1fr 1fr;gap:9px}.collab-result__notes p{margin:10px 0;color: var(--text-muted);font-size: var(--text-caption-size);line-height: var(--text-caption-line)}.collab-result__notes b{display:block;color:var(--foreground);margin-bottom:3px}.collab-result>button{height:42px;margin-left:auto}.spin{animation:collab-spin .9s linear infinite}@keyframes collab-spin{to{transform:rotate(360deg)}}.collab-panel--compact{width:100%;margin:0;padding:0;border:none;border-radius:0;background:none;box-shadow:none}.collab-panel--compact .collab-panel__form{margin-top:0}.collab-panel--compact .collab-panel__form>textarea{min-height:64px}.collab-panel--compact .collab-result{margin-top:12px}@media(max-width:760px){.collab-panel{width:calc(100% - 20px);padding:16px}.collab-panel__heading{display:block}.collab-panel__guard{margin-top:9px}.collab-panel__controls{flex-wrap:wrap}.collab-panel__controls select{height:42px;max-width:none;width:100%}.collab-panel__budgets{width:100%}.collab-panel__controls>button{height:44px;width:100%}.collab-result__notes{grid-template-columns:1fr}.collab-result>button{width:100%;margin:0;height:44px}}`}</style>
  </section>;
}
