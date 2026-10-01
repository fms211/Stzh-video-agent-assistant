"use client";

// 研究运行工作台 — 中央运行主视图
// 五种主视图：输入/规划中、待确认计划、运行/暂停、失败恢复、完成（规划 Task 4 Step 3）
// 状态只来自事件投影后的 Snapshot；真实状态驱动，禁止与运行事实无关的轮播阶段文案。

import { useMemo, useState } from "react";
import { Play, Pause, RotateCcw, X, CheckCircle2, AlertTriangle, Clock, FileSearch } from "lucide-react";
import type { ResearchRunSnapshot, ResearchRunAction } from "@/app/lib/research-runtime/types";
import { ResearchPlanEditor } from "./ResearchPlanEditor";

type Props = {
  snapshot: ResearchRunSnapshot;
  act: (action: ResearchRunAction) => Promise<void>;
  updatePlan: (expectedRevision: number, operations: import("@/app/lib/research-runtime/types").PlanOperation[]) => Promise<import("@/app/lib/research-runtime/types").ResearchPlan>;
  planDirty: boolean;
  onPlanDirtyChange: (dirty: boolean) => void;
  busy: boolean;
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  return `${s}s`;
}

export function ResearchRunSurface({ snapshot, act, updatePlan, busy, planDirty, onPlanDirtyChange }: Props) {
  const { status, plan, metrics, input, error } = snapshot;
  const awaitingApproval = status === "awaiting_plan_approval";
  const running = status === "running" || status === "paused" || status === "recovering";
  const finished = status === "completed";
  const failed = status === "failed" || status === "recovering";
  const [editingRetry, setEditingRetry] = useState(false);
  const [retryText, setRetryText] = useState("");

  const failedStep = useMemo(() => {
    if (!error?.stepId || !plan) return null;
    return plan.steps.find((step) => step.id === error.stepId) ?? null;
  }, [error, plan]);

  return (
    <section className="rrun-surface" aria-label="研究运行主视图">
      {/* 顶部摘要：状态 / 已完成步骤 / 耗时 / 来源数（规划 §2.4） */}
      <header className="rrun-header">
        <h3 className="rrun-title">
          <FileSearch aria-hidden="true" size={16} />
          {input.styleName} × {input.useCase}
        </h3>
        <div className="rrun-metrics" role="status" aria-live="polite">
          <span className="rrun-metric rrun-metric-status">{statusLabel(status)}</span>
          <span className="rrun-metric">
            步骤 {metrics.completedSteps}/{metrics.totalSteps}
          </span>
          <span className="rrun-metric">
            <Clock aria-hidden="true" size={12} /> {formatElapsed(metrics.elapsedMs)}
          </span>
          <span className="rrun-metric">来源 {metrics.sourceCount}</span>
        </div>
      </header>

      {/* 输入/规划中 */}
      {(status === "draft" || status === "planning") && (
        <div className="rrun-body">
          <p className="rrun-hint">
            {status === "planning" ? "正在根据风格与场景生成研究计划…" : "填写风格名称与应用场景后，点击「生成研究计划」。"}
          </p>
        </div>
      )}

      {/* 待确认计划：受控编辑器 */}
      {awaitingApproval && plan && (
        <div className="rrun-body">
          <ResearchPlanEditor plan={plan} updatePlan={updatePlan} busy={busy} onDirtyChange={onPlanDirtyChange} />
          {planDirty && <p className="rrun-hint">请先保存或处理本地计划修改，再确认开始。</p>}
          <div className="rrun-actions">
            <button
              type="button"
              className="rrun-btn rrun-btn-primary"
              disabled={busy || planDirty}
              onClick={() => void act({ type: "approve_plan", expectedRevision: plan.revision })}
            >
              <Play aria-hidden="true" size={14} /> 确认并开始
            </button>
            <button
              type="button"
              className="rrun-btn"
              disabled={busy}
              onClick={() => void act({ type: "cancel" })}
            >
              <X aria-hidden="true" size={14} /> 取消
            </button>
          </div>
        </div>
      )}

      {/* 运行 / 暂停 */}
      {running && !failed && (
        <div className="rrun-body">
          <ol className="rrun-steps">
            {(plan?.steps ?? []).map((step) => (
              <li key={step.id} className={`rrun-step rrun-step-${step.status}`}>
                <span className="rrun-step-dot" aria-hidden="true" />
                <span className="rrun-step-title">{step.title}</span>
                <span className="rrun-step-state">{stepStatusLabel(step.status)}</span>
              </li>
            ))}
          </ol>
          <div className="rrun-actions">
            {status === "running" && (
              <button type="button" className="rrun-btn" disabled={busy} onClick={() => void act({ type: "pause" })}>
                <Pause aria-hidden="true" size={14} /> 暂停
              </button>
            )}
            {status === "paused" && (
              <button type="button" className="rrun-btn" disabled={busy} onClick={() => void act({ type: "resume" })}>
                <Play aria-hidden="true" size={14} /> 继续
              </button>
            )}
            <button type="button" className="rrun-btn" disabled={busy} onClick={() => void act({ type: "cancel" })}>
              <X aria-hidden="true" size={14} /> 取消
            </button>
          </div>
        </div>
      )}

      {/* 失败恢复 */}
      {failed && error && (
        <div className="rrun-body">
          <div className="rrun-error" role="alert">
            <AlertTriangle aria-hidden="true" size={16} />
            <div>
              <p className="rrun-error-title">运行失败：{errorCodeLabel(error.code)}</p>
              <p className="rrun-error-msg">{error.message}</p>
            </div>
          </div>
          {failedStep && (
            <div className="rrun-recover">
              <p className="rrun-recover-title">失败步骤：{failedStep.title}</p>
              <div className="rrun-actions">
                <button
                  type="button"
                  className="rrun-btn rrun-btn-primary"
                  disabled={busy}
                  onClick={() => void act({ type: "retry_step", stepId: failedStep.id, expectedRevision: plan!.revision })}
                >
                  <RotateCcw aria-hidden="true" size={14} /> 直接重试
                </button>
                <button
                  type="button"
                  className="rrun-btn"
                  disabled={busy || !failedStep.optional}
                  onClick={() => void act({ type: "skip_step", stepId: failedStep.id, expectedRevision: plan!.revision })}
                >
                  跳过并继续
                </button>
                <button
                  type="button"
                  className="rrun-btn"
                  disabled={busy}
                  onClick={() => {
                    setRetryText(String(failedStep.input.query || failedStep.input.instruction || ""));
                    setEditingRetry(true);
                  }}
                >
                  修改参数并重新确认
                </button>
                <button type="button" className="rrun-btn" disabled={busy} onClick={() => void act({ type: "cancel" })}>
                  <X aria-hidden="true" size={14} /> 取消
                </button>
              </div>
              {editingRetry && (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  if (!retryText.trim()) return;
                  void act({ type: "retry_step", stepId: failedStep.id, expectedRevision: plan!.revision, input: { ...failedStep.input, [failedStep.kind === "model" ? "instruction" : "query"]: retryText.trim() } });
                  setEditingRetry(false);
                }}>
                  <label>
                    {failedStep.kind === "model" ? "补充生成要求" : "调整检索关键词"}
                    <textarea value={retryText} onChange={(event) => setRetryText(event.target.value)} maxLength={2000} required />
                  </label>
                  <p>修改后会生成新修订，请确认更新后的计划再继续；已完成步骤保留。</p>
                  <button type="submit" className="rrun-btn rrun-btn-primary" disabled={busy}>保存修改并查看计划</button>
                </form>
              )}
              <p className="rrun-recover-hint">保留的来源与产物可在右侧「资料 / 产物」中查看。</p>
            </div>
          )}
        </div>
      )}

      {/* 完成 */}
      {finished && (
        <div className="rrun-body">
          <div className="rrun-done">
            <CheckCircle2 aria-hidden="true" size={20} />
            <p>研究完成。{snapshot.artifacts.length} 个产物可在右侧「产物」标签复制或下载。</p>
          </div>
        </div>
      )}

      {/* cancelled */}
      {status === "cancelled" && (
        <div className="rrun-body">
          <p className="rrun-hint">运行已取消。可重新生成研究计划。</p>
        </div>
      )}
    </section>
  );
}

function statusLabel(status: ResearchRunSnapshot["status"]): string {
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

function stepStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "等待",
    running: "执行中",
    completed: "完成",
    failed: "失败",
    skipped: "已跳过",
  };
  return map[status] ?? status;
}

function errorCodeLabel(code: string): string {
  const map: Record<string, string> = {
    RUN_NOT_FOUND: "运行不存在",
    PLAN_REVISION_CONFLICT: "计划版本冲突",
    INVALID_PLAN_OPERATION: "非法计划操作",
    INVALID_STATE_TRANSITION: "非法状态迁移",
    TOOL_NOT_REGISTERED: "工具未注册",
    BUDGET_EXCEEDED: "超出预算",
    UPSTREAM_TIMEOUT: "上游超时",
    STREAM_GAP: "事件流断档",
    AUTH_REQUIRED: "需要登录",
  };
  return map[code] ?? code;
}
