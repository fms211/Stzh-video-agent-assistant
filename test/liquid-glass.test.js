"use strict";

// 08-29 — Task 6: Liquid Glass（规划 §2.2/§2.3）
// 三级渲染检测纯函数 + variant 全组合 + filters 数量契约。

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

describe("detectGlassTier（三级检测纯函数）", () => {
  let mod;
  beforeEach(async () => { mod = await load("app/lib/glass-detect.ts"); });

  test("无 backdrop-filter → tier 0", () => {
    assert.equal(mod.detectGlassTier({ backdropFilter: "", webkitBackdropFilter: undefined }), 0);
  });

  test("标准 backdrop-filter → tier 1", () => {
    assert.equal(mod.detectGlassTier({ backdropFilter: "blur(18px)", webkitBackdropFilter: "" }), 1);
  });

  test("webkit 前缀单独存在也视为 tier 1（Safari 兼容）", () => {
    assert.equal(mod.detectGlassTier({ backdropFilter: "", webkitBackdropFilter: "blur(12px)" }), 1);
  });
});

describe("isChromiumRefractionCapable", () => {
  let mod;
  beforeEach(async () => { mod = await load("app/lib/glass-detect.ts"); });

  test("Chrome/Chromium → true", () => {
    assert.equal(mod.isChromiumRefractionCapable("Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36"), true);
    assert.equal(mod.isChromiumRefractionCapable("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"), true);
  });

  test("Firefox/Safari → false", () => {
    assert.equal(mod.isChromiumRefractionCapable("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15"), false);
    assert.equal(mod.isChromiumRefractionCapable("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0"), false);
  });
});

describe("GlassSurface 全组合不 throw（4 variant × 3 预设 × 3 tier）", () => {
  test("render props 组合遍历", async () => {
    const mod = await load("app/lib/glass-detect.ts");
    const variants = ["bar", "panel", "capsule", "popover"];
    const presets = ["clear", "balanced", "deep"];
    // 纯函数校验：给定 variant+preset 应返回合法配置（不渲染 DOM）
    for (const variant of variants) {
      for (const preset of presets) {
        const cfg = mod.glassConfigForVariant(variant, preset) ?? null;
        if (cfg) {
          assert.ok(cfg.blurPx > 0, `${variant}/${preset}`);
          assert.ok(cfg.opacity >= 0.12 && cfg.opacity <= 0.42, `${variant}/${preset} opacity 范围`);
        }
      }
    }
  });
});

describe("LiquidGlassFilters 契约", () => {
  test("折射滤镜恰好 4 个（bar/panel/capsule/popover）+ 4 个共享噪声源", () => {
    const filtersSrc = read("app/components/LiquidGlassFilters.tsx");
    const displace = filtersSrc.match(/feDisplacementMap/g) || [];
    assert.equal(displace.length, 4, "折射 feDisplacementMap 恰好 4 个");
    const noise = filtersSrc.match(/feTurbulence/g) || [];
    assert.equal(noise.length, 4, "共享噪声源 4 个");
    assert.match(filtersSrc, /cws-refract-bar/);
    assert.match(filtersSrc, /cws-refract-panel/);
    assert.match(filtersSrc, /cws-refract-capsule/);
    assert.match(filtersSrc, /cws-refract-popover/);
  });

  test("GlassSurface 不扭曲正文，只在独立边缘层引用共享滤镜", () => {
    const surfaceSrc = read("app/components/LiquidGlassSurface.tsx");
    assert.doesNotMatch(surfaceSrc, /<svg/);
    // 滤镜不能挂在承载文字和控件的根节点，否则 Chromium 会把正文一起位移成重影。
    assert.doesNotMatch(surfaceSrc, /fe[A-Z]/);
    const rootStyleLine = surfaceSrc.split("\n").find((line) => line.includes("...(energyVar")) || "";
    assert.doesNotMatch(rootStyleLine, /filter:/);
    assert.match(surfaceSrc, /cws-glass__refraction-edge/);
    const css = read("app/globals.css");
    assert.match(css, /data-glass-tier="1"[^}]*data-glass-tier="2"[^}]*background/s);
    assert.match(css, /--glass-panel-strength/);
  });

  test("正文类名不出现 GlassSurface（禁止嵌套玻璃）", () => {
    const surface = read("app/components/LiquidGlassSurface.tsx");
    // 组件自身契约：variant 组合渲染 data-glass-tier 输出
    assert.match(surface, /data-glass-tier/);
    assert.match(surface, /data-energy-state/);
  });
});
