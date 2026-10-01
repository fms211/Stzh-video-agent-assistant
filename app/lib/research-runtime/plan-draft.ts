import type { JsonValue, PlanOperation, ResearchPlan } from "./types";

export type ResearchPlanDraft = {
  base: ResearchPlan;
  value: ResearchPlan;
  inputEdits: Record<string, string>;
};

export function createPlanDraft(plan: ResearchPlan): ResearchPlanDraft {
  return { base: plan, value: { ...plan, steps: plan.steps.map(step => ({ ...step })) }, inputEdits: {} };
}

export function movePlanDraftStep(draft: ResearchPlanDraft, stepId: string, direction: -1 | 1): ResearchPlanDraft {
  const steps = [...draft.value.steps];
  const from = steps.findIndex(step => step.id === stepId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= steps.length) return draft;
  const [step] = steps.splice(from, 1);
  steps.splice(to, 0, step);
  return { ...draft, value: { ...draft.value, steps } };
}

// Compute operations against the revision on which editing began. Validation
// errors block the whole save; malformed fields must never be silently omitted.
export function inspectPlanDraft(draft: ResearchPlanDraft) {
  const { base, value, inputEdits } = draft;
  const operations: PlanOperation[] = [];
  const errors: string[] = [];
  if (value.objective !== base.objective) operations.push({ type: "set_objective", value: value.objective });
  if (!value.objective.trim()) errors.push("研究目标不能为空。");
  if (value.budget !== base.budget) operations.push({ type: "set_budget", value: value.budget });

  const order = base.steps.map(step => step.id);
  value.steps.forEach((step, toIndex) => {
    const fromIndex = order.indexOf(step.id);
    if (fromIndex !== toIndex) {
      operations.push({ type: "move_step", stepId: step.id, toIndex });
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, step.id);
    }
    const original = base.steps.find(item => item.id === step.id)!;
    if (step.optional && step.enabled !== original.enabled) {
      operations.push({ type: "set_optional_enabled", stepId: step.id, enabled: step.enabled });
    }
  });

  let invalidInputs = 0;
  for (const [stepId, raw] of Object.entries(inputEdits)) {
    const step = base.steps.find(item => item.id === stepId);
    if (!step || raw === JSON.stringify(step.input)) continue;
    try {
      const input: unknown = JSON.parse(raw);
      if (input === null || Array.isArray(input) || typeof input !== "object") throw new Error();
      if (JSON.stringify(input) !== JSON.stringify(step.input)) {
        operations.push({ type: "set_step_input", stepId, input: input as Record<string, JsonValue> });
      }
    } catch {
      invalidInputs++;
      errors.push(`「${step.title}」输入必须是有效的 JSON 对象，例如 {"query":"关键词"}。`);
    }
  }

  const seen = new Set<string>();
  for (const step of value.steps) {
    if (step.enabled && step.dependsOn.some(id => value.steps.find(item => item.id === id)?.enabled && !seen.has(id))) {
      errors.push(`「${step.title}」必须排在它依赖的步骤之后。`);
    }
    seen.add(step.id);
  }
  return { operations, errors, pendingCount: operations.length + invalidInputs };
}

export function reconcilePlanDraft(local: ResearchPlanDraft, latest: ResearchPlan): ResearchPlanDraft {
  // Adopt remote changes only while clean. A saved response may already be
  // newer than the polling snapshot; never revert that acknowledged revision.
  return latest.revision > local.base.revision && inspectPlanDraft(local).pendingCount === 0
    ? createPlanDraft(latest) : local;
}

export async function savePlanDraft(
  draft: ResearchPlanDraft,
  updatePlan: (revision: number, operations: PlanOperation[]) => Promise<ResearchPlan>,
): Promise<ResearchPlanDraft> {
  const { operations, errors } = inspectPlanDraft(draft);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!operations.length) return draft;
  const saved = await updatePlan(draft.base.revision, operations);
  return createPlanDraft(saved);
}
