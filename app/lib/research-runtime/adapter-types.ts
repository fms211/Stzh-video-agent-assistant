// Adapter 内部使用的共享类型别名（零运行时 import 约束下的 owner 形状声明）

export type DataOwnerLike = { kind: "guest" } | { kind: "account"; userId: number };

export type {
  ResearchRunAction,
  ResearchRunSnapshot,
  PlanOperation,
  ResearchPlan,
  RunEvent,
  StyleResearchInput,
} from "./types";
