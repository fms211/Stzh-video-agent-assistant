"use strict";

// 08-29 — Task 12: CreativeContextInspector 契约（规划 §1.5）
// 四模式固定 inspector model + 空状态真实下一步；不自行拉取任务。

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("CreativeContextInspector（规划 §1.5）", () => {
  const inspector = read("app/components/CreativeContextInspector.tsx");

  test("四模式四段 tablist（coze/assistant/workflow/collaboration + empty）", () => {
    assert.match(inspector, /role="tablist"/);
    assert.match(inspector, /"coze"/);
    assert.match(inspector, /"assistant"/);
    assert.match(inspector, /"workflow"/);
    assert.match(inspector, /"collaboration"/);
    assert.match(inspector, /empty/);
  });

  test("每节有真实下一步的空状态文案（非空白面板）", () => {
    assert.match(inspector, /下一步/);
    assert.match(inspector, /输入主题|填写风格|选择项目|选择工作流/u);
  });

  test("不自行 import getTasks（数据经 Workspace 注入）", () => {
    assert.doesNotMatch(inspector, /getTasks/);
    assert.doesNotMatch(inspector, /fetch\(/);
  });

  test("检查器收起不停止后台运行（runId 状态长存）", () => {
    assert.match(inspector, /runId/);
  });

  test("Workspace 注入真实 Coze 与助手运行状态，而不是固定空对象", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");
    const composer = read("app/components/UnifiedCreativeComposer.tsx");
    assert.match(workspace, /cozeTaskStatus/);
    assert.match(workspace, /onTaskStatusChange=\{setCozeTaskStatus\}/);
    assert.match(workspace, /assistantMeta = currentInspection\.assistant/);
    assert.match(workspace, /onAssistantInspection=\{onAssistantInspection\}/);
    assert.match(composer, /onAssistantInspection=\{onAssistantInspection\}/);
  });

  test("统一工作区消费真实能谱状态并暴露到视觉根节点", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");
    assert.match(workspace, /useThemeEnergy/);
    assert.match(workspace, /data-energy-state=\{energyState\}/);
  });

  test("检查器 tab 支持 roving tabindex、键盘导航与共享活动指示器", () => {
    assert.match(inspector, /ArrowLeft/);
    assert.match(inspector, /ArrowRight/);
    assert.match(inspector, /Home/);
    assert.match(inspector, /End/);
    assert.match(inspector, /tabIndex=\{effectiveSection === section \? 0 : -1\}/);
    assert.match(inspector, /layoutId="creative-inspector-active-pill"/);
    assert.match(inspector, /CREATIVE_MOTION\.indicatorSpring/);
  });

  test("检查器内容以 Motion 按顺序方向切换，使用 8px 位移且退出快于进入", () => {
    assert.match(inspector, /AnimatePresence/);
    assert.doesNotMatch(inspector, /<AnimatePresence[^>]*mode="wait"/);
    assert.match(inspector, /<AnimatePresence[^>]*mode="sync"/);
    assert.match(inspector, /<motion\.div/);
    assert.match(inspector, /offset:\s*8/);
    assert.match(inspector, /exitDuration:\s*0\.14/);
    assert.match(inspector, /motionDirection/);
    assert.match(inspector, /useCreativeMotion/);
  });

  test("检查器 tab 按压反馈显式使用 0.09s pressDuration，而非继承 hoverDuration", () => {
    assert.match(inspector, /whileTap=\{[\s\S]{0,300}?CREATIVE_MOTION\.pressDuration/);
  });
});
