"use strict";

const assert = require("node:assert/strict");
const { beforeEach, describe, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

async function load(relativePath) {
  const url = pathToFileURL(path.join(REPO_ROOT, relativePath));
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

describe("creative-motion 基础", () => {
  let motion;

  beforeEach(async () => {
    motion = await load("app/lib/creative-motion.ts");
  });

  test("CREATIVE_MOTION 导出固定面板、指示器、退出与交互 token", () => {
    assert.deepEqual(motion.CREATIVE_MOTION.panelSpring, { type: "spring", stiffness: 320, damping: 30, mass: 0.8 });
    assert.deepEqual(motion.CREATIVE_MOTION.indicatorSpring, { type: "spring", stiffness: 360, damping: 32, mass: 0.75 });
    assert.equal(motion.CREATIVE_MOTION.exitDuration, 0.14);
    assert.equal(motion.CREATIVE_MOTION.hoverDuration, 0.14);
    assert.equal(motion.CREATIVE_MOTION.pressDuration, 0.09);
    assert.equal(motion.CREATIVE_MOTION.reducedMotionDuration, 0.08);
    assert.equal(motion.CREATIVE_MOTION.pressScale, 0.97);
  });

  test("motionDirection 根据固定顺序返回 -1、0 或 1", () => {
    const order = ["coze", "assistant", "workflow", "collaboration"];
    assert.equal(motion.motionDirection(order, "coze", "collaboration"), 1);
    assert.equal(motion.motionDirection(order, "collaboration", "coze"), -1);
    assert.equal(motion.motionDirection(order, "workflow", "workflow"), 0);
  });

  test("降低动态变体移除位移和缩放，且仅保留不超过 80ms 的透明度过渡", () => {
    const variants = motion.createDirectionalVariants({ offset: 12, reducedMotion: true });
    const enter = variants.enter(1);
    const active = variants.active;
    const exit = variants.exit(-1);

    for (const variant of [enter, active, exit]) {
      assert.equal("x" in variant, false);
      assert.equal("y" in variant, false);
      assert.equal("scale" in variant, false);
      assert.ok(!variant.transition || variant.transition.duration <= 0.08);
    }
  });
});

describe("useCreativeMotion 偏好监听契约", () => {
  test("SSR 与水合首帧 fail-safe 为 reduced，effect 后才同步真实偏好", () => {
    const hook = read("app/hooks/useCreativeMotion.ts");
    assert.match(hook, /useState\(true\)/);
    assert.match(hook, /useEffect\(\(\) => \{[\s\S]{0,320}const sync = \(\) => setReducedMotion\(readReducedMotionPreference\(\)\);[\s\S]{0,80}sync\(\);/);
  });

  test("同时读取系统 reduce-motion 与根节点数据集，并清理两类监听", () => {
    const hook = read("app/hooks/useCreativeMotion.ts");
    assert.match(hook, /prefers-reduced-motion:\s*reduce/);
    assert.match(hook, /document\.documentElement\.dataset\.reducedMotion\s*===\s*["']true["']/);
    assert.match(hook, /addEventListener\(["']change["']/);
    assert.match(hook, /removeEventListener\(["']change["']/);
    assert.match(hook, /addEventListener\(["']tszh_preferences_changed["']/);
    assert.match(hook, /removeEventListener\(["']tszh_preferences_changed["']/);
    assert.match(hook, /return\s+\{\s*reducedMotion\s*\}/);
  });
});
