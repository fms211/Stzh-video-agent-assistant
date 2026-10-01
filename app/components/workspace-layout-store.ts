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

export function createWorkspaceLayoutStore(initialViewport = 1600) {
  let snapshot: WorkspaceLayoutSnapshot = Object.freeze({
    viewportWidth: initialViewport,
    leftMode: "docked",
    leftWidth: WORKSPACE_LAYOUT_LIMITS.leftDefault,
    rightMode: initialViewport >= WORKSPACE_LAYOUT_LIMITS.dockBreakpoint ? "docked" : "overlay",
    rightWidth: WORKSPACE_LAYOUT_LIMITS.rightDefault,
  });
  const listeners = new Set<() => void>();

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
      publish(applyViewportRules(Math.max(0, Math.round(width))));
    },

    setLeftMode(mode: DockMode): void {
      publish({ leftMode: mode });
    },

    setLeftWidth(width: number): void {
      publish({ leftWidth: clamp(Math.round(width), WORKSPACE_LAYOUT_LIMITS.leftMin, WORKSPACE_LAYOUT_LIMITS.leftMax) });
    },

    setRightMode(mode: DockMode): void {
      publish({ rightMode: mode });
    },

    setRightWidth(width: number): void {
      publish({ rightWidth: clamp(Math.round(width), WORKSPACE_LAYOUT_LIMITS.rightMin, WORKSPACE_LAYOUT_LIMITS.rightMax) });
    },
  };
}

export type WorkspaceLayoutStore = ReturnType<typeof createWorkspaceLayoutStore>;

export function restoreWorkspaceLayoutStore(storage: StorageLike, storageKey: string, viewportWidth: number) {
  const persister = createWorkspaceLayoutPersister(storageKey);
  persister.attach(storage);
  const store = createWorkspaceLayoutStore(1600);
  const saved = persister.load();
  if (saved) {
    store.setViewport(saved.viewportWidth);
    store.setLeftWidth(saved.leftWidth);
    store.setRightWidth(saved.rightWidth);
    store.setLeftMode(saved.leftMode);
    store.setRightMode(saved.rightMode);
  }
  store.setViewport(viewportWidth);
  return store;
}

// ---- owner-scoped 持久化（debounce 500ms）----

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function createWorkspaceLayoutPersister(storageKey: string) {
  let storage: StorageLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    attach(target: StorageLike) {
      storage = target;
    },
    save(snapshot: WorkspaceLayoutSnapshot): void {
      if (!storage) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        storage?.setItem(storageKey, JSON.stringify(snapshot));
      }, 500);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    load(): WorkspaceLayoutSnapshot | null {
      if (!storage) return null;
      try {
        const raw = storage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<WorkspaceLayoutSnapshot>;
        if (typeof parsed.viewportWidth !== "number" || typeof parsed.leftWidth !== "number") return null;
        return {
          viewportWidth: parsed.viewportWidth,
          leftMode: parsed.leftMode || "docked",
          leftWidth: parsed.leftWidth,
          rightMode: parsed.rightMode || "docked",
          rightWidth: parsed.rightWidth || WORKSPACE_LAYOUT_LIMITS.rightDefault,
        };
      } catch {
        return null;
      }
    },
  };
}
