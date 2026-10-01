"use strict";

// 08-29 — Task 7: AppearanceSettingsStudio 契约（规划 §3）
// 静态断言：dialog 语义、焦点管理、未保存确认、主题网格 10、壁纸库操作、预览复用同款组件。

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("AppearanceSettingsStudio（规划 §3）", () => {
  const source = read("app/components/AppearanceSettingsStudio.tsx");

  test("对话框语义：role=dialog + aria-modal + aria-label", () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal/);
    assert.match(source, /aria-label=|aria-label=/);
  });

  test("焦点管理：Tab/Shift+Tab 循环 + Escape 关闭 + 焦点恢复", () => {
    assert.match(source, /Tab/);
    assert.match(source, /Shift\+Tab|shiftKey/);
    assert.match(source, /Escape/);
    assert.match(source, /focus\(\)|\.focus/);
  });

  test("未保存壁纸裁切离开确认", () => {
    assert.match(source, /role="alertdialog"/);
    assert.match(source, /未保存.*离开|离开.*未保存|裁切/u);
    assert.match(source, /commitAppearance/);
    assert.match(source, /应用壁纸设置/);
  });

  test("主题网格渲染 10 套（THEMES.map）", () => {
    assert.match(source, /THEMES(\.map|\.slice|\.filter)?/);
    assert.match(source, /10|THEMES\.length/);
  });

  test("壁纸库含删除与恢复操作 + 上限说明", () => {
    assert.match(source, /deleteWallpaper|删除/);
    assert.match(source, /restoreQuarantined|恢复/);
    assert.match(source, /25 ?MiB|150 ?MiB|4096|30 ?秒/u);
  });

  test("选择壁纸先更新可见状态，touch 元数据失败不能阻塞应用", () => {
    const applyIndex = source.indexOf("updateAppearance({ assetId: wallpaper.id")
    const touchIndex = source.indexOf("touchWallpaper(wallpaper.id", applyIndex);
    assert.ok(applyIndex >= 0 && touchIndex > applyIndex);
    assert.match(source.slice(applyIndex, touchIndex + 300), /catch/);
  });

  test("预览复用同款渲染组件（WallpaperLayer/GalaxyBackground/LiquidGlassSurface）", () => {
    assert.match(source, /WallpaperLayer/);
    assert.match(source, /GalaxyBackground/);
    assert.match(source, /LiquidGlassSurface/);
    assert.match(source, /cws-studio__preview-starfield/);
  });

  test("玻璃三档预设切换（clear/balanced/deep）", () => {
    assert.match(source, /clear/);
    assert.match(source, /balanced/);
    assert.match(source, /deep/);
  });

  test("URL 壁纸、焦点、星尘轨道与视频暂停控件均接入真实状态", () => {
    assert.match(source, /HTTPS URL/);
    assert.match(source, /urlKind/);
    assert.match(source, /validateWallpaperInput\([^)]*"url"/s);
    assert.match(source, /previewVideoPaused/);
    assert.match(source, /focalX/);
    assert.match(source, /focalY/);
    assert.match(source, /starfieldOpacity/);
    assert.match(source, /orbitOpacity/);
  });

  test("主题能谱预览、默认恢复和玻璃高级参数不是占位文案", () => {
    assert.match(source, /THEME_ENERGY_STATES/);
    assert.match(source, /恢复主题默认值/);
    assert.match(source, /advancedGlassOpen/);
    assert.match(source, /aria-expanded=\{advancedGlassOpen\}/);
    assert.match(source, /blurPx/);
    assert.match(source, /edgeGlow/);
  });

  test("性能开关写入真实 GlassSettings", () => {
    assert.match(source, /videoAutoplay/);
    assert.match(source, /refractionEnabled/);
    assert.match(source, /恢复推荐性能配置/);
    assert.match(source, /onGlassSettingsChange/);
  });

  test("inert 背景（模态打开时工作区不可交互）", () => {
    assert.match(source, /<dialog/);
    assert.match(source, /dialog\.showModal\(\)/);
    assert.match(source, /dialog\.close\(\)/);
    assert.match(source, /onCancel=\{event => \{ event\.preventDefault\(\);/);
    assert.match(source, /else requestClose\(\)/);
  });
});

test("CreativeWorkspace 将玻璃设置应用到真实 CSS 变量并按 owner 保存", () => {
  const workspace = read("app/components/CreativeWorkspace.tsx");
  assert.match(workspace, /glassSettings/);
  assert.match(workspace, /--glass-blur/);
  assert.match(workspace, /--glass-opacity/);
  assert.match(workspace, /onGlassSettingsChange/);
  assert.match(workspace, /glass-settings/);
  assert.match(workspace, /localStorage\.setItem\("theme"/);
  assert.match(workspace, /fetchServerSettings/);
  assert.match(workspace, /saveServerSettings/);
  assert.match(workspace, /const root = document\.documentElement/);
  assert.match(workspace, /root\.dataset\.theme\s*=\s*theme\.id/);
  assert.match(workspace, /getThemeDefinition/);
  assert.match(workspace, /--theme-glass-tint/);
  assert.match(workspace, /--theme-energy-peak/);
  assert.match(workspace, /onThemeChange/);
});

describe("SettingsDrawer 迁移契约", () => {
  const source = read("app/components/SettingsDrawer.tsx");

  test("THEMES 常量迁出（改 registry import）", () => {
    assert.match(source, /@\/app\/lib\/theme-registry|theme-registry/);
  });

  test("START_PAGES 移除 chat/opc，含 studio", () => {
    assert.doesNotMatch(source, /key:\s*"chat"/);
    assert.doesNotMatch(source, /key:\s*"opc"/);
    assert.match(source, /studio/);
  });
});
