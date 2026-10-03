// 创意工坊统一工作区 — 三域布局 store（规划 §1.2/§8）
// 结构复用 research-workbench/layout-store.ts 的已验证模式：
// Object.freeze 发布 + useSyncExternalStore 消费；
// docked/rail/overlay 三模态；断点 1440/1180/960；降级顺序固定（收左 rail → 压右 300 → 收右）；
// owner-scoped 持久化 debounce 500ms。

export type DockMode = "docked" | "rail" | "overlay";

export type WorkspaceLayoutSnapshot = {
  viewportWidth: number;
  leftMode: DockMode;
  leftWidth: number;
  rightMode: DockMode;
  rightWidth: number;
};

export const WORKSPACE_LAYOUT_LIMITS = {
  leftMin: 240,
  leftMax: 360,
  leftRailWidth: 56,
  leftDefault: 280,
  rightMin: 340,
  rightMax: 520,
  rightRailWidth: 52,
  rightDefault: 420,
  centerMin: 640,
  dockBreakpoint: 1440,
  railBreakpoint: 1180,
  overlayBreakpoint: 960,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function leftOccupied(snapshot: WorkspaceLayoutSnapshot): number {
  if (snapshot.leftMode === "overlay") return 0;
  return snapshot.leftMode === "docked" ? snapshot.leftWidth : WORKSPACE_LAYOUT_LIMITS.leftRailWidth;
}

function rightOccupied(snapshot: WorkspaceLayoutSnapshot): number {
  return snapshot.rightMode === "docked" ? snapshot.rightWidth : WORKSPACE_LAYOUT_LIMITS.rightRailWidth;
}

export function computeWorkspaceColumns(snapshot: WorkspaceLayoutSnapshot): {
  left: number;
  center: number;
  right: number;
  centerBelowMin: boolean;
} {
  const left = leftOccupied(snapshot);
  const right = rightOccupied(snapshot);
  const workspaceWidth = Math.max(0, Math.min(snapshot.viewportWidth - 32, 1440));
  const gaps = ((left > 0 ? 1 : 0) + (right > 0 ? 1 : 0)) * 12;
  const center = Math.max(0, workspaceWidth - left - right - gaps);
  return {
    left,
    center,
    right,
    centerBelowMin: center < WORKSPACE_LAYOUT_LIMITS.centerMin,
  };
}

// Dock resizing must leave room for the reading column, not just fit a nominal range.
// Overlay widths do not consume the reading column; retain their configured range.
export function workspaceResizeLimits(snapshot: WorkspaceLayoutSnapshot) {
  const columns = computeWorkspaceColumns(snapshot);
  const spare = columns.center - WORKSPACE_LAYOUT_LIMITS.centerMin;
  return {
    leftMax: snapshot.leftMode === "docked"
      ? Math.max(WORKSPACE_LAYOUT_LIMITS.leftMin, Math.min(WORKSPACE_LAYOUT_LIMITS.leftMax, snapshot.leftWidth + spare))
      : WORKSPACE_LAYOUT_LIMITS.leftMax,
    rightMax: snapshot.rightMode === "docked"
      ? Math.max(WORKSPACE_LAYOUT_LIMITS.rightMin, Math.min(WORKSPACE_LAYOUT_LIMITS.rightMax, snapshot.rightWidth + spare))
      : WORKSPACE_LAYOUT_LIMITS.rightMax,
  };
}

function fitDock(snapshot: WorkspaceLayoutSnapshot, side: "left" | "right"): Partial<WorkspaceLayoutSnapshot> {
  const modeKey = side === "left" ? "leftMode" : "rightMode";
  const widthKey = side === "left" ? "leftWidth" : "rightWidth";
  const minimum = side === "left" ? WORKSPACE_LAYOUT_LIMITS.leftMin : WORKSPACE_LAYOUT_LIMITS.rightMin;
  const probe = { ...snapshot, [modeKey]: "docked", [widthKey]: minimum } as WorkspaceLayoutSnapshot;
  if (computeWorkspaceColumns(probe).centerBelowMin) return { [modeKey]: "overlay" };
  const limit = workspaceResizeLimits(probe)[side === "left" ? "leftMax" : "rightMax"];
  return { [modeKey]: "docked", [widthKey]: Math.min(snapshot[widthKey], limit) };
}

export function workspaceLeftExpandMode(snapshot: WorkspaceLayoutSnapshot): DockMode {
  return fitDock(snapshot, "left").leftMode ?? "overlay";
}

export function createWorkspaceLayoutStore(initialViewport = 1600) {
  initialViewport = Number.isFinite(initialViewport) ? Math.max(0, Math.round(initialViewport)) : 1600;
  let snapshot: WorkspaceLayoutSnapshot = Object.freeze({
    viewportWidth: initialViewport,
    leftMode: "docked",
    leftWidth: WORKSPACE_LAYOUT_LIMITS.leftDefault,
    rightMode: initialViewport >= WORKSPACE_LAYOUT_LIMITS.dockBreakpoint ? "docked" : "overlay",
    rightWidth: WORKSPACE_LAYOUT_LIMITS.rightDefault,
  });
  const listeners = new Set<() => void>();
  let viewportRulesInitialized = false;

  function publish(next: Partial<WorkspaceLayoutSnapshot>): void {
    const merged = { ...snapshot, ...next };
    if (
      merged.viewportWidth === snapshot.viewportWidth &&
      merged.leftMode === snapshot.leftMode &&
      merged.leftWidth === snapshot.leftWidth &&
      merged.rightMode === snapshot.rightMode &&
      merged.rightWidth === snapshot.rightWidth
    ) {
      return;
    }
    snapshot = Object.freeze(merged);
    for (const listener of listeners) listener();
  }

  function applyViewportRules(width: number): Partial<WorkspaceLayoutSnapshot> {
    const patch: Partial<WorkspaceLayoutSnapshot> = { viewportWidth: width };
    if (width >= WORKSPACE_LAYOUT_LIMITS.dockBreakpoint) {
      // 三列停靠
      if (snapshot.leftMode !== "docked") patch.leftMode = "docked";
      if (snapshot.rightMode !== "docked") patch.rightMode = "docked";
    } else if (width >= WORKSPACE_LAYOUT_LIMITS.railBreakpoint) {
      // 左 rail + 右 docked
      patch.leftMode = "rail";
      patch.rightMode = "docked";
    } else if (width >= WORKSPACE_LAYOUT_LIMITS.overlayBreakpoint) {
      // 左 docked + 右 overlay（右占 0 停靠宽）
      patch.leftMode = "docked";
      patch.rightMode = "overlay";
    } else {
      // 两侧 rail/overlay 呈现
      patch.leftMode = "rail";
      patch.rightMode = "overlay";
    }

    // 中央最小宽保护：任何停靠组合不得把中央压到 640 以下
    if (width >= WORKSPACE_LAYOUT_LIMITS.overlayBreakpoint || width >= WORKSPACE_LAYOUT_LIMITS.railBreakpoint) {
      const probe: WorkspaceLayoutSnapshot = { ...snapshot, ...patch };
      const columns = computeWorkspaceColumns(probe);
      if (columns.centerBelowMin) {
        if (probe.rightMode === "docked") {
          patch.rightWidth = Math.max(WORKSPACE_LAYOUT_LIMITS.rightMin, probe.rightWidth - (WORKSPACE_LAYOUT_LIMITS.centerMin - columns.center));
        }
        const probe2: WorkspaceLayoutSnapshot = { ...snapshot, ...patch };
        if (computeWorkspaceColumns(probe2).centerBelowMin) {
          patch.leftMode = "rail";
        }
        if (computeWorkspaceColumns({ ...snapshot, ...patch }).centerBelowMin) patch.rightMode = "overlay";
      }
    }
    return patch;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): WorkspaceLayoutSnapshot {
      return snapshot;
    },

    setViewport(width: number): void {
      if (!Number.isFinite(width)) return;
      const nextWidth = Math.max(0, Math.round(width));
      // A keyboard or browser toolbar can change height without changing columns.
      // Apply the first responsive pass, then preserve user-opened panels when
      // resize reports the same width instead of resetting their modes.
      if (viewportRulesInitialized && nextWidth === snapshot.viewportWidth) return;
      viewportRulesInitialized = true;
      publish(applyViewportRules(nextWidth));
    },

    setLeftMode(mode: DockMode): void {
      if (!isDockMode(mode)) return;
      publish(mode === "docked" ? fitDock(snapshot, "left") : { leftMode: mode });
    },

    setLeftWidth(width: number): void {
      if (!Number.isFinite(width)) return;
      publish({ leftWidth: clamp(Math.round(width), WORKSPACE_LAYOUT_LIMITS.leftMin, workspaceResizeLimits(snapshot).leftMax) });
    },

    setRightMode(mode: DockMode): void {
      if (!isDockMode(mode)) return;
      publish(mode === "docked" ? fitDock(snapshot, "right") : { rightMode: mode });
    },

    setRightWidth(width: number): void {
      if (!Number.isFinite(width)) return;
      publish({ rightWidth: clamp(Math.round(width), WORKSPACE_LAYOUT_LIMITS.rightMin, workspaceResizeLimits(snapshot).rightMax) });
    },
  };
}

export type WorkspaceLayoutStore = ReturnType<typeof createWorkspaceLayoutStore>;

export type LayoutPersistenceIssue = "read" | "format" | "write";
type PersistenceOptions = {
  current?: () => boolean;
  onFailure?: (issue: LayoutPersistenceIssue) => void;
  onSaved?: () => void;
};
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function isDockMode(value: unknown): value is DockMode {
  return value === "docked" || value === "rail" || value === "overlay";
}
function normalizeSavedLayout(value: unknown): WorkspaceLayoutSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Partial<WorkspaceLayoutSnapshot>;
  if (typeof saved.viewportWidth !== "number" || !Number.isFinite(saved.viewportWidth) || saved.viewportWidth < 0 ||
      typeof saved.leftWidth !== "number" || !Number.isFinite(saved.leftWidth) || saved.leftWidth <= 0) return null;
  const rightWidth = saved.rightWidth ?? WORKSPACE_LAYOUT_LIMITS.rightDefault;
  const leftMode = saved.leftMode ?? "docked", rightMode = saved.rightMode ?? "docked";
  if (!isDockMode(leftMode) || !isDockMode(rightMode) || typeof rightWidth !== "number" || !Number.isFinite(rightWidth) || rightWidth <= 0) return null;
  return {
    viewportWidth: Math.round(saved.viewportWidth), leftMode, rightMode,
    leftWidth: clamp(Math.round(saved.leftWidth), WORKSPACE_LAYOUT_LIMITS.leftMin, WORKSPACE_LAYOUT_LIMITS.leftMax),
    rightWidth: clamp(Math.round(rightWidth), WORKSPACE_LAYOUT_LIMITS.rightMin, WORKSPACE_LAYOUT_LIMITS.rightMax),
  };
}

export function restoreWorkspaceLayoutStore(storage: StorageLike, storageKey: string, viewportWidth: number, current?: () => boolean) {
  let restoreIssue: LayoutPersistenceIssue | null = null;
  const persister = createWorkspaceLayoutPersister(storageKey, { current, onFailure: issue => { restoreIssue = issue; } });
  persister.attach(storage);
  const store = createWorkspaceLayoutStore(1600);
  const saved = persister.load();
  if (saved) {
    // Restore both preferred widths before applying the current viewport budget.
    // Do not clamp one restored side against the other side's temporary defaults.
    store.setLeftMode("rail"); store.setRightMode("overlay");
    store.setLeftWidth(saved.leftWidth); store.setRightWidth(saved.rightWidth);
    store.setLeftMode(saved.leftMode); store.setRightMode(saved.rightMode);
  }
  store.setViewport(viewportWidth);
  return { ...store, restoreIssue: restoreIssue as LayoutPersistenceIssue | null };
}

// Debounce repeated changes, but retain the last pending value until successful commit.
export function createWorkspaceLayoutPersister(storageKey: string, options: PersistenceOptions = {}) {
  let storage: StorageLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: WorkspaceLayoutSnapshot | null = null;
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancel = () => { clearTimer(); pending = null; };
  function flush(): boolean {
    clearTimer();
    if (!pending) return true;
    if (!storage) return false;
    try {
      if (options.current && !options.current()) { cancel(); return false; }
      storage.setItem(storageKey, JSON.stringify(pending));
      pending = null;
    } catch { options.onFailure?.("write"); return false; }
    options.onSaved?.(); return true;
  }
  return {
    attach(target: StorageLike) { storage = target; },
    save(snapshot: WorkspaceLayoutSnapshot): void {
      if (!storage) return;
      const normalized = normalizeSavedLayout(snapshot);
      if (!normalized) { options.onFailure?.("format"); return; }
      pending = Object.freeze(normalized);
      clearTimer(); timer = setTimeout(flush, 500);
    },
    flush, cancel,
    load(): WorkspaceLayoutSnapshot | null {
      if (!storage) return null;
      let raw: string | null;
      try {
        if (options.current && !options.current()) return null;
        raw = storage.getItem(storageKey);
      } catch { options.onFailure?.("read"); return null; }
      if (!raw) return null;
      try {
        const normalized = normalizeSavedLayout(JSON.parse(raw));
        if (!normalized) options.onFailure?.("format");
        return normalized;
      } catch { options.onFailure?.("format"); return null; }
    },
  };
}
