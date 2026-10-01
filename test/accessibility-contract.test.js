"use strict";

// 08-29 — Task 14: 响应式与无障碍契约
// workspace-responsive 纯函数 + 无障碍属性静态断言。

const assert = require("node:assert/strict");
const { test, describe, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

async function load(relativePath) {
  const abs = path.join(REPO_ROOT, relativePath);
  const url = pathToFileURL(abs);
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

describe("workspace-responsive 断点（规划 §1.2）", () => {
  let mod;
  beforeEach(async () => { mod = await load("app/components/workspace-responsive.ts"); });

  test("断点数组 1440/1180/960", () => {
    assert.deepEqual(mod.BREAKPOINTS, [1440, 1180, 960]);
  });
});

describe("无障碍属性（Task 13/14）", () => {
  test("NavigationBar tab 有 aria-label", () => {
    assert.match(read("app/components/NavigationBar.tsx"), /aria-label=\{tab\.label\}/);
  });

  test("Composer mode tablist 语义", () => {
    assert.match(read("app/components/UnifiedCreativeComposer.tsx"), /role="tablist"/);
    assert.match(read("app/components/UnifiedCreativeComposer.tsx"), /aria-label="创作模式"/);
  });

  test("Inspector complementary + aria-label", () => {
    const inspector = read("app/components/CreativeContextInspector.tsx");
    assert.match(inspector, /role="complementary"/);
    assert.match(inspector, /aria-label="上下文检查器"/);
  });

  test("SessionDock 半轨/收起按钮 aria", () => {
    const dock = read("app/components/WorkspaceSessionDock.tsx");
    assert.match(dock, /aria-label="展开会话坞"/);
    assert.match(dock, /aria-label="收起会话坞"/);
    assert.match(dock, /motion\.aside/);
    assert.match(dock, /wsd-dock__rail-layer/);
    assert.match(dock, /wsd-dock__panel-layer/);
    assert.match(dock, /aria-hidden/);
    assert.match(dock, /inert/);
    assert.doesNotMatch(dock, /if \(layoutMode === "rail"\)/);
  });

  test("Escape 关闭 overlay 并恢复焦点（AppearanceSettingsStudio）", () => {
    const studio = read("app/components/AppearanceSettingsStudio.tsx");
    assert.match(studio, /Escape/);
    assert.match(studio, /restoreFocusRef/);
  });

  test("左右停靠栏实际渲染可键盘操作的 separator", () => {
    const dock = read("app/components/WorkspaceSessionDock.tsx");
    const workspace = read("app/components/CreativeWorkspace.tsx");
    assert.match(dock, /role="separator"/);
    assert.match(dock, /aria-valuenow/);
    assert.match(dock, /ArrowLeft|ArrowRight/);
    assert.match(workspace, /role="separator"/);
    assert.match(workspace, /setRightWidth/);
  });

  test("左右 overlay 互斥，支持 scrim/Escape 与退出后焦点恢复", () => {
    const workspace = read("app/components/CreativeWorkspace.tsx");
    assert.match(workspace, /activeOverlay/);
    assert.match(workspace, /cws-side-scrim/);
    assert.match(workspace, /Escape/);
    assert.match(workspace, /setRightOverlayOpen\(false\)/);
    assert.match(workspace, /rightTriggerRef\.current\?\.focus/);
  });

  test("图像参数抽屉按覆盖状态提供 modal 或 complementary 语义，并保留背景 inert", () => {
    const drawer = read("app/components/CreativeImageParameterDrawer.tsx");
    const workspace = read("app/components/CreativeWorkspace.tsx");

    assert.match(drawer, /isOverlay:\s*boolean/);
    assert.match(drawer, /role=\{isOverlay\s*\?\s*"dialog"\s*:\s*"complementary"\}/);
    assert.match(drawer, /aria-modal=\{isOverlay\s*\?\s*true\s*:\s*undefined\}/);
    assert.match(workspace, /<CreativeImageParameterDrawer[\s\S]*isOverlay=\{activeOverlay\s*===\s*"right"\}/);
    assert.match(workspace, /className="cws-center"[\s\S]*inert=\{activeOverlay\s*\?\s*true\s*:\s*undefined\}/);
  });
});
