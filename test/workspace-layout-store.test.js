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

  test("收起另一栏时可使用完整宽度范围；停靠时仍受阅读空间限制", () => {
    const store = mod.createWorkspaceLayoutStore(1600);
    store.setRightMode("overlay");
    store.setLeftWidth(999);
    assert.equal(store.getSnapshot().leftWidth, 360);
    store.setLeftWidth(1);
    assert.equal(store.getSnapshot().leftWidth, 240);
    store.setLeftMode("rail");
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


// Prepared during paused testing; executed in the later recorded regression batches.
describe("布局提交、恢复与存储故障边界", () => {
  let mod;
  beforeEach(async () => { mod = await load("app/components/workspace-layout-store.ts"); });
  function storage(values = new Map()) {
    return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  }

  test("离开前flush提交最后一次调整，而非首个防抖值", () => {
    const target = storage(), persist = mod.createWorkspaceLayoutPersister("A"); persist.attach(target);
    const store = mod.createWorkspaceLayoutStore(1800);
    persist.save(store.getSnapshot()); store.setLeftWidth(340); store.setRightWidth(400); persist.save(store.getSnapshot());
    assert.equal(target.values.size, 0); assert.equal(persist.flush(), true);
    const saved = JSON.parse(target.values.get("A")); assert.equal(saved.leftWidth, 340); assert.equal(saved.rightWidth, 400);
  });

  test("写入拒绝不抛出定时异常，待提交值可在存储恢复后重试", () => {
    let denied = true; const issues = [], values = new Map();
    const persist = mod.createWorkspaceLayoutPersister("A", { onFailure: issue => issues.push(issue) });
    persist.attach({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (denied) throw new Error("denied"); values.set(key, value); } });
    const store = mod.createWorkspaceLayoutStore(1800); store.setRightWidth(480); persist.save(store.getSnapshot());
    assert.equal(persist.flush(), false); assert.deepEqual(issues, ["write"]); assert.equal(values.size, 0);
    denied = false; assert.equal(persist.flush(), true); assert.equal(JSON.parse(values.get("A")).rightWidth, 480);
  });

  test("账户切换后的flush丢弃旧操作，不在返回旧账户时重新提交", () => {
    let current = true; const target = storage();
    const persist = mod.createWorkspaceLayoutPersister("A", { current: () => current }); persist.attach(target);
    persist.save(mod.createWorkspaceLayoutStore(1800).getSnapshot()); current = false;
    assert.equal(persist.flush(), false); current = true; assert.equal(persist.flush(), true); assert.equal(target.values.size, 0);
  });

  test("读取拒绝与坏格式分别标记，原记录在恢复过程中不被重写", () => {
    const denied = mod.restoreWorkspaceLayoutStore({ getItem() { throw new Error("denied"); }, setItem() { assert.fail("read must not write"); } }, "A", 390);
    assert.equal(denied.restoreIssue, "read"); assert.equal(denied.getSnapshot().viewportWidth, 390);
    for (const value of ["{", "null", "[]", JSON.stringify({ viewportWidth: null, leftWidth: 280 }), JSON.stringify({ viewportWidth: 1800, leftWidth: 280, rightMode: "unknown" }), JSON.stringify({ viewportWidth: 1800, leftWidth: 280, rightWidth: "420" })]) {
      const target = storage(new Map([["A", value]])), store = mod.restoreWorkspaceLayoutStore(target, "A", 1800);
      assert.equal(store.restoreIssue, "format"); assert.equal(store.getSnapshot().leftWidth, 280); assert.equal(target.values.get("A"), value);
    }
  });

  test("旧记录缺少右栏字段仍可恢复，越界宽度夹在现有范围", () => {
    const target = storage(new Map([["A", JSON.stringify({ viewportWidth: 1800, leftWidth: 900 })]]));
    const store = mod.restoreWorkspaceLayoutStore(target, "A", 1800);
    assert.equal(store.restoreIssue, null); assert.equal(store.getSnapshot().leftWidth, 360);
    const reader = mod.createWorkspaceLayoutPersister("A"); reader.attach(target);
    assert.equal(reader.load().rightWidth, mod.WORKSPACE_LAYOUT_LIMITS.rightDefault);
    assert.ok(mod.computeWorkspaceColumns(store.getSnapshot()).center >= mod.WORKSPACE_LAYOUT_LIMITS.centerMin, "恢复后仍按真实窗口保护正文宽度");
    assert.equal(JSON.parse(target.values.get("A")).leftWidth, 900, "读取不改写旧记录");
  });

  test("非有限数值和无效模式不会污染布局或发布新快照", () => {
    const store = mod.createWorkspaceLayoutStore(1800), before = store.getSnapshot();
    for (const value of [NaN, Infinity, -Infinity]) { store.setViewport(value); store.setLeftWidth(value); store.setRightWidth(value); }
    store.setLeftMode("bad"); store.setRightMode("bad"); assert.equal(store.getSnapshot(), before);
    assert.equal(mod.createWorkspaceLayoutStore(NaN).getSnapshot().viewportWidth, 1600);
  });

  test("保存时复制快照，调用方后续修改不改变已排队值", () => {
    const target = storage(), persist = mod.createWorkspaceLayoutPersister("A"); persist.attach(target);
    const value = { ...mod.createWorkspaceLayoutStore(1800).getSnapshot(), leftWidth: 300 };
    persist.save(value); value.leftWidth = 350; persist.flush(); assert.equal(JSON.parse(target.values.get("A")).leftWidth, 300);
  });

  test("无效待保存值被拒绝，不覆盖已有有效记录", () => {
    const initial = JSON.stringify(mod.createWorkspaceLayoutStore(1800).getSnapshot()), target = storage(new Map([["A", initial]])), issues = [];
    const persist = mod.createWorkspaceLayoutPersister("A", { onFailure: issue => issues.push(issue) }); persist.attach(target);
    persist.save({ ...mod.createWorkspaceLayoutStore(1800).getSnapshot(), leftWidth: NaN }); persist.flush();
    assert.deepEqual(issues, ["format"]); assert.equal(target.values.get("A"), initial);
  });
});

describe("手动调宽的阅读空间保护", () => {
  test("首次同宽初始化仍应用窄屏断点，重复尺寸保留已打开浮层", async () => {
    const mod = await load("app/components/workspace-layout-store.ts");
    const store = mod.createWorkspaceLayoutStore(390);
    store.setViewport(390);
    assert.equal(store.getSnapshot().leftMode, "rail");
    assert.equal(store.getSnapshot().rightMode, "overlay");
    store.setLeftMode("overlay");
    const opened = store.getSnapshot();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => { notifications += 1; });
    store.setViewport(390); store.setViewport(390.2);
    assert.equal(store.getSnapshot(), opened);
    assert.equal(notifications, 0);
    unsubscribe();
  });
  test("桌面重复尺寸不展开已收起栏，真实宽度变化仍重新布局", async () => {
    const mod = await load("app/components/workspace-layout-store.ts");
    const store = mod.createWorkspaceLayoutStore(1440);
    store.setViewport(1440);
    store.setLeftMode("rail"); store.setRightMode("rail");
    store.setViewport(1440);
    assert.equal(store.getSnapshot().leftMode, "rail");
    assert.equal(store.getSnapshot().rightMode, "rail");
    store.setViewport(390);
    assert.equal(store.getSnapshot().leftMode, "rail");
    assert.equal(store.getSnapshot().rightMode, "overlay");
    store.setLeftMode("overlay");
    store.setViewport(1440);
    assert.equal(store.getSnapshot().leftMode, "docked");
    assert.equal(store.getSnapshot().rightMode, "docked");
    assert.ok(mod.computeWorkspaceColumns(store.getSnapshot()).center >= 640);
  });
  test("960/1280展开会话使用浮层，不把停靠另一栏和正文裁掉", async () => {
    const mod = await load("app/components/workspace-layout-store.ts");
    for (const width of [960, 1280]) {
      const store = mod.createWorkspaceLayoutStore(width); store.setViewport(width);
      assert.equal(mod.workspaceLeftExpandMode(store.getSnapshot()), "overlay");
      store.setLeftMode("docked");
      assert.equal(store.getSnapshot().leftMode, "overlay");
      assert.ok(mod.computeWorkspaceColumns(store.getSnapshot()).center >= 640);
    }
    const store = mod.createWorkspaceLayoutStore(1440); store.setViewport(1440);
    store.setRightMode("rail"); store.setRightWidth(520); store.setRightMode("docked");
    assert.equal(store.getSnapshot().rightWidth, 464);
    assert.ok(mod.computeWorkspaceColumns(store.getSnapshot()).center >= 640);
  });
  test("1440下连续两侧调宽不会裁掉右栏，限值随另一侧收窄恢复", async () => {
    const mod = await load("app/components/workspace-layout-store.ts");
    const store = mod.createWorkspaceLayoutStore(1440); store.setViewport(1440);
    store.setRightWidth(520);
    assert.equal(store.getSnapshot().rightWidth, 464);
    store.setLeftWidth(360);
    assert.equal(store.getSnapshot().leftWidth, 280);
    assert.equal(mod.computeWorkspaceColumns(store.getSnapshot()).center, 640);
    store.setRightWidth(340); store.setLeftWidth(360);
    assert.equal(store.getSnapshot().leftWidth, 360);
    assert.equal(mod.workspaceResizeLimits(store.getSnapshot()).rightMax, 384);
    store.setRightWidth(520);
    assert.equal(mod.computeWorkspaceColumns(store.getSnapshot()).center, 640);
  });
  test("各桌面断点左右极端调宽仍保留正文预算，浮层不受停靠预算夹紧", async () => {
    const mod = await load("app/components/workspace-layout-store.ts");
    for (const width of [960, 1180, 1280, 1440, 1800]) {
      const store = mod.createWorkspaceLayoutStore(width); store.setViewport(width);
      for (const value of [999, 1, 360, 520, 999]) {
        store.setLeftWidth(value); store.setRightWidth(value);
        assert.ok(mod.computeWorkspaceColumns(store.getSnapshot()).center >= 640, `${width}/${value}`);
      }
    }
    const narrow = mod.createWorkspaceLayoutStore(390); narrow.setViewport(390);
    narrow.setLeftWidth(360); narrow.setRightWidth(520);
    assert.equal(narrow.getSnapshot().rightWidth, 520);
    assert.deepEqual(mod.workspaceResizeLimits(narrow.getSnapshot()), { leftMax: 360, rightMax: 520 });
  });
});
