"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-runtime-bootstrap-test-"));
process.env.STZH_DATA_DIR = dataDir;

const db = require("../db.js");
const bootstrapPath = path.join(__dirname, "..", "task-runtime-bootstrap.js");
assert.equal(fs.existsSync(bootstrapPath), true, "task-runtime-bootstrap.js must create the production queue runtime");
const { createTaskRuntime, startProductionTaskRuntime } = require(bootstrapPath);

let sequence = 0;
function createUser() {
  sequence += 1;
  return Number(db.prepare(
    "INSERT INTO users (username, password) VALUES (?, 'unused')"
  ).run(`runtime-bootstrap-${sequence}`).lastInsertRowid);
}

function createTask(userId, id, kind = "video.generate") {
  return db.taskCreate({
    id,
    userId,
    kind,
    title: id,
    input: { prompt: `prompt:${id}`, attachmentIds: [] },
    origin: "server",
  }).task;
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not met before timeout");
}

test.afterEach(() => {
  db.prepare("DELETE FROM notifications").run();
  db.prepare("DELETE FROM agent_run_events").run();
  db.prepare("DELETE FROM agent_runs").run();
  db.prepare("DELETE FROM creative_projects").run();
  db.prepare("DELETE FROM task_attachments").run();
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM users").run();
});

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("production runtime executes only server video.generate tasks and publishes lifecycle updates", async (t) => {
  const userId = createUser();
  const video = createTask(userId, "bootstrap-video");
  const unsupported = createTask(userId, "bootstrap-unsupported", "image.generate");
  db.prepare(
    "INSERT INTO creative_projects (id, user_id, name) VALUES ('bootstrap-project', ?, 'Runtime project')"
  ).run(userId);
  db.prepare(
    `INSERT INTO agent_runs
     (id, user_id, project_id, task, status, final_instruction, task_id)
     VALUES ('bootstrap-run', ?, 'bootstrap-project', 'runtime task', 'queued', 'prompt', ?)`
  ).run(userId, video.id);
  db.prepare(
    "UPDATE tasks SET input = json_set(input, '$.sourceAgentRunId', 'bootstrap-run') WHERE id = ?"
  ).run(video.id);
  const updates = [];
  const runtime = createTaskRuntime({
    db,
    workerId: "bootstrap-test-worker",
    pollIntervalMs: 10,
    renewIntervalMs: 20,
    leaseMs: 1_000,
    agentService: {
      async generate(options) {
        await options.onProgress?.({ stage: "mock.upstream", progress: 35 });
        return { text: "mock answer", imageUrls: [] };
      },
    },
    attachmentService: { async resolveForTask() { return []; } },
    onTaskUpdate: (task) => updates.push(task),
  });
  t.after(() => runtime.stop());

  runtime.start();
  await waitFor(() => db.taskGet(video.id, userId).status === "completed");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(db.taskGet(unsupported.id, userId).status, "queued");
  assert.ok(updates.some((task) => task.id === video.id && task.status === "running"));
  assert.ok(updates.some((task) => task.id === video.id && task.progress >= 25));
  assert.ok(updates.some((task) => task.id === video.id && task.status === "completed"));
  const linkedRun = db.prepare("SELECT status, coze_delivered_at FROM agent_runs WHERE id = 'bootstrap-run'").get();
  assert.equal(linkedRun.status, "completed");
  assert.ok(linkedRun.coze_delivered_at);
  const notifications = db.notifList(userId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "success");
  await runtime.stop();
});

test("production bootstrap stays disabled without explicit Coze credentials and never claims work", () => {
  const userId = createUser();
  const task = createTask(userId, "bootstrap-missing-config");
  const started = startProductionTaskRuntime({ db, env: {} });
  assert.equal(started.enabled, false);
  assert.equal(started.runtime, null);
  assert.equal(started.reason, "MISSING_CONFIG");
  assert.equal(db.taskGet(task.id, userId).status, "queued");
});
