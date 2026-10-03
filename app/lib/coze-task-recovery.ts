// Task metadata, never waiting text, determines whether a reply is still pending.
type RecoveryTask = {
  id: string; kind: string; status: string; stage?: string; error?: string | null;
  conversationMessageId?: string | null; input: Record<string, unknown>;
  output?: Record<string, unknown> | null; completedAt?: string | null;
};
export function taskReplyId(task: RecoveryTask, sessionId: string) {
  return task.kind === "video.generate" && task.input?.conversationId === sessionId &&
    typeof task.conversationMessageId === "string" && task.conversationMessageId
    ? task.conversationMessageId : null;
}
export function isActiveCozeTask(task: RecoveryTask) {
  return ["queued", "running", "paused"].includes(task.status);
}
export function cozeTaskLabel(task: RecoveryTask) {
  return task.status === "queued" ? "已排队，等待服务器调度"
    : task.status === "paused" ? "任务已暂停，可在任务中心继续" : task.stage || "正在生成";
}
export function cozeRecoveryStatus(state: { label: string; error: string; loading: boolean }) {
  if (state.label) return { active: true, label: state.error
    ? `上次确认：${state.label}；进度连接中断，正在重新连接。` : state.label };
  if (state.error) return { active: false, label: "任务状态暂未确认，正在重新连接；不会重复提交生成。" };
  if (state.loading) return { active: false, label: "正在恢复当前会话的任务状态…" };
  return null;
}
export function cozeTaskReply(task: RecoveryTask) {
  if (isActiveCozeTask(task)) return { text: cozeTaskLabel(task), isError: false, errorText: undefined };
  if (["failed", "cancelled"].includes(task.status)) return {
    isError: true, errorText: task.error || (task.status === "cancelled" ? "任务已取消" : "任务执行失败"),
  };
  if (task.status !== "completed") return null;
  const output = task.output || {};
  const warnings = Array.isArray(output.warnings) ? output.warnings.map(value =>
    value && typeof value === "object" && typeof value.message === "string" ? value.message : ""
  ).filter(Boolean).join("；") : "";
  const text = typeof output.text === "string" ? output.text : "任务已完成";
  const videoUrl = typeof output.videoUrl === "string" ? output.videoUrl : undefined;
  const imageUrls = Array.isArray(output.imageUrls) ? output.imageUrls.filter((url): url is string => typeof url === "string") : [];
  return {
    text: warnings ? `${text}\n\n> 部分能力未完成：${warnings}` : text,
    isError: false, errorText: undefined, textIsPayload: false, contextTrace: output.contextTrace,
    payload: videoUrl || imageUrls.length ? { requestId: task.id, createdAt: task.completedAt || undefined, videoUrl, imageUrls } : undefined,
  };
}

export async function readConversationTasks<T extends RecoveryTask>(
  sessionId: string,
  readPage: (cursor?: string) => Promise<{ tasks: T[]; nextCursor: string | null }>,
  isCurrent: () => boolean,
) {
  const tasks: T[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  do {
    if (!isCurrent()) return null;
    const page = await readPage(cursor);
    if (!isCurrent()) return null;
    if (page.tasks.some(task => task.kind === "video.generate" && task.input?.conversationId === sessionId &&
      !Object.prototype.hasOwnProperty.call(task, "conversationMessageId"))) {
      throw new Error("任务服务尚未加载刷新恢复更新，请重启本机预览服务");
    }
    tasks.push(...page.tasks.filter(task => taskReplyId(task, sessionId)));
    cursor = page.nextCursor || undefined;
    if (cursor && seen.has(cursor)) throw new Error("任务分页未推进，请稍后重新连接");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return tasks;
}
