"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-task-notifications-"));
process.env.STZH_DATA_DIR = dataDir;
const db = require("../db.js");
const modulePath = path.join(__dirname, "..", "task-notifications.js");
assert.equal(fs.existsSync(modulePath), true, "task-notifications.js must create durable terminal notifications");
const { createTaskNotification } = require(modulePath);

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("terminal task notifications are account-scoped and idempotent", () => {
  const userId = Number(db.prepare(
    "INSERT INTO users (username, password) VALUES ('notif-owner', 'unused')"
  ).run().lastInsertRowid);
  const task = {
    id: "notification-task",
    user_id: userId,
    title: "通知任务",
    status: "completed",
    progress: 100,
  };
  assert.equal(createTaskNotification(db, { ...task, status: "running" }), null);
  const first = createTaskNotification(db, task);
  const duplicate = createTaskNotification(db, task);
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.notification.type, "success");
  assert.equal(db.notifList(userId).length, 1);

  const failed = createTaskNotification(db, {
    ...task,
    status: "failed",
    error: "mock upstream failed",
  });
  assert.equal(failed.created, true);
  assert.equal(failed.notification.type, "error");
  assert.match(failed.notification.message, /mock upstream failed/);
  assert.equal(db.notifList(userId).length, 2);
});
