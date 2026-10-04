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

test("conversation recovery exposes exact legacy reply IDs, scoped by both account and conversation", async () => {
  const owner = await register("recovery-owner"), stranger = await register("recovery-stranger");
  const create = async (conversationId, key) => request("/api/tasks", {method:"POST",token:owner.token,
    body:JSON.stringify({kind:"video.generate",title:"只验证任务元数据",origin:"desktop",input:{conversationId},idempotencyKey:key})});
  const one = await create("conversation_with_underscores", "chat_conversation_with_underscores_reply-original");
  await create("other", "chat_other_other-reply");
  await create("conversation_with_underscores", "unrelated-key");
  assert.equal(one.body.task.conversationMessageId,"reply-original");
  const page = await request("/api/tasks?conversationId=conversation_with_underscores",{token:owner.token});
  assert.equal(page.body.total,2);assert.equal(page.body.tasks.filter(task=>task.conversationMessageId).length,1);
  assert.equal(page.body.tasks.find(task=>task.id===one.body.task.id).conversationMessageId,"reply-original");
  const hidden = await request("/api/tasks?conversationId=conversation_with_underscores",{token:stranger.token});
  assert.equal(hidden.body.tasks.length,0);
  const before = db.prepare("SELECT COUNT(*) n FROM tasks WHERE user_id=?").get(owner.user.id).n;
  await request("/api/tasks?conversationId=conversation_with_underscores",{token:owner.token});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tasks WHERE user_id=?").get(owner.user.id).n,before);
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
  assert.match(claimed.body.leaseToken, /^[a-f0-9]{64}$/);

  const strangerRenew = await request(`/api/tasks/${created.body.task.id}/lease/renew`, {
    method: "POST",
    token: stranger.token,
    body: JSON.stringify({ leaseToken: claimed.body.leaseToken }),
  });
  assert.equal(strangerRenew.response.status, 404);

  const wrongRenew = await request(`/api/tasks/${created.body.task.id}/lease/renew`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ leaseToken: "wrong-token" }),
  });
  assert.equal(wrongRenew.response.status, 409);

  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE tasks SET lease_expires_at = ? WHERE id = ?")
    .run(now - 1, created.body.task.id);
  const expiredRenew = await request(`/api/tasks/${created.body.task.id}/lease/renew`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ leaseToken: claimed.body.leaseToken }),
  });
  assert.equal(expiredRenew.response.status, 409);

  db.prepare("UPDATE tasks SET lease_expires_at = ? WHERE id = ?")
    // A one-second lease can expire across the wall-clock second boundary
    // between this write and the HTTP request, unrelated to renewal behavior.
    .run(Math.floor(Date.now() / 1000) + 30, created.body.task.id);
  const renewed = await request(`/api/tasks/${created.body.task.id}/lease/renew`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ leaseToken: claimed.body.leaseToken }),
  });
  assert.equal(renewed.response.status, 200);
  assert.equal(renewed.body.task.status, "running");
  assert.ok(db.taskGet(created.body.task.id, owner.user.id).lease_expires_at >= now + 60);

  const tokenlessProgress = await request(`/api/tasks/${created.body.task.id}/progress`, {
    method: "PATCH",
    token: owner.token,
    body: JSON.stringify({ progress: 40, stage: "旧客户端无租约写入" }),
  });
  assert.equal(tokenlessProgress.response.status, 409);

  const wrongTokenProgress = await request(`/api/tasks/${created.body.task.id}/progress`, {
    method: "PATCH",
    token: owner.token,
    body: JSON.stringify({ leaseToken: "wrong-token", progress: 41, stage: "错误租约写入" }),
  });
  assert.equal(wrongTokenProgress.response.status, 409);

  const progressed = await request(`/api/tasks/${created.body.task.id}/progress`, {
    method: "PATCH",
    token: owner.token,
    body: JSON.stringify({
      leaseToken: claimed.body.leaseToken,
      progress: 42,
      stage: "正在生成分镜",
    }),
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

test("an attached server runtime wakes queued work, owns claims, and is told to abort controls", async () => {
  const account = await register("runtime-route");
  const previousRuntime = app.locals.taskRuntime;
  const wakes = [];
  const aborts = [];
  app.locals.taskRuntime = {
    started: true,
    wake() { wakes.push("wake"); },
    abortTask(id) { aborts.push(id); return true; },
  };
  try {
    const created = await request("/api/tasks", {
      method: "POST",
      token: account.token,
      body: JSON.stringify({
        kind: "video.generate",
        title: "服务端执行任务",
        input: { prompt: "服务端接手" },
        idempotencyKey: "runtime-route-task",
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(wakes.length, 1);

    const claimed = await request(`/api/tasks/${created.body.task.id}/claim`, {
      method: "POST",
      token: account.token,
      body: JSON.stringify({ deviceId: "legacy-desktop" }),
    });
    assert.equal(claimed.response.status, 409);
    assert.equal(claimed.body.error.code, "SERVER_MANAGED_TASK");

    const legacyClaim = db.taskClaim(created.body.task.id, account.user.id, "route-control-worker");
    assert.ok(legacyClaim);
    const paused = await request(`/api/tasks/${created.body.task.id}/actions`, {
      method: "POST",
      token: account.token,
      body: JSON.stringify({ action: "pause" }),
    });
    assert.equal(paused.response.status, 200);
    assert.deepEqual(aborts, [created.body.task.id]);

    const resumed = await request(`/api/tasks/${created.body.task.id}/actions`, {
      method: "POST",
      token: account.token,
      body: JSON.stringify({ action: "resume" }),
    });
    assert.equal(resumed.response.status, 200);
    assert.equal(wakes.length, 2);
  } finally {
    if (previousRuntime === undefined) delete app.locals.taskRuntime;
    else app.locals.taskRuntime = previousRuntime;
  }
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

test("desktop registers a stable device before heartbeat and cannot claim another account's id", async () => {
  const owner = await register("desktop-device");
  const stranger = await register("desktop-other");
  const deviceId = "desktop_runtime_device_01";
  const created = await request("/api/devices/register", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ id: deviceId, name: "我的桌面创作中心", type: "desktop" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.device.id, deviceId);
  assert.equal(created.body.device.status, "online");

  const heartbeat = await request(`/api/devices/${deviceId}/heartbeat`, {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({}),
  });
  assert.equal(heartbeat.response.status, 200);

  const repeated = await request("/api/devices/register", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({ id: deviceId, name: "重命名桌面", type: "desktop" }),
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.device.name, "重命名桌面");

  const hijack = await request("/api/devices/register", {
    method: "POST",
    token: stranger.token,
    body: JSON.stringify({ id: deviceId, name: "错误设备", type: "desktop" }),
  });
  assert.equal(hijack.response.status, 409);
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

test("task cursor pagination has no overlap and archive accepts multiple terminal statuses", async () => {
  const account = await register("cursor-owner");
  const taskIds = [];
  for (let index = 0; index < 5; index += 1) {
    const created = await request("/api/tasks", {
      method: "POST",
      token: account.token,
      body: JSON.stringify({
        kind: "video.generate",
        title: `分页任务 ${index}`,
        input: { prompt: `prompt ${index}` },
        idempotencyKey: `cursor-${index}`,
      }),
    });
    taskIds.push(created.body.task.id);
    db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(2_000_000_000 + index, created.body.task.id);
  }
  db.prepare("UPDATE tasks SET status = 'completed', completed_at = 2_000_000_010 WHERE id = ?").run(taskIds[0]);
  db.prepare("UPDATE tasks SET status = 'failed', completed_at = 2_000_000_011 WHERE id = ?").run(taskIds[1]);
  db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = 2_000_000_012 WHERE id = ?").run(taskIds[2]);

  const first = await request("/api/tasks?limit=2", { token: account.token });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.tasks.length, 2);
  assert.ok(first.body.nextCursor);
  const second = await request(`/api/tasks?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`, { token: account.token });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.tasks.length, 2);
  assert.deepEqual(
    first.body.tasks.map((task) => task.id).filter((id) => second.body.tasks.some((task) => task.id === id)),
    [],
  );

  const archive = await request("/api/tasks?status=completed,failed,cancelled&limit=10", { token: account.token });
  assert.equal(archive.response.status, 200);
  assert.equal(archive.body.total, 3);
  assert.deepEqual(new Set(archive.body.tasks.map((task) => task.status)), new Set(["completed", "failed", "cancelled"]));

  const invalid = await request("/api/tasks?cursor=not-a-valid-cursor", { token: account.token });
  assert.equal(invalid.response.status, 400);
});
