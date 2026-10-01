"use client";

import { StudioContextTrace } from "../StudioContextTrace";

// 研究运行工作台 — 组合根
// 组合左轨（PromptRail）、中央运行区（ResearchRunSurface）、右检查器（RunInspector），
// 不实现业务细节；布局状态经 createResearchLayoutStore 外部 store 管理。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { PanelRightOpen, PanelRightClose, FlaskConical } from "lucide-react";
import type { ResearchRunAction, ResearchPlan, PlanOperation } from "@/app/lib/research-runtime/types";
import type { ResearchRuntimeAdapter } from "@/app/lib/research-runtime/adapter";
import { createResearchRunConnection } from "@/app/lib/research-runtime/run-connection";
import { createResearchLayoutStore } from "./layout-store";
import type { ResearchInspectorTab } from "./inspector-types";
import { ResearchRunSurface } from "./ResearchRunSurface";
import { RunInspector } from "./RunInspector";
import { PromptRail } from "./PromptRail";
import "./ResearchWorkbench.css";

type Props = {
  adapter: ResearchRuntimeAdapter;
  runId: string | null;
  onExit: () => void;
  promptPane: React.ReactNode; // CreativeStudio 传入的 OPCPanel（单实例复用）
};

export function ResearchWorkbench({ adapter, runId, onExit, promptPane }: Props) {
  const [store] = useState(() => createResearchLayoutStore(1600));
  const layout = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const connection = useMemo(() => createResearchRunConnection(adapter, runId), [adapter, runId]);
  const { snapshot, events, syncing, error: syncError } = useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [planDirty, setPlanDirty] = useState(false);
  const [manualTab, setManualTab] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);

  // ResizeObserver → store.setViewport
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        store.setViewport(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [store]);

  useEffect(() => {
    connection.connect();
    return () => connection.close();
  }, [connection]);
  const act = useCallback(
    async (action: ResearchRunAction): Promise<void> => {
      if (!runId) return;
      if (action.type === "approve_plan" && planDirty) {
        setActionError("请先保存或处理本地计划修改，再确认开始。");
        return;
      }
      setBusy(true);
      setActionError("");
      try {
        await adapter.act(runId, action);
      } catch (error) {
        if (connection.isActive()) setActionError(error instanceof Error ? error.message : "研究任务操作失败");
      } finally {
        if (connection.isActive()) setBusy(false);
      }
    },
    [adapter, runId, connection, planDirty],
  );

  const updatePlan = useCallback(
    async (expectedRevision: number, operations: PlanOperation[]): Promise<ResearchPlan> => {
      if (!runId) throw new Error("请先打开研究运行");
      setBusy(true);
      setActionError("");
      try {
        return await adapter.updatePlan(runId, expectedRevision, operations);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "PLAN_REVISION_CONFLICT") void connection.refresh();
        throw error;
      } finally {
        if (connection.isActive()) setBusy(false);
      }
    },
    [adapter, runId, connection],
  );

  const onTabChange = useCallback(
    (tab: ResearchInspectorTab) => {
      store.setInspectorTab(tab);
      setManualTab(true);
    },
    [store],
  );

  // 完成时未手动切换过 tab → 自动跳到产物
  useEffect(() => {
    if (snapshot?.status === "completed" && !manualTab) {
      store.setInspectorTab("artifacts");
    }
  }, [snapshot?.status, manualTab, store]);

  const activeTab = layout.activeInspectorTab;

  return (
    <div ref={viewportRef} className="rworkbench" data-testid="research-workbench">
      {actionError && <p role="alert" className="cws-inspector__risk">{actionError}</p>}
      {/* Header */}
      <header className="rworkbench-header">
        <span className="rworkbench-title">
          <FlaskConical aria-hidden="true" size={15} /> 风格研究运行工作台
          <span className="rworkbench-badge">服务端运行</span>
        </span>
        <div className="rworkbench-header-actions">
          <button
            type="button"
            className="rworkbench-inspector-toggle"
            aria-label={layout.inspectorOpen ? "收起检查器" : "展开检查器"}
            aria-pressed={layout.inspectorOpen}
            onClick={() => store.setInspectorOpen(!layout.inspectorOpen)}
          >
            {layout.inspectorOpen ? <PanelRightClose aria-hidden="true" size={15} /> : <PanelRightOpen aria-hidden="true" size={15} />}
          </button>
          <button type="button" className="rworkbench-exit" onClick={onExit} aria-label="退出运行工作台">
            退出工作台
          </button>
        </div>
      </header>

      {/* 三列 */}
      <div className="rworkbench-columns">
        {promptPane !== null && (
          <PromptRail
            mode={layout.promptMode}
            onModeChange={(mode) => store.setPromptMode(mode)}
            width={layout.promptWidth}
          >
            {promptPane}
          </PromptRail>
        )}

        <main className="rworkbench-center" aria-label="研究运行主区">
          {syncing && snapshot && (
            <p className="rworkbench-resync" role="alert">
              正在同步最新进度…
            </p>
          )}
          {syncError && (
            <div className="rworkbench-resync" role="alert">
              <p>{syncError}</p>
              <button type="button" className="rins-btn" disabled={syncing} onClick={() => void connection.refresh()}>重新同步</button>
            </div>
          )}
          {events.filter(event => event.type === "context.prepared").map(event => <StudioContextTrace key={event.seq} trace={event.payload.trace} label={typeof event.payload.stepId === "string" ? `${event.payload.stepId} · 上下文` : "研究上下文"} />)}
          {snapshot ? (
            <ResearchRunSurface snapshot={snapshot} act={act} updatePlan={updatePlan} busy={busy || syncing || Boolean(syncError)} planDirty={planDirty} onPlanDirtyChange={setPlanDirty} />
          ) : (
            <p className="rworkbench-empty">{syncError ? "运行暂时无法加载，请重新同步。" : "正在加载运行…"}</p>
          )}
        </main>

        {layout.inspectorOpen && snapshot && (
          <div className="rworkbench-inspector" style={{ width: layout.inspectorWidth }}>
            <RunInspector
              snapshot={snapshot}
              events={events}
              act={act}
              updatePlan={updatePlan}
              busy={busy || syncing || Boolean(syncError)}
              planDirty={planDirty}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
