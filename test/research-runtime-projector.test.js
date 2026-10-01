"use strict";

// 08-28 Hermes 研究运行工作台 — Task 1/2: 事件投影与 Mock Runtime 行为测试
// 运行: node --test test/research-runtime-projector.test.js
// 机制: Node 25 原生 type-stripping，动态 import .ts（projector/types 必须零依赖 erasable syntax）

const assert = require("node:assert/strict");
const { test, describe, beforeEach } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// test/ 位于仓库根下一级；__dirname = <repo>/test
const REPO_ROOT = path.resolve(__dirname, "..");

async function load(relativePath) {
  const abs = path.join(REPO_ROOT, relativePath);
  const url = pathToFileURL(abs);
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

// ---------- 测试数据工厂 ----------

test("context and candidate events advance the cursor without approving or completing research", async () => {
  const { projectRunEvent } = await load("app/lib/research-runtime/projector.ts");
  let snapshot = makeSnapshot({ status: "awaiting_plan_approval" });
  for (const [index, type] of ["context.prepared", "memory.candidate"].entries()) {
    const event = makeEvent({ type, seq: index + 1, payload: { status: "completed", approved: true } });
    const result = projectRunEvent(snapshot, event);
    assert.equal(result.needsResync, false);
    assert.equal(result.snapshot.status, "awaiting_plan_approval");
    assert.deepEqual(result.snapshot.metrics, snapshot.metrics);
    assert.deepEqual(result.snapshot.artifacts, []);
    assert.equal(result.snapshot.lastSeq, index + 1);
    snapshot = result.snapshot;
  }
});

function makeSnapshot(overrides = {}) {
  return {
    runId: "run-1",
    workflowId: "style-research",
    input: {
      styleName: "赛博朋克",
      useCase: "国产工业机器人 8 秒产品短片",
      providerId: null,
      projectId: null,
    },
    status: "draft",
    plan: null,
    activeStepId: null,
    sources: [],
    artifacts: [],
    metrics: {
      elapsedMs: 0,
      completedSteps: 0,
      totalSteps: 0,
      sourceCount: 0,
      modelCalls: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      ttftMs: null,
      estimatedCostCny: null,
    },
    error: null,
    lastSeq: 0,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    version: 1,
    runId: "run-1",
    seq: 1,
    type: "run.created",
    occurredAt: "2026-08-29T00:00:01.000Z",
    payload: {},
    ...overrides,
  };
}

function makePlan() {
  return {
    revision: 1,
    objective: "赛博朋克风格研究与应用",
    budget: "standard",
    estimatedCalls: 2,
    steps: [
      {
        id: "step-1",
        title: "读取 OPC 上下文",
        description: "",
        kind: "tool",
        tool: "get_opc_context",
        optional: false,
        enabled: true,
        dependsOn: [],
        input: {},
        status: "pending",
      },
      {
        id: "step-2",
        title: "风格视觉调研",
        description: "",
        kind: "tool",
        tool: "web_search",
        optional: false,
        enabled: true,
        dependsOn: ["step-1"],
        input: {},
        status: "pending",
      },
    ],
  };
}

// ---------- Task 1: 事件投影 ----------

describe("projectRunEvent", () => {
  let mod;

  beforeEach(async () => {
    mod = await load("app/lib/research-runtime/projector.ts");
  });

  test("按序应用事件并推进 lastSeq 与状态", async () => {
    const { projectRunEvent } = mod;
    const snapshot = makeSnapshot({ status: "planning", lastSeq: 0 });

    const r1 = projectRunEvent(snapshot, makeEvent({ seq: 1, type: "run.created" }));
    assert.equal(r1.duplicate, false);
    assert.equal(r1.needsResync, false);
    assert.equal(r1.snapshot.lastSeq, 1);
    assert.notEqual(r1.snapshot, snapshot, "必须返回新对象，不原地修改");
    assert.equal(snapshot.lastSeq, 0, "原 snapshot 不可被修改");

    const r2 = projectRunEvent(
      r1.snapshot,
      makeEvent({ seq: 2, type: "plan.generated", payload: { plan: makePlan() } }),
    );
    assert.equal(r2.snapshot.lastSeq, 2);
    assert.equal(r2.snapshot.status, "awaiting_plan_approval");
    assert.equal(r2.snapshot.metrics.totalSteps, 2);

    const r3 = projectRunEvent(
      r2.snapshot,
      makeEvent({ seq: 3, type: "plan.approved" }),
    );
    assert.equal(r3.snapshot.status, "awaiting_plan_approval", "approved 只确认计划，不启动");

    const r4 = projectRunEvent(
      r3.snapshot,
      makeEvent({ seq: 4, type: "run.started" }),
    );
    assert.equal(r4.snapshot.status, "running");
  });

  test("重复 seq 视为重复帧并忽略", async () => {
    const { projectRunEvent } = mod;
    const snapshot = makeSnapshot({ lastSeq: 3 });

    const result = projectRunEvent(snapshot, makeEvent({ seq: 3, type: "run.paused" }));
    assert.equal(result.duplicate, true);
    assert.equal(result.needsResync, false);
    assert.equal(result.snapshot, snapshot, "重复帧不产生新 snapshot");
  });

  test("seq gap 需要重同步且不修改 snapshot", async () => {
    const { projectRunEvent } = mod;
    const snapshot = makeSnapshot({ lastSeq: 3 });

    const result = projectRunEvent(snapshot, makeEvent({ seq: 5, type: "run.paused" }));
    assert.equal(result.needsResync, true);
    assert.equal(result.snapshot, snapshot);
    assert.equal(result.duplicate, false);
  });

  test("completed 状态拒绝 step.started（非法跃迁）", async () => {
    const { projectRunEvent } = mod;
    const snapshot = makeSnapshot({ status: "completed", lastSeq: 10 });

    assert.throws(
      () => projectRunEvent(snapshot, makeEvent({ seq: 11, type: "step.started" })),
      /INVALID_STATE_TRANSITION/,
    );
  });

  test("run.failed 事件进入 recovering 并写入 error", async () => {
    const { projectRunEvent } = mod;
    const snapshot = makeSnapshot({ status: "running", lastSeq: 5 });

    const result = projectRunEvent(
      snapshot,
      makeEvent({
        seq: 6,
        type: "run.failed",
        payload: {
          code: "UPSTREAM_TIMEOUT",
          message: "下一步超时",
          stepId: "step-3",
        },
      }),
    );
    assert.equal(result.snapshot.status, "recovering");
    assert.deepEqual(result.snapshot.error, {
      code: "UPSTREAM_TIMEOUT",
      message: "下一步超时",
      stepId: "step-3",
    });
  });

  test("source.added 幂等插入（同 id 替换不重复）", async () => {
    const { projectRunEvent } = mod;
    const src = {
      id: "src-1",
      sourceType: "web",
      title: "赛博朋克视觉研究",
      url: "https://example.com/a",
      domain: "example.com",
      publishedAt: null,
      retrievedAt: "2026-08-29T00:00:02.000Z",
      excerpt: "……",
      toolCallId: "tc-1",
      citedBy: [],
      trust: "untrusted",
    };
    const snapshot = makeSnapshot({ status: "running", lastSeq: 1 });

    const r1 = projectRunEvent(
      snapshot,
      makeEvent({ seq: 2, type: "source.added", payload: { source: src } }),
    );
    assert.equal(r1.snapshot.sources.length, 1);
    assert.equal(r1.snapshot.metrics.sourceCount, 1);

    // 同 id 再来一次（工具重试重发）→ 替换，不追加
    const r2 = projectRunEvent(
      r1.snapshot,
      makeEvent({ seq: 3, type: "source.added", payload: { source: { ...src, excerpt: "更新摘要" } } }),
    );
    assert.equal(r2.snapshot.sources.length, 1);
    assert.equal(r2.snapshot.sources[0].excerpt, "更新摘要");
    assert.equal(r2.snapshot.metrics.sourceCount, 1);
  });

  test("artifact.created 幂等插入", async () => {
    const { projectRunEvent } = mod;
    const artifact = {
      id: "art-1",
      type: "research-report",
      title: "研究报告",
      mimeType: "text/markdown",
      fileName: "research-report.md",
      content: "# 报告",
      createdAt: "2026-08-29T00:00:05.000Z",
      sourceIds: ["src-1"],
    };
    const snapshot = makeSnapshot({ status: "running", lastSeq: 1 });

    const r1 = projectRunEvent(
      snapshot,
      makeEvent({ seq: 2, type: "artifact.created", payload: { artifact } }),
    );
    assert.equal(r1.snapshot.artifacts.length, 1);

    const r2 = projectRunEvent(
      r1.snapshot,
      makeEvent({ seq: 3, type: "artifact.created", payload: { artifact: { ...artifact, content: "# 更新" } } }),
    );
    assert.equal(r2.snapshot.artifacts.length, 1);
    assert.equal(r2.snapshot.artifacts[0].content, "# 更新");
  });

  test("step.completed 更新 metrics.completedSteps；run.completed 收尾", async () => {
    const { projectRunEvent } = mod;
    const plan = makePlan();
    // 先模拟第一步已 started
    const snapshot = makeSnapshot({ status: "running", lastSeq: 1, plan, activeStepId: "step-1", metrics: { ...makeSnapshot().metrics, totalSteps: 2 } });
    const started = projectRunEvent(snapshot, makeEvent({ seq: 2, type: "step.started", payload: { stepId: "step-1" } }));

    const r1 = projectRunEvent(
      started.snapshot,
      makeEvent({ seq: 3, type: "step.completed", payload: { stepId: "step-1" } }),
    );
    assert.equal(r1.snapshot.metrics.completedSteps, 1);
    assert.equal(r1.snapshot.plan.steps[0].status, "completed");

    const r2 = projectRunEvent(
      r1.snapshot,
      makeEvent({ seq: 4, type: "run.completed", payload: {} }),
    );
    assert.equal(r2.snapshot.status, "completed");
  });

  test("version 非 1 的事件被拒绝", async () => {
    const { projectRunEvent } = mod;
    const snapshot = makeSnapshot({ lastSeq: 1 });
    assert.throws(
      () => projectRunEvent(snapshot, makeEvent({ seq: 2, version: 2 })),
      /version/,
    );
  });
});

// ---------- Task 2: Mock Runtime Adapter ----------

describe("MockResearchRuntimeAdapter", () => {
  let mod;
  let memoryStorage;

  beforeEach(async () => {
    mod = await load("app/lib/research-runtime/mock-adapter.ts");
    // 极简 StorageLike 内存实现
    const data = new Map();
    memoryStorage = {
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
  });

  test("createRun → planning → 生成计划 awaiting_plan_approval", async () => {
    const { createMockResearchRuntimeAdapter } = mod;
    const adapter = createMockResearchRuntimeAdapter({
      owner: { kind: "account", userId: 17 },
      storage: memoryStorage,
    });
    try {
      const snapshot = await adapter.createRun({
        styleName: "赛博朋克",
        useCase: "国产工业机器人 8 秒产品短片",
        providerId: null,
        projectId: null,
      });
      assert.equal(snapshot.status, "planning");
      assert.ok(snapshot.runId);

      // 计划是异步生成的，等待状态迁移
      const deadline = Date.now() + 3000;
      let latest = snapshot;
      while (latest.status === "planning" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
        latest = await adapter.getRun(snapshot.runId);
      }
      assert.equal(latest.status, "awaiting_plan_approval");
      assert.ok(latest.plan);
      assert.ok(latest.plan.revision >= 1);
      assert.ok(latest.plan.steps.length >= 4);
    } finally {
      adapter.dispose();
    }
  });

  test("计划 revision conflict：旧 expectedRevision 被拒绝", async () => {
    const { createMockResearchRuntimeAdapter } = mod;
    const adapter = createMockResearchRuntimeAdapter({
      owner: { kind: "account", userId: 1 },
      storage: memoryStorage,
    });
    try {
      const run = await adapter.createRun({ styleName: "浮世绘", useCase: "城市风光", providerId: null, projectId: null });
      let latest = run;
      const deadline = Date.now() + 3000;
      while (latest.status === "planning" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
        latest = await adapter.getRun(run.runId);
      }
      await assert.rejects(
        () => adapter.updatePlan(latest.runId, latest.plan.revision + 5, [{ type: "set_objective", value: "x" }]),
        /PLAN_REVISION_CONFLICT/,
      );
    } finally {
      adapter.dispose();
    }
  });

  test("approve 后开始运行；pause/resume/cancel 状态机", async () => {
    const { createMockResearchRuntimeAdapter } = mod;
    const adapter = createMockResearchRuntimeAdapter({
      owner: { kind: "account", userId: 2 },
      storage: memoryStorage,
    });
    try {
      const run = await adapter.createRun({ styleName: "赛博朋克", useCase: "产品短片", providerId: null, projectId: null });
      let latest = run;
      const deadline = Date.now() + 3000;
      while (latest.status === "planning" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
        latest = await adapter.getRun(run.runId);
      }

      await adapter.act(latest.runId, { type: "approve_plan", expectedRevision: latest.plan.revision });
      latest = await adapter.getRun(latest.runId);
      assert.equal(latest.status, "running");

      await adapter.act(latest.runId, { type: "pause" });
      latest = await adapter.getRun(latest.runId);
      assert.equal(latest.status, "paused");

      await adapter.act(latest.runId, { type: "resume" });
      latest = await adapter.getRun(latest.runId);
      assert.equal(latest.status, "running");

      await adapter.act(latest.runId, { type: "cancel" });
      latest = await adapter.getRun(latest.runId);
      assert.equal(latest.status, "cancelled");
    } finally {
      adapter.dispose();
    }
  });

  test("失败 → 重试恢复；跨实例从 storage 重建（刷新页面场景）", async () => {
    const { createMockResearchRuntimeAdapter } = mod;
    const owner = { kind: "account", userId: 3 };
    const adapter = createMockResearchRuntimeAdapter({ owner, storage: memoryStorage });
    let runId;
    try {
      const run = await adapter.createRun({ styleName: "赛博朋克", useCase: "产品短片", providerId: null, projectId: null });
      runId = run.runId;
      let latest = run;
      const deadline = Date.now() + 3000;
      while (latest.status === "planning" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
        latest = await adapter.getRun(run.runId);
      }
      await adapter.act(latest.runId, { type: "approve_plan", expectedRevision: latest.plan.revision });
    } finally {
      adapter.dispose(); // 模拟离开页面：timer 停，数据留存
    }

    // 新实例（刷新后）从 owner-scoped storage 恢复
    const adapter2 = createMockResearchRuntimeAdapter({ owner, storage: memoryStorage });
    try {
      const recovered = await adapter2.getRun(runId);
      assert.ok(recovered, "恢复后 run 仍存在");
      assert.ok(["running", "paused", "completed", "recovering", "failed"].includes(recovered.status));

      // listRuns 可见
      const runs = await adapter2.listRuns(20);
      assert.ok(runs.some((r) => r.runId === runId));
    } finally {
      adapter2.dispose();
    }
  });

  test("owner 隔离：不同 owner 看不到彼此的 run", async () => {
    const { createMockResearchRuntimeAdapter } = mod;
    const a = createMockResearchRuntimeAdapter({ owner: { kind: "account", userId: 7 }, storage: memoryStorage });
    const run = await a.createRun({ styleName: "X", useCase: "Y", providerId: null, projectId: null });
    a.dispose();

    const b = createMockResearchRuntimeAdapter({ owner: { kind: "guest" }, storage: memoryStorage });
    try {
      const runs = await b.listRuns(20);
      assert.equal(runs.some((r) => r.runId === run.runId), false);
      await assert.rejects(() => b.getRun(run.runId), /RUN_NOT_FOUND/);
    } finally {
      b.dispose();
    }
  });

  test("订阅：按序收到事件；cancel 后订阅可关闭", async () => {
    const { createMockResearchRuntimeAdapter } = mod;
    const adapter = createMockResearchRuntimeAdapter({ owner: { kind: "account", userId: 9 }, storage: memoryStorage });
    try {
      const run = await adapter.createRun({ styleName: "莫兰迪", useCase: "静物短片", providerId: null, projectId: null });
      const events = [];
      const sub = adapter.subscribe(run.runId, 0, {
        onEvent(event) {
          events.push(event);
        },
        onError() {},
      });

      const deadline = Date.now() + 3000;
      let latest = run;
      while (latest.status === "planning" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
        latest = await adapter.getRun(run.runId);
      }

      await adapter.act(run.runId, { type: "cancel" });
      sub.close();

      // 事件按 seq 严格递增且连续（无 gap 才能应用）
      for (let i = 1; i < events.length; i++) {
        assert.equal(events[i].seq, events[i - 1].seq + 1, "订阅流内事件必须连续");
      }
      assert.ok(events.length >= 2);
    } finally {
      adapter.dispose();
    }
  });
});
