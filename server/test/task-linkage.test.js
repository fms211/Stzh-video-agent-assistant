"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-task-test-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "task-linkage-test-secret-that-is-longer-than-thirty-two-characters";

const app = require("../app.js");
const db = require("../db.js");

let server;
let baseUrl;

async function request(endpoint, options = {}) {
  const { token, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...fetchOptions,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function register(username) {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: "secure-pass-123",
      displayName: username,
    }),
  });
  assert.equal(response.response.status, 200);
  return response.body;
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("task API is idempotent, user-isolated, and supports lifecycle controls", async () => {
  const owner = await register("task-owner");
  const stranger = await register("task-stranger");
  const payload = {
    kind: "video.generate",
    title: "手机发起的产品短片",
    origin: "mobile",
    input: { prompt: "制作一条 15 秒产品短片" },
    idempotencyKey: "mobile-request-001",
  };

  const created = await request("/api/tasks", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify(payload),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.task.status, "queued");
  assert.equal(created.body.task.origin, "mobile");
  assert.deepEqual(created.body.task.input, payload.input);

  const repeated = await request("/api/tasks", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify(payload),
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.task.id, created.body.task.id);

  const hidden = await request(`/api/tasks/${created.body.task.id}`, {
    token: stranger.token,
  });
  assert.equal(hidden.response.status, 404);

  const claimed = await request(`/api/tasks/${created.body.task.id}/claim`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ deviceId: "desktop-test" }),
  });
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.body.task.status, "running");
  assert.equal(claimed.body.task.workerDeviceId, "desktop-test");

  const progressed = await request(`/api/tasks/${created.body.task.id}/progress`, {
    method: "PATCH",
    token: owner.token,
    body: JSON.stringify({ progress: 42, stage: "正在生成分镜" }),
  });
  assert.equal(progressed.response.status, 200);
  assert.equal(progressed.body.task.progress, 42);
  assert.equal(progressed.body.task.stage, "正在生成分镜");

  const paused = await request(`/api/tasks/${created.body.task.id}/actions`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ action: "pause" }),
  });
  assert.equal(paused.body.task.status, "paused");

  const resumed = await request(`/api/tasks/${created.body.task.id}/actions`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ action: "resume" }),
  });
  assert.equal(resumed.body.task.status, "queued");
});

test("legacy generations migrate once into completed tasks", async () => {
  const account = await register("task-migration");
  const generation = db.prepare(
    `INSERT INTO generations (user_id, prompt, video_url, status)
     VALUES (?, ?, ?, ?)`
  ).run(account.user.id, "旧作品提示词", "https://example.test/video.mp4", "completed");

  const first = db.migrateGenerationsToTasks();
  const second = db.migrateGenerationsToTasks();
  const migrated = db.prepare(
    "SELECT * FROM tasks WHERE source_generation_id = ?"
  ).all(generation.lastInsertRowid);

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].status, "completed");
  assert.equal(migrated[0].origin, "migration");
});

test("pairing code binds a mobile device to the signed-in account", async () => {
  const account = await register("device-owner");
  const codeResult = await request("/api/devices/pairing-codes", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ deviceName: "创作中心" }),
  });

  assert.equal(codeResult.response.status, 201);
  assert.match(codeResult.body.code, /^[A-Z0-9]{8}$/);
  assert.ok(codeResult.body.expiresAt);

  const pairResult = await request("/api/devices/pair", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({
      code: codeResult.body.code,
      name: "我的手机",
      type: "mobile",
    }),
  });
  assert.equal(pairResult.response.status, 201);
  assert.equal(pairResult.body.device.type, "mobile");
  assert.ok(pairResult.body.device.id);

  const reused = await request("/api/devices/pair", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({
      code: codeResult.body.code,
      name: "第二台手机",
      type: "mobile",
    }),
  });
  assert.equal(reused.response.status, 409);
});

test("authenticated desktop can discover LAN targets for QR pairing", async () => {
  const account = await register("network-target-owner");
  const anonymous = await request("/api/devices/network-targets");
  assert.equal(anonymous.response.status, 401);

  const result = await request("/api/devices/network-targets", {
    token: account.token,
  });
  assert.equal(result.response.status, 200);
  assert.ok(Array.isArray(result.body.targets));
  for (const target of result.body.targets) {
    assert.equal(typeof target.label, "string");
    assert.match(target.address, /^\d{1,3}(?:\.\d{1,3}){3}$/);
    assert.match(target.url, /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:\d+$/);
  }
});
