type ContextApplicationState = "off" | "preview" | "applied" | "unapplied" | "unknown";

/** Request-time flags describe application; matching a candidate alone does not. */
export function contextPresentation(rollout: unknown, applied: unknown) {
  let state: ContextApplicationState = "unknown";
  if (rollout === "off" && applied === false) state = "off";
  if (rollout === "shadow" && applied === false) state = "preview";
  if (rollout === "enforce" && applied === true) state = "applied";
  if (rollout === "enforce" && applied === false) state = "unapplied";
  const labels: Record<ContextApplicationState, string> = {
    off: "未启用",
    preview: "拟引用预览，未用于请求",
    applied: "已用于本次请求",
    unapplied: "本次未应用",
    unknown: "应用状态未确认",
  };
  return { state, applied: state === "applied", label: labels[state] };
}

export function contextMemoryLabel(rollout: unknown, applied: unknown, count: number) {
  const presentation = contextPresentation(rollout, applied);
  if (presentation.applied) return `本轮请求已引用 ${count} 条记忆`;
  if (presentation.state === "preview") return `拟引用 ${count} 条记忆（仅预览，未用于请求）`;
  if (presentation.state === "off") return "本轮未启用记忆";
  if (presentation.state === "unapplied") return "本轮未应用记忆（已开启，以请求记录为准）";
  return "本轮记忆应用状态未确认";
}
