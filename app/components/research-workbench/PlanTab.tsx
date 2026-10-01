"use client";

// 检查器「计划」标签：待确认时受控编辑，运行后只读列表

import type { ResearchRunSnapshot, ResearchPlan, PlanOperation } from "@/app/lib/research-runtime/types";
import { ResearchPluginDetails } from "./ResearchPluginDetails";

type Props = {
  snapshot: ResearchRunSnapshot;
  updatePlan: (expectedRevision: number, operations: PlanOperation[]) => Promise<ResearchPlan>;
  busy: boolean;
};

export function PlanTab({ snapshot }: Props) {
  const plan = snapshot.plan;

  if (!plan) {
    return (
      <div className="rtab-empty">
        <p>尚未生成计划。</p>
        <p className="rtab-empty-next">下一步：在左侧填写风格与场景后生成研究计划。</p>
      </div>
    );
  }

  // 中央是唯一编辑位置，检查器始终显示已保存计划，避免两个草稿互相覆盖。
  return (
    <div className="rtab-plan">
      {snapshot.status === "awaiting_plan_approval" && <p className="rtab-empty-next">在中央编辑并保存计划，然后确认开始。</p>}
      <div className="rtab-plan-meta">
        <span>目标：{plan.objective}</span>
        <span>预算：{budgetText(plan.budget)}</span>
        <span>修订 v{plan.revision}</span>
      </div>
      <ol className="rplan-steps rplan-steps-readonly">
        {plan.steps.map((step) => (
          <li key={step.id} className={`rplan-step rplan-step-${step.status}`}>
            <ResearchPluginDetails step={step} />
            <div className="rplan-step-main">
              <span className="rplan-step-kind">{step.plugin ? "插件工具" : step.kind === "tool" ? `工具 ${step.tool}` : "模型"}</span>
              <span className="rplan-step-title">{step.title}</span>
              <span className={`rplan-step-state rplan-step-state-${step.status}`}>{stepStateText(step.status)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function budgetText(budget: string): string {
  const map: Record<string, string> = { economy: "经济", standard: "标准", deep: "深入" };
  return map[budget] ?? budget;
}

function stepStateText(status: string): string {
  const map: Record<string, string> = {
    pending: "等待",
    running: "执行中",
    completed: "完成",
    failed: "失败",
    skipped: "已跳过",
  };
  return map[status] ?? status;
}
