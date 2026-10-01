// 研究运行工作台 — 纯函数事件投影
// 规则（规划 §3.3）：
//   seq <= lastSeq          → duplicate: true，忽略，返回原 snapshot
//   seq === lastSeq + 1     → 应用事件，返回新 snapshot
//   seq >  lastSeq + 1      → needsResync: true，不猜测中间状态，返回原 snapshot
//   非法状态跃迁             → throw INVALID_STATE_TRANSITION，UI 保留最后有效 snapshot
// 零依赖纯模块（erasable syntax only）；projectRunEvent 不原地修改任何数组/对象。

import type {
  ResearchRunSnapshot,
  RunEvent,
  SourceArtifact,
  OutputArtifact,
  ResearchStepStatus,
} from "./types";

// 纯类型 import 在 type-stripping 后消失，不构成运行时依赖

type ProjectResult = {
  snapshot: ResearchRunSnapshot;
  duplicate: boolean;
  needsResync: boolean;
};

class InvalidStateTransition extends Error {
  constructor(transition: string) {
    super(`INVALID_STATE_TRANSITION: ${transition}`);
    this.name = "InvalidStateTransition";
  }
}

function transitionError(type: string, status: string): never {
  throw new InvalidStateTransition(`${type} in status ${status}`);
}

function requireSeqContinuity(snapshot: ResearchRunSnapshot, event: RunEvent): boolean {
  if (event.seq <= snapshot.lastSeq) return false; // duplicate
  if (event.seq > snapshot.lastSeq + 1) {
    const gap = new Error("STREAM_GAP");
    gap.name = "StreamGap";
    throw gap;
  }
  return true;
}

function updated(snapshot: ResearchRunSnapshot, event: RunEvent, patch: Partial<ResearchRunSnapshot>): ResearchRunSnapshot {
  return {
    ...snapshot,
    ...patch,
    lastSeq: event.seq,
    updatedAt: event.occurredAt,
  };
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    const next = list.slice();
    next[index] = item;
    return next;
  }
  return [...list, item];
}

function applySourceAdded(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  const source = event.payload.source as unknown as SourceArtifact | undefined;
  if (!source || typeof source.id !== "string") {
    transitionError(event.type, snapshot.status);
  }
  const sources = upsertById(snapshot.sources, source);
  return updated(snapshot, event, {
    sources,
    metrics: {
      ...snapshot.metrics,
      sourceCount: sources.length,
    },
  });
}

function applyArtifactCreated(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  const artifact = event.payload.artifact as unknown as OutputArtifact | undefined;
  if (!artifact || typeof artifact.id !== "string") {
    transitionError(event.type, snapshot.status);
  }
  return updated(snapshot, event, {
    artifacts: upsertById(snapshot.artifacts, artifact),
  });
}

function applyStepStarted(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  const stepId = typeof event.payload.stepId === "string" ? event.payload.stepId : null;
  if (!stepId || !snapshot.plan) transitionError(event.type, snapshot.status);
  // completed / failed / cancelled / paused 之外，running/recovering 可接收
  if (snapshot.status !== "running" && snapshot.status !== "recovering") {
    transitionError(event.type, snapshot.status);
  }
  const steps = snapshot.plan.steps.map((step) =>
    step.id === stepId ? { ...step, status: "running" as ResearchStepStatus } : step,
  );
  return updated(snapshot, event, {
    activeStepId: stepId,
    plan: { ...snapshot.plan, steps },
  });
}

function applyStepTerminal(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  const stepId = typeof event.payload.stepId === "string" ? event.payload.stepId : null;
  if (!stepId || !snapshot.plan) transitionError(event.type, snapshot.status);
  if (snapshot.status !== "running" && snapshot.status !== "recovering") {
    transitionError(event.type, snapshot.status);
  }
  const statusMap: Record<string, ResearchStepStatus> = {
    "step.completed": "completed",
    "step.failed": "failed",
    "step.skipped": "skipped",
  };
  const nextStatus = statusMap[event.type];
  let completedDelta = 0;
  const steps = snapshot.plan.steps.map((step) => {
    if (step.id !== stepId) return step;
    if (step.status === "completed" && nextStatus === "completed") {
      // 幂等：重复完成不再累计
      return step;
    }
    if (nextStatus === "completed" && step.status !== "completed") completedDelta = 1;
    return { ...step, status: nextStatus };
  });
  return updated(snapshot, event, {
    plan: { ...snapshot.plan, steps },
    activeStepId: null,
    metrics: {
      ...snapshot.metrics,
      completedSteps: snapshot.metrics.completedSteps + completedDelta,
    },
  });
}

function applyPlanGenerated(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "planning" && snapshot.status !== "awaiting_plan_approval") {
    transitionError(event.type, snapshot.status);
  }
  const plan = event.payload.plan as unknown as ResearchRunSnapshot["plan"];
  if (!plan || !Array.isArray(plan.steps)) {
    transitionError(event.type, snapshot.status);
  }
  const totalSteps = plan.steps.filter((step) => step.enabled).length;
  return updated(snapshot, event, {
    status: "awaiting_plan_approval",
    plan,
    metrics: { ...snapshot.metrics, totalSteps },
  });
}

function applyRunStarted(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "awaiting_plan_approval" && snapshot.status !== "recovering" && snapshot.status !== "paused") {
    transitionError(event.type, snapshot.status);
  }
  return updated(snapshot, event, {
    status: "running",
    error: null,
  });
}

function applyRunPaused(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "running") transitionError(event.type, snapshot.status);
  return updated(snapshot, event, { status: "paused" });
}

function applyRunResumed(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "paused") transitionError(event.type, snapshot.status);
  return updated(snapshot, event, { status: "running" });
}

function applyRunRecovering(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "running" && snapshot.status !== "failed") transitionError(event.type, snapshot.status);
  return updated(snapshot, event, { status: "recovering", error: null });
}

function applyRunCancelled(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status === "completed" || snapshot.status === "cancelled") {
    transitionError(event.type, snapshot.status);
  }
  return updated(snapshot, event, { status: "cancelled", activeStepId: null });
}

function applyRunCompleted(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "running") transitionError(event.type, snapshot.status);
  return updated(snapshot, event, { status: "completed", activeStepId: null });
}

function applyRunFailed(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  if (snapshot.status !== "running" && snapshot.status !== "recovering") {
    transitionError(event.type, snapshot.status);
  }
  const code = typeof event.payload.code === "string" ? event.payload.code : "UPSTREAM_TIMEOUT";
  const message = typeof event.payload.message === "string" ? event.payload.message : "";
  const stepId = typeof event.payload.stepId === "string" ? event.payload.stepId : null;
  return updated(snapshot, event, {
    status: "recovering",
    error: {
      code: code as ResearchRunSnapshot["error"] extends null ? never : never,
      message,
      stepId,
    } as ResearchRunSnapshot["error"],
  });
}

function applyMetricsUpdated(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  const metrics = event.payload.metrics as unknown as ResearchRunSnapshot["metrics"] | undefined;
  if (!metrics) transitionError(event.type, snapshot.status);
  return updated(snapshot, event, { metrics: { ...snapshot.metrics, ...metrics } });
}

function applyToolEvents(snapshot: ResearchRunSnapshot, event: RunEvent): ResearchRunSnapshot {
  // tool.* 事件只累计计数，不改变状态
  const toolCalls = event.type === "tool.started" ? snapshot.metrics.toolCalls + 1 : snapshot.metrics.toolCalls;
  const modelCalls =
    event.type === "tool.completed" && event.payload.modelCall === true
      ? snapshot.metrics.modelCalls + 1
      : snapshot.metrics.modelCalls;
  return updated(snapshot, event, {
    metrics: { ...snapshot.metrics, toolCalls, modelCalls },
  });
}

export function projectRunEvent(snapshot: ResearchRunSnapshot, event: RunEvent): ProjectResult {
  if (event.version !== 1) {
    throw new Error(`unsupported event version: ${String(event.version)}`);
  }
  if (!Number.isInteger(event.seq) || event.seq < 1) {
    throw new Error(`invalid event seq: ${String(event.seq)}`);
  }

  let continuous: boolean;
  try {
    continuous = requireSeqContinuity(snapshot, event);
  } catch (gapError) {
    if ((gapError as Error).name === "StreamGap") {
      return { snapshot, duplicate: false, needsResync: true };
    }
    throw gapError;
  }
  if (!continuous) {
    return { snapshot, duplicate: true, needsResync: false };
  }

  switch (event.type) {
    case "context.prepared":
    case "memory.candidate":
    case "run.created":
      return { snapshot: updated(snapshot, event, {}), duplicate: false, needsResync: false };
    case "plan.generated":
    case "plan.updated":
      return { snapshot: applyPlanGenerated(snapshot, event), duplicate: false, needsResync: false };
    case "plan.approved":
      if (snapshot.status !== "awaiting_plan_approval") transitionError(event.type, snapshot.status);
      return { snapshot: updated(snapshot, event, {}), duplicate: false, needsResync: false };
    case "run.started":
      return { snapshot: applyRunStarted(snapshot, event), duplicate: false, needsResync: false };
    case "run.paused":
      return { snapshot: applyRunPaused(snapshot, event), duplicate: false, needsResync: false };
    case "run.resumed":
      return { snapshot: applyRunResumed(snapshot, event), duplicate: false, needsResync: false };
    case "run.recovering":
      return { snapshot: applyRunRecovering(snapshot, event), duplicate: false, needsResync: false };
    case "run.cancelled":
      return { snapshot: applyRunCancelled(snapshot, event), duplicate: false, needsResync: false };
    case "run.completed":
      return { snapshot: applyRunCompleted(snapshot, event), duplicate: false, needsResync: false };
    case "run.failed":
      return { snapshot: applyRunFailed(snapshot, event), duplicate: false, needsResync: false };
    case "step.started":
      return { snapshot: applyStepStarted(snapshot, event), duplicate: false, needsResync: false };
    case "step.completed":
    case "step.failed":
    case "step.skipped":
      return { snapshot: applyStepTerminal(snapshot, event), duplicate: false, needsResync: false };
    case "tool.requested":
    case "tool.started":
    case "tool.completed":
    case "tool.failed":
      return { snapshot: applyToolEvents(snapshot, event), duplicate: false, needsResync: false };
    case "source.added":
      return { snapshot: applySourceAdded(snapshot, event), duplicate: false, needsResync: false };
    case "artifact.created":
      return { snapshot: applyArtifactCreated(snapshot, event), duplicate: false, needsResync: false };
    case "metrics.updated":
      return { snapshot: applyMetricsUpdated(snapshot, event), duplicate: false, needsResync: false };
    default:
      throw new Error(`unknown event type: ${String((event as { type?: unknown }).type)}`);
  }
}

// 供 UI 端重建快照：从事件流投影出完整状态（Adapter 恢复路径也使用）
export function rebuildSnapshotFromEvents(
  base: ResearchRunSnapshot,
  events: RunEvent[],
): { snapshot: ResearchRunSnapshot; needsResync: boolean } {
  let current = base;
  let needsResync = false;
  for (const event of events) {
    try {
      current = projectRunEvent(current, event).snapshot;
    } catch (error) {
      if ((error as Error).name === "InvalidStateTransition") {
        needsResync = true;
        break;
      }
      throw error;
    }
  }
  return { snapshot: current, needsResync };
}
