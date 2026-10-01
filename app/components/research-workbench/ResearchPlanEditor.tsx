"use client";

// 研究运行工作台 — 受控计划编辑器
// 只能产生 PlanOperation 五种操作（规划 §3.2）；工具名与依赖不可自由输入。
// 保存携带当前 revision；冲突时提示并等待上层刷新权威 Snapshot。

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Power } from "lucide-react";
import type { ResearchPlan, ResearchBudget, PlanOperation } from "@/app/lib/research-runtime/types";
import { createPlanDraft, inspectPlanDraft, movePlanDraftStep, reconcilePlanDraft, savePlanDraft, type ResearchPlanDraft } from "@/app/lib/research-runtime/plan-draft";
import { ResearchPluginDetails } from "./ResearchPluginDetails";

type Props = {
  plan: ResearchPlan;
  updatePlan: (expectedRevision: number, operations: PlanOperation[]) => Promise<ResearchPlan>;
  onDirtyChange: (dirty: boolean) => void;
  busy: boolean;
};

const BUDGET_LABELS: Record<ResearchBudget, string> = {
  economy: "经济",
  standard: "标准",
  deep: "深入",
};

export function ResearchPlanEditor({ plan, updatePlan, busy, onDirtyChange }: Props) {
  // 本地编辑缓冲：保存前不触碰 Adapter
  const [localDraft, setLocalDraft] = useState(() => createPlanDraft(plan));
  const draft = reconcilePlanDraft(localDraft, plan);
  const { objective, budget, steps } = draft.value;
  const { inputEdits } = draft;
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const conflict = conflictRevision === draft.base.revision;
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = busy || saving;
  const pendingOps = inspectPlanDraft(draft).pendingCount;
  const remoteChanged = plan.revision > draft.base.revision;
  const approvalBlocked = pendingOps > 0 || draft.base.revision > plan.revision;

  useEffect(() => { onDirtyChange(approvalBlocked); }, [approvalBlocked, onDirtyChange]);

  function edit(next: ResearchPlanDraft) {
    setLocalDraft(next);
    setSaved(false);
    setSaveError("");
  }

  function moveStep(stepId: string, direction: -1 | 1): void {
    edit(movePlanDraftStep(draft, stepId, direction));
  }

  function toggleOptional(stepId: string, enabled: boolean): void {
    edit({ ...draft, value: { ...draft.value, steps: steps.map(step => step.id === stepId ? { ...step, enabled } : step) } });
  }

  async function save(): Promise<void> {
    if (disabled || remoteChanged || conflict || !pendingOps) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      setLocalDraft(await savePlanDraft(draft, updatePlan));
      setConflictRevision(null);
      setSaved(true);
    } catch (error) {
      if (error instanceof Error && (("code" in error && error.code === "PLAN_REVISION_CONFLICT") || error.message.includes("PLAN_REVISION_CONFLICT"))) {
        setConflictRevision(draft.base.revision);
      } else {
        setSaveError(error instanceof Error ? error.message : "计划保存失败，本地修改已保留。");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rplan-editor">
      <div className="rplan-row">
        <label className="rplan-label" htmlFor="rplan-objective">
          研究目标
        </label>
        <input
          id="rplan-objective"
          className="rplan-input"
          value={objective}
          disabled={disabled}
          onChange={(event) => edit({ ...draft, value: { ...draft.value, objective: event.target.value } })}
        />
      </div>

      <div className="rplan-row">
        <span className="rplan-label">预算档位</span>
        <div className="rplan-budget" role="radiogroup" aria-label="预算档位">
          {(Object.keys(BUDGET_LABELS) as ResearchBudget[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={budget === key}
              className={`rplan-budget-btn${budget === key ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => edit({ ...draft, value: { ...draft.value, budget: key } })}
            >
              {BUDGET_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <ol className="rplan-steps">
        {steps.map((step, index) => (
          <li key={step.id} className={`rplan-step${step.enabled ? "" : " is-disabled"}`}>
            <ResearchPluginDetails step={step} />
            <div className="rplan-step-main">
              <span className="rplan-step-kind">{step.plugin ? "插件工具" : step.kind === "tool" ? `工具 ${step.tool}` : "模型"}</span>
              <span className="rplan-step-title">{step.title}</span>
              {step.optional && (
                <button
                  type="button"
                  className="rplan-step-toggle"
                  disabled={disabled}
                  aria-pressed={step.enabled}
                  title={step.enabled ? "点击禁用该可选步骤" : "点击启用该可选步骤"}
                  onClick={() => toggleOptional(step.id, !step.enabled)}
                >
                  <Power aria-hidden="true" size={12} />
                  {step.enabled ? "已启用" : "已禁用"}
                </button>
              )}
            </div>
            <div className="rplan-step-ops">
              {step.kind === "tool" && (
                <button
                  type="button"
                  className="rplan-step-move"
                  aria-expanded={Boolean(expandedInputs[step.id])}
                  aria-label={`编辑工具输入：${step.title}`}
                  title="编辑工具输入"
                  disabled={disabled}
                  onClick={() => {
                    setExpandedInputs((prev) => ({ ...prev, [step.id]: !prev[step.id] }));
                  }}
                >
                  {`{}`}
                </button>
              )}
              <button
                type="button"
                className="rplan-step-move"
                disabled={disabled || index === 0}
                aria-label={`上移步骤：${step.title}`}
                onClick={() => moveStep(step.id, -1)}
              >
                <ArrowUp aria-hidden="true" size={12} />
              </button>
              <button
                type="button"
                className="rplan-step-move"
                disabled={disabled || index === steps.length - 1}
                aria-label={`下移步骤：${step.title}`}
                onClick={() => moveStep(step.id, 1)}
              >
                <ArrowDown aria-hidden="true" size={12} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {/* 工具输入编辑区 */}
      {Object.keys(expandedInputs).some((key) => expandedInputs[key]) && (
        <div className="rplan-inputs">
          {steps
            .filter((step) => step.kind === "tool" && expandedInputs[step.id])
            .map((step) => (
              <div key={step.id} className="rplan-row">
                <label className="rplan-label" htmlFor={`rplan-input-${step.id}`}>
                  {step.title} 输入
                </label>
                <textarea
                  id={`rplan-input-${step.id}`}
                  className="rplan-input rplan-input-json"
                  value={inputEdits[step.id] ?? JSON.stringify(step.input)}
                  disabled={disabled}
                  rows={2}
                  onChange={(event) => edit({ ...draft, inputEdits: { ...inputEdits, [step.id]: event.target.value } })}
                />
              </div>
            ))}
        </div>
      )}

      {(conflict || remoteChanged) && (
        <div className="rplan-conflict" role="alert">
          <p>计划已在其他位置更新，本地修改已保留。右侧检查器显示最新已保存计划；请核对后再处理草稿。</p>
          <button type="button" className="rrun-btn" disabled={disabled || !remoteChanged} onClick={() => {
            edit(createPlanDraft(plan));
            setConflictRevision(null);
          }}>载入最新计划并放弃本地修改</button>
        </div>
      )}
      {saveError && <p className="rplan-conflict" role="alert">{saveError} 本地修改已保留。</p>}
      {saved && !conflict && !remoteChanged && pendingOps === 0 && (
        <p className="rplan-saved" role="status">
          计划修改已保存。
        </p>
      )}

      <div className="rplan-actions">
        <button type="button" className="rrun-btn" disabled={disabled || remoteChanged || conflict || pendingOps === 0} onClick={() => void save()}>
          保存计划修改（{pendingOps}）
        </button>
        <span className="rplan-revision">修订号 v{draft.base.revision}</span>
      </div>
    </div>
  );
}
