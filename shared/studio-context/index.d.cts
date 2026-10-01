export type StudioMode = "coze" | "assistant" | "workflow" | "collaboration";
export type MemoryScope =
  | { kind: "user" }
  | { kind: "project"; projectId: string }
  | { kind: "session"; mode: StudioMode; sessionId: string }
  | { kind: "run"; mode: StudioMode; runId: string };
export type Applicability = { contractVersion?: string; codeRevision?: string; deploymentId?: string };
export type Verification = {
  state: "unverified" | "verified" | "conflicted" | "stale";
  evidenceIds: string[];
  appliesTo: Applicability;
  observedAt?: string;
  lastVerifiedAt?: string;
  openQuestions: string[];
};
/** Evidence is separate from memory; these records are a future storage/adapter
 * contract and are not yet loaded by the offline builder. */
export type StudioEvidence = {
  id: string;
  ownerUserId: number;
  scope: MemoryScope;
  sourceType: "contract" | "code" | "runtime" | "user_statement" | "web" | "rag" | "artifact";
  sourceRef: string;
  revision: number;
  capturedAt: string;
  appliesTo: Applicability;
  range?: { kind: "event" | "message"; firstId: string; lastId: string };
  summary: string;
  state: "available" | "revoked" | "stale";
};
export type StudioMechanism = {
  id: string;
  revision: number;
  mode: StudioMode;
  purpose: string;
  expectedResult: string;
  allowedStates: string[];
  steps: { id: string; input: string; output: string; state: string; completedActionsOnFailure: string[] }[];
  atomicityBoundary: string;
  idempotency: { key?: string; retryConditions: string[]; unknowns: string[] };
  irreversibleActions: string[];
  resultQueries: string[];
  evidenceIds: string[];
  appliesTo: Applicability;
  lastVerifiedAt: string;
  conflicts: string[];
  openQuestions: string[];
};
export type StudioMemoryItem = {
  id: string;
  ownerUserId: number;
  scope: MemoryScope;
  kind: "working" | "episodic" | "semantic" | "perceptual";
  content: string;
  status: "candidate" | "confirmed" | "superseded";
  claimKind: "preference" | "constraint" | "observation" | "mechanism" | "hypothesis";
  verification: Verification;
  enabled: boolean;
  revision: number;
  confidence: number;
  importance: number;
  source: { mode: StudioMode; recordId: string; sessionId?: string; runId?: string; artifactIds?: string[]; fingerprint?: string };
  sensitivity: "normal" | "sensitive";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  /** Structured preference key; current explicit values take precedence. */
  slot?: string;
};
/** Server-derived identity and freshly authorized scope; never request.body. */
export type TrustedContext = {
  ownerUserId: number;
  mode: StudioMode;
  projectId?: string;
  sessionId?: string;
  runId?: string;
  now: string;
  versions: Applicability;
  currentConstraints: Record<string, string>;
};
/** Check current record revision plus ALL source, evidence and asset references.
 * Missing, async or non-true results deny use. A browser preview is not authority. */
export type MemoryAuthorizer = (item: StudioMemoryItem) => boolean;
export type SelectedMemory = {
  item: StudioMemoryItem;
  score: number;
  relevance: number;
  matchedTerms: string[];
  section: "Relevant Memory" | "Evidence";
  effectiveVerification: Verification["state"];
};
export type ContextSection = "Role & Policy" | "Task" | "Current Creative State" | "Mechanism Reference" | "Relevant Memory" | "Evidence" | "Recent Conversation" | "Tool State" | "Output";
export type ContextPacket = {
  id: string;
  section: ContextSection;
  trust: "policy" | "current_input" | "reference";
  required: boolean;
  content: string;
  memoryId?: string;
  revision?: number;
  source?: StudioMemoryItem["source"];
  scope?: MemoryScope;
  claimKind?: StudioMemoryItem["claimKind"];
  verification?: Verification;
  instructionBoundary?: string;
};
export type ContextTrace = {
  retrievalVersion: string;
  estimator: "utf8-bytes-plus-16";
  available: number;
  requiredEstimate: number;
  estimatedInput: number;
  selectedIds: string[];
  dropped: Record<string, number>;
  remoteHistoryTokens: "unknown" | "not_applicable";
};
export const MODES: readonly StudioMode[];
export const SECTIONS: readonly ContextSection[];
export function validMemory(item: unknown): item is StudioMemoryItem;
export function selectMemories(input: {
  items: unknown[];
  query: string;
  context: TrustedContext;
  authorize?: MemoryAuthorizer;
  limit?: number;
  excludedMemoryIds?: string[];
}): { retrievalVersion: string; selected: SelectedMemory[]; dropped: Record<string, number> };
export function estimateLocalTokens(serialized: string): number;
export function buildStudioContext(input: {
  packetId: string;
  /** Fixed application policy. User role prompts must not enter this field. */
  policy: string;
  task: string;
  retrievalQuery?: string;
  creativeState?: string;
  /** Fresh canonical state including approval revision; no inferred approvals. */
  toolState?: string;
  output?: string;
  memories?: unknown[];
  context: TrustedContext;
  authorize?: MemoryAuthorizer;
  budget: { contextWindow: number; maxOutput: number; safetyMargin: number };
}):
  | { ok: true; packets: ContextPacket[]; serialized: string; trace: ContextTrace }
  | { ok: false; reason: "required_context_over_budget"; packets: []; serialized: null; trace: ContextTrace };
