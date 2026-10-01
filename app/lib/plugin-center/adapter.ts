// 插件中心 — Adapter 接口与共享类型（规划 §8.2）
// 零运行时 import 约束同 research-runtime。

import type { PluginPermissionTier } from "./types";

export type DataOwnerLike = { kind: "guest" } | { kind: "account"; userId: number };

export type {
  CatalogPage,
  CatalogQuery,
  InstallConfirmation,
  InstallPreview,
  PluginEvent,
  PluginEventHandler,
  PluginGeneration,
  PluginPackage,
  PluginSource,
  PluginSubscription,
  ProjectPluginBinding,
  ProjectPluginBindingInput,
  QuarantineEntry,
  UninstallResult,
} from "./types";

export type ChangeVersionOptions = {
  acceptedPermissionTier?: PluginPermissionTier;
};

export interface PluginCenterAdapter {
  uploadLocalPackage?(file: File): Promise<PluginSourceLike>;
  unbindProjectPlugin?(projectId: string, pluginId: string): Promise<void>;
  getGenerationHistory?(projectId: string): Promise<PluginGenerationLike[]>;
  listBuilds?(previewId?: string): Promise<import("./types").PluginBuildRecord[]>;
  searchCatalog(query: CatalogQueryLike): Promise<CatalogPageLike>;
  resolveSource(source: PluginSourceLike): Promise<InstallPreviewLike>;
  install(previewId: string, confirmation: InstallConfirmationLike): Promise<PluginPackageLike>;
  listAccountPackages(): Promise<PluginPackageLike[]>;
  listProjectBindings(projectId: string): Promise<ProjectPluginBindingLike[]>;
  bindProjectPlugin(projectId: string, input: ProjectPluginBindingInputLike): Promise<void>;
  changeProjectVersion(
    projectId: string,
    pluginId: string,
    version: string,
    options?: ChangeVersionOptions,
  ): Promise<void>;
  disableProjectPlugin(projectId: string, pluginId: string): Promise<void>;
  uninstallVersion(pluginId: string, version: string): Promise<UninstallResultLike>;
  listQuarantined(): Promise<QuarantineEntryLike[]>;
  restoreQuarantined(quarantineId: string): Promise<{ pluginId: string; version: string }>;
  purgeQuarantined(quarantineId: string): Promise<void>;
  getProjectGeneration(projectId: string): Promise<PluginGenerationLike | null>;
  restartGeneration(projectId: string): Promise<PluginGenerationLike>;
  enterSafeMode(projectId: string): Promise<PluginGenerationLike>;
  rollbackGeneration(projectId: string, generationId: string): Promise<PluginGenerationLike>;
  subscribe(
    projectId: string | null,
    afterSeq: number,
    handler: PluginEventHandlerLike,
  ): PluginSubscriptionLike;
  dispose(): void;
}

// 本地别名（零 import 依赖约束下的形状声明，与 types.ts 一一对应）
export type CatalogQueryLike = import("./types").CatalogQuery;
export type CatalogPageLike = import("./types").CatalogPage;
export type InstallPreviewLike = import("./types").InstallPreview;
export type InstallConfirmationLike = import("./types").InstallConfirmation;
export type PluginPackageLike = import("./types").PluginPackage;
export type ProjectPluginBindingLike = import("./types").ProjectPluginBinding;
export type ProjectPluginBindingInputLike = import("./types").ProjectPluginBindingInput;
export type UninstallResultLike = import("./types").UninstallResult;
export type QuarantineEntryLike = import("./types").QuarantineEntry;
export type PluginGenerationLike = import("./types").PluginGeneration;
export type PluginEventHandlerLike = import("./types").PluginEventHandler;
export type PluginSubscriptionLike = import("./types").PluginSubscription;
export type PluginSourceLike = import("./types").PluginSource;
