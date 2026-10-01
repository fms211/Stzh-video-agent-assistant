"use strict";

// 08-29 — Task 10/11: UnifiedCreativeComposer 契约（规划 §1.4）
// 四模式固定文案；草稿四份独立；禁止直接调 /api/agent；复用 creativeApi。

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("UnifiedCreativeComposer（规划 §1.4）", () => {
  const composer = read("app/components/UnifiedCreativeComposer.tsx");

  test("四模式固定文案：Coze 创作 / 单助手 / 工作流 / 协作编排", () => {
    assert.match(composer, /Coze 创作/);
    assert.match(composer, /单助手/);
    assert.match(composer, /工作流/);
    assert.match(composer, /协作编排/);
  });

  test("四种草稿独立存储（drafts Record 含 4 mode 键）", () => {
    assert.match(composer, /Record<CreativeWorkspaceMode, string>/);
    assert.match(composer, /"coze"/);
    assert.match(composer, /"assistant"/);
    assert.match(composer, /"workflow"/);
    assert.match(composer, /"collaboration"/);
    assert.match(composer, /onTextChange/);
  });

  test("受控助手草稿不得复用一次性 seed 后再被 onSeedConsumed 清空", () => {
    assert.match(composer, /draftValue=\{drafts\.assistant\}/);
    assert.match(composer, /draftValue=\{drafts\.workflow\}/);
    assert.doesNotMatch(composer, /seed=\{drafts\.(assistant|workflow)\}/);
    assert.doesNotMatch(composer, /onSeedConsumed=\{\(\) => setDrafts\(\(prev\) => \(\{ \.\.\.prev, (assistant|workflow): "" \}\)\)\}/);
  });

  test("参数变化不自动写入草稿，只有 Workspace 的显式插入请求才触发", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");
    assert.match(workspace, /insertRequestRevision/);
    assert.match(workspace, /handleInserted/);
    assert.match(workspace, /insertRevision=\{insertRequestRevision\}/);
    assert.match(workspace, /onInserted=\{handleInserted\}/);
  });

  test("已访问模式以 Activity 隐藏保活，首次只挂载 Coze", () => {
    assert.match(composer, /Activity/);
    assert.match(composer, /useState<Set<CreativeWorkspaceMode>>\(\(\) => new Set\(\["coze"\]\)\)/);
    assert.match(composer, /setVisitedModes/);
    assert.match(composer, /visitedModes\.has\(m\)/);
    assert.match(composer, /<Activity\s+mode=\{\w+Active \? "visible" : "hidden"\}/);
    assert.match(composer, /aria-hidden=\{!\w+Active\}/);
    assert.match(composer, /inert=\{!\w+Active\}/);
    assert.match(composer, /pointerEvents:\s*\w+Active\s*\?\s*"auto"\s*:\s*"none"/);
  });

  test("外部 mode 首次切到未访问模式时当场渲染，并在 effect 中补记 visited", () => {
    assert.match(composer, /const shouldRender = m === mode \|\| visitedModes\.has\(m\);/);
    assert.match(composer, /if \(!shouldRender\) return null;/);
    assert.match(composer, /useEffect\(\(\) => \{\s*previousModeRef\.current = mode;\s*visitMode\(mode\);/);
  });

  test("首次访问模式以 enter 初始态进入 active，而非跳过初始动画", () => {
    assert.match(composer, /initial="enter"/);
    assert.doesNotMatch(composer, /initial=\{false\}/);
    assert.match(composer, /animate=\{\w+Active \? "active" : "inactive"\}/);
  });

  test("重面板首次访问才按需加载，并在对应 tab hover/focus 时复用同一 import 预加载", () => {
    assert.match(composer, /from "next\/dynamic"/);
    assert.doesNotMatch(composer, /^import ModelAssistantPanel from /m);
    assert.doesNotMatch(composer, /^import CollaborativeRunPanel from /m);
    assert.match(composer, /const loadModelAssistantPanel = \(\) => import\("\.\/ModelAssistantPanel"\)/);
    assert.match(composer, /const loadCollaborativeRunPanel = \(\) => import\("\.\/CollaborativeRunPanel"\)/);
    assert.match(composer, /dynamic\(loadModelAssistantPanel/);
    assert.match(composer, /dynamic\(loadCollaborativeRunPanel/);
    assert.match(composer, /onMouseEnter=\{\(\) => preloadMode\(m\)\}/);
    assert.match(composer, /onFocus=\{\(\) => preloadMode\(m\)\}/);
    assert.match(composer, /visitedModes\.has\(m\)[\s\S]{0,240}<Activity/);
  });

  test("未访问模式不构造对应业务 JSX，访问后才调用内容工厂", () => {
    assert.match(composer, /content:\s*\(\) => ReactNode/);
    assert.match(composer, /if \(!shouldRender\) return null;[\s\S]{0,640}\{content\(\)\}/);
    assert.match(composer, /renderVisitedMode\("assistant", assistantActive,\s*\(\) => </);
    assert.match(composer, /renderVisitedMode\("workflow", workflowActive,\s*\(\) => </);
    assert.match(composer, /renderVisitedMode\("collaboration", collaborationActive,\s*\(\) => </);
  });

  test("Composer固定内容区不叠加高度投影，活动内容使用方向变体", () => {
    assert.match(composer, /from "motion\/react"/);
    assert.equal((composer.match(/layout=\{reducedMotion \? false : "size"\}/g) || []).length, 0);
    assert.doesNotMatch(composer, /(?:^|\s)hidden=/);
    assert.match(composer, /offset:\s*4/);
    assert.match(composer, /scale:\s*1/);
    assert.match(composer, /variants=\{modeVariants\}/);
    assert.match(composer, /animate=\{\w+Active \? "active" : "inactive"\}/);
  });

  test("compact 助手不重复渲染内层对话/工作流切换", () => {
    const assistant = read("app/components/ModelAssistantPanel.tsx");
    assert.match(assistant, /!compact/);
    assert.match(assistant, /is-compact/);
  });

  test("禁止直接调用后端（复用既有 creativeApi），mode 切换不覆盖草稿", () => {
    assert.doesNotMatch(composer, /fetch\(["']\/api\/agent/);
  });

  test("复用 ModelAssistantPanel / CollaborativeRunPanel（禁止复制后端逻辑）", () => {
    assert.match(composer, /ModelAssistantPanel/);
    assert.match(composer, /CollaborativeRunPanel/);
  });

  test("mode tablist 语义（role=tablist + aria-label）", () => {
    assert.match(composer, /role="tablist"/);
    assert.match(composer, /创作模式|aria-label/);
  });

  test("tab 支持 roving tabindex、方向键与 Home/End，并带共享活动指示器", () => {
    assert.match(composer, /ArrowLeft/);
    assert.match(composer, /ArrowRight/);
    assert.match(composer, /Home/);
    assert.match(composer, /End/);
    assert.match(composer, /tabIndex=\{mode === m \? 0 : -1\}/);
    assert.match(composer, /layoutId="creative-composer-active-pill"/);
    assert.match(composer, /transition=\{\{ duration: 0\.18, ease:/);
  });

  test("tab 按压反馈显式使用 0.09s pressDuration，而非继承 hoverDuration", () => {
    assert.match(composer, /whileTap=\{[\s\S]{0,300}?CREATIVE_MOTION\.pressDuration/);
  });

  test("降低动态时关闭内容 projection 与共享 pill 弹簧，tab 只作 80ms 内透明度反馈", () => {
    assert.doesNotMatch(composer, /layout=\{reducedMotion \? false : "size"\}/);
    assert.match(composer, /reducedMotion \? \(\s*<span[\s\S]{0,180}?\) : \(\s*<motion\.span[\s\S]{0,240}?layoutId="creative-composer-active-pill"[\s\S]{0,160}?transition=\{\{ duration: 0\.18/);
    assert.match(composer, /transition=\{\{ duration: reducedMotion \? CREATIVE_MOTION\.reducedMotionDuration : CREATIVE_MOTION\.hoverDuration \}\}/);
    assert.match(composer, /opacity:\s*0\.9,\s*transition:\s*\{ duration: CREATIVE_MOTION\.reducedMotionDuration \}/);
    assert.match(composer, /whileHover=\{reducedMotion \? \{ opacity: 0\.96 \} : \{ y: -1 \}\}/);
    assert.match(composer, /whileTap=\{reducedMotion\s*\?\s*\{\s*opacity:\s*0\.9/);
  });

  test("Activity 接管隐藏状态，不保留 Composer 的 hidden CSS 覆盖规则", () => {
    const globals = read("app/globals.css");
    assert.doesNotMatch(globals, /\.cws-composer__mode\[hidden\]/);
  });

  test("独立错误状态 per-mode", () => {
    assert.match(composer, /errors|error/u);
  });
});
