"use client";

// 研究运行工作台 — 四标签检查器
// 计划 / 资料 / 产物 / 轨迹（规划 Task 5）；审批、暂停、失败与取消确认固定在 tabs 上方状态条。
// 用户手动切换后不因新事件强制跳 tab。

import { useRef } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import type { ResearchRunSnapshot, ResearchRunAction, ResearchPlan, PlanOperation, RunEvent } from "@/app/lib/research-runtime/types";
import { INSPECTOR_TABS, INSPECTOR_TAB_LABELS, type ResearchInspectorTab } from "./inspector-types";
import { PlanTab } from "./PlanTab";
import { SourcesTab } from "./SourcesTab";
import { ArtifactsTab } from "./ArtifactsTab";
import { TrajectoryTab } from "./TrajectoryTab";

type Props = {
  snapshot: ResearchRunSnapshot;
  events: RunEvent[];
  act: (action: ResearchRunAction) => Promise<void>;
  updatePlan: (expectedRevision: number, operations: PlanOperation[]) => Promise<ResearchPlan>;
  planDirty: boolean;
  busy: boolean;
  activeTab: ResearchInspectorTab;
  onTabChange: (tab: ResearchInspectorTab) => void;
};

export function RunInspector({ snapshot, events, act, updatePlan, busy, planDirty, activeTab, onTabChange }: Props) {
  const tablistRef = useRef<HTMLDivElement>(null);
  const finishedArtifacts = snapshot.artifacts.length;

  function onTablistKeyDown(event: React.KeyboardEvent): void {
    const index = INSPECTOR_TABS.indexOf(activeTab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % INSPECTOR_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = INSPECTOR_TABS.length - 1;
    if (next !== null) {
      event.preventDefault();
      onTabChange(INSPECTOR_TABS[next]);
      // 焦点移到新 tab 按钮
      const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[next]?.focus();
    }
  }

  return (
    <aside className="rins" aria-label="运行检查器">
      {/* 顶部状态条：不随标签滚动消失（规划 §2.5） */}
      <div className="rins-statusbar" role="group" aria-label="运行控制">
        <span className={`rins-status rins-status-${snapshot.status}`}>{statusText(snapshot.status)}</span>
        <div className="rins-statusbar-actions">
          {snapshot.status === "awaiting_plan_approval" && snapshot.plan && (
            <button
              type="button"
              className="rins-btn rins-btn-primary"
              disabled={busy || planDirty}
              onClick={() => void act({ type: "approve_plan", expectedRevision: snapshot.plan!.revision })}
            >
              <Play aria-hidden="true" size={12} /> 确认并开始
            </button>
          )}
          {snapshot.status === "running" && (
            <button type="button" className="rins-btn" disabled={busy} onClick={() => void act({ type: "pause" })}>
              <Pause aria-hidden="true" size={12} /> 暂停
            </button>
          )}
          {snapshot.status === "paused" && (
            <button type="button" className="rins-btn" disabled={busy} onClick={() => void act({ type: "resume" })}>
              <Play aria-hidden="true" size={12} /> 继续
            </button>
          )}
          {(snapshot.status === "recovering" || snapshot.status === "failed") && snapshot.error?.stepId && (
            <button
              type="button"
              className="rins-btn"
              disabled={busy}
              onClick={() => void act({ type: "retry_step", stepId: snapshot.error!.stepId! })}
            >
              <RotateCcw aria-hidden="true" size={12} /> 修改参数后重试
            </button>
          )}
          {snapshot.status !== "completed" && snapshot.status !== "cancelled" && (
            <button type="button" className="rins-btn" disabled={busy} onClick={() => void act({ type: "cancel" })}>
              <X aria-hidden="true" size={12} /> 取消
            </button>
          )}
        </div>
      </div>

      {/* 标签栏 */}
      <div className="rins-tabs" role="tablist" aria-label="检查器标签" ref={tablistRef} onKeyDown={onTablistKeyDown}>
        {INSPECTOR_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`rins-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`rins-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            className={`rins-tab${activeTab === tab ? " is-active" : ""}`}
            onClick={() => onTabChange(tab)}
          >
            {INSPECTOR_TAB_LABELS[tab]}
            {tab === "artifacts" && finishedArtifacts > 0 && <span className="rins-tab-badge">{finishedArtifacts}</span>}
          </button>
        ))}
      </div>

      {/* 面板 */}
      <div className="rins-panels">
        <div
          role="tabpanel"
          id="rins-panel-plan"
          aria-labelledby="rins-tab-plan"
          hidden={activeTab !== "plan"}
          className="rins-panel"
        >
          {activeTab === "plan" && <PlanTab snapshot={snapshot} updatePlan={updatePlan} busy={busy} />}
        </div>
        <div
          role="tabpanel"
          id="rins-panel-sources"
          aria-labelledby="rins-tab-sources"
          hidden={activeTab !== "sources"}
          className="rins-panel"
        >
          {activeTab === "sources" && <SourcesTab sources={snapshot.sources} />}
        </div>
        <div
          role="tabpanel"
          id="rins-panel-artifacts"
          aria-labelledby="rins-tab-artifacts"
          hidden={activeTab !== "artifacts"}
          className="rins-panel"
        >
          {activeTab === "artifacts" && <ArtifactsTab artifacts={snapshot.artifacts} />}
        </div>
        <div
          role="tabpanel"
          id="rins-panel-trajectory"
          aria-labelledby="rins-tab-trajectory"
          hidden={activeTab !== "trajectory"}
          className="rins-panel"
        >
          {activeTab === "trajectory" && <TrajectoryTab events={events} snapshot={snapshot} />}
        </div>
      </div>
    </aside>
  );
}

function statusText(status: ResearchRunSnapshot["status"]): string {
  const map: Record<ResearchRunSnapshot["status"], string> = {
    draft: "待输入",
    planning: "生成计划中",
    awaiting_plan_approval: "计划待确认",
    running: "运行中",
    paused: "已暂停",
    recovering: "恢复中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return map[status] ?? status;
}
