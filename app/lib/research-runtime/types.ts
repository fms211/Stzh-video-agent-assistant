// 研究运行工作台 — 共享领域契约
// 来源：docs/superpowers/plans/2026-08-28-Hermes风格研究运行工作台-Web原型技术与执行规划.md §3
// 命名为页面、Mock Adapter 与未来 HTTP Adapter 的共同契约，不得自行改名。
// 零依赖纯类型模块（erasable syntax only）——node:test 原生 type-stripping 直接导入。

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ResearchBudget = "economy" | "standard" | "deep";

export type ResearchRunStatus =
  | "draft"
  | "planning"
  | "awaiting_plan_approval"
  | "running"
  | "paused"
  | "recovering"
  | "completed"
  | "failed"
  | "cancelled";

export type ResearchStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ResearchToolName = "web_search" | "rag_search" | "get_opc_context" | `plugin:${string}:${string}`;

export type ResearchLaunchInput = { styleName: string; useCase: string; providerId?: string; projectId?: string; excludedMemoryIds?: string[] };

export type StyleResearchInput = {
  styleName: string;
  useCase: string;
  providerId: string | null;
  projectId: string | null;
  excludedMemoryIds?: string[];
};

export type ResearchPlanStep = {
  id: string;
  title: string;
  description: string;
  kind: "tool" | "model";
  tool: ResearchToolName | null;
  optional: boolean;
  enabled: boolean;
  dependsOn: string[];
  input: Record<string, JsonValue>;
  status: ResearchStepStatus;
  plugin?: { pluginId: string; toolName: string; version: string; contentHash: string; generationId: string; permissionTier: "safe" | "standard" | "full"; risk: "read" | "write" | "external"; inputSchema: Record<string, JsonValue> };
};

export type ResearchPlan = {
  revision: number;
  objective: string;
  budget: ResearchBudget;
  estimatedCalls: number;
  steps: ResearchPlanStep[];
};

export type SourceArtifact = {
  id: string;
  sourceType: "web" | "rag" | "plugin";
  pluginId?: string;
  pluginVersion?: string;
  title: string;
  url: string | null;
  domain: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  toolCallId: string;
  citedBy: string[];
  trust: "untrusted" | "project_knowledge";
};

export type ResearchArtifactEvidence = {
  version: 1;
  origin: "model_output";
  verification: "unverified";
  runId: string;
  planRevision: number;
  approvedPlanRevision: number | null;
  scope: { styleName: string; useCase: string; projectId: string | null };
  note: string;
  fields: Record<string, { origin: "model_output"; verification: "unverified" }>;
  references: Pick<SourceArtifact, "id" | "title" | "url" | "sourceType" | "retrievedAt" | "trust">[];
};

export type OutputArtifact = {
  id: string;
  type: "research-report" | "style-feature-pack" | "application-prompt-pack";
  title: string;
  mimeType: "text/markdown" | "application/json";
  fileName: string;
  content: string;
  createdAt: string;
  sourceIds: string[];
  evidence?: ResearchArtifactEvidence;
};

export type ResearchRunMetrics = {
  elapsedMs: number;
  completedSteps: number;
  totalSteps: number;
  sourceCount: number;
  modelCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  ttftMs: number | null;
  estimatedCostCny: number | null;
};

export type ResearchRunSnapshot = {
  runId: string;
  workflowId: "style-research";
  input: StyleResearchInput;
  status: ResearchRunStatus;
  plan: ResearchPlan | null;
  activeStepId: string | null;
  sources: SourceArtifact[];
  artifacts: OutputArtifact[];
  metrics: ResearchRunMetrics;
  error: { code: ResearchErrorCode; message: string; stepId: string | null } | null;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type ResearchErrorCode =
  | "RUN_NOT_FOUND"
  | "PLAN_REVISION_CONFLICT"
  | "INVALID_PLAN_OPERATION"
  | "INVALID_STATE_TRANSITION"
  | "TOOL_NOT_REGISTERED"
  | "BUDGET_EXCEEDED"
  | "UPSTREAM_TIMEOUT"
  | "STREAM_GAP"
  | "AUTH_REQUIRED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_OUTPUT_INVALID"
  | "MODEL_NOT_CONFIGURED"
  | "RUN_BUSY";

// ---- §3.2 计划操作与运行动作 ----

export type PlanOperation =
  | { type: "set_objective"; value: string }
  | { type: "set_budget"; value: ResearchBudget }
  | { type: "move_step"; stepId: string; toIndex: number }
  | { type: "set_optional_enabled"; stepId: string; enabled: boolean }
  | { type: "set_step_input"; stepId: string; input: Record<string, JsonValue> };

export type ResearchRunAction =
  | { type: "approve_plan"; expectedRevision: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "cancel" }
  | { type: "retry_step"; stepId: string; expectedRevision?: number; input?: Record<string, JsonValue> }
  | { type: "skip_step"; stepId: string; expectedRevision?: number };

// ---- §3.3 事件 envelope ----

export type ResearchEventType =
  | "run.created"
  | "plan.generated"
  | "plan.updated"
  | "plan.approved"
  | "run.started"
  | "run.paused"
  | "run.resumed"
  | "run.recovering"
  | "run.cancelled"
  | "run.completed"
  | "run.failed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "step.skipped"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "source.added"
  | "artifact.created"
  | "context.prepared"
  | "memory.candidate"
  | "metrics.updated";

export type RunEvent = {
  version: 1;
  runId: string;
  seq: number;
  type: ResearchEventType;
  occurredAt: string;
  payload: Record<string, JsonValue>;
};
