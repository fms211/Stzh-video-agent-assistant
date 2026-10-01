// 创意工坊统一工作区 — 响应式断点常量（规划 §1.2，供 layout store 与 CSS 共用）

export const BREAKPOINTS = [1440, 1180, 960] as const;

export function isDockedLayout(viewportWidth: number): boolean {
  return viewportWidth >= BREAKPOINTS[0];
}

export function isRailLayout(viewportWidth: number): boolean {
  return viewportWidth >= BREAKPOINTS[1] && viewportWidth < BREAKPOINTS[0];
}

export function isOverlayLayout(viewportWidth: number): boolean {
  return viewportWidth >= BREAKPOINTS[2] && viewportWidth < BREAKPOINTS[1];
}

export function isSingleColumn(viewportWidth: number): boolean {
  return viewportWidth < BREAKPOINTS[2];
}
