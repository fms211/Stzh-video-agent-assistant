"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-realtime-test-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "realtime-test-secret-that-is-longer-than-thirty-two-characters";

const app = require("../app.js");
const db = require("../db.js");
const { attachRealtime } = require("../realtime.js");

let server;
let realtime;
let baseUrl;

async function jsonRequest(endpoint, token, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  return { response, body: await response.json().catch(() => null) };
}

function waitForMessage(socket, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("等待实时事件超时")), timeout);
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.removeEventListener("message", handler);
      resolve(data);
    };
    socket.addEventListener("message", handler);
  });
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  realtime = attachRealtime(server);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await realtime.close();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("authenticated mobile socket receives task updates for its account", async () => {
  const registered = await jsonRequest("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({
      username: "realtime-owner",
      password: "secure-pass-123",
      displayName: "实时联动用户",
    }),
  });
  const token = registered.body.token;
  const created = await jsonRequest("/api/tasks", token, {
    method: "POST",
    body: JSON.stringify({
      kind: "video.generate",
      title: "实时任务",
      origin: "mobile",
      input: { prompt: "测试实时同步" },
    }),
  });

  const wsUrl = baseUrl.replace("http://", "ws://");
  const socket = new WebSocket(`${wsUrl}/ws/mobile?token=${encodeURIComponent(token)}`);
  const ready = await waitForMessage(socket, (message) => message.type === "connection.ready");
  assert.equal(ready.payload.userId, registered.body.user.id);

  const updatePromise = waitForMessage(
    socket,
    (message) => message.type === "task.updated"
      && message.payload.task.id === created.body.task.id
      && message.payload.task.status === "running"
  );
  await jsonRequest(`/api/tasks/${created.body.task.id}/claim`, token, {
    method: "POST",
    body: JSON.stringify({ deviceId: "desktop-live-test" }),
  });
  const update = await updatePromise;

  assert.equal(update.payload.task.workerDeviceId, "desktop-live-test");
  socket.close();
});

test("socket rejects missing authentication", async () => {
  const wsUrl = baseUrl.replace("http://", "ws://");
  const socket = new WebSocket(`${wsUrl}/ws/mobile`);
  const closed = await new Promise((resolve) => {
    socket.addEventListener("close", (event) => resolve(event));
  });
  assert.equal(closed.code, 4401);
});

test("socket task controls notify the attached server runtime to abort or wake", async () => {
  const registered = await jsonRequest("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({
      username: "ws-runtime",
      password: "secure-pass-123",
      displayName: "运行时联动用户",
    }),
  });
  const token = registered.body.token;
  const created = await jsonRequest("/api/tasks", token, {
    method: "POST",
    body: JSON.stringify({
      kind: "video.generate",
      title: "WebSocket 控制任务",
      input: { prompt: "测试控制" },
    }),
  });
  const taskId = created.body.task.id;
  assert.ok(db.taskClaim(taskId, registered.body.user.id, "ws-runtime-worker"));
  const previousRuntime = server.stzhTaskRuntime;
  const aborts = [];
  let wakes = 0;
  server.stzhTaskRuntime = {
    abortTask(id) { aborts.push(id); return true; },
    wake() { wakes += 1; },
  };
  const wsUrl = baseUrl.replace("http://", "ws://");
  const socket = new WebSocket(`${wsUrl}/ws/mobile?token=${encodeURIComponent(token)}`);
  await waitForMessage(socket, (message) => message.type === "connection.ready");
  try {
    const paused = waitForMessage(socket, (message) => (
      message.type === "task.updated"
      && message.payload.task.id === taskId
      && message.payload.task.status === "paused"
    ));
    socket.send(JSON.stringify({ type: "task.action", payload: { taskId, action: "pause" } }));
    await paused;
    assert.deepEqual(aborts, [taskId]);

    const resumed = waitForMessage(socket, (message) => (
      message.type === "task.updated"
      && message.payload.task.id === taskId
      && message.payload.task.status === "queued"
    ));
    socket.send(JSON.stringify({ type: "task.action", payload: { taskId, action: "resume" } }));
    await resumed;
    assert.equal(wakes, 1);
  } finally {
    socket.close();
    server.stzhTaskRuntime = previousRuntime;
  }
});
