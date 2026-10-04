"use strict";

// 08-28 Hermes 研究运行工作台 — Task 3–7: UI 契约静态测试
// 运行: node --test test/research-workbench-ui-contract.test.js
// 模式: fs.readFileSync 读源码文本 + regex 断言（与 creative-workspace-ui-contract.test.js 同模式）

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("research-workbench 布局 store（Task 3）", () => {
  const layoutStore = read("app/components/research-workbench/layout-store.ts");

  test("使用 useSyncExternalStore 语义的外部 store（Object.freeze 发布）", () => {
    assert.match(layoutStore, /Object\.freeze/);
    assert.match(layoutStore, /subscribe/);
    assert.match(layoutStore, /getSnapshot/);
  });

  test("快照字段与规划 §2.2 固定契约一致", () => {
    assert.match(layoutStore, /viewportWidth/);
    assert.match(layoutStore, /promptMode/);
    assert.match(layoutStore, /promptWidth/);
    assert.match(layoutStore, /inspectorOpen/);
    assert.match(layoutStore, /inspectorWidth/);
    assert.match(layoutStore, /activeInspectorTab/);
  });

  test("中央最小 640px、检查器 300–480、提示词 300–420、收起轨 56", () => {
    assert.match(layoutStore, /centerMin:\s*640/);
    assert.match(layoutStore, /inspectorMin:\s*300/);
    assert.match(layoutStore, /inspectorMax:\s*480/);
    assert.match(layoutStore, /promptMin:\s*300/);
    assert.match(layoutStore, /promptMax:\s*420/);
    assert.match(layoutStore, /railWidth:\s*56/);
  });

  test("响应式降级顺序：先收提示词固定，再压检查器 300，最后收检查器", () => {
    assert.match(layoutStore, /dockBreakpoint:\s*1280/);
    assert.match(layoutStore, /overlayBreakpoint:\s*1024/);
    // 降级序列中提示词固定必须先于检查器处理
    const degradeIndex = layoutStore.indexOf("响应式降级");
    const promptDegrade = layoutStore.indexOf('patch.promptMode = "rail"', degradeIndex);
    const inspectorCollapse = layoutStore.indexOf('patch.inspectorOpen = false', degradeIndex);
    assert.ok(promptDegrade > -1 && inspectorCollapse > promptDegrade, "降级顺序必须先提示词后检查器");
  });

  test("computeResearchColumns 纯函数存在", () => {
    assert.match(layoutStore, /export function computeResearchColumns/);
  });
});

describe("research-workbench 组件契约（Task 4–6）", () => {
  test("组合根存在且不实现业务细节", () => {
    const workbench = read("app/components/research-workbench/ResearchWorkbench.tsx");
    assert.match(workbench, /ResearchRunSurface/);
    assert.match(workbench, /RunInspector/);
    assert.match(workbench, /PromptRail/);
    assert.match(workbench, /createResearchLayoutStore/);
  });

  test("统一工作区中的研究运行态占满主工作区，不再嵌套第二套左右栏", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");
    const workbench = read("app/components/research-workbench/ResearchWorkbench.tsx");
    assert.match(workspace, /cws-research-shell/);
    assert.match(workspace, /researchRun[^?]*\?/s);
    assert.match(workbench, /promptPane !== null/);
  });

  test("中央 Run Surface 提供规划要求的动作文案", () => {
    const surface = read("app/components/research-workbench/ResearchRunSurface.tsx");
    assert.match(surface, /生成研究计划/);
    assert.match(surface, /确认并开始/);
    assert.match(surface, /暂停/);
    assert.match(surface, /继续/);
    assert.match(surface, /取消/);
    assert.match(surface, /修改参数并重新确认/);
    assert.match(surface, /保存修改并查看计划/);
    assert.match(surface, /type: "retry_step"[^\n]*expectedRevision:/);
  });

  test("不存在 thinkingStages 轮播复用（真实状态驱动）", () => {
    const surface = read("app/components/research-workbench/ResearchRunSurface.tsx");
    assert.doesNotMatch(surface, /thinkingStages/);
    const chatFlow = read("app/components/ChatFlow.tsx");
    // ChatFlow 保留自己的轮播，但 Workbench 不引用它
    assert.doesNotMatch(read("app/components/research-workbench/ResearchWorkbench.tsx"), /ChatFlow/);
    assert.ok(chatFlow.length > 0);
  });

  test("计划编辑器只产生受控 PlanOperation", () => {
    const editor = read("app/lib/research-runtime/plan-draft.ts");
    assert.match(editor, /set_objective/);
    assert.match(editor, /set_budget/);
    assert.match(editor, /move_step/);
    assert.match(editor, /set_optional_enabled/);
    assert.match(editor, /set_step_input/);
  });

  test("四标签检查器 ARIA 与结构", () => {
    const inspector = read("app/components/research-workbench/RunInspector.tsx");
    assert.match(inspector, /role="tablist"/);
    assert.match(inspector, /role="tab"/);
    assert.match(inspector, /aria-selected/);
    assert.match(inspector, /计划/);
    assert.match(inspector, /资料/);
    assert.match(inspector, /产物/);
    assert.match(inspector, /轨迹/);
  });

  test("资料 tab 提示外部资料不可信 + 安全外链", () => {
    const sources = read("app/components/research-workbench/SourcesTab.tsx");
    assert.match(sources, /不可信|外部资料/);
    assert.match(sources, /noopener/);
    assert.match(sources, /noreferrer/);
    assert.match(sources, /_blank/);
  });

  test("轨迹 tab 有 200 条渲染上限与 metrics 汇总", () => {
    const trajectory = read("app/components/research-workbench/TrajectoryTab.tsx");
    assert.match(trajectory, /200/);
    assert.match(trajectory, /加载更早记录/);
    assert.match(trajectory, /TTFT|ttftMs/);
  });

  test("产物 tab 提供三类产物下载/复制", () => {
    const artifacts = read("app/components/research-workbench/ArtifactsTab.tsx");
    assert.match(artifacts, /research-report/);
    assert.match(artifacts, /style-feature-pack/);
    assert.match(artifacts, /application-prompt-pack/);
    assert.match(artifacts, /createObjectURL/);
    assert.match(artifacts, /saveFileDownload/);
    assert.match(read("app/lib/media-download.ts"), /revokeObjectURL/);
  });

  test("PromptRail 三态且焦点返回", () => {
    const rail = read("app/components/research-workbench/PromptRail.tsx");
    assert.match(rail, /"rail"/);
    assert.match(rail, /"overlay"/);
    assert.match(rail, /"pinned"/);
    assert.match(rail, /Escape/);
    assert.match(rail, /focus\(\)|\.focus/);
  });
});

describe("范围隔离（Task 7）", () => {
  test("只有 style-research 带 runtimeMode", () => {
    const workflows = read("app/lib/opc-workflows.ts");
    const matches = workflows.match(/runtimeMode:\s*"research-workbench"/g) || [];
    assert.equal(matches.length, 1, "runtimeMode 只出现一次");
    // 出现在 style-research 定义附近
    const styleIdx = workflows.indexOf('id: "style-research"');
    const modeIdx = workflows.indexOf('runtimeMode: "research-workbench"');
    assert.ok(styleIdx > -1 && modeIdx > styleIdx, "runtimeMode 应位于 style-research 定义内");
  });

  test("ModelAssistantPanel 提供 onLaunchRuntime 并只在 runtimeMode 时分流", () => {
    const panel = read("app/components/ModelAssistantPanel.tsx");
    assert.match(panel, /onLaunchRuntime/);
    assert.match(panel, /runtimeMode/);
  });

  test("Coze ChatFlow / CollaborativeRunPanel / TaskCenter 不引用 ResearchRuntimeAdapter", () => {
    assert.doesNotMatch(read("app/components/ChatFlow.tsx"), /ResearchRuntimeAdapter|research-runtime/);
    assert.doesNotMatch(read("app/components/CollaborativeRunPanel.tsx"), /ResearchRuntimeAdapter|research-runtime/);
    assert.doesNotMatch(read("app/components/TaskCenter.tsx"), /ResearchRuntimeAdapter|research-runtime/);
  });

  test("CreativeStudio 保留单一 OPCPanel 实例来源", () => {
    const studio = read("app/components/CreativeStudio.tsx");
    // 08-29 Task 13：CreativeStudio 转为 wrapper；OPCPanel 复用职责移交 CreativeWorkspace
    assert.match(studio, /CreativeWorkspace/);
    // Workspace 的左侧库面板与参数条是 OPCPanel 单实例的两个表达位（均经 props 回调接线）
    const workspace = read("app/components/CreativeWorkspace.tsx");
    assert.match(workspace, /CreativeParameterBar/);
  });

  test("HomeClient 创建 owner-scoped Adapter 单例并响应账号切换", () => {
    const home = read("app/components/HomeClient.tsx");
    assert.match(home, /createHttpResearchRuntimeAdapter/);
    assert.doesNotMatch(home, /createMockResearchRuntimeAdapter/);
    // 账号切换路径：user 变化 → dataOwnerFromUser 得到新 owner → dispose 旧 Adapter 并重建
    assert.match(home, /dataOwnerFromUser/);
    assert.match(home, /dispose/);
    // owner 维度（kind + userId）作为重建依据
    assert.match(home, /researchOwnerKind|ownerKind/);
    assert.match(home, /researchOwnerUserId|ownerUserId/);
  });
});
