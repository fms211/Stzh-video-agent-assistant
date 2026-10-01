import type { OpcAgentMessage } from "../components/opc-agent/types";

export type AssistantInspectorState = { providerName: string; model: string; sessionSummary: string; sending: boolean };
export type WorkflowInspectorState = { planTitle: string | null; stepCount: number; completedSteps: number; isRunning: boolean; runId: string | null; status: string };
export type CollaborationInspectorState = { projectName: string; roleCount: number; stage: string; runId: string | null; risks: string; active: boolean };
export type StudioInspectorState = { owner: string; assistant: AssistantInspectorState | null; workflow: WorkflowInspectorState | null; collaboration: CollaborationInspectorState | null };
export const emptyStudioInspector = (owner: string): StudioInspectorState => ({ owner, assistant: null, workflow: null, collaboration: null });

export function updateStudioInspector<K extends "assistant" | "workflow" | "collaboration">(state: StudioInspectorState, owner: string, mode: K, value: StudioInspectorState[K]): StudioInspectorState {
  return state.owner === owner ? { ...state, [mode]: value } : state;
}

export function describeWorkflow({ selected, latest, running, choosing, messages = [] }: {
  selected: { name: string; steps: unknown[] } | null;
  latest?: OpcAgentMessage;
  running: boolean;
  choosing: boolean;
  messages?: OpcAgentMessage[];
}): WorkflowInspectorState {
  // A selected form is a new plan, not the previous run in this conversation.
  if (choosing && selected) return { planTitle: selected.name, stepCount: selected.steps.length, completedSteps: 0, isRunning: running, runId: null, status: running ? "正在规划" : "待开始" };
  if (!latest) return { planTitle: null, stepCount: 0, completedSteps: 0, isRunning: running, runId: null, status: running ? "正在规划" : "未启动工作流" };
  const total = latest.totalSteps ?? 0;
  const declaredCompleted = Math.min(total, Math.max(0, latest.stepIndex ?? 0));
  const savedSteps = latest.workflowRunId ? new Set(messages.filter(message => message.role === "workflow-step"
    && message.workflowRunId === latest.workflowRunId && !message.workflowStepId?.endsWith(":plan")
    && !message.isError && message.content.trim() && Number.isSafeInteger(message.stepIndex)
    && message.stepIndex! >= 0 && message.stepIndex! < total).map(message => message.stepIndex)).size : 0;
  const completed = Math.max(declaredCompleted, savedSteps);
  return {
    planTitle: latest.workflowName || "工作流", stepCount: total, completedSteps: completed,
    runId: latest.id, isRunning: running,
    status: running ? (latest.stepName ? `执行中 · ${latest.stepName}` : "执行中") : latest.isError ? "执行失败" : total > 0 && declaredCompleted === total ? "已完成" : "未完成，当前页面未在执行",
  };
}
