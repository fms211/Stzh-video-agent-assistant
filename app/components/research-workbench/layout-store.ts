// 研究运行工作台 — 布局状态 store（useSyncExternalStore 外部状态）
// 规划 Task 3 / DSH 借鉴：
// - Snapshot 字段固定：viewportWidth / promptMode / promptWidth / inspectorOpen / inspectorWidth / activeInspectorTab
// - Object.freeze 发布新 snapshot；React 经 useSyncExternalStore 订阅
// - 响应式降级顺序固定：收回固定提示词面板 → 压缩右检查器到 300px → 收起右检查器
// - 中央区最小 640px；检查器 300–480px；提示词固定 300–420px，收起轨 56px

import type { ResearchInspectorTab } from "./inspector-types";

export type PromptRailMode = "rail" | "overlay" | "pinned";

export type ResearchLayoutSnapshot = {
  viewportWidth: number;
  promptMode: PromptRailMode;
  promptWidth: number;
  inspectorOpen: boolean;
  inspectorWidth: number;
  activeInspectorTab: ResearchInspectorTab;
};

export const RESEARCH_LAYOUT_LIMITS = {
  railWidth: 56,
  promptMin: 300,
  promptMax: 420,
  inspectorMin: 300,
  inspectorMax: 480,
  centerMin: 640,
  dockBreakpoint: 1280, // >= 1280 三列停靠
  overlayBreakpoint: 1024, // < 1024 全部侧滑层
} as const;

export const DEFAULT_INSPECTOR_TAB: ResearchInspectorTab = "plan";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createResearchLayoutStore(initialViewportWidth = 1600) {
  let snapshot: ResearchLayoutSnapshot = {
    viewportWidth: initialViewportWidth,
    promptMode: "rail",
    promptWidth: 340,
    inspectorOpen: initialViewportWidth >= RESEARCH_LAYOUT_LIMITS.dockBreakpoint,
    inspectorWidth: 360,
    activeInspectorTab: DEFAULT_INSPECTOR_TAB,
  };

  const listeners = new Set<() => void>();

  function publish(next: Partial<ResearchLayoutSnapshot>): void {
    const merged = { ...snapshot, ...next };
    // 防御：值不变不发布，避免无谓渲染
    if (
      merged.viewportWidth === snapshot.viewportWidth &&
      merged.promptMode === snapshot.promptMode &&
      merged.promptWidth === snapshot.promptWidth &&
      merged.inspectorOpen === snapshot.inspectorOpen &&
      merged.inspectorWidth === snapshot.inspectorWidth &&
      merged.activeInspectorTab === snapshot.activeInspectorTab
    ) {
      return;
    }
    snapshot = Object.freeze(merged);
    for (const listener of listeners) listener();
  }

  // 中央区可用宽度 = viewport - 左侧占用 - 右侧占用
  function leftOccupied(viewportWidth: number, promptMode: PromptRailMode, promptWidth: number): number {
    if (viewportWidth < RESEARCH_LAYOUT_LIMITS.overlayBreakpoint) return 0;
    return promptMode === "pinned" ? promptWidth : RESEARCH_LAYOUT_LIMITS.railWidth;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): ResearchLayoutSnapshot {
      return snapshot;
    },

    setViewport(width: number): void {
      const viewportWidth = Math.max(0, Math.round(width));
      const patch: Partial<ResearchLayoutSnapshot> = { viewportWidth };

      // 响应式降级（规划 §2.2）
      if (viewportWidth < RESEARCH_LAYOUT_LIMITS.overlayBreakpoint) {
        patch.promptMode = "rail";
        patch.inspectorOpen = false;
      } else if (viewportWidth < RESEARCH_LAYOUT_LIMITS.dockBreakpoint) {
        if (snapshot.promptMode === "pinned") patch.promptMode = "rail";
        if (snapshot.inspectorOpen) {
          // 降级时先压缩到 300px，仍不足则收起（降级顺序）
          const left = leftOccupied(viewportWidth, "rail", snapshot.promptWidth);
          const rightMin = RESEARCH_LAYOUT_LIMITS.inspectorMin;
          if (viewportWidth - left - rightMin >= RESEARCH_LAYOUT_LIMITS.centerMin) {
            patch.inspectorWidth = Math.min(snapshot.inspectorWidth, rightMin);
          } else {
            patch.inspectorOpen = false;
          }
        }
      }

      // 常规宽度保护：不得把中央压到 640px 以下还保留双侧停靠
      if (viewportWidth >= RESEARCH_LAYOUT_LIMITS.dockBreakpoint) {
        const left = leftOccupied(viewportWidth, patch.promptMode ?? snapshot.promptMode, patch.promptWidth ?? snapshot.promptWidth);
        const inspectorOpen = patch.inspectorOpen ?? snapshot.inspectorOpen;
        let inspectorWidth = patch.inspectorWidth ?? snapshot.inspectorWidth;
        if (inspectorOpen && viewportWidth - left - inspectorWidth < RESEARCH_LAYOUT_LIMITS.centerMin) {
          inspectorWidth = viewportWidth - left - RESEARCH_LAYOUT_LIMITS.centerMin;
          if (inspectorWidth < RESEARCH_LAYOUT_LIMITS.inspectorMin) {
            patch.inspectorOpen = false;
          } else {
            patch.inspectorWidth = clamp(inspectorWidth, RESEARCH_LAYOUT_LIMITS.inspectorMin, RESEARCH_LAYOUT_LIMITS.inspectorMax);
          }
        }
      }

      publish(patch);
    },

    setPromptMode(mode: PromptRailMode): void {
      publish({ promptMode: mode });
    },

    setPromptWidth(width: number): void {
      publish({ promptWidth: clamp(Math.round(width), RESEARCH_LAYOUT_LIMITS.promptMin, RESEARCH_LAYOUT_LIMITS.promptMax) });
    },

    setInspectorOpen(open: boolean): void {
      // < 1280 无停靠检查器；1024–1279 为覆盖抽屉（允许打开但占 0 停靠宽度）
      publish({ inspectorOpen: open });
    },

    setInspectorWidth(width: number): void {
      publish({ inspectorWidth: clamp(Math.round(width), RESEARCH_LAYOUT_LIMITS.inspectorMin, RESEARCH_LAYOUT_LIMITS.inspectorMax) });
    },

    setInspectorTab(tab: ResearchInspectorTab): void {
      publish({ activeInspectorTab: tab });
    },

    // 拖拽校验入口（Task 3 Step 4 的 handle 调用）
    dragInspectorWidth(width: number): void {
      const viewportWidth = snapshot.viewportWidth;
      const left = leftOccupied(viewportWidth, snapshot.promptMode, snapshot.promptWidth);
      const maxByCenter = viewportWidth - left - RESEARCH_LAYOUT_LIMITS.centerMin;
      const maxAllowed = Math.min(RESEARCH_LAYOUT_LIMITS.inspectorMax, Math.max(RESEARCH_LAYOUT_LIMITS.inspectorMin, maxByCenter));
      publish({ inspectorWidth: clamp(Math.round(width), RESEARCH_LAYOUT_LIMITS.inspectorMin, maxAllowed) });
    },
  };
}

export type ResearchLayoutStore = ReturnType<typeof createResearchLayoutStore>;

// 纯函数列宽计算（测试锚点）：给定快照返回三列实际宽度
export function computeResearchColumns(snapshot: ResearchLayoutSnapshot): {
  left: number;
  center: number;
  right: number;
  centerBelowMin: boolean;
} {
  const left =
    snapshot.viewportWidth < RESEARCH_LAYOUT_LIMITS.overlayBreakpoint
      ? 0
      : snapshot.promptMode === "pinned"
        ? snapshot.promptWidth
        : RESEARCH_LAYOUT_LIMITS.railWidth;
  const right =
    snapshot.viewportWidth >= RESEARCH_LAYOUT_LIMITS.dockBreakpoint && snapshot.inspectorOpen
      ? snapshot.inspectorWidth
      : 0;
  const center = Math.max(0, snapshot.viewportWidth - left - right);
  return {
    left,
    center,
    right,
    centerBelowMin: center < RESEARCH_LAYOUT_LIMITS.centerMin,
  };
}
