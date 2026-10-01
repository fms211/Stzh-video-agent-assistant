import type { OpcAgentMessage } from "../components/opc-agent/types";

export type SavedWorkflowStep = {
  stepId: string; stepIndex: number; workflowId: string;
  status: "running" | "completed" | "uncertain";
  result: { text: string; contextTrace?: unknown; referenceNotes?: string[] } | null;
};

export function workflowCompletionMessageId(runId:string,messages:OpcAgentMessage[]) {
  return messages.find(message=>message.role==="action-cards"&&message.workflowRunId===runId)?.id || `wf_cards_${runId}`;
}

// A saved reply never completes the whole run or creates action cards.
// Missing messages can be restored only beneath an existing matching run.
export function recoverWorkflowMessages(messages: OpcAgentMessage[], runId: string, steps: SavedWorkflowStep[]) {
  const completed = new Map(steps.filter(step => step.status === "completed" && typeof step.result?.text === "string").map(step => [step.stepId, step.result!]));
  const restored = messages.map(message => {
    const saved = message.role === "workflow-step" && message.workflowRunId === runId && message.workflowStepId ? completed.get(message.workflowStepId) : undefined;
    return saved ? { ...message, content: saved.text, contextTrace: saved.contextTrace,
      referenceNotes: saved.referenceNotes ?? message.referenceNotes ?? ["已恢复生成结果；当时的检索记录缺失，请核实引用。"], isError: false } : message;
  });
  const run = messages.find(message => message.role === "workflow" && message.workflowRunId === runId);
  if (!run?.workflowId) return restored;
  const known = new Set(messages.filter(message => message.workflowRunId === runId).map(message => message.workflowStepId));
  const missing: OpcAgentMessage[] = [];
  for (const step of [...steps].sort((a,b) => a.stepIndex-b.stepIndex)) {
    if (known.has(step.stepId) || step.workflowId !== run.workflowId || !completed.has(step.stepId) || !Number.isSafeInteger(step.stepIndex) || step.stepIndex < 0) continue;
    const result = completed.get(step.stepId)!;
    missing.push({
      id: `wf_recovered_${globalThis.crypto.randomUUID()}`, role: "workflow-step", content: result.text,
      timestamp: Date.now(), workflowRunId: runId, workflowStepId: step.stepId, workflowId: step.workflowId,
      workflowName: run.workflowName, workflowIcon: run.workflowIcon,
      stepName: step.stepId.endsWith(":plan") ? "规划回复（从服务端恢复）" : `步骤 ${step.stepIndex + 1}（从服务端恢复）`,
      stepIndex: step.stepIndex, totalSteps: run.totalSteps, contextTrace: result.contextTrace, isError: false,
      referenceNotes: result.referenceNotes ?? ["已恢复生成结果；当时的检索记录缺失，请核实引用。"],
    });
    known.add(step.stepId);
  }
  const last = restored.findLastIndex(message => message.workflowRunId === runId);
  restored.splice(last + 1, 0, ...missing);
  return restored;
}
