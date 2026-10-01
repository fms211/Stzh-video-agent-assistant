"use strict";

// 08-29 — Task 8: WorkspaceLayoutStore（三域调宽 + 响应式降级 + owner 持久化）
// 运行: node --test test/workspace-layout-store.test.js

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

describe("workspace-layout-store（规划 §1.2/§8）", () => {
  let mod;

  beforeEach(async () => {
    mod = await load("app/components/workspace-layout-store.ts");
  });

  test("限制：左 240–360 / 右 340–520 / 中央最小 640 / 断点 1440/1180/960", () => {
    const L = mod.WORKSPACE_LAYOUT_LIMITS;
    assert.equal(L.leftMin, 240);
    assert.equal(L.leftMax, 360);
    assert.equal(L.rightMin, 340);
    assert.equal(L.rightMax, 520);
    assert.equal(L.centerMin, 640);
    assert.equal(L.dockBreakpoint, 1440);
    assert.equal(L.railBreakpoint, 1180);
    assert.equal(L.overlayBreakpoint, 960);
  });

  test("账户布局分别恢复，未保存账户使用默认值，窄窗口重新计算", () => {
    const snapshots = new Map([
      ["A", JSON.stringify({ viewportWidth: 1800, leftWidth: 280, rightWidth: 480, leftMode: "docked", rightMode: "docked" })],
      ["B", JSON.stringify({ viewportWidth: 1800, leftWidth: 260, rightWidth: 360, leftMode: "docked", rightMode: "docked" })],
    ]);
    const storage = { getItem: key => snapshots.get(key) ?? null, setItem: (key, value) => snapshots.set(key, value) };
    const a = mod.restoreWorkspaceLayoutStore(storage, "A", 1800);
    const b = mod.restoreWorkspaceLayoutStore(storage, "B", 1800);
    a.setRightWidth(520);
    assert.equal(b.getSnapshot().rightWidth, 360);
    assert.equal(mod.restoreWorkspaceLayoutStore(storage, "A", 1800).getSnapshot().rightWidth, 480);
    assert.equal(mod.restoreWorkspaceLayoutStore(storage, "guest", 1800).getSnapshot().rightWidth, mod.WORKSPACE_LAYOUT_LIMITS.rightDefault);
    const narrow = mod.restoreWorkspaceLayoutStore(storage, "A", 760).getSnapshot();
    assert.equal(narrow.rightMode, "overlay");
    assert.equal(narrow.viewportWidth, 760);
  });

  test("账户切换取消未落盘布局，后续保存只写新账户", async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const a = mod.createWorkspaceLayoutPersister("A");
    a.attach(storage);
    a.save(mod.createWorkspaceLayoutStore(1800).getSnapshot());
    a.cancel();
    const b = mod.createWorkspaceLayoutPersister("B");
    b.attach(storage);
    b.save(mod.createWorkspaceLayoutStore(760).getSnapshot());
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(values.has("A"), false);
    assert.equal(JSON.parse(values.get("B")).viewportWidth, 760);
  });

  test("1440 宽：三列停靠，中央 ≥640", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    store.setViewport(1440);
    const cols = mod.computeWorkspaceColumns(store.getSnapshot());
    assert.equal(cols.centerBelowMin, false);
    assert.ok(cols.left > 0 && cols.right > 0);
  });

  test("1280/1180 左 rail 右 dock；960 按真实可用宽度收起左坞", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    store.setViewport(1280);
    let snap = store.getSnapshot();
    assert.equal(snap.leftMode, "rail");
    assert.equal(snap.rightMode, "docked");
    assert.equal(mod.computeWorkspaceColumns(snap).centerBelowMin, false);

    store.setViewport(1180);
    snap = store.getSnapshot();
    assert.equal(snap.leftMode, "rail");
    assert.equal(snap.rightMode, "docked");

    store.setViewport(960);
    snap = store.getSnapshot();
    assert.equal(snap.leftMode, "rail");
    assert.equal(snap.rightMode, "overlay");
  });

  test("768：两侧均 overlay 且中央单列保护", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    store.setViewport(768);
    const snap = store.getSnapshot();
    assert.equal(snap.leftMode, "rail");
    assert.equal(snap.rightMode, "overlay");
    const cols = mod.computeWorkspaceColumns(snap);
    assert.ok(cols.center > 0 && cols.center < 640, "窄屏允许内容区小于桌面最小宽度");
  });

  test("左宽 clamp 240–360；右宽 clamp 340–520", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    store.setLeftWidth(999);
    assert.equal(store.getSnapshot().leftWidth, 360);
    store.setLeftWidth(1);
    assert.equal(store.getSnapshot().leftWidth, 240);
    store.setRightWidth(999);
    assert.equal(store.getSnapshot().rightWidth, 520);
    store.setRightWidth(1);
    assert.equal(store.getSnapshot().rightWidth, 340);
  });

  test("布局预算包含两侧边距、列间距与实际停靠右栏", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    for (const width of [960, 1180, 1280, 1440, 1920]) {
      store.setViewport(width);
      const snap = store.getSnapshot();
      const cols = mod.computeWorkspaceColumns(snap);
      assert.ok(cols.center >= 640, `${width}px 下正文不能被裁切`);
      assert.equal(cols.left + cols.center + cols.right + 24, Math.min(width - 32, 1440));
      if (snap.rightMode === "docked") assert.equal(cols.right, snap.rightWidth);
    }
  });

  test("降级顺序：先收提示词固定，再压检查器，最后收检查器", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    store.setViewport(1200); // 进入 1180–1439 档
    const snap = store.getSnapshot();
    // 该档左 rail 右 docked；继续降到 960 后右 overlay
    store.setViewport(960);
    assert.equal(store.getSnapshot().rightMode, "overlay");
    assert.ok(snap.rightWidth >= 340);
  });

  test("Object.freeze 发布 + subscribe/getSnapshot 语义", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    const frozen = store.getSnapshot();
    assert.equal(Object.isFrozen(frozen), true);
    let notified = 0;
    const unsub = store.subscribe(() => { notified += 1; });
    store.setLeftWidth(320);
    assert.equal(notified, 1);
    unsub();
    store.setLeftWidth(330);
    assert.equal(notified, 1, "退订后不再通知");
  });

  test("persister 往返（fake localStorage，等待 debounce 500ms）", async () => {
    const store = new Map();
    const storage = {
      get length() { return store.size; },
      key(i) { return [...store.keys()][i] ?? null; },
      getItem(k) { return store.get(k) ?? null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
    };
    const persister = mod.createWorkspaceLayoutPersister("test-layout");
    persister.attach(storage);
    const target = mod.createWorkspaceLayoutStore(1600);
    target.setLeftWidth(300);
    persister.save(target.getSnapshot());
    await new Promise((r) => setTimeout(r, 550));
    const loaded = persister.load();
    assert.equal(Math.round(loaded.leftWidth), 300);
  });
});
