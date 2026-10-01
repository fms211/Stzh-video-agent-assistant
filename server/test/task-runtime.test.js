"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-task-runtime-test-"));
process.env.STZH_DATA_DIR = dataDir;

const runtimePath = path.join(__dirname, "..", "task-runtime.js");
assert.equal(fs.existsSync(runtimePath), true, "task-runtime.js must provide the injectable queue runtime");

const db = require("../db.js");
const { TaskRuntime } = require(runtimePath);

let sequence = 0;

function createUser(label = "runtime-user") {
  sequence += 1;
  return Number(db.prepare(
    "INSERT INTO users (username, password) VALUES (?, 'unused')"
  ).run(`${label}-${sequence}`).lastInsertRowid);
}

function createTask(userId, id = `runtime-task-${++sequence}`) {
  return db.taskCreate({
    id,
    userId,
    kind: "test.execute",
    title: id,
    input: { prompt: id },
    origin: "server",
  }).task;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not met before timeout");
}

test.afterEach(() => {
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM users").run();
});

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("runtime enforces global two and per-user one while reporting progress through the lease", async (t) => {
  const firstUser = createUser("runtime-first");
  const secondUser = createUser("runtime-second");
  const firstTask = createTask(firstUser, "runtime-first-a");
  createTask(firstUser, "runtime-first-b");
  createTask(secondUser, "runtime-second-a");
  const gates = new Map();
  const activeByUser = new Map();
  let active = 0;
  let maxActive = 0;
  let sameUserOverlap = false;

  const runtime = new TaskRuntime({
    db,
    workerId: "runtime-concurrency",
    pollIntervalMs: 20,
    renewIntervalMs: 25,
    // This case tests concurrency, not expiration. SQLite stores whole seconds;
    // a sub-second request can cross its deadline before the first renewal.
    leaseMs: 5_000,
    execute: async (task, context) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const userActive = (activeByUser.get(task.user_id) || 0) + 1;
      activeByUser.set(task.user_id, userActive);
      sameUserOverlap ||= userActive > 1;
      if (task.id === firstTask.id) await context.reportProgress(27, "runtime-progress", { partial: true });
      const gate = deferred();
      gates.set(task.id, gate);
      await gate.promise;
      active -= 1;
      activeByUser.set(task.user_id, activeByUser.get(task.user_id) - 1);
      return { taskId: task.id };
    },
  });

  t.after(async () => {
    for (const gate of gates.values()) gate.resolve();
    await runtime.stop();
  });

  runtime.start();
  await waitFor(() => gates.size === 2);
  assert.equal(maxActive, 2);
  assert.equal(sameUserOverlap, false);
  assert.equal(db.taskGet(firstTask.id, firstUser).progress, 27);

  const runningIds = [...gates.keys()];
  for (const id of runningIds) gates.get(id).resolve();
  await waitFor(() => gates.size === 3);
  const remainingId = [...gates.keys()].find((id) => !runningIds.includes(id));
  gates.get(remainingId).resolve();
  await waitFor(() => db.prepare("SELECT COUNT(*) count FROM tasks WHERE status = 'completed'").get().count === 3);
  await runtime.stop();
});

test("pause and cancel abort active execution and stale completion cannot overwrite their states", async () => {
  const userId = createUser();
  const pausedTask = createTask(userId, "runtime-pause");
  let firstSignal;
  let firstStarted = false;
  const runtime = new TaskRuntime({
    db,
    workerId: "runtime-abort",
    pollIntervalMs: 20,
    leaseMs: 500,
    renewIntervalMs: 100,
    execute: async (_task, context) => {
      firstSignal = context.signal;
      firstStarted = true;
      await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
      return { stale: true };
    },
  });

  runtime.start();
  await waitFor(() => firstStarted);
  db.taskAction(pausedTask.id, userId, "pause");
  assert.equal(runtime.abortTask(pausedTask.id), true);
  await waitFor(() => firstSignal.aborted);
  await waitFor(() => runtime.activeCount === 0);
  assert.equal(db.taskGet(pausedTask.id, userId).status, "paused");

  db.taskAction(pausedTask.id, userId, "resume");
  runtime.wake();
  await waitFor(() => db.taskGet(pausedTask.id, userId).status === "running");
  db.taskAction(pausedTask.id, userId, "cancel");
  assert.equal(runtime.abortTask(pausedTask.id), true);
  await waitFor(() => runtime.activeCount === 0);
  assert.equal(db.taskGet(pausedTask.id, userId).status, "cancelled");
  await runtime.stop();
});

test("graceful stop aborts slow execution, immediately requeues its lease, and start-stop are idempotent", async () => {
  const userId = createUser();
  const task = createTask(userId, "runtime-stop");
  let signal;
  let starts = 0;
  const runtime = new TaskRuntime({
    db,
    workerId: "runtime-stopping-worker",
    pollIntervalMs: 20,
    leaseMs: 60_000,
    renewIntervalMs: 15_000,
    execute: async (_task, context) => {
      starts += 1;
      signal = context.signal;
      await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
      return { shouldNotComplete: true };
    },
  });

  assert.equal(runtime.start(), runtime);
  assert.equal(runtime.start(), runtime);
  await waitFor(() => db.taskGet(task.id, userId).status === "running");
  const firstStop = runtime.stop();
  const secondStop = runtime.stop();
  await Promise.all([firstStop, secondStop]);

  const stopped = db.taskGet(task.id, userId);
  assert.equal(signal.aborted, true);
  assert.equal(stopped.status, "queued");
  assert.equal(stopped.worker_id, null);
  assert.equal(stopped.lease_token, null);
  assert.equal(stopped.lease_expires_at, null);
  assert.equal(runtime.activeCount, 0);
  assert.equal(starts, 1);

  await runtime.stop();
});
