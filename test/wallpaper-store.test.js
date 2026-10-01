"use strict";

// 08-29 — Task 4: WallpaperStore（IndexedDB owner-scoped CRUD + 校验）
// 运行: node --test test/wallpaper-store.test.js（需要一个能注入内存 IDB 的 store 实现）

const assert = require("node:assert/strict");
const { test, describe, beforeEach } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createMemoryFactory } = require("./helpers/indexeddb-memory.js");

const REPO_ROOT = path.resolve(__dirname, "..");

async function load(relativePath) {
  const abs = path.join(REPO_ROOT, relativePath);
  const url = pathToFileURL(abs);
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

function makeAsset(overrides = {}) {
  return {
    id: "wall-1",
    ownerScope: "user:5",
    kind: "image",
    source: "local",
    mimeType: "image/png",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    url: undefined,
    posterBlob: undefined,
    width: 1920,
    height: 1080,
    durationMs: null,
    createdAt: 1000,
    lastUsedAt: 1000,
    ...overrides,
  };
}

function createAsyncRequestFactory() {
  const records = new Map();
  const request = (work) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      try {
        req.result = work();
        req.onsuccess?.();
      } catch (error) {
        req.error = error;
        req.onerror?.();
      }
    }, 5);
    return req;
  };
  const objectStore = {
    put(value) { return request(() => { records.set(String(value.id), value); return value.id; }); },
    get(id) { return request(() => records.get(String(id))); },
    getAll() { return request(() => [...records.values()]); },
    delete(id) { return request(() => records.delete(String(id))); },
  };
  const db = { transaction() { return { objectStore() { return objectStore; } }; } };
  return { async open() { return { db, version: 1 }; } };
}

describe("wallpaper-store（内存/注入 IDB）", () => {
  let mod;
  let factory;

  beforeEach(async () => {
    mod = await load("app/lib/wallpaper-store.ts");
    factory = createMemoryFactory();
    mod.setDatabaseFactoryForTest(factory); // 测试注入锚点
  });

  test("put 后 get 读回且 owner 匹配", async () => {
    const asset = makeAsset();
    await mod.putWallpaper(asset, "user:5");
    const read = await mod.getWallpaper(asset.id, "user:5");
    assert.equal(read.id, asset.id);
    assert.equal(read.ownerScope, "user:5");
    assert.equal(read.kind, "image");
  });

  test("owner 隔离：guest 读不到 user:5 的壁纸", async () => {
    const asset = makeAsset();
    await mod.putWallpaper(asset, "user:5");
    const read = await mod.getWallpaper(asset.id, "guest");
    assert.equal(read, null, "跨 owner 读取应返回 null");
  });

  test("list 按 owner 过滤", async () => {
    await mod.putWallpaper(makeAsset({ id: "a1", ownerScope: "user:5", lastUsedAt: 2 }), "user:5");
    await mod.putWallpaper(makeAsset({ id: "b1", ownerScope: "guest", lastUsedAt: 1 }), "guest");
    const userList = await mod.listWallpapers("user:5");
    assert.deepEqual(userList.map((w) => w.id), ["a1"]);
  });

  test("delete 后 get null；touch 更新 lastUsedAt", async () => {
    const asset = makeAsset();
    await mod.putWallpaper(asset, "user:5");
    await mod.touchWallpaper(asset.id, "user:5");
    const touched = await mod.getWallpaper(asset.id, "user:5");
    assert.ok(touched.lastUsedAt >= asset.lastUsedAt);
    await mod.deleteWallpaper(asset.id, "user:5");
    assert.equal(await mod.getWallpaper(asset.id, "user:5"), null);
  });

  test("Object URL 生命周期：创建/集中 revoke 不误删 exceptId", async () => {
    const a = await mod.createAssetObjectUrl(makeAsset({ id: "wa" }));
    const b = await mod.createAssetObjectUrl(makeAsset({ id: "wb" }));
    assert.ok(a.startsWith("blob:") && b.startsWith("blob:"), "创建对象 URL");
    mod.revokeAllAssetObjectUrls("wb"); // 保留 wb，revoke 其余（wa）被清理
    assert.equal(mod.hasObjectUrl("wa"), false);
    assert.equal(mod.hasObjectUrl("wb"), true);
  });
});

describe("wallpaper-validation（纯函数）", () => {
  let mod;

  beforeEach(async () => {
    mod = await load("app/lib/wallpaper-store.ts");
  });

  test("isValidWallpaperUrl 仅接受 https 且无账号密码", () => {
    assert.equal(mod.isValidWallpaperUrl("https://example.com/wall.jpg"), true);
    assert.equal(mod.isValidWallpaperUrl("http://example.com/wall.jpg"), false);
    assert.equal(mod.isValidWallpaperUrl("https://user:pass@example.com/wall.jpg"), false);
    assert.equal(mod.isValidWallpaperUrl("ftp://example.com/wall.jpg"), false);
    assert.equal(mod.isValidWallpaperUrl(""), false);
  });

  test("validateAppearance：fit 只允许 cover/contain，dim 范围", async () => {
    const base = (await load("app/lib/appearance-types.ts")).DEFAULT_WALLPAPER_APPEARANCE;
    assert.equal(mod.validateAppearance({ ...base, fit: "cover" }).ok, true);
    assert.equal(mod.validateAppearance({ ...base, fit: "contain" }).ok, true);
    const bad = mod.validateAppearance({ ...base, fit: "stretch" });
    assert.equal(bad.ok, false);
    const dimBad = mod.validateAppearance({ ...base, dim: 1.5 });
    assert.equal(dimBad.ok, false);
  });

  test("大小/分辨率上限消息含关键子串", async () => {
    const bigBlob = new Blob([new Uint8Array(26 * 1024 * 1024)]);
    const result = await mod.validateWallpaperInput("image", "local", bigBlob, null);
    assert.equal(result.ok, false);
    assert.match(result.error, /25 ?MiB|大小/u);
  });

  test("URL 输入拒绝非 HTTPS，并走 URL 专用校验而非文件缺失分支", async () => {
    const result = await mod.validateWallpaperInput("image", "url", null, "http://example.com/wall.jpg");
    assert.equal(result.ok, false);
    assert.match(result.error, /HTTPS/u);
  });
});

describe("wallpaper-store（真实 IndexedDB 异步请求语义）", () => {
  test("CRUD 等待 request success 后才返回", async () => {
    const mod = await load("app/lib/wallpaper-store.ts");
    mod.setDatabaseFactoryForTest(createAsyncRequestFactory());
    const asset = makeAsset({ id: "async-1" });
    await mod.putWallpaper(asset, "user:5");
    assert.equal((await mod.getWallpaper("async-1", "user:5"))?.id, "async-1");
    assert.deepEqual((await mod.listWallpapers("user:5")).map((item) => item.id), ["async-1"]);
    await mod.deleteWallpaper("async-1", "user:5");
    assert.equal(await mod.getWallpaper("async-1", "user:5"), null);
  });
});
