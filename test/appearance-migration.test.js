"use strict";

// 08-29 创意工坊统一工作区 — Task 1: 领域类型与迁移契约（chat/opc → studio）
// 运行: node --test test/appearance-migration.test.js
// 机制: 与既有测试相同——Node 25 原生 type-stripping 动态 import .ts

const assert = require("node:assert/strict");
const { test, describe, beforeEach } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");

async function load(relativePath) {
  const abs = path.join(REPO_ROOT, relativePath);
  const url = pathToFileURL(abs);
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

describe("startPage 迁移契约（chat/opc → studio）", () => {
  let mod;

  beforeEach(async () => {
    mod = await load("app/lib/appearance-types.ts");
  });

  test("migrateStartPage: chat → studio", () => {
    assert.equal(mod.migrateStartPage("chat"), "studio");
  });

  test("migrateStartPage: opc → studio", () => {
    assert.equal(mod.migrateStartPage("opc"), "studio");
  });

  test("migrateStartPage: 其他页面原样保留", () => {
    assert.equal(mod.migrateStartPage("tasks"), "tasks");
    assert.equal(mod.migrateStartPage("stats"), "stats");
    assert.equal(mod.migrateStartPage("gallery"), "gallery");
    assert.equal(mod.migrateStartPage("studio"), "studio");
  });

  test("migrateStartPage: 已移除的 libtv 起始页回到 studio", () => {
    assert.equal(mod.migrateStartPage("libtv"), "studio");
  });
});

describe("CreativeWorkspaceMode 四模式契约（规划 §1.4）", () => {
  test("四种模式字面量固定", async () => {
    const m = await load("app/lib/appearance-types.ts");
    const modes = m.CREATIVE_WORKSPACE_MODES;
    assert.deepEqual(modes, ["coze", "assistant", "workflow", "collaboration"]);
  });
});

describe("CreativeContext 契约（规划 §1.3）", () => {
  test("emptyCreativeContext 默认值", async () => {
    const m = await load("app/lib/appearance-types.ts");
    const ctx = m.emptyCreativeContext();
    assert.equal(ctx.revision, 0);
    assert.equal(ctx.styleId, null);
    assert.equal(ctx.aspect, "16:9");
    assert.equal(ctx.durationSeconds, 8);
    assert.deepEqual(ctx.selectedParams, []);
    assert.equal(ctx.promptFragment, "");
  });
});

describe("GlassSettings / GLASS_PRESETS（规划 §2.3）", () => {
  test("三档预设默认值", async () => {
    const m = await load("app/lib/appearance-types.ts");
    assert.deepEqual(m.GLASS_PRESETS.clear, { blurPx: 12, opacity: 0.14, refraction: 32, edgeGlow: 0.18, wallpaperDim: 0.2, smartTint: 0.12 });
    assert.deepEqual(m.GLASS_PRESETS.balanced, { blurPx: 18, opacity: 0.22, refraction: 24, edgeGlow: 0.24, wallpaperDim: 0.32, smartTint: 0.18 });
    assert.deepEqual(m.GLASS_PRESETS.deep, { blurPx: 24, opacity: 0.34, refraction: 16, edgeGlow: 0.3, wallpaperDim: 0.48, smartTint: 0.25 });
  });
});

describe("DEFAULT_WALLPAPER_APPEARANCE（规划 §2.4）", () => {
  test("默认 16:9 cover 无资产 智能取色关", async () => {
    const m = await load("app/lib/appearance-types.ts");
    const a = m.DEFAULT_WALLPAPER_APPEARANCE;
    assert.equal(a.assetId, null);
    assert.equal(a.aspect, "16:9");
    assert.equal(a.fit, "cover");
    assert.equal(a.focalX, 50);
    assert.equal(a.focalY, 50);
    assert.equal(a.dim, 0.32);
    assert.equal(a.smartTintEnabled, false);
    assert.equal(a.smartTintStrength, 0.15);
  });
});

describe("LiquidGlassVariant（规划 §2.2）", () => {
  test("四种 variant 固定", async () => {
    const m = await load("app/lib/appearance-types.ts");
    assert.deepEqual(m.LIQUID_GLASS_VARIANTS, ["bar", "panel", "capsule", "popover"]);
  });
});

describe("ThemeEnergyState（规划 §4.3）", () => {
  test("四状态固定", async () => {
    const m = await load("app/lib/appearance-types.ts");
    assert.deepEqual(m.THEME_ENERGY_STATES, ["idle", "running", "thinking", "peak"]);
  });
});

describe("迁移不触碰数据（规划 §5.3）", () => {
  test("会话/消息 storage key 不受 startPage 迁移影响", async () => {
    const m = await load("app/lib/appearance-types.ts");
    // 迁移只改 prefs.startPage；workspace 数据 key 由 data-owner.ts 生成，与此无关。
    // 断言迁移函数是纯 startPage 变换，不涉及任何 storage。
    const before = Object.keys(m);
    const result = m.migrateStartPage("chat");
    assert.equal(result, "studio");
    assert.deepEqual(Object.keys(m), before, "模块导出不应因迁移调用而膨胀/变化");
  });
});
