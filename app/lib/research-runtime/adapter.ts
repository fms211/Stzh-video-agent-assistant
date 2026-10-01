// 研究运行工作台 — Runtime Adapter 边界
// 规划 §3.4：页面与运行时之间唯一通道；原型期由 Mock 实现，未来替换为 HTTP Adapter 时不改组件。

import type {
  ResearchRunAction,
  ResearchRunSnapshot,
  PlanOperation,
  ResearchPlan,
  RunEvent,
  StyleResearchInput,
  DataOwnerLike,
} from "./adapter-types";

export type ResearchRunSummary = Pick<
  ResearchRunSnapshot,
  "runId" | "workflowId" | "status" | "input" | "metrics" | "createdAt" | "updatedAt"
>;

export type ResearchSubscription = {
  close(): void;
};

export interface ResearchRuntimeAdapter {
  createRun(input: StyleResearchInput): Promise<ResearchRunSnapshot>;
  getRun(runId: string): Promise<ResearchRunSnapshot>;
  listRuns(limit: number): Promise<ResearchRunSummary[]>;
  updatePlan(
    runId: string,
    expectedRevision: number,
    operations: PlanOperation[],
  ): Promise<ResearchPlan>;
  act(runId: string, action: ResearchRunAction): Promise<void>;
  subscribe(
    runId: string,
    afterSeq: number,
    handlers: {
      onEvent(event: RunEvent): void;
      onError(error: Error): void;
    },
  ): ResearchSubscription;
  dispose(): void;
}

// owner 形状与 app/lib/data-owner.ts 的 DataOwner 一致；
// 以本地别名声明以保持本目录零运行时 import（node:test 机制 A 约束）。
export type { DataOwnerLike };
