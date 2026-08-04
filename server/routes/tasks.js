"use strict";

const { Router } = require("express");
const db = require("../db.js");
const { publish } = require("../events.js");

const router = Router();
const VALID_ORIGINS = new Set(["desktop", "mobile", "server"]);

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function serializeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    origin: row.origin,
    input: parseJson(row.input, {}),
    output: parseJson(row.output, null),
    progress: row.progress,
    stage: row.stage || "",
    error: row.error || null,
    workerDeviceId: row.worker_device_id || null,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at * 1000).toISOString() : null,
    startedAt: row.started_at ? new Date(row.started_at * 1000).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at * 1000).toISOString() : null,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
    revision: row.revision,
  };
}

function emitTask(userId, row) {
  const task = serializeTask(row);
  publish(userId, "task.updated", { task });
  return task;
}

router.get("/api/tasks", (req, res) => {
  const rows = db.taskList(req.user.userId, req.query);
  const total = db.prepare("SELECT COUNT(*) count FROM tasks WHERE user_id = ?").get(req.user.userId).count;
  res.json({ tasks: rows.map(serializeTask), total });
});

router.post("/api/tasks", (req, res) => {
  const { kind, title, input, origin, idempotencyKey, scheduledAt } = req.body || {};
  if (!kind || !title || typeof kind !== "string" || typeof title !== "string") {
    return res.status(400).json({ error: { message: "任务类型和标题不能为空" } });
  }
  const parsedSchedule = scheduledAt ? Math.floor(new Date(scheduledAt).getTime() / 1000) : null;
  if (scheduledAt && !Number.isFinite(parsedSchedule)) {
    return res.status(400).json({ error: { message: "定时时间无效" } });
  }
  const result = db.taskCreate({
    userId: req.user.userId,
    kind: kind.trim(),
    title: title.trim().slice(0, 120),
    input: input || {},
    origin: VALID_ORIGINS.has(origin) ? origin : "desktop",
    idempotencyKey: idempotencyKey || null,
    scheduledAt: parsedSchedule,
  });
  const task = result.created
    ? emitTask(req.user.userId, result.task)
    : serializeTask(result.task);
  res.status(result.created ? 201 : 200).json({ task, created: result.created });
});

router.get("/api/tasks/:id", (req, res) => {
  const task = db.taskGet(req.params.id, req.user.userId);
  if (!task) return res.status(404).json({ error: { message: "任务不存在" } });
  res.json({ task: serializeTask(task) });
});

router.post("/api/tasks/:id/claim", (req, res) => {
  const deviceId = String(req.body?.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: { message: "缺少执行设备" } });
  const existing = db.taskGet(req.params.id, req.user.userId);
  if (!existing) return res.status(404).json({ error: { message: "任务不存在" } });
  const claimed = db.taskClaim(req.params.id, req.user.userId, deviceId);
  if (!claimed) return res.status(409).json({ error: { message: "任务当前不可领取" } });
  res.json({ task: emitTask(req.user.userId, claimed) });
});

router.patch("/api/tasks/:id/progress", (req, res) => {
  const task = db.taskProgress(req.params.id, req.user.userId, req.body || {});
  if (!task) return res.status(409).json({ error: { message: "任务当前不可更新进度" } });
  res.json({ task: emitTask(req.user.userId, task) });
});

router.post("/api/tasks/:id/actions", (req, res) => {
  const action = String(req.body?.action || "");
  const result = db.taskAction(req.params.id, req.user.userId, action, req.body || {});
  if (result.reason === "not_found") {
    return res.status(404).json({ error: { message: "任务不存在" } });
  }
  if (result.reason) {
    return res.status(409).json({
      error: { message: `任务处于 ${result.task.status} 状态，不能执行 ${action}` },
      task: serializeTask(result.task),
    });
  }
  res.json({ task: emitTask(req.user.userId, result.task) });
});

module.exports = router;
module.exports.serializeTask = serializeTask;
