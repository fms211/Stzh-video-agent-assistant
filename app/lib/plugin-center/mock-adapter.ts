// 插件中心 — Mock Adapter（规划 Task 10：确定性安装、版本、Generation、恢复状态机）
// 存储键：tszh:v2:${ownerScope(owner)}:plugin-center
// dispose() 清理 timer 与订阅但不删除数据；dispose 后所有 API 抛 AUTH_REQUIRED。
// 演示数据来自 mock-fixtures；crashesGeneration 包触发 Generation failed 链路。

import type {
  CatalogPage,
  CatalogQuery,
  InstallConfirmation,
  InstallPreview,
  JsonValue,
  PluginEvent,
  PluginGeneration,
  PluginManifestV1,
  PluginPackage,
  PluginPermissionTier,
  PluginSource,
  ProjectPluginBinding,
  ProjectPluginBindingInput,
  QuarantineEntry,
  UninstallResult,
} from "./types";
import type { DataOwnerLike } from "./adapter";
import { FIXTURES, findFixture, sha256Hex } from "./mock-fixtures.ts";

// ---- 基础工具（零依赖约束下的本地实现）----

function ownerScope(owner: DataOwnerLike): string {
  return owner.kind === "guest" ? "guest" : `user:${owner.userId}`;
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function storageKey(owner: DataOwnerLike): string {
  return `tszh:v2:${ownerScope(owner)}:plugin-center`;
}

export class PluginAdapterError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.code = code;
    this.name = "PluginAdapterError";
  }
}

const TIER_RANK: Record<PluginPermissionTier, number> = { safe: 0, standard: 1, full: 2 };
const GEN_DELAY_MS = 120;
const QUARANTINE_DAYS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---- 持久化状态 ----

type GenSnapshot = { id: string; bindings: Array<{ pluginId: string; version: string; permissionTier: PluginPermissionTier }> };

type PersistedState = {
  packages: PluginPackage[];
  bindings: ProjectPluginBinding[];
  generations: Record<string, PluginGeneration | undefined>;
  genHistory: Record<string, PluginGeneration[] | undefined>;
  lastKnownGood: Record<string, GenSnapshot | undefined>;
  events: PluginEvent[];
  quarantine: QuarantineEntry[];
};

function emptyState(): PersistedState {
  return { packages: [], bindings: [], generations: {}, genHistory: {}, lastKnownGood: {}, events: [], quarantine: [] };
}

function loadState(storage: StorageLike, key: string): PersistedState {
  const raw = storage.getItem(key);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

export type MockPluginCenterAdapterOptions = {
  owner: DataOwnerLike;
  storage: StorageLike;
};

export function createMockPluginCenterAdapter(options: MockPluginCenterAdapterOptions) {
  const { owner, storage } = options;
  const key = storageKey(owner);
  const userId = owner.kind === "account" ? owner.userId : 0;

  let disposed = false;
  let previewCounter = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const previews = new Map<string, InstallPreview>();
  const subscribers = new Set<{ projectId: string | null; handler: { onEvent(event: PluginEvent): void; onError(error: Error): void } }>();

  function assertNotDisposed(): void {
    if (disposed) throw new PluginAdapterError("AUTH_REQUIRED", "adapter disposed");
  }

  function persist(state: PersistedState): void {
    if (disposed) return;
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch {
      // 演示存储写失败不中断
    }
  }

  function emit(state: PersistedState, type: PluginEvent["type"], payload: Record<string, JsonValue>, projectId: string | null, generationId: string | null): void {
    const event: PluginEvent = {
      version: 1,
      userId,
      projectId,
      generationId,
      seq: state.events.length + 1,
      type,
      occurredAt: nowIso(),
      payload,
    };
    state.events.push(event);
    for (const sub of subscribers) {
      if (sub.projectId !== null && event.projectId !== sub.projectId) continue;
      try {
        sub.handler.onEvent(event);
      } catch {
        // 订阅者异常不影响运行时
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

  function refreshReferences(state: PersistedState): void {
    for (const pkg of state.packages) {
      pkg.referencedProjectIds = [...new Set(state.bindings.filter((b) => b.pluginId === pkg.pluginId && b.version === pkg.version).map((b) => b.projectId))];
    }
  }

  // ---- 目录与解析 ----

  async function searchCatalog(query: CatalogQuery): Promise<CatalogPage> {
    assertNotDisposed();
    const state = loadState(storage, key);
    void state;
    const text = query.text.trim().toLowerCase();
    let items = FIXTURES.map((fixture) => ({ manifest: fixture.manifest, source: fixture.source, publisher: fixture.publisher }));
    if (text) {
      items = items.filter((item) => item.manifest.name.toLowerCase().includes(text) || item.manifest.description.toLowerCase().includes(text));
    }
    if (query.signature === "verified") {
      items = items.filter((item) => FIXTURES.find((f) => f.manifest.id === item.manifest.id && f.manifest.version === item.manifest.version)?.signatureStatus === "verified");
    } else if (query.signature === "unsigned") {
      items = items.filter((item) => FIXTURES.find((f) => f.manifest.id === item.manifest.id && f.manifest.version === item.manifest.version)?.signatureStatus !== "verified");
    }
    if (query.permissionTier) {
      items = items.filter((item) => item.manifest.requestedPermissionTier === query.permissionTier);
    }
    const offset = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0;
    const page = items.slice(offset, offset + Math.max(1, query.limit));
    const nextCursor = offset + page.length < items.length ? String(offset + page.length) : null;
    return { items: deepClone(page), nextCursor };
  }

  function fixtureForSource(source: PluginSource) {
    switch (source.type) {
      case "catalog":
        return findFixture(source.catalogId, source.version);
      case "npm":
        return FIXTURES.find((f) => f.source.type === "npm") ?? null;
      case "git":
        return FIXTURES.find((f) => f.source.type === "git") ?? null;
      case "local":
        return FIXTURES.find((f) => f.source.type === "local") ?? null;
    }
  }

  function resolvedRefFor(source: PluginSource, hash: string): string {
    switch (source.type) {
      case "catalog":
        return `${source.catalogId}@${source.version}`;
      case "npm":
        return `npm:${source.spec}`;
      case "git":
        return `git:${hash.slice(0, 12)}`;
      case "local":
        return `local:${source.fileName}`;
    }
  }

  async function resolveSource(source: PluginSource): Promise<InstallPreview> {
    assertNotDisposed();
    const fixture = fixtureForSource(source);
    if (!fixture) throw new PluginAdapterError("SOURCE_RESOLUTION_FAILED", "no demo fixture for source");
    const contentHash = sha256Hex(JSON.stringify({ id: fixture.manifest.id, version: fixture.manifest.version, source }));
    const resolvedRef = resolvedRefFor(source, contentHash);
    previewCounter += 1;
    const preview: InstallPreview = {
      previewId: `preview-${previewCounter}-${Math.random().toString(36).slice(2, 8)}`,
      previewHash: sha256Hex(JSON.stringify({ manifest: fixture.manifest, resolvedRef, contentHash })),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      source: deepClone(source),
      resolvedRef,
      contentHash,
      signatureStatus: fixture.signatureStatus,
      manifest: deepClone(fixture.manifest),
      dependencies: deepClone(fixture.dependencies),
      buildScripts: deepClone(fixture.buildScripts),
      strongSandboxAvailable: fixture.strongSandboxAvailable,
    };
    previews.set(preview.previewId, preview);
    return deepClone(preview);
  }

  async function install(previewId: string, confirmation: InstallConfirmation): Promise<PluginPackage> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const preview = previews.get(previewId);
    if (!preview) throw new PluginAdapterError("PREVIEW_EXPIRED", "preview not found or expired");
    if (Date.now() > Date.parse(preview.expiresAt)) throw new PluginAdapterError("PREVIEW_EXPIRED");
    if (confirmation.previewHash !== preview.previewHash) {
      throw new PluginAdapterError("PREVIEW_HASH_MISMATCH", "source changed since preview");
    }

    emit(state, "install.started", { pluginId: preview.manifest.id, version: preview.manifest.version }, null, null);

    const pkg: PluginPackage = {
      installationId: `inst-${Math.random().toString(36).slice(2, 10)}`,
      pluginId: preview.manifest.id,
      version: preview.manifest.version,
      source: deepClone(preview.source),
      resolvedRef: preview.resolvedRef,
      contentHash: preview.contentHash,
      signatureStatus: preview.signatureStatus,
      manifest: deepClone(preview.manifest),
      installStatus: "installed",
      referencedProjectIds: [],
      installedAt: nowIso(),
    };
    const existingIndex = state.packages.findIndex((p) => p.pluginId === pkg.pluginId && p.version === pkg.version);
    if (existingIndex >= 0) state.packages[existingIndex] = pkg;
    else state.packages.push(pkg);
    refreshReferences(state);
    emit(state, "install.completed", { pluginId: pkg.pluginId, version: pkg.version, contentHash: pkg.contentHash, signatureStatus: pkg.signatureStatus }, null, null);
    persist(state);
    return deepClone(pkg);
  }

  // ---- 账户库与绑定 ----

  async function listAccountPackages(): Promise<PluginPackage[]> {
    assertNotDisposed();
    const state = loadState(storage, key);
    refreshReferences(state);
    persist(state);
    return deepClone(state.packages);
  }

  async function listProjectBindings(projectId: string): Promise<ProjectPluginBinding[]> {
    assertNotDisposed();
    const state = loadState(storage, key);
    return deepClone(state.bindings.filter((b) => b.projectId === projectId));
  }

  function scheduleGeneration(state: PersistedState, projectId: string): void {
    const enabledBindings = state.bindings
      .filter((b) => b.projectId === projectId && b.enabled)
      .map((b) => ({ pluginId: b.pluginId, version: b.version, permissionTier: b.permissionTier }));
    const prev = state.generations[projectId];
    const gen: PluginGeneration = {
      id: `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      packageSetHash: sha256Hex(JSON.stringify(enabledBindings)),
      bindings: enabledBindings,
      status: "starting",
      suspectedPluginIds: [],
      lastKnownGoodId: state.lastKnownGood[projectId]?.id ?? null,
    };
    state.generations[projectId] = gen;
    const history = state.genHistory[projectId] ?? [];
    history.push(gen);
    state.genHistory[projectId] = history.slice(-10);
    emit(state, "generation.starting", { projectId, generationId: gen.id }, projectId, gen.id);
    persist(state);

    schedule(() => {
      const s2 = loadState(storage, key);
      const live = s2.generations[projectId];
      if (!live || live.id !== gen.id) return;
      const crashy = live.bindings.find((b) => findFixture(b.pluginId, b.version)?.crashesGeneration);
      if (crashy) {
        live.status = "failed";
        live.suspectedPluginIds = [crashy.pluginId];
        emit(s2, "generation.failed", { projectId, generationId: live.id, suspected: live.suspectedPluginIds }, projectId, live.id);
      } else {
        live.status = "healthy";
        s2.lastKnownGood[projectId] = { id: live.id, bindings: deepClone(live.bindings) };
        emit(s2, "generation.healthy", { projectId, generationId: live.id }, projectId, live.id);
      }
      persist(s2);
    }, GEN_DELAY_MS);
  }

  async function bindProjectPlugin(projectId: string, input: ProjectPluginBindingInput): Promise<void> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const pkg = state.packages.find((p) => p.pluginId === input.pluginId && p.version === input.version);
    if (!pkg) throw new PluginAdapterError("PLUGIN_VERSION_NOT_FOUND", `${input.pluginId}@${input.version}`);
    if (TIER_RANK[input.permissionTier] < TIER_RANK[pkg.manifest.requestedPermissionTier]) {
      throw new PluginAdapterError("PERMISSION_TIER_TOO_LOW", `requested ${pkg.manifest.requestedPermissionTier}, got ${input.permissionTier}`);
    }
    const binding: ProjectPluginBinding = { projectId, ...deepClone(input) };
    const index = state.bindings.findIndex((b) => b.projectId === projectId && b.pluginId === input.pluginId);
    if (index >= 0) state.bindings[index] = binding;
    else state.bindings.push(binding);
    refreshReferences(state);
    emit(state, "binding.updated", { projectId, pluginId: input.pluginId, version: input.version, enabled: binding.enabled }, projectId, null);
    persist(state);
    if (binding.enabled) scheduleGeneration(state, projectId);
  }

  async function changeProjectVersion(projectId: string, pluginId: string, version: string, changeOptions?: { acceptedPermissionTier?: PluginPermissionTier }): Promise<void> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const binding = state.bindings.find((b) => b.projectId === projectId && b.pluginId === pluginId);
    if (!binding) throw new PluginAdapterError("PLUGIN_NOT_FOUND", pluginId);
    const targetPkg = state.packages.find((p) => p.pluginId === pluginId && p.version === version);
    if (!targetPkg) throw new PluginAdapterError("PLUGIN_VERSION_NOT_FOUND", `${pluginId}@${version}`);
    const needed = targetPkg.manifest.requestedPermissionTier;
    const effectiveTier = changeOptions?.acceptedPermissionTier ?? binding.permissionTier;
    if (TIER_RANK[effectiveTier] < TIER_RANK[needed]) {
      throw new PluginAdapterError("RISK_CONFIRMATION_REQUIRED", `version ${version} requests ${needed}`);
    }
    binding.version = version;
    binding.installationId = targetPkg.installationId;
    binding.permissionTier = effectiveTier;
    emit(state, "binding.updated", { projectId, pluginId, version, permissionTier: binding.permissionTier }, projectId, null);
    persist(state);
    if (binding.enabled) scheduleGeneration(state, projectId);
  }

  async function disableProjectPlugin(projectId: string, pluginId: string): Promise<void> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const binding = state.bindings.find((b) => b.projectId === projectId && b.pluginId === pluginId);
    if (!binding) throw new PluginAdapterError("PLUGIN_NOT_FOUND", pluginId);
    binding.enabled = false;
    emit(state, "binding.updated", { projectId, pluginId, enabled: false }, projectId, null);
    persist(state);
    scheduleGeneration(state, projectId);
  }

  // ---- 卸载与隔离区 ----

  async function uninstallVersion(pluginId: string, version: string): Promise<UninstallResult> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const pkg = state.packages.find((p) => p.pluginId === pluginId && p.version === version);
    if (!pkg) throw new PluginAdapterError("PLUGIN_VERSION_NOT_FOUND", `${pluginId}@${version}`);
    const referencing = [...new Set(state.bindings.filter((b) => b.pluginId === pluginId && b.version === version).map((b) => b.projectId))];
    if (referencing.length > 0) {
      return { status: "blocked", projectIds: referencing };
    }
    state.packages = state.packages.filter((p) => !(p.pluginId === pluginId && p.version === version));
    const entry: QuarantineEntry = {
      quarantineId: `q-${Math.random().toString(36).slice(2, 10)}`,
      pluginId,
      version,
      manifestName: pkg.manifest.name,
      deletedAt: nowIso(),
      expiresAt: new Date(Date.now() + QUARANTINE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      hadProjects: [],
    };
    state.quarantine.push(entry);
    emit(state, "data.quarantined", { pluginId, version, quarantineId: entry.quarantineId }, null, null);
    persist(state);
    return { status: "deleted", projectIds: [] };
  }

  async function listQuarantined(): Promise<QuarantineEntry[]> {
    assertNotDisposed();
    const state = loadState(storage, key);
    return deepClone(state.quarantine);
  }

  async function restoreQuarantined(quarantineId: string): Promise<{ pluginId: string; version: string }> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const entry = state.quarantine.find((q) => q.quarantineId === quarantineId);
    if (!entry) throw new PluginAdapterError("PLUGIN_NOT_FOUND", quarantineId);
    const fixture = findFixture(entry.pluginId, entry.version);
    if (!fixture) throw new PluginAdapterError("PLUGIN_NOT_FOUND", `${entry.pluginId}@${entry.version}`);
    const pkg: PluginPackage = {
      installationId: `inst-${Math.random().toString(36).slice(2, 10)}`,
      pluginId: fixture.manifest.id,
      version: fixture.manifest.version,
      source: deepClone(fixture.source),
      resolvedRef: resolvedRefFor(fixture.source, sha256Hex(entry.pluginId + entry.version)),
      contentHash: sha256Hex(JSON.stringify({ id: fixture.manifest.id, version: fixture.manifest.version })),
      signatureStatus: fixture.signatureStatus,
      manifest: deepClone(fixture.manifest),
      installStatus: "installed",
      referencedProjectIds: [],
      installedAt: nowIso(),
    };
    state.packages.push(pkg);
    state.quarantine = state.quarantine.filter((q) => q.quarantineId !== quarantineId);
    emit(state, "data.restored", { pluginId: entry.pluginId, version: entry.version }, null, null);
    persist(state);
    return { pluginId: entry.pluginId, version: entry.version };
  }

  async function purgeQuarantined(quarantineId: string): Promise<void> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const entry = state.quarantine.find((q) => q.quarantineId === quarantineId);
    if (!entry) throw new PluginAdapterError("PLUGIN_NOT_FOUND", quarantineId);
    state.quarantine = state.quarantine.filter((q) => q.quarantineId !== quarantineId);
    emit(state, "data.purged", { pluginId: entry.pluginId, version: entry.version, quarantineId }, null, null);
    persist(state);
  }

  // ---- Generation 生命周期 ----

  async function getProjectGeneration(projectId: string): Promise<PluginGeneration | null> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const stored = state.generations[projectId];
    if (stored) return deepClone(stored);
    return {
      id: `gen-empty-${projectId}`,
      projectId,
      packageSetHash: sha256Hex("[]"),
      bindings: [],
      status: "healthy",
      suspectedPluginIds: [],
      lastKnownGoodId: null,
    };
  }

  async function restartGeneration(projectId: string): Promise<PluginGeneration> {
    assertNotDisposed();
    const state = loadState(storage, key);
    scheduleGeneration(state, projectId);
    return deepClone(state.generations[projectId]!);
  }

  async function enterSafeMode(projectId: string): Promise<PluginGeneration> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const gen: PluginGeneration = {
      id: `gen-safe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      packageSetHash: sha256Hex("[]"),
      bindings: [],
      status: "healthy",
      suspectedPluginIds: [],
      lastKnownGoodId: state.lastKnownGood[projectId]?.id ?? state.generations[projectId]?.id ?? null,
    };
    state.generations[projectId] = gen;
    const history = state.genHistory[projectId] ?? [];
    history.push(gen);
    state.genHistory[projectId] = history.slice(-10);
    emit(state, "safe-mode.entered", { projectId, generationId: gen.id }, projectId, gen.id);
    persist(state);
    return deepClone(gen);
  }

  async function rollbackGeneration(projectId: string, generationId: string): Promise<PluginGeneration> {
    assertNotDisposed();
    const state = loadState(storage, key);
    const history = state.genHistory[projectId] ?? [];
    const snapshot = history.find((g) => g.id === generationId);
    if (!snapshot) throw new PluginAdapterError("GENERATION_CONFLICT", `generation ${generationId} not found for ${projectId}`);
    const gen: PluginGeneration = {
      id: `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      packageSetHash: sha256Hex(JSON.stringify(snapshot.bindings)),
      bindings: deepClone(snapshot.bindings),
      status: "healthy",
      suspectedPluginIds: [],
      lastKnownGoodId: generationId,
    };
    state.generations[projectId] = gen;
    state.lastKnownGood[projectId] = { id: gen.id, bindings: deepClone(snapshot.bindings) };
    history.push(gen);
    state.genHistory[projectId] = history.slice(-10);
    emit(state, "generation.rolled-back", { projectId, generationId: gen.id, restoredFrom: generationId }, projectId, gen.id);
    persist(state);
    return deepClone(gen);
  }

  // ---- 订阅与生命周期 ----

  function subscribe(projectId: string | null, afterSeq: number, handler: { onEvent(event: PluginEvent): void; onError(error: Error): void }): { close(): void } {
    assertNotDisposed();
    const sub = { projectId, handler };
    subscribers.add(sub);
    const state = loadState(storage, key);
    for (const event of state.events) {
      if (event.seq <= afterSeq) continue;
      if (projectId !== null && event.projectId !== projectId) continue;
      try {
        handler.onEvent(event);
      } catch {
        // 回放异常忽略
      }
    }
    return {
      close() {
        subscribers.delete(sub);
      },
    };
  }

  function dispose(): void {
    disposed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    subscribers.clear();
  }

  return {
    searchCatalog,
    resolveSource,
    install,
    listAccountPackages,
    listProjectBindings,
    bindProjectPlugin,
    changeProjectVersion,
    disableProjectPlugin,
    uninstallVersion,
    listQuarantined,
    restoreQuarantined,
    purgeQuarantined,
    getProjectGeneration,
    restartGeneration,
    enterSafeMode,
    rollbackGeneration,
    subscribe,
    dispose,
  };
}

export type MockPluginCenterAdapter = ReturnType<typeof createMockPluginCenterAdapter>;
export type { PluginManifestV1 };
