// 插件中心 — 领域契约
// 来源：docs/superpowers/plans/2026-08-28-Hermes风格研究运行工作台-Web原型技术与执行规划.md §7.5/§8.2
// 命名为 Mock Adapter 与未来 HTTP Adapter 的共同契约，不得自行改名。
// 零运行时依赖（node:test 原生 type-stripping 约束），JsonValue 复制自 research-runtime 以维持零 import。

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

// ---- §7.5 Manifest V1 ----

export type PluginPermissionTier = "safe" | "standard" | "full";

export type PluginSlotName =
  | "home.quickActions"
  | "chat.composer.actions"
  | "chat.message.after"
  | "studio.workflowCatalog"
  | "studio.promptRail"
  | "studio.workbench.toolbar"
  | "studio.workbench.inspector"
  | "modelCenter.actions"
  | "taskCenter.detailActions"
  | "gallery.itemActions"
  | "stats.cards"
  | "settings.sections";

export type ToolContribution = {
  name: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
  outputSchema: Record<string, JsonValue>;
  risk: "read" | "write" | "external";
  timeoutMs: number;
};

export type WorkflowContribution = {
  id: string;
  title: string;
  description: string;
  entryTool: string | null;
  uiSurfaceId: string | null;
};

export type SlotContribution = {
  slot: PluginSlotName;
  uiSurfaceId: string;
  order: number;
};

export type PageContribution = {
  id: string;
  title: string;
  uiSurfaceId: string;
};

export type PluginManifestV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  engine: { stzh: string };
  entrypoints: {
    host?: string;
    ui?: string;
  };
  contributes: {
    tools?: ToolContribution[];
    workflows?: WorkflowContribution[];
    slots?: SlotContribution[];
    pages?: PageContribution[];
  };
  requestedPermissionTier: PluginPermissionTier;
  runtimeNetwork?: {
    publicInternet: boolean;
    allowedDomains?: string[];
  };
};

// ---- §8.2 Adapter 数据类型 ----

export type PluginSource =
  | { type: "catalog"; catalogId: string; version: string }
  | { type: "npm"; spec: string }
  | { type: "git"; url: string; ref: string | null }
  | { type: "local"; uploadToken: string; fileName: string; contentHash: string };

export type PluginPackage = {
  installationId: string;
  pluginId: string;
  version: string;
  source: PluginSource;
  resolvedRef: string;
  contentHash: string;
  signatureStatus: "verified" | "unsigned" | "invalid";
  manifest: PluginManifestV1;
  installStatus: "resolving" | "installing" | "installed" | "failed" | "quarantined";
  referencedProjectIds: string[];
  installedAt: string;
};

export type ProjectPluginBinding = {
  projectId: string;
  pluginId: string;
  version: string;
  installationId: string;
  permissionTier: PluginPermissionTier;
  enabled: boolean;
  config: Record<string, JsonValue>;
};

export type PluginEvent = {
  version: 1;
  userId: number;
  projectId: string | null;
  generationId: string | null;
  seq: number;
  type:
    | "install.started"
    | "install.completed"
    | "install.failed"
    | "binding.updated"
    | "generation.starting"
    | "generation.healthy"
    | "generation.failed"
    | "generation.stopped"
    | "safe-mode.entered"
    | "safe-mode.exited"
    | "generation.rolled-back"
    | "risk.confirmed"
    | "data.quarantined"
    | "data.restored"
    | "data.purged";
  occurredAt: string;
  payload: Record<string, JsonValue>;
};

export type PluginErrorCode =
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_VERSION_NOT_FOUND"
  | "SOURCE_RESOLUTION_FAILED"
  | "PREVIEW_EXPIRED"
  | "PREVIEW_HASH_MISMATCH"
  | "INVALID_MANIFEST"
  | "INCOMPATIBLE_ENGINE"
  | "PACKAGE_BOUNDARY_VIOLATION"
  | "PACKAGE_TOO_LARGE"
  | "SIGNATURE_INVALID"
  | "PERMISSION_TIER_TOO_LOW"
  | "VERSION_IN_USE"
  | "GENERATION_CONFLICT"
  | "RISK_CONFIRMATION_REQUIRED"
  | "BRIDGE_UNAUTHORIZED"
  | "AUTH_REQUIRED";

export type CatalogQuery = {
  text: string;
  category: string | null;
  signature: "all" | "verified" | "unsigned";
  permissionTier: PluginPermissionTier | null;
  cursor: string | null;
  limit: number;
};

export type CatalogPage = {
  items: Array<{ manifest: PluginManifestV1; source: PluginSource; publisher: string }>;
  nextCursor: string | null;
};

export type InstallPreview = {
  previewId: string;
  previewHash: string;
  expiresAt: string;
  source: PluginSource;
  resolvedRef: string;
  contentHash: string;
  signatureStatus: PluginPackage["signatureStatus"];
  manifest: PluginManifestV1;
  dependencies: Array<{ name: string; version: string }>;
  buildScripts: Array<{ name: string; command: string }>;
  strongSandboxAvailable: boolean;
  dependencyLockHash?: string | null;
};

export type InstallConfirmation = {
  previewHash: string;
  acceptedPermissionTier: PluginPermissionTier;
  acceptsUnsignedRisk: boolean;
  acceptsOpenInternetBuildScripts: boolean;
  acceptsWeakSandboxRisk: boolean;
};

export type ProjectPluginBindingInput = Omit<ProjectPluginBinding, "projectId">;
export type UninstallResult = { status: "deleted" | "blocked" | "quarantined"; projectIds: string[] };
export type PluginEventHandler = { onEvent(event: PluginEvent): void; onError(error: Error): void };
export type PluginSubscription = { close(): void };

export type PluginBuildRecord = {
  id: string;
  previewId: string | null;
  phase: "resolve" | "build";
  status: "running" | "completed" | "failed";
  records: Array<{ command: string[]; elapsedMs: number; exitCode: number | null; output: string }>;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

// ---- §7.8 Generation ----

export type PluginGeneration = {
  id: string;
  projectId: string;
  packageSetHash: string;
  bindings: Array<{
    pluginId: string;
    version: string;
    permissionTier: PluginPermissionTier;
  }>;
  status: "starting" | "healthy" | "failed" | "stopped";
  suspectedPluginIds: string[];
  lastKnownGoodId?: string | null;
  error?: { code: string; message: string };
};

// ---- 隔离区（§7.2 数据保留）----

export type QuarantineEntry = {
  quarantineId: string;
  pluginId: string;
  version: string;
  manifestName: string;
  deletedAt: string;
  expiresAt: string;
  hadProjects: string[];
};
