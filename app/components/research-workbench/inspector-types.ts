// 研究运行工作台 — 检查器标签类型（layout-store 与 RunInspector 共用）

export type ResearchInspectorTab = "plan" | "sources" | "artifacts" | "trajectory";

export const INSPECTOR_TABS: readonly ResearchInspectorTab[] = ["plan", "sources", "artifacts", "trajectory"] as const;

export const INSPECTOR_TAB_LABELS: Record<ResearchInspectorTab, string> = {
  plan: "计划",
  sources: "资料",
  artifacts: "产物",
  trajectory: "轨迹",
};
