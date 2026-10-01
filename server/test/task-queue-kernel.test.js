"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-queue-kernel-test-"));
const databasePath = path.join(dataDir, "stzh.db");
process.env.STZH_DATA_DIR = dataDir;

function createLegacyDatabase() {
  const legacy = new Database(databasePath);
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
      origin TEXT NOT NULL DEFAULT 'desktop',
      input TEXT NOT NULL DEFAULT '{}',
      output TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      stage TEXT DEFAULT '',
      error TEXT,
      idempotency_key TEXT,
      source_generation_id INTEGER UNIQUE,
      worker_device_id TEXT,
      scheduled_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      revision INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO users (id, username, password) VALUES (1, 'legacy-user', 'unused');
    INSERT INTO tasks
      (id, user_id, kind, title, status, input, output, progress, stage, error,
       worker_device_id, started_at, completed_at)
    VALUES
      ('legacy-running', 1, 'test', 'legacy running', 'running', '{"prompt":"keep-running-input"}', '{"partial":true}', 68, 'rendering', 'old-error', 'legacy-device', 101, NULL),
      ('legacy-paused', 1, 'test', 'legacy paused', 'paused', '{"prompt":"keep-paused-input"}', '{"partial":true}', 32, 'paused-stage', NULL, 'paused-device', 102, NULL),
      ('legacy-completed', 1, 'test', 'legacy completed', 'completed', '{"prompt":"keep-completed-input"}', '{"url":"done"}', 100, 'done', NULL, 'done-device', 103, 104);
  `);
  legacy.close();
}

createLegacyDatabase();
const db = require("../db.js");

let sequence = 0;

function createUser(label = "queue-user") {
  sequence += 1;
  return Number(db.prepare(
    "INSERT INTO users (username, password) VALUES (?, 'unused')"
  ).run(`${label}-${sequence}`).lastInsertRowid);
}

function createTask(userId, overrides = {}) {
  const id = overrides.id || `queue-task-${++sequence}`;
  return db.taskCreate({
    id,
    userId,
    kind: "test.execute",
    title: overrides.title || id,
    input: overrides.input || { prompt: id },
    origin: "server",
    scheduledAt: overrides.scheduledAt ?? null,
  }).task;
}

function clearFixtures() {
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM users").run();
}

test.afterEach(clearFixtures);

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("queue migration snapshots the legacy database once and preserves non-running state", () => {
  const columns = new Set(db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
  for (const name of ["worker_id", "lease_token", "lease_expires_at", "attempt_count", "execution_mode"]) {
    assert.equal(columns.has(name), true, `missing migrated column ${name}`);
  }

  const migrations = db.prepare(
    "SELECT name FROM schema_migrations WHERE name = ?"
  ).all("2026-08-10-task-lease-runtime");
  assert.equal(migrations.length, 1);

  const snapshotFiles = () => fs.readdirSync(dataDir).filter(
    (name) => name.startsWith("stzh.db.snapshot-") && !name.endsWith("-wal") && !name.endsWith("-shm")
  );
  const snapshotsBefore = snapshotFiles();
  assert.equal(snapshotsBefore.length, 1);
  const snapshot = new Database(path.join(dataDir, snapshotsBefore[0]), { readonly: true });
  assert.equal(snapshot.prepare("SELECT status FROM tasks WHERE id = 'legacy-running'").get().status, "running");
  assert.equal(snapshot.prepare("PRAGMA table_info(tasks)").all().some((column) => column.name === "lease_token"), false);
  snapshot.close();

  const running = db.prepare("SELECT * FROM tasks WHERE id = 'legacy-running'").get();
  assert.equal(running.status, "queued");
  assert.equal(running.worker_device_id, null);
  assert.equal(running.worker_id, null);
  assert.equal(running.lease_token, null);
  assert.equal(running.progress, 0);
  assert.equal(running.stage, "");
  assert.equal(running.input, '{"prompt":"keep-running-input"}');

  const paused = db.prepare("SELECT * FROM tasks WHERE id = 'legacy-paused'").get();
  assert.equal(paused.status, "paused");
  assert.equal(paused.progress, 32);
  assert.equal(paused.stage, "paused-stage");
  assert.equal(paused.input, '{"prompt":"keep-paused-input"}');

  const completed = db.prepare("SELECT * FROM tasks WHERE id = 'legacy-completed'").get();
  assert.equal(completed.status, "completed");
  assert.equal(completed.output, '{"url":"done"}');
  assert.equal(completed.input, '{"prompt":"keep-completed-input"}');

  db.prepare(
    "UPDATE tasks SET status = 'running', worker_id = 'new-worker', lease_token = 'new-token', lease_expires_at = 9999999999 WHERE id = 'legacy-running'"
  ).run();
  assert.deepEqual(db.applyTaskLeaseMigrations(), []);
  assert.equal(snapshotFiles().length, 1);
  assert.equal(db.prepare("SELECT status FROM tasks WHERE id = 'legacy-running'").get().status, "running");
  clearFixtures();
});

test("concurrent claim attempts produce exactly one high-entropy lease", async () => {
  const userId = createUser();
  const task = createTask(userId);
  const claims = await Promise.all([
    Promise.resolve().then(() => db.taskClaimNext("worker-a", { now: 1000, leaseSeconds: 60 })),
    Promise.resolve().then(() => db.taskClaimNext("worker-b", { now: 1000, leaseSeconds: 60 })),
  ]);
  const successful = claims.filter(Boolean);

  assert.equal(successful.length, 1);
  assert.equal(successful[0].id, task.id);
  assert.match(successful[0].lease_token, /^[a-f0-9]{64}$/);
  assert.equal(successful[0].attempt_count, 1);
  assert.equal(successful[0].lease_expires_at, 1060);
  clearFixtures();
});

test("claim skips a user with an effective running lease but can claim another user", () => {
  const firstUser = createUser("same-user");
  const otherUser = createUser("other-user");
  createTask(firstUser, { id: "same-user-first" });
  createTask(firstUser, { id: "same-user-second" });
  createTask(otherUser, { id: "other-user-task" });

  const first = db.taskClaimNext("worker-a", { now: 2000, leaseSeconds: 60 });
  const second = db.taskClaimNext("worker-b", { now: 2000, leaseSeconds: 60 });
  const third = db.taskClaimNext("worker-c", { now: 2000, leaseSeconds: 60 });

  assert.equal(first.user_id, firstUser);
  assert.equal(second.user_id, otherUser);
  assert.equal(third, null);
  clearFixtures();
});

test("legacy claim cannot create a second running task beside an effective lease", () => {
  const userId = createUser("legacy-claim-blocked");
  createTask(userId, { id: "leased-first" });
  const legacyCandidate = createTask(userId, { id: "legacy-second" });
  const lease = db.taskClaimNext("runtime-worker", {
    now: Math.floor(Date.now() / 1000),
    leaseSeconds: 60,
  });

  assert.ok(lease);
  assert.equal(db.taskClaim(legacyCandidate.id, userId, "legacy-device"), null);
  assert.equal(db.taskGet(legacyCandidate.id, userId).status, "queued");
});

test("legacy claim is recoverable and blocks taskClaimNext for the same user", () => {
  const userId = createUser("legacy-claim-recoverable");
  const legacyTask = createTask(userId, { id: "legacy-running-task" });
  createTask(userId, { id: "runtime-must-wait" });
  const now = Math.floor(Date.now() / 1000);

  const claimed = db.taskClaim(legacyTask.id, userId, "legacy-device");
  assert.ok(claimed);
  assert.ok(claimed.lease_expires_at > now, "legacy running 必须具有可回收的到期时间");
  assert.equal(db.taskClaimNext("runtime-worker", { now, leaseSeconds: 60 }), null);
  assert.deepEqual(
    db.taskRecoverExpiredLeases({ now: claimed.lease_expires_at }).map((task) => task.id),
    [legacyTask.id]
  );
});

test("legacy claim token is required for progress and terminal writes, and progress renews it", () => {
  const userId = createUser("legacy-token-required");
  const task = createTask(userId, { id: "legacy-token-task" });
  const lease = db.taskClaim(task.id, userId, "legacy-token-device");

  assert.match(lease.lease_token, /^[a-f0-9]{64}$/);
  assert.equal(lease.worker_id, "legacy:legacy-token-device");
  assert.equal(db.taskProgress(task.id, userId, { progress: 10 }), null);
  assert.equal(db.taskProgress(task.id, userId, {
    leaseToken: "wrong-token",
    progress: 11,
  }), null);
  assert.equal(db.taskAction(task.id, userId, "complete", { output: { unsafe: true } }).reason, "lease_required");
  assert.equal(db.taskAction(task.id, userId, "fail", {
    leaseToken: "wrong-token",
    error: "unsafe",
  }).reason, "lease_lost");

  const progressNow = lease.lease_expires_at - 1;
  const progressed = db.taskProgress(task.id, userId, {
    leaseToken: lease.lease_token,
    now: progressNow,
    progress: 42,
    stage: "token-owned-progress",
  });
  assert.equal(progressed.progress, 42);
  assert.equal(progressed.lease_expires_at, progressNow + 60);

  const completed = db.taskAction(task.id, userId, "complete", {
    leaseToken: lease.lease_token,
    now: progressNow + 1,
    output: { safe: true },
  });
  assert.equal(completed.task.status, "completed");
  assert.deepEqual(JSON.parse(completed.task.output), { safe: true });
});

test("expired legacy worker cannot write after the same task is claimed by a new device", () => {
  const userId = createUser("legacy-token-handoff");
  const task = createTask(userId, { id: "legacy-token-handoff-task" });
  const first = db.taskClaim(task.id, userId, "legacy-device-a");
  assert.match(first.lease_token, /^[a-f0-9]{64}$/);

  assert.deepEqual(
    db.taskRecoverExpiredLeases({ now: first.lease_expires_at }).map((row) => row.id),
    [task.id]
  );
  const second = db.taskClaim(task.id, userId, "legacy-device-b");
  assert.match(second.lease_token, /^[a-f0-9]{64}$/);
  assert.notEqual(second.lease_token, first.lease_token);

  assert.equal(db.taskProgress(task.id, userId, {
    leaseToken: first.lease_token,
    progress: 90,
  }), null);
  assert.equal(db.taskAction(task.id, userId, "complete", {
    leaseToken: first.lease_token,
    output: { stale: true },
  }).reason, "lease_lost");
  assert.equal(db.taskAction(task.id, userId, "fail", {
    leaseToken: first.lease_token,
    error: "stale",
  }).reason, "lease_lost");

  const progressNow = second.lease_expires_at - 1;
  assert.equal(db.taskProgress(task.id, userId, {
    leaseToken: second.lease_token,
    now: progressNow,
    progress: 75,
  }).progress, 75);
  assert.equal(db.taskAction(task.id, userId, "complete", {
    leaseToken: second.lease_token,
    now: progressNow + 1,
    output: { owner: "device-b" },
  }).task.status, "completed");
});

test("pre-fix tokenless legacy running rows are recoverable instead of blocking forever", () => {
  clearFixtures();
  const userId = createUser("legacy-pre-fix-recovery");
  const legacyTask = createTask(userId, { id: "legacy-pre-fix-running" });
  createTask(userId, { id: "legacy-pre-fix-waiting" });
  db.prepare(
    `UPDATE tasks
     SET status = 'running', worker_device_id = 'old-device',
         lease_token = NULL, lease_expires_at = NULL
     WHERE id = ?`
  ).run(legacyTask.id);

  assert.equal(db.taskClaimNext("runtime-worker", { now: 2600, leaseSeconds: 60 }), null);
  assert.deepEqual(
    db.taskRecoverExpiredLeases({ now: 2600 }).map((task) => task.id),
    [legacyTask.id]
  );
});

test("future scheduled tasks cannot be claimed before their due time", () => {
  const userId = createUser();
  const task = createTask(userId, { scheduledAt: 3050 });

  assert.equal(db.taskClaimNext("early-worker", { now: 3049, leaseSeconds: 60 }), null);
  assert.equal(db.taskClaimNext("due-worker", { now: 3050, leaseSeconds: 60 }).id, task.id);
  clearFixtures();
});

test("lease token protects renewal, progress, completion, and failure from stale workers", () => {
  const userId = createUser();
  const task = createTask(userId);
  const firstLease = db.taskClaimNext("worker-old", { now: 4000, leaseSeconds: 10 });

  assert.equal(db.taskRenewLease(task.id, firstLease.lease_token, { now: 4005, leaseSeconds: 20 }).ok, true);
  const progress = db.taskReportProgress(task.id, firstLease.lease_token, {
    now: 4006,
    leaseSeconds: 20,
    progress: 41,
    stage: "working",
    output: { partial: true },
  });
  assert.equal(progress.ok, true);
  assert.equal(progress.task.progress, 41);

  assert.equal(db.taskRecoverExpiredLeases({ now: 4026 }).length, 1);
  const secondLease = db.taskClaimNext("worker-new", { now: 4026, leaseSeconds: 30 });
  assert.notEqual(secondLease.lease_token, firstLease.lease_token);
  for (const result of [
    db.taskRenewLease(task.id, firstLease.lease_token, { now: 4027, leaseSeconds: 20 }),
    db.taskReportProgress(task.id, firstLease.lease_token, { now: 4027, progress: 90 }),
    db.taskCompleteLease(task.id, firstLease.lease_token, { now: 4027, output: { stale: true } }),
    db.taskFailLease(task.id, firstLease.lease_token, { now: 4027, error: "stale" }),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.reason, "lease_lost");
  }

  assert.equal(db.taskCompleteLease(task.id, secondLease.lease_token, {
    now: 4028,
    output: { done: true },
  }).ok, true);
  assert.equal(db.taskGet(task.id, userId).status, "completed");
  clearFixtures();
});

test("legacy mutation helpers cannot bypass an active runtime lease", () => {
  const userId = createUser();
  const task = createTask(userId);
  const lease = db.taskClaimNext("protected-worker", { now: 4500, leaseSeconds: 60 });

  assert.equal(db.taskProgress(task.id, userId, { progress: 88, stage: "bypass" }), null);
  assert.equal(db.taskAction(task.id, userId, "complete", { output: { bypass: true } }).reason, "lease_required");
  assert.equal(db.taskAction(task.id, userId, "fail", { error: "bypass" }).reason, "lease_required");

  const completed = db.taskAction(task.id, userId, "complete", {
    leaseToken: lease.lease_token,
    output: { protected: true },
    now: 4501,
  });
  assert.equal(completed.task.status, "completed");
  assert.deepEqual(JSON.parse(completed.task.output), { protected: true });
  clearFixtures();
});

test("legacy progress cannot write after pause has cleared the worker", () => {
  const userId = createUser("legacy-paused-progress");
  const task = createTask(userId, { id: "legacy-paused-task" });
  assert.ok(db.taskClaim(task.id, userId, "legacy-device"));

  const paused = db.taskAction(task.id, userId, "pause").task;
  const staleProgress = db.taskProgress(task.id, userId, {
    progress: 91,
    stage: "stale-worker-write",
  });

  assert.equal(staleProgress, null);
  const stored = db.taskGet(task.id, userId);
  assert.equal(stored.status, "paused");
  assert.equal(stored.progress, paused.progress);
  assert.equal(stored.stage, paused.stage);
});

test("taskAction reports a conflict instead of overwriting a state changed after its read", () => {
  const userId = createUser("action-cas");
  const task = createTask(userId, { id: "action-cas-task" });
  assert.ok(db.taskClaim(task.id, userId, "legacy-device"));

  const originalTaskGet = db.taskGet;
  let injected = false;
  db.taskGet = function taskGetWithConcurrentTerminalState(id, ownerId) {
    const current = originalTaskGet.call(db, id, ownerId);
    if (!injected && id === task.id) {
      injected = true;
      db.prepare(
        `UPDATE tasks
         SET status = 'completed', progress = 100, stage = 'concurrent-complete',
             completed_at = unixepoch(), worker_device_id = NULL, worker_id = NULL,
             lease_token = NULL, lease_expires_at = NULL, revision = revision + 1
         WHERE id = ? AND user_id = ?`
      ).run(id, ownerId);
    }
    return current;
  };

  let result;
  try {
    result = db.taskAction(task.id, userId, "pause");
  } finally {
    db.taskGet = originalTaskGet;
  }

  assert.equal(result.reason, "conflict");
  const stored = db.taskGet(task.id, userId);
  assert.equal(stored.status, "completed");
  assert.equal(stored.stage, "concurrent-complete");
});

test("pause and cancel clear leases; resume and retry restart from zero without losing input", () => {
  const userId = createUser();
  const task = createTask(userId, { input: { prompt: "must-survive" } });
  const firstLease = db.taskClaimNext("worker-pause", { now: 5000, leaseSeconds: 60 });
  assert.equal(db.taskReportProgress(task.id, firstLease.lease_token, {
    now: 5001,
    progress: 55,
    stage: "halfway",
    output: { partial: true },
  }).ok, true);

  const paused = db.taskAction(task.id, userId, "pause").task;
  assert.equal(paused.status, "paused");
  assert.equal(paused.worker_id, null);
  assert.equal(paused.lease_token, null);
  assert.equal(paused.lease_expires_at, null);
  assert.equal(db.taskReportProgress(task.id, firstLease.lease_token, { now: 5002, progress: 99 }).reason, "lease_lost");

  const resumed = db.taskAction(task.id, userId, "resume").task;
  assert.equal(resumed.status, "queued");
  assert.equal(resumed.progress, 0);
  assert.equal(resumed.stage, "");
  assert.equal(resumed.output, null);
  assert.equal(resumed.error, null);
  assert.deepEqual(JSON.parse(resumed.input), { prompt: "must-survive" });

  const secondLease = db.taskClaimNext("worker-cancel", { now: 5010, leaseSeconds: 60 });
  const cancelled = db.taskAction(task.id, userId, "cancel").task;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.lease_token, null);
  assert.equal(db.taskFailLease(task.id, secondLease.lease_token, { now: 5011, error: "late" }).reason, "lease_lost");

  const retried = db.taskAction(task.id, userId, "retry").task;
  assert.equal(retried.status, "queued");
  assert.equal(retried.progress, 0);
  assert.equal(retried.output, null);
  assert.equal(retried.error, null);
  assert.equal(retried.completed_at, null);
  assert.deepEqual(JSON.parse(retried.input), { prompt: "must-survive" });
  clearFixtures();
});

test("expired leases recover without device records and can be claimed by a new worker", () => {
  const userId = createUser();
  const task = createTask(userId);
  const first = db.taskClaimNext("crashed-worker", { now: 6000, leaseSeconds: 5 });
  assert.ok(first);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM devices").get().count, 0);

  const recovered = db.taskRecoverExpiredLeases({ now: 6005 });
  assert.deepEqual(recovered.map((row) => row.id), [task.id]);
  assert.equal(recovered[0].status, "queued");
  const second = db.taskClaimNext("replacement-worker", { now: 6005, leaseSeconds: 30 });
  assert.equal(second.id, task.id);
  assert.notEqual(second.lease_token, first.lease_token);
  assert.equal(second.attempt_count, 2);
  clearFixtures();
});

test("lease recovery rechecks the captured lease before requeueing", () => {
  const userId = createUser("recover-cas");
  const task = createTask(userId, { id: "recover-cas-task" });
  const lease = db.taskClaimNext("recover-old-worker", { now: 7000, leaseSeconds: 5 });
  assert.ok(lease);

  const originalPrepare = db.prepare;
  let injected = false;
  db.prepare = function prepareWithLeaseSwap(sql) {
    const statement = originalPrepare.call(db, sql);
    if (!injected
        && sql.includes("SET status = 'queued'")
        && sql.includes("WHERE id = ? AND status = 'running'")) {
      return new Proxy(statement, {
        get(target, property, receiver) {
          if (property !== "run") return Reflect.get(target, property, receiver);
          return (...parameters) => {
            injected = true;
            originalPrepare.call(db,
              `UPDATE tasks
               SET worker_id = 'recover-new-worker', lease_token = 'recover-new-token',
                   lease_expires_at = 7100, revision = revision + 1
               WHERE id = ?`
            ).run(task.id);
            return target.run(...parameters);
          };
        },
      });
    }
    return statement;
  };

  let recovered;
  try {
    recovered = db.taskRecoverExpiredLeases({ now: 7005 });
  } finally {
    db.prepare = originalPrepare;
  }

  assert.equal(injected, true, "测试应在 SELECT 与最终 UPDATE 之间换入新租约");
  assert.deepEqual(recovered, []);
  const stored = db.taskGet(task.id, userId);
  assert.equal(stored.status, "running");
  assert.equal(stored.worker_id, "recover-new-worker");
  assert.equal(stored.lease_token, "recover-new-token");
  assert.equal(stored.lease_expires_at, 7100);
});
