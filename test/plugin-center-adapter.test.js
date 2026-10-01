"use strict";

// 08-28 Hermes 插件中心 — B-Task 10/14: PluginCenterAdapter 行为测试 + bridge 校验测试
// 运行: node --test test/plugin-center-adapter.test.js
// 机制: 与 research-runtime 相同——Node 25 原生 type-stripping 动态 import .ts

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

// ---------- 工具 ----------

function memoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

const accept = (preview, overrides = {}) => ({
  previewHash: preview.previewHash,
  acceptedPermissionTier: "standard",
  acceptsUnsignedRisk: true,
  acceptsOpenInternetBuildScripts: true,
  acceptsWeakSandboxRisk: true,
  ...overrides,
});

async function waitFor(fn, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let value = await fn();
  while (!value && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
    value = await fn();
  }
  return value;
}

async function waitStatus(adapter, projectId, statuses) {
  return waitFor(async () => {
    const gen = await adapter.getProjectGeneration(projectId);
    return gen && statuses.includes(gen.status) ? gen : null;
  });
}

async function installCatalog(adapter, catalogId, version, overrides = {}) {
  const preview = await adapter.resolveSource({ type: "catalog", catalogId, version });
  return adapter.install(preview.previewId, accept(preview, overrides));
}

// ---------- B-Task 10: Adapter 行为 ----------

describe("MockPluginCenterAdapter", () => {
  let mod;
  let storage;

  beforeEach(async () => {
    mod = await load("app/lib/plugin-center/mock-adapter.ts");
    storage = memoryStorage();
  });

  test("目录查询：按文本/签名/权限筛选，返回分页", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 1 }, storage });

    const all = await adapter.searchCatalog({ text: "", category: null, signature: "all", permissionTier: null, cursor: null, limit: 50 });
    assert.ok(all.items.length >= 6, `fixture 至少 6 个，实际 ${all.items.length}`);

    const byText = await adapter.searchCatalog({ text: "风格", category: null, signature: "all", permissionTier: null, cursor: null, limit: 50 });
    assert.ok(byText.items.every((item) => item.manifest.name.includes("风格") || item.manifest.description.includes("风格")));

    const unsigned = await adapter.searchCatalog({ text: "", category: null, signature: "unsigned", permissionTier: null, cursor: null, limit: 50 });
    // unsigned 筛选的语义：fixture 标记未签名的条目（社区 npm 包在结果里，官方签名包不在）
    assert.ok(unsigned.items.some((item) => item.manifest.id === "com.stzh.narrative-flow"));
    assert.equal(unsigned.items.some((item) => item.manifest.id === "com.stzh.style-kit"), false);

    const full = await adapter.searchCatalog({ text: "", category: null, signature: "all", permissionTier: "full", cursor: null, limit: 50 });
    assert.ok(full.items.every((item) => item.manifest.requestedPermissionTier === "full"));

    adapter.dispose();
  });

  test("解析 → 安装 → 账户库多版本并存；预览哈希不匹配被拒绝", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 1 }, storage });

    const preview = await adapter.resolveSource({ type: "catalog", catalogId: "com.stzh.style-kit", version: "1.0.0" });
    assert.ok(preview.previewHash);
    assert.equal(preview.manifest.schemaVersion, 1);
    assert.ok(Array.isArray(preview.dependencies));
    assert.ok(Array.isArray(preview.buildScripts));

    const pkg = await adapter.install(preview.previewId, accept(preview));
    assert.equal(pkg.installStatus, "installed");
    assert.equal(pkg.pluginId, "com.stzh.style-kit");
    assert.equal(pkg.version, "1.0.0");
    assert.ok(pkg.contentHash.length === 64, "SHA-256 hex");

    // 同插件第二版本
    const pkg2 = await installCatalog(adapter, "com.stzh.style-kit", "2.0.0");
    assert.equal(pkg2.version, "2.0.0");

    const library = await adapter.listAccountPackages();
    const versions = library.filter((p) => p.pluginId === "com.stzh.style-kit").map((p) => p.version);
    assert.deepEqual(versions.sort(), ["1.0.0", "2.0.0"]);

    // 预览哈希不匹配（重放旧 previewId 携带错哈希）→ 拒绝
    const preview3 = await adapter.resolveSource({ type: "catalog", catalogId: "com.stzh.style-kit", version: "2.0.0" });
    await assert.rejects(
      () => adapter.install(preview3.previewId, { ...accept(preview3), previewHash: "deadbeef".repeat(8) }),
      /PREVIEW_HASH_MISMATCH/,
    );

    adapter.dispose();
  });

  test("项目绑定与版本固定：新版本安装不改 pin；跨项目不同版本；低于最低权限档禁用确认", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 17 }, storage });

    const first = await installCatalog(adapter, "com.stzh.style-kit", "1.0.0");
    await adapter.bindProjectPlugin("project-a", {
      pluginId: first.pluginId,
      version: first.version,
      installationId: first.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });

    // 新版本安装后 pin 不变（规划 Task 10 Step 1 示例场景）
    await installCatalog(adapter, "com.stzh.style-kit", "2.0.0");
    const bindings = await adapter.listProjectBindings("project-a");
    const binding = bindings.find((b) => b.pluginId === "com.stzh.style-kit");
    assert.equal(binding.version, "1.0.0");

    // project-b 固定 2.0.0
    const pkg2 = (await adapter.listAccountPackages()).find((p) => p.pluginId === "com.stzh.style-kit" && p.version === "2.0.0");
    await adapter.bindProjectPlugin("project-b", {
      pluginId: pkg2.pluginId,
      version: pkg2.version,
      installationId: pkg2.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });
    const bindingsB = await adapter.listProjectBindings("project-b");
    assert.equal(bindingsB.find((b) => b.pluginId === "com.stzh.style-kit").version, "2.0.0");

    // 低于 manifest requested tier → 拒绝（PERMISSION_TIER_TOO_LOW）
    const fullPreview = await adapter.resolveSource({ type: "catalog", catalogId: "com.stzh.risk-runner", version: "1.0.0" });
    assert.equal(fullPreview.manifest.requestedPermissionTier, "full");
    const fullPkg = await adapter.install(fullPreview.previewId, accept(fullPreview, { acceptedPermissionTier: "full" }));
    await assert.rejects(
      () =>
        adapter.bindProjectPlugin("project-a", {
          pluginId: fullPkg.pluginId,
          version: fullPkg.version,
          installationId: fullPkg.installationId,
          permissionTier: "safe",
          enabled: true,
          config: {},
        }),
      /PERMISSION_TIER_TOO_LOW/,
    );

    adapter.dispose();
  });

  test("权限升级：新版本提高 requested tier 后，旧项目授权保持且要求重新确认（不自动升级）", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 21 }, storage });

    const v1 = await installCatalog(adapter, "com.stzh.upgrade-demo", "1.0.0");
    await adapter.bindProjectPlugin("project-a", {
      pluginId: v1.pluginId,
      version: "1.0.0",
      installationId: v1.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });

    // 2.0.0 请求 full
    const v2 = await installCatalog(adapter, "com.stzh.upgrade-demo", "2.0.0");
    assert.equal(v2.manifest.requestedPermissionTier, "full");

    // 旧 binding 保持 1.0.0 + standard，不被自动升级
    const bindings = await adapter.listProjectBindings("project-a");
    const b = bindings.find((x) => x.pluginId === "com.stzh.upgrade-demo");
    assert.equal(b.version, "1.0.0");
    assert.equal(b.permissionTier, "standard");

    // 显式把项目切到 2.0.0 且只给 standard → 拒绝；给 full → 成功
    await assert.rejects(
      () => adapter.changeProjectVersion("project-a", v2.pluginId, "2.0.0"),
      /RISK_CONFIRMATION_REQUIRED/,
    );
    await adapter.changeProjectVersion("project-a", v2.pluginId, "2.0.0", { acceptedPermissionTier: "full" });
    const after = (await adapter.listProjectBindings("project-a")).find((x) => x.pluginId === v2.pluginId);
    assert.equal(after.version, "2.0.0");
    assert.equal(after.permissionTier, "full");

    adapter.dispose();
  });

  test("被引用版本拒绝删除；未引用版本可删除", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 3 }, storage });

    const pkg = await installCatalog(adapter, "com.stzh.style-kit", "1.0.0");
    await adapter.bindProjectPlugin("project-a", {
      pluginId: pkg.pluginId,
      version: pkg.version,
      installationId: pkg.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });

    const result = await adapter.uninstallVersion(pkg.pluginId, pkg.version);
    assert.equal(result.status, "blocked");
    assert.ok(result.projectIds.includes("project-a"));

    // 未引用版本
    const other = await installCatalog(adapter, "com.stzh.style-kit", "2.0.0");
    const ok = await adapter.uninstallVersion(other.pluginId, other.version);
    assert.equal(ok.status, "deleted");

    adapter.dispose();
  });

  test("卸载后数据进入 30 天隔离区；可恢复、可永久删除", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 4 }, storage });

    const pkg = await installCatalog(adapter, "com.stzh.style-kit", "1.0.0");
    await adapter.uninstallVersion(pkg.pluginId, pkg.version);

    const quarantined = await adapter.listQuarantined();
    const entry = quarantined.find((q) => q.pluginId === pkg.pluginId);
    assert.ok(entry, "卸载后进入隔离区");
    assert.ok(entry.expiresAt > entry.deletedAt, "30 天过期时间存在");

    // 恢复（需重装同版本）
    const restored = await adapter.restoreQuarantined(entry.quarantineId);
    assert.equal(restored.pluginId, pkg.pluginId);

    // 再卸载 → 永久删除
    await adapter.uninstallVersion(pkg.pluginId, pkg.version);
    const q2 = (await adapter.listQuarantined()).find((x) => x.pluginId === pkg.pluginId);
    await adapter.purgeQuarantined(q2.quarantineId);
    assert.equal((await adapter.listQuarantined()).some((x) => x.quarantineId === q2.quarantineId), false);

    adapter.dispose();
  });

  test("Generation 生命周期：重建 → healthy；safe mode 空第三方 binding；rollback 到 last-known-good", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 5 }, storage });

    const pkg = await installCatalog(adapter, "com.stzh.style-kit", "1.0.0");
    await adapter.bindProjectPlugin("project-a", {
      pluginId: pkg.pluginId,
      version: pkg.version,
      installationId: pkg.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });

    // 触发重建
    let gen = await adapter.restartGeneration("project-a");
    assert.ok(["starting", "healthy", "failed"].includes(gen.status));
    gen = await waitStatus(adapter, "project-a", ["healthy", "failed"]);
    assert.equal(gen.status, "healthy");
    const healthyGenId = gen.id;

    // Safe Mode：空第三方 binding，仍保留 last-known-good
    const safe = await adapter.enterSafeMode("project-a");
    assert.equal(safe.status, "healthy");
    assert.equal(safe.bindings.length, 0, "safe mode 空第三方 binding");
    assert.ok(safe.lastKnownGoodId, "保留 last-known-good");

    // rollback 回健康快照
    const rolled = await adapter.rollbackGeneration("project-a", healthyGenId);
    assert.equal(rolled.status, "healthy");
    assert.equal(rolled.bindings.length, 1);
    assert.equal(rolled.bindings[0].pluginId, "com.stzh.style-kit");

    adapter.dispose();
  });

  test("Generation 失败：故障包触发 failed + 疑似插件；疑似插件禁用后重建 healthy", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 6 }, storage });

    const bad = await installCatalog(adapter, "com.stzh.crashy-tool", "1.0.0");
    await adapter.bindProjectPlugin("project-a", {
      pluginId: bad.pluginId,
      version: bad.version,
      installationId: bad.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });

    const gen = await waitStatus(adapter, "project-a", ["failed", "healthy"]);
    assert.equal(gen.status, "failed", "crashy-tool 触发 Generation 失败");
    assert.ok(gen.suspectedPluginIds.includes("com.stzh.crashy-tool"));

    // 禁用疑似插件 → 重建 → healthy
    await adapter.disableProjectPlugin("project-a", "com.stzh.crashy-tool");
    await adapter.restartGeneration("project-a");
    const ok = await waitStatus(adapter, "project-a", ["healthy", "failed"]);
    assert.equal(ok.status, "healthy");

    adapter.dispose();
  });

  test("owner 隔离：不同 owner 的包库/绑定/Generation 互不可见", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const a = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 7 }, storage });
    const pkg = await installCatalog(a, "com.stzh.style-kit", "1.0.0");
    await a.bindProjectPlugin("project-a", {
      pluginId: pkg.pluginId,
      version: pkg.version,
      installationId: pkg.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });
    a.dispose();

    const b = createMockPluginCenterAdapter({ owner: { kind: "guest" }, storage });
    try {
      assert.equal((await b.listAccountPackages()).length, 0);
      assert.equal((await b.listProjectBindings("project-a")).length, 0);
      const gen = await b.getProjectGeneration("project-a");
      assert.equal(gen.bindings.length, 0);
    } finally {
      b.dispose();
    }
  });

  test("订阅：安装/Generation 事件按 seq 连续投递", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 8 }, storage });
    const events = [];
    const sub = adapter.subscribe(null, 0, {
      onEvent(event) {
        events.push(event);
      },
      onError() {},
    });

    await installCatalog(adapter, "com.stzh.style-kit", "1.0.0");
    await adapter.bindProjectPlugin("project-a", {
      pluginId: "com.stzh.style-kit",
      version: "1.0.0",
      installationId: (await adapter.listAccountPackages())[0].installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });
    await waitStatus(adapter, "project-a", ["healthy", "failed"]);
    sub.close();

    assert.ok(events.length >= 3);
    for (let i = 1; i < events.length; i++) {
      assert.equal(events[i].seq, events[i - 1].seq + 1, "订阅流 seq 连续");
    }
    assert.ok(events.some((e) => e.type === "install.completed"));
    assert.ok(events.some((e) => e.type === "binding.updated"));

    adapter.dispose();
  });

  test("dispose 后再调用抛错；dispose 幂等", async () => {
    const { createMockPluginCenterAdapter } = mod;
    const adapter = createMockPluginCenterAdapter({ owner: { kind: "account", userId: 9 }, storage });
    adapter.dispose();
    adapter.dispose(); // 幂等
    await assert.rejects(() => adapter.listAccountPackages(), /AUTH_REQUIRED|disposed/);
  });
});

// ---------- B-Task 14: bridge 校验（同文件承载） ----------

describe("plugin bridge 校验", () => {
  test("合法消息通过；错误 frame/nonce/协议版本/未授权 action 拒绝", async () => {
    const { validateBridgeMessage } = await load("app/lib/plugin-center/bridge.ts");

    const context = {
      bridgeVersion: 1,
      frameId: "frame-1",
      frameToken: "tok-abc",
      nonce: "n-1",
      pluginId: "com.stzh.style-kit",
      projectId: "project-a",
      allowedActions: ["ui.setState", "ui.notify"],
    };

    const good = validateBridgeMessage(
      { bridgeVersion: 1, frameId: "frame-1", frameToken: "tok-abc", nonce: "n-1", action: "ui.setState", payload: {} },
      context,
    );
    assert.equal(good.ok, true);

    const badFrame = validateBridgeMessage(
      { bridgeVersion: 1, frameId: "frame-2", frameToken: "tok-abc", nonce: "n-1", action: "ui.setState", payload: {} },
      context,
    );
    assert.equal(badFrame.ok, false);

    const badVersion = validateBridgeMessage(
      { bridgeVersion: 2, frameId: "frame-1", frameToken: "tok-abc", nonce: "n-1", action: "ui.setState", payload: {} },
      context,
    );
    assert.equal(badVersion.ok, false);

    const badAction = validateBridgeMessage(
      { bridgeVersion: 1, frameId: "frame-1", frameToken: "tok-abc", nonce: "n-1", action: "host.exec", payload: {} },
      context,
    );
    assert.equal(badAction.ok, false);

    const badToken = validateBridgeMessage(
      { bridgeVersion: 1, frameId: "frame-1", frameToken: "tok-wrong", nonce: "n-1", action: "ui.setState", payload: {} },
      context,
    );
    assert.equal(badToken.ok, false);
  });
});
