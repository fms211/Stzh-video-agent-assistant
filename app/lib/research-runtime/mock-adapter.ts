// 研究运行工作台 — Mock Runtime Adapter
// 规划 Task 2：确定性计时器、动作处理、订阅和本地恢复。
// - 存储键：workspaceDataKey 语义 => tszh:v2:${ownerScope(owner)}:research-runtime
// - dispose() 清理 timer 和全部订阅，但不删除已保存数据（跨实例恢复依赖）
// - 所有数据为演示数据，来源卡必须显示"演示来源"

import {
  projectRunEvent,
} from "./projector.ts";
import type {
  JsonValue,
  PlanOperation,
  ResearchPlan,
  ResearchPlanStep,
  ResearchRunAction,
  ResearchRunSnapshot,
  ResearchRunStatus,
  RunEvent,
  SourceArtifact,
  StyleResearchInput,
} from "./types";
import type { DataOwnerLike } from "./adapter-types";
import { buildDemoPlan, buildDemoSources, buildDemoArtifacts } from "./mock-fixtures.ts";

// ---- owner/storage 工具（与 data-owner.ts 语义一致，本地实现以维持零依赖）----

function ownerScope(owner: DataOwnerLike): string {
  return owner.kind === "guest" ? "guest" : `user:${owner.userId}`;
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function storageKey(owner: DataOwnerLike): string {
  return `tszh:v2:${ownerScope(owner)}:research-runtime`;
}

// ---- 错误 ----

export class ResearchAdapterError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.code = code;
    this.name = "ResearchAdapterError";
  }
}

// ---- 内部状态 ----

type RunRecord = {
  snapshot: ResearchRunSnapshot;
  events: RunEvent[];
  // 运行推进用（不持久化语义的一部分，但随 JSON 一起存也能恢复）
  cursorStepIndex: number;
};

type PersistedState = {
  runs: Record<string, RunRecord>;
};

const PLAN_DELAY_MS = 120; // planning → awaiting_plan_approval
const STEP_DELAY_MS = 150; // 每步推进间隔
const MAX_SEQ_LOG = 500; // 每 run 事件上限（演示规模控制）

function nowIso(clock: () => number): string {
  return new Date(clock()).toISOString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type MockResearchRuntimeAdapterOptions = {
  owner: DataOwnerLike;
  storage: StorageLike;
  clock?: () => number;
};

export interface MockResearchRuntimeAdapterLike {
  createRun(input: StyleResearchInput): Promise<ResearchRunSnapshot>;
  getRun(runId: string): Promise<ResearchRunSnapshot>;
  listRuns(limit: number): Promise<
    Pick<ResearchRunSnapshot, "runId" | "workflowId" | "status" | "input" | "metrics" | "createdAt" | "updatedAt">[]
  >;
  updatePlan(runId: string, expectedRevision: number, operations: PlanOperation[]): Promise<ResearchPlan>;
  act(runId: string, action: ResearchRunAction): Promise<void>;
  subscribe(
    runId: string,
    afterSeq: number,
    handlers: { onEvent(event: RunEvent): void; onError(error: Error): void },
  ): { close(): void };
  dispose(): void;
}

export function createMockResearchRuntimeAdapter(
  options: MockResearchRuntimeAdapterOptions,
): MockResearchRuntimeAdapterLike {
  const { owner, storage } = options;
  const clock = options.clock ?? (() => Date.now());

  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const subscriptions = new Map<string, Set<{ onEvent(event: RunEvent): void; onError(error: Error): void }>>();

  // ---- 持久化 ----

  function loadState(): PersistedState {
    const raw = storage.getItem(storageKey(owner));
    if (!raw) return { runs: {} };
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed || typeof parsed !== "object" || !parsed.runs) return { runs: {} };
      return parsed;
    } catch {
      return { runs: {} };
    }
  }

  function saveState(state: PersistedState): void {
    if (disposed) return;
    try {
      storage.setItem(storageKey(owner), JSON.stringify(state));
    } catch {
      // 演示存储写入失败不中断运行（如配额），保留内存态
    }
  }

  // ---- 事件发射 ----

  function emit(record: RunRecord, type: RunEvent["type"], payload: Record<string, JsonValue>): void {
    const seq = record.events.length + 1;
    const event: RunEvent = {
      version: 1,
      runId: record.snapshot.runId,
      seq,
      type,
      occurredAt: nowIso(clock),
      payload,
    };
    record.events.push(event);
    if (record.events.length > MAX_SEQ_LOG) {
      record.events = record.events.slice(record.events.length - MAX_SEQ_LOG);
    }
    // 通过投影器应用，保证状态机一致；非法跃迁视为内部错误（Mock 数据可控，不应发生）
    const result = projectRunEvent(record.snapshot, event);
    record.snapshot = result.snapshot;

    const subs = subscriptions.get(record.snapshot.runId);
    if (subs) {
      for (const handler of subs) {
        try {
          handler.onEvent(event);
        } catch {
          // 订阅者异常不影响运行时
        }
      }
    }
  }

  function schedule(fn: () => void, delayMs: number): void {
    if (disposed) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (disposed) return;
      fn();
    }, delayMs);
    timers.add(timer);
  }

  // ---- 运行推进 ----

  function advanceRun(runId: string): void {
    const state = loadState();
    const record = state.runs[runId];
    if (!record) return;
    if (record.snapshot.status !== "running") {
      saveState(state);
      return;
    }

    const plan = record.snapshot.plan;
    if (!plan) {
      saveState(state);
      return;
    }

    // 找下一个可执行步骤（enabled 且依赖完成）
    const steps = plan.steps;
    let nextIndex = -1;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.status !== "pending") continue;
      if (!step.enabled) continue;
      const depsDone = step.dependsOn.every((depId) => {
        const dep = steps.find((s) => s.id === depId);
        return !dep || dep.status === "completed" || dep.status === "skipped";
      });
      if (depsDone) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex === -1) {
      // 全部完成 → 产物落盘 + 完成
      finalizeRun(record);
      saveState(state);
      return;
    }

    const step = steps[nextIndex];
    record.cursorStepIndex = nextIndex;
    emit(record, "step.started", { stepId: step.id });
    if (step.kind === "tool") {
      emit(record, "tool.started", { stepId: step.id, tool: step.tool });
    }
    saveState(state);

    schedule(() => {
      completeStep(runId, step.id, step);
    }, STEP_DELAY_MS);
  }

  function completeStep(runId: string, stepId: string, step: ResearchPlanStep): void {
    const state = loadState();
    const record = state.runs[runId];
    if (!record) return;
    if (record.snapshot.status !== "running") {
      saveState(state);
      return;
    }

    // 模拟故障开关（仅 Mock：轨迹开发控件触发）
    if (failNextStepId && failNextStepId === stepId) {
      failNextStepId = null;
      emit(record, "tool.failed", { stepId, tool: step.tool });
      emit(record, "step.failed", { stepId });
      emit(record, "run.failed", {
        code: "UPSTREAM_TIMEOUT",
        message: `步骤「${step.title}」模拟超时（演示故障）`,
        stepId,
      });
      saveState(state);
      return;
    }

    if (step.kind === "tool") {
      // 工具完成：按步骤注入演示来源
      const sources: SourceArtifact[] = [];
      if (step.tool === "web_search" && !record.snapshot.sources.length) {
        for (const source of buildDemoSources(record.snapshot.input.styleName).filter((s) => s.sourceType === "web")) {
          sources.push(source);
        }
      } else if (step.tool === "rag_search") {
        for (const source of buildDemoSources(record.snapshot.input.styleName).filter((s) => s.sourceType === "rag")) {
          sources.push(source);
        }
      }
      for (const source of sources) {
        emit(record, "source.added", { source: source as unknown as Record<string, JsonValue> });
      }
      emit(record, "tool.completed", { stepId, tool: step.tool });
    }
    emit(record, "step.completed", { stepId });

    // 特征包步骤完成后产出三个演示产物
    if (stepId === "step-feature-pack" && record.snapshot.artifacts.length === 0) {
      for (const artifact of buildDemoArtifacts(record.snapshot.input)) {
        emit(record, "artifact.created", { artifact: artifact as unknown as Record<string, JsonValue> });
      }
    }

    saveState(state);
    schedule(() => advanceRun(runId), STEP_DELAY_MS);
  }

  function finalizeRun(record: RunRecord): void {
    emit(record, "run.completed", {});
  }

  let failNextStepId: string | null = null;

  // ---- 恢复中断运行（跨实例 / 刷新）----

  function resumeIfRunning(): void {
    const state = loadState();
    let changed = false;
    for (const runId of Object.keys(state.runs)) {
      const record = state.runs[runId];
      // 之前实例崩溃在 running 状态 → 先标记 recovering 再继续（规划：返回页面从事件日志重建）
      if (record.snapshot.status === "running" && record.snapshot.activeStepId) {
        emit(record, "run.recovering", {});
        // 未完成的步骤重新 pending（事件流会记录失败/重启）
        record.snapshot.activeStepId = null;
        changed = true;
        saveState(state);
        schedule(() => advanceRun(runId), PLAN_DELAY_MS);
      } else if (record.snapshot.status === "planning") {
        // planning 中断 → 直接补发计划
        schedule(() => {
          const s2 = loadState();
          const r2 = s2.runs[runId];
          if (!r2 || r2.snapshot.status !== "planning") return;
          const plan = buildDemoPlan(r2.snapshot.input);
          emit(r2, "plan.generated", { plan: plan as unknown as Record<string, JsonValue> });
          saveState(s2);
        }, PLAN_DELAY_MS);
        changed = true;
      }
    }
    if (changed) saveState(state);
  }

  // ---- 公开 API ----

  const adapter: MockResearchRuntimeAdapterLike = {
    async createRun(input) {
      if (disposed) throw new ResearchAdapterError("RUN_NOT_FOUND", "adapter disposed");
      const state = loadState();
      const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const record: RunRecord = {
        snapshot: {
          runId,
          workflowId: "style-research",
          input: deepClone(input),
          status: "planning",
          plan: null,
          activeStepId: null,
          sources: [],
          artifacts: [],
          metrics: {
            elapsedMs: 0,
            completedSteps: 0,
            totalSteps: 0,
            sourceCount: 0,
            modelCalls: 0,
            toolCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            ttftMs: null,
            estimatedCostCny: null,
          },
          error: null,
          lastSeq: 0,
          createdAt: nowIso(clock),
          updatedAt: nowIso(clock),
        },
        events: [],
        cursorStepIndex: -1,
      };
      state.runs[runId] = record;
      emit(record, "run.created", { input: input as unknown as Record<string, JsonValue> });
      saveState(state);

      // 异步生成计划
      schedule(() => {
        const s2 = loadState();
        const r2 = s2.runs[runId];
        if (!r2 || r2.snapshot.status !== "planning") return;
        const plan = buildDemoPlan(r2.snapshot.input);
        emit(r2, "plan.generated", { plan: plan as unknown as Record<string, JsonValue> });
        saveState(s2);
      }, PLAN_DELAY_MS);

      return deepClone(record.snapshot);
    },

    async getRun(runId) {
      const state = loadState();
      const record = state.runs[runId];
      if (!record) throw new ResearchAdapterError("RUN_NOT_FOUND", runId);
      return deepClone(record.snapshot);
    },

    async listRuns(limit) {
      const state = loadState();
      const summaries = Object.values(state.runs)
        .map((record) => ({
          runId: record.snapshot.runId,
          workflowId: record.snapshot.workflowId,
          status: record.snapshot.status as ResearchRunStatus,
          input: record.snapshot.input,
          metrics: record.snapshot.metrics,
          createdAt: record.snapshot.createdAt,
          updatedAt: record.snapshot.updatedAt,
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, Math.max(1, limit));
      return summaries;
    },

    async updatePlan(runId, expectedRevision, operations) {
      const state = loadState();
      const record = state.runs[runId];
      if (!record) throw new ResearchAdapterError("RUN_NOT_FOUND", runId);
      const plan = record.snapshot.plan;
      if (!plan) throw new ResearchAdapterError("INVALID_PLAN_OPERATION", "plan not ready");
      if (plan.revision !== expectedRevision) {
        throw new ResearchAdapterError("PLAN_REVISION_CONFLICT", `expected ${expectedRevision}, actual ${plan.revision}`);
      }
      if (record.snapshot.status !== "awaiting_plan_approval") {
        throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `plan editable only in awaiting_plan_approval, got ${record.snapshot.status}`);
      }

      // 应用受控操作
      let steps = plan.steps.slice();
      let objective = plan.objective;
      let budget = plan.budget;
      for (const op of operations) {
        switch (op.type) {
          case "set_objective":
            objective = op.value;
            break;
          case "set_budget":
            budget = op.value;
            break;
          case "move_step": {
            const from = steps.findIndex((s) => s.id === op.stepId);
            if (from === -1) throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `unknown step ${op.stepId}`);
            const to = Math.max(0, Math.min(steps.length - 1, op.toIndex));
            const [moved] = steps.splice(from, 1);
            steps = [...steps.slice(0, to), moved, ...steps.slice(to)];
            break;
          }
          case "set_optional_enabled": {
            const target = steps.find((s) => s.id === op.stepId);
            if (!target) throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `unknown step ${op.stepId}`);
            if (!target.optional) {
              throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `step ${op.stepId} is not optional`);
            }
            steps = steps.map((s) => (s.id === op.stepId ? { ...s, enabled: op.enabled } : s));
            break;
          }
          case "set_step_input": {
            const target = steps.find((s) => s.id === op.stepId);
            if (!target) throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `unknown step ${op.stepId}`);
            steps = steps.map((s) => (s.id === op.stepId ? { ...s, input: deepClone(op.input) } : s));
            break;
          }
          default:
            throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `unknown operation ${String((op as { type?: unknown }).type)}`);
        }
      }

      const nextPlan: ResearchPlan = {
        ...plan,
        revision: plan.revision + 1,
        objective,
        budget,
        steps,
      };
      emit(record, "plan.updated", { plan: nextPlan as unknown as Record<string, JsonValue> });
      saveState(state);
      return deepClone(nextPlan);
    },

    async act(runId, action) {
      const state = loadState();
      const record = state.runs[runId];
      if (!record) throw new ResearchAdapterError("RUN_NOT_FOUND", runId);
      const snapshot = record.snapshot;

      switch (action.type) {
        case "approve_plan": {
          if (snapshot.status !== "awaiting_plan_approval") {
            throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `approve in ${snapshot.status}`);
          }
          if (!snapshot.plan || snapshot.plan.revision !== action.expectedRevision) {
            throw new ResearchAdapterError("PLAN_REVISION_CONFLICT", "plan revision changed");
          }
          emit(record, "plan.approved", { revision: action.expectedRevision });
          emit(record, "run.started", {});
          saveState(state);
          schedule(() => advanceRun(runId), STEP_DELAY_MS);
          break;
        }
        case "pause": {
          if (snapshot.status !== "running") {
            throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `pause in ${snapshot.status}`);
          }
          emit(record, "run.paused", {});
          saveState(state);
          break;
        }
        case "resume": {
          if (snapshot.status !== "paused") {
            throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `resume in ${snapshot.status}`);
          }
          emit(record, "run.resumed", {});
          saveState(state);
          schedule(() => advanceRun(runId), STEP_DELAY_MS);
          break;
        }
        case "cancel": {
          if (snapshot.status === "completed" || snapshot.status === "cancelled") {
            throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `cancel in ${snapshot.status}`);
          }
          emit(record, "run.cancelled", {});
          saveState(state);
          break;
        }
        case "retry_step": {
          if (snapshot.status !== "recovering" && snapshot.status !== "failed") {
            throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `retry in ${snapshot.status}`);
          }
          const stepId = action.stepId;
          const step = snapshot.plan?.steps.find((s) => s.id === stepId);
          if (!step) throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `unknown step ${stepId}`);
          emit(record, "run.recovering", {});
          // 失败步骤重置为 pending 后重跑
          record.snapshot.plan = {
            ...record.snapshot.plan!,
            steps: record.snapshot.plan!.steps.map((s) => (s.id === stepId ? { ...s, status: "pending" } : s)),
          };
          emit(record, "run.started", {});
          saveState(state);
          schedule(() => advanceRun(runId), STEP_DELAY_MS);
          break;
        }
        case "skip_step": {
          if (snapshot.status !== "recovering" && snapshot.status !== "failed" && snapshot.status !== "running") {
            throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `skip in ${snapshot.status}`);
          }
          const step = snapshot.plan?.steps.find((s) => s.id === action.stepId);
          if (!step || !step.optional) {
            throw new ResearchAdapterError("INVALID_PLAN_OPERATION", `step ${action.stepId} is not skippable`);
          }
          emit(record, "step.skipped", { stepId: action.stepId });
          if (snapshot.status === "recovering" || snapshot.status === "failed") {
            emit(record, "run.started", {});
            saveState(state);
            schedule(() => advanceRun(runId), STEP_DELAY_MS);
          }
          saveState(state);
          break;
        }
        default:
          throw new ResearchAdapterError("INVALID_STATE_TRANSITION", `unknown action ${String((action as { type?: unknown }).type)}`);
      }
    },

    subscribe(runId, afterSeq, handlers) {
      const set = subscriptions.get(runId) ?? new Set();
      set.add(handlers);
      subscriptions.set(runId, set);

      // 回放 afterSeq 之后的历史事件（快照恢复路径）
      const state = loadState();
      const record = state.runs[runId];
      if (record) {
        for (const event of record.events) {
          if (event.seq > afterSeq) {
            try {
              handlers.onEvent(event);
            } catch {
              // 忽略订阅者回放异常
            }
          }
        }
      }

      return {
        close() {
          const current = subscriptions.get(runId);
          if (current) {
            current.delete(handlers);
            if (!current.size) subscriptions.delete(runId);
          }
        },
      };
    },

    dispose() {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      subscriptions.clear();
    },
  };

  // 实例创建时恢复中断的运行
  resumeIfRunning();

  return adapter;
}

// 仅供轨迹开发控件使用（Mock 专属）：让下一步触发模拟超时
export function armMockFailureOnce(
  adapterLike: unknown,
  stepId: string,
): void {
  // 通过闭包外暴露的方式不可达；Mock Adapter 暴露内部控制点
  const internal = adapterLike as { __armFailureOnce?: (stepId: string) => void };
  internal.__armFailureOnce?.(stepId);
}
