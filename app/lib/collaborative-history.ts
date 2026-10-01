import type { AgentRun } from "./creative-agent-api";

export type CollaborativeEvent = { id: string; type: string; payload: { stage?: string; output?: string; [key: string]: unknown }; created_at: number };
export type CollaborativeDetail = { run: AgentRun; events: CollaborativeEvent[] };

export function collaborativeStatus(run: Pick<AgentRun, "status" | "taskId">): string {
  if (run.status === "running") return run.taskId ? "生成任务执行中" : "协作讨论中";
  return ({ draft: "讨论草稿，尚未执行", awaiting_confirmation: "待确认最终指令", queued: "已进入任务队列", paused: "生成任务已暂停", completed: "生成任务已完成", failed: "运行失败", cancelled: "运行已取消" } as Record<string, string>)[run.status] || `状态：${run.status}`;
}

export async function saveCollaborativeDraft(
  run: AgentRun | null, instruction: string,
  save: (run: AgentRun, instruction: string) => Promise<AgentRun>,
): Promise<AgentRun | null> {
  if (!run || instruction === (run.finalInstruction || "")) return run;
  if (run.status !== "awaiting_confirmation") throw new Error("运行状态已变化，当前不能保存最终指令");
  if (!instruction.trim()) throw new Error("最终指令不能为空，请填写后再切换记录");
  return save(run, instruction);
}

export async function openCollaborativeHistory({ flush, read, isCurrent, commit }: {
  flush: () => Promise<unknown>; read: () => Promise<CollaborativeDetail>;
  isCurrent: () => boolean; commit: (detail: CollaborativeDetail) => void;
}): Promise<boolean> {
  await flush();
  if (!isCurrent()) return false;
  const detail = await read();
  if (!isCurrent()) return false;
  commit(detail);
  return true;
}

export function exportCollaborativeRun(run: AgentRun, events: CollaborativeEvent[], draft = run.finalInstruction || ""): string {
  return [
    "# 协作运行记录", `运行：${run.id}`, `项目：${run.projectId}`, `状态：${collaborativeStatus(run)}`, `预算：${run.budget}`,
    run.taskId ? `关联任务：${run.taskId}` : "尚未投递生成任务", "## 原始任务", run.task,
      "## 角色快照", ...(run.teamSnapshot || []).map(role => `### ${role.name}\n${role.prompt}\n能力：${(role.capabilities || []).join("、")}\n模型：${role.defaultProviderId || "跟随运行模型"}`),
      "## 创建时创作参数", Object.entries(run.currentConstraints || {}).map(([key,value])=>`${key}：${value}`).join("\n") || "原运行未记录结构化参数",
    "## 最终指令", run.finalInstruction || "尚未生成",
    ...(draft !== (run.finalInstruction || "") ? ["## 尚未保存的编辑", draft || "（空）"] : []),
    "## 决策依据", run.rationale || "尚无记录", "## 风险与未决项", run.risks || "尚无记录",
    ...(run.error ? ["## 错误", run.error] : []),
    "## 运行事件", ...events.map(event => `### ${event.type}\n时间：${new Date(event.created_at * 1000).toISOString()}\n${JSON.stringify(event.payload, null, 2)}`), "",
  ].join("\n\n");
}
