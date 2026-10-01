"use strict";

// 08-29 — Task 2: Theme Registry 抽离（规划 §4）
// 运行: node --test test/theme-registry.test.js

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

const REQUIRED_COLORS = ["deep", "panel", "surface", "foreground", "muted", "primary", "primarySoft", "cool", "aurora"];
const REQUIRED_GLASS = ["tint", "border", "highlight", "shadow"];
const REQUIRED_ENERGY = ["idle", "running", "thinking", "peak"];

describe("Theme Registry（规划 §4）", () => {
  let mod;

  beforeEach(async () => {
    mod = await load("app/lib/theme-registry.ts");
  });

  test("10 个主题，ID 唯一", () => {
    const ids = mod.THEMES.map((t) => t.id);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10, "ID 不得重复");
  });

  test("保留全部旧 ID（10 个）", () => {
    const ids = mod.THEMES.map((t) => t.id).sort();
    assert.deepEqual(ids, [
      "atom-lab",
      "crystal-cave",
      "deep-space",
      "nebula-drift",
      "ocean-void",
      "photon-field",
      "quantum-garden",
      "rust-chamber",
      "solar-forge",
      "void-signal",
    ]);
  });

  test("每个主题齐全 colors 9 键 / glass 4 键 / energy 4 键", () => {
    for (const theme of mod.THEMES) {
      for (const key of REQUIRED_COLORS) {
        assert.ok(typeof theme.colors[key] === "string" && theme.colors[key].length > 0, `${theme.id}.colors.${key}`);
      }
      for (const key of REQUIRED_GLASS) {
        assert.ok(typeof theme.glass[key] === "string" && theme.glass[key].length > 0, `${theme.id}.glass.${key}`);
      }
      for (const key of REQUIRED_ENERGY) {
        assert.ok(typeof theme.energy[key] === "string" && theme.energy[key].length > 0, `${theme.id}.energy.${key}`);
      }
      assert.ok(theme.name.length > 0);
      assert.ok(theme.description.length > 0);
    }
  });

  test("默认主题为 deep-space", () => {
    assert.equal(mod.DEFAULT_THEME, "deep-space");
  });

  test("getThemeDefinition 未知 ID 回退 deep-space", () => {
    const fallback = mod.getThemeDefinition("not-a-theme");
    assert.equal(fallback.id, "deep-space");
    assert.equal(mod.getThemeDefinition("solar-forge").id, "solar-forge");
  });

  test("太阳熔炉/磁暴极光 energy 为规划 §4.3 专用值（hex 大小写不敏感）", () => {
    const hex = (v) => v.toLowerCase();
    const solar = mod.getThemeDefinition("solar-forge");
    assert.equal(hex(solar.energy.idle), hex("#54E6B4"));
    assert.equal(hex(solar.energy.running), hex("#3BC7FF"));
    assert.equal(hex(solar.energy.thinking), hex("#7A76FF"));
    assert.equal(hex(solar.energy.peak), hex("#F05BC8"));

    const rust = mod.getThemeDefinition("rust-chamber");
    assert.equal(hex(rust.energy.idle), hex("#4FB7FF"));
    assert.equal(hex(rust.energy.running), hex("#8A6DFF"));
    assert.equal(hex(rust.energy.thinking), hex("#F05BC8"));
    assert.equal(hex(rust.energy.peak), hex("#FF4FBF"));
  });

  test("七套重构主题 primary 采用规划 §4.2 新主色（hex 大小写不敏感）", () => {
    const hex = (v) => v.toLowerCase();
    const expected = {
      "atom-lab": "#B7F36B",
      "solar-forge": "#54E6B4",
      "void-signal": "#37E0D1",
      "rust-chamber": "#F05BC8",
      "photon-field": "#FFE3A1",
      "ocean-void": "#42E8C4",
      "crystal-cave": "#9CEBFF",
    };
    for (const [id, primary] of Object.entries(expected)) {
      const theme = mod.getThemeDefinition(id);
      assert.equal(hex(theme.colors.primary), hex(primary), `${id}`);
    }
  });

  test("三套保留主题主色保持原值（hex 大小写不敏感）", () => {
    const hex = (v) => v.toLowerCase();
    const expected = {
      "deep-space": "#E89840",
      "quantum-garden": "#9880D0",
      "nebula-drift": "#E87898",
    };
    for (const [id, primary] of Object.entries(expected)) {
      assert.equal(hex(mod.getThemeDefinition(id).colors.primary), hex(primary), id);
    }
  });

  test("glass.highlight 统一白色镜面细线", () => {
    for (const theme of mod.THEMES) {
      assert.match(theme.glass.highlight, /^rgba\(255,255,255,/u, `${theme.id}`);
    }
  });

  test("能源状态字面量与 appearance-types 一致", async () => {
    const types = await load("app/lib/appearance-types.ts");
    for (const theme of mod.THEMES) {
      assert.deepEqual(Object.keys(theme.energy).sort(), [...types.THEME_ENERGY_STATES].sort());
    }
  });
});
