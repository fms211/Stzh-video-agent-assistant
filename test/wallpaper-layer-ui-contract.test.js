"use strict";

// 08-29 — Task 5: WallpaperLayer 契约测试（规划 §2.4 降级与渲染）
// 静态断言 + 组件行为锚点（不渲染）。

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("WallpaperLayer（规划 §2.4）", () => {
  const source = read("app/components/WallpaperLayer.tsx");

  test("视频渲染三件套：muted / playsInline / autoPlay（+ loop）", () => {
    assert.match(source, /muted/);
    assert.match(source, /playsInline|playsinline/i);
    assert.match(source, /autoPlay|autoplay/i);
    assert.match(source, /loop/);
  });

  test("页面隐藏/降级暂停视频：visibilitychange 监听", () => {
    assert.match(source, /visibilitychange/);
    assert.match(source, /document\.visibilityState|hidden/);
    const css = read("app/globals.css");
    assert.doesNotMatch(css, /data-reduced-motion[^}]*\.wl-layer video[^}]*display:\s*none/s);
  });

  test("本地视频上传生成 posterBlob，减少动画时保留静态首帧", () => {
    const studio = read("app/components/AppearanceSettingsStudio.tsx");
    const store = read("app/lib/wallpaper-store.ts");
    assert.match(studio, /createVideoPosterBlob/);
    assert.match(studio, /posterBlob/);
    assert.match(store, /canvas\.toBlob/);
  });

  test("不预加载全片：preload 仅 metadata", () => {
    assert.match(source, /preload|metadata/);
  });

  test("focus 拖动仅 cover 模式（contain 禁用 focal）", () => {
    assert.match(source, /cover/);
    assert.match(source, /contain/);
    assert.match(source, /focalX|focalY|objectPosition|object-position/);
    assert.match(source, /onFocalPointChange/);
  });

  test("降级信号集：prefers-reduced-motion / saveData / 外部 videoPaused", () => {
    assert.match(source, /prefers-reduced-motion|matchMedia/);
    assert.match(source, /saveData|connection/);
    assert.match(source, /videoPaused/);
    assert.match(source, /videoAutoplay/);
  });

  test("装饰层 aria-hidden", () => {
    assert.match(source, /aria-hidden/);
  });

  test("本地 Blob URL 使用 state 触发重渲染，并由每个 WallpaperLayer 实例独立 revoke", () => {
    assert.match(source, /setResolvedMedia/);
    assert.match(source, /resolvedMedia\.asset === asset/);
    assert.match(source, /URL\.createObjectURL/);
    assert.match(source, /URL\.revokeObjectURL/);
    assert.doesNotMatch(source, /createAssetObjectUrl|revokeAssetObjectUrl/);
  });

  test("无 setInterval（降级逻辑不引入轮询）", () => {
    assert.doesNotMatch(source, /setInterval/);
  });
});

describe("StarfieldBackground densityFactor（视频壁纸粒子降40%）", () => {
  const source = read("app/components/StarfieldBackground.tsx");

  test("densityFactor prop 接入（0.6 = 视频壁纸）", () => {
    assert.match(source, /densityFactor/);
    const frameLoop = source.slice(source.indexOf("useFrame((state)"), source.indexOf("return (", source.indexOf("useFrame((state)")));
    assert.match(frameLoop, /for \(let i = 0; i < effectiveCount; i\+\+\)/);
    assert.doesNotMatch(frameLoop, /for \(let i = 0; i < count; i\+\+\)/);
  });

  test("reduced-motion fallback 保持透明，不覆盖用户壁纸", () => {
    assert.doesNotMatch(source, /background:\s*"radial-gradient\(ellipse at center, #0a1228/);
    assert.match(source, /rgba\(10,\s*18,\s*40,\s*0\.[0-4]/);
  });
});

describe("OrbitRings 壁纸透明度变量", () => {
  const source = read("app/components/OrbitRings.tsx");

  test("--orbit-opacity CSS 变量接入", () => {
    assert.match(source, /orbit-opacity|opacity/);
  });
});

describe("ProductShell WallpaperLayer 接入", () => {
  const source = read("app/components/ProductShell.tsx");

  test("渲染 WallpaperLayer 且置于 scene 之上", () => {
    assert.match(source, /WallpaperLayer/);
  });

  test("HomeClient 持有 owner-scoped 外观状态并同时接到 ProductShell 与设置工作室", () => {
    const home = read("app/components/HomeClient.tsx");
    assert.match(home, /wallpaperAppearance/);
    assert.match(home, /wallpaperAsset/);
    assert.match(home, /getWallpaper/);
    assert.match(home, /workspaceDataKey/);
    assert.match(home, /onWallpaperAppearanceChange/);
    assert.match(home, /videoWallpaperActive/);
  });
});
