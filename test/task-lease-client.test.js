"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function taskFixture(overrides = {}) {
  return {
    id: "client-lease-task",
    kind: "video.generate",
    title: "客户端续租测试",
    status: "running",
    origin: "desktop",
    input: { prompt: "只使用 mock，不调用外网" },
    progress: 0,
    stage: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

async function loadAuthModule() {
  const storage = new Map([["stzh_token", "test-jwt"]]);
  global.window = {
    location: { origin: "http://desktop.test" },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
  };
  global.localStorage = global.window.localStorage;
  const url = pathToFileURL(path.join(root, "app", "lib", "auth.ts")).href;
  return import(`${url}?lease-test=${Date.now()}-${Math.random()}`);
}

test.afterEach(() => {
  delete global.window;
  delete global.localStorage;
  delete global.fetch;
});

test("executeTask renews serially during a long agent request and stops after completion", { timeout: 5000 }, async () => {
  const { executeTask } = await loadAuthModule();
  const task = taskFixture();
  let renewCalls = 0;
  let renewActive = 0;
  let maxRenewActive = 0;
  let completeCalls = 0;
  let releaseAgent;
  const enoughRenewals = new Promise((resolve) => { releaseAgent = resolve; });

  global.fetch = async (input, options = {}) => {
    const pathname = new URL(String(input), "http://desktop.test").pathname;
    if (pathname.endsWith("/lease/renew")) {
      renewCalls += 1;
      renewActive += 1;
      maxRenewActive = Math.max(maxRenewActive, renewActive);
      await delay(8);
      renewActive -= 1;
      if (renewCalls >= 3) releaseAgent();
      return jsonResponse({ task });
    }
    if (pathname === "/api/agent") {
      // Complete after observed renewals, independent of CPU contention or timer jitter.
      await enoughRenewals;
      return jsonResponse({ result: { mocked: true } });
    }
    if (pathname.endsWith("/progress")) return jsonResponse({ task });
    if (pathname.endsWith("/actions")) {
      const body = JSON.parse(options.body);
      if (body.action === "complete") completeCalls += 1;
      return jsonResponse({ task: taskFixture({ status: body.action === "complete" ? "completed" : "failed" }) });
    }
    throw new Error(`unexpected mock request: ${pathname}`);
  };

  const result = await executeTask(task, "lease-token", undefined, { renewIntervalMs: 5 });
  assert.equal(result.status, "completed");
  assert.ok(renewCalls >= 3, "长请求期间应多次续租");
  assert.equal(maxRenewActive, 1, "续租请求不得重叠");
  assert.equal(completeCalls, 1);

  const callsAfterCompletion = renewCalls;
  await delay(25);
  assert.equal(renewCalls, callsAfterCompletion, "执行结束后不得继续续租");
});

test("renewal failure aborts the agent request and never submits a terminal write", async () => {
  const { executeTask } = await loadAuthModule();
  const task = taskFixture({ id: "client-lease-loss-task" });
  let renewCalls = 0;
  let agentAborted = false;
  let terminalCalls = 0;

  global.fetch = async (input, options = {}) => {
    const pathname = new URL(String(input), "http://desktop.test").pathname;
    if (pathname.endsWith("/lease/renew")) {
      renewCalls += 1;
      return jsonResponse({ error: { message: "租约已失效" } }, 409);
    }
    if (pathname === "/api/agent") {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(jsonResponse({ result: { tooLate: true } })), 80);
        options.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          agentAborted = true;
          reject(options.signal.reason || new Error("aborted"));
        }, { once: true });
      });
    }
    if (pathname.endsWith("/progress")) return jsonResponse({ task });
    if (pathname.endsWith("/actions")) {
      terminalCalls += 1;
      return jsonResponse({ task: taskFixture({ status: "completed" }) });
    }
    throw new Error(`unexpected mock request: ${pathname}`);
  };

  const result = await executeTask(task, "stale-token", undefined, { renewIntervalMs: 5 });
  assert.equal(result, null);
  assert.equal(agentAborted, true);
  assert.equal(renewCalls, 1);
  assert.equal(terminalCalls, 0, "租约丢失后不得 complete/fail");

  await delay(20);
  assert.equal(renewCalls, 1, "租约失败后续租循环必须停止");
});
