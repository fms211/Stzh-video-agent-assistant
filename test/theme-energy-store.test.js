"use strict";

// 08-29 — Task 3: 能谱状态（规划 §4.3）
// 优先级 running > thinking > idle；peak 仅上升沿 + 主题门控 + 有界 900ms；
// reduced-motion 静态降级；禁止 setInterval 循环。

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

describe("theme-energy-store（规划 §4.3）", () => {
  let mod;
  let store;

  beforeEach(async () => {
    mod = await load("app/lib/theme-energy-store.ts");
    store = mod.createThemeEnergyStore();
  });

  test("初始 idle", () => {
    assert.equal(store.getState(), "idle");
  });

  test("setSource running → running", () => {
    store.setSource("coze-task", "running");
    assert.equal(store.getState(), "running");
  });

  test("优先级 running > thinking（两者并存时 running 显形）", () => {
    store.setSource("coze-thinking", "thinking");
    assert.equal(store.getState(), "thinking");
    store.setSource("coze-task", "running");
    assert.equal(store.getState(), "running", "running 优先于 thinking");
    store.clearSource("coze-task");
    assert.equal(store.getState(), "thinking", "running 消失后 thinking 显形");
  });

  test("clearSource 后无来源回 idle", () => {
    store.setSource("assistant", "running");
    store.clearSource("assistant");
    assert.equal(store.getState(), "idle");
  });

  test("busy/active 归一为 running", () => {
    store.setSource("research", "busy");
    assert.equal(store.getState(), "running");
  });

  test("订阅者收到状态变化", () => {
    let seen = null;
    const unsub = store.subscribe(() => { seen = store.getState(); });
    store.setSource("coze-task", "running");
    assert.equal(seen, "running");
    unsub();
    store.clearSource("coze-task");
    assert.equal(seen, "running", "退订后不再通知");
  });

  test("peak 在上升沿触发（非 idle → running）且 900ms 内回落", async () => {
    store.setThemeForPeak("solar-forge");
    store.setSource("coze-task", "running");
    const atPeak = store.getState();
    assert.equal(atPeak, "peak", "上升沿应短暂进入 peak");
    await new Promise((r) => setTimeout(r, 950));
    assert.equal(store.getState(), "running", "peak 结束后回落 running");
  });

  test("peak 只在 solar-forge/rust-chamber 主题触发", () => {
    store.setThemeForPeak("deep-space");
    store.setSource("coze-task", "running");
    assert.equal(store.getState(), "running", "非专用主题不触发 peak");
  });

  test("peak 时长不超过 900ms 常量", async () => {
    const mod2 = await load("app/lib/theme-energy-store.ts");
    assert.equal(mod2.MAX_PEAK_MS, 900);
  });

  test("重复 setSource 同态不重复触发 peak", () => {
    store.setThemeForPeak("rust-chamber");
    store.setSource("coze-task", "running");
    assert.equal(store.getState(), "peak");
    // 再次 setSource running（无状态变化）不应再触发
    store.setSource("coze-task", "running");
    assert.equal(store.getState(), "peak");
  });

  test("reduced-motion 时静态降级（no peak 动画）", () => {
    store.setReducedMotion(true);
    store.setThemeForPeak("solar-forge");
    store.setSource("coze-task", "running");
    assert.equal(store.getState(), "running", "reduced-motion 下不触发 peak");
  });
});

describe("theme-energy 禁 setInterval（契约）", () => {
  test("store 与 hook 文件不含 setInterval", async () => {
    const fs = require("node:fs");
    const storeSrc = fs.readFileSync(path.join(REPO_ROOT, "app/lib/theme-energy-store.ts"), "utf8");
    assert.doesNotMatch(storeSrc, /setInterval/);
    const hookSrc = fs.readFileSync(path.join(REPO_ROOT, "app/hooks/useThemeEnergy.ts"), "utf8");
    assert.doesNotMatch(hookSrc, /setInterval/);
  });
});
