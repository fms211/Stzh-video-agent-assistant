"use strict";

const crypto = require("node:crypto");

function parseInput(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function syncAgentRunFromTask(db, task, explicitUserId) {
  if (!task) return null;
  const input = parseInput(task.input);
  const runId = String(input.sourceAgentRunId || "").trim();
  const userId = Number(task.user_id ?? explicitUserId);
  if (!runId || !Number.isFinite(userId)) return null;
  const run = db.prepare(
    "SELECT * FROM agent_runs WHERE id = ? AND user_id = ? AND task_id = ?"
  ).get(runId, userId, task.id);
  if (!run) return null;
  const status = String(task.status || "");
  if (!["queued", "running", "paused", "completed", "failed", "cancelled"].includes(status)) return null;
  const error = status === "failed" || status === "cancelled"
    ? String(task.error || (status === "cancelled" ? "任务已取消" : "任务执行失败"))
    : null;
  const deliveredAt = status === "completed"
    ? Number(task.completed_at)
      || Math.floor(Date.parse(task.completedAt || "") / 1000)
      || Math.floor(Date.now() / 1000)
    : null;
  const changed = db.prepare(
    `UPDATE agent_runs
     SET status = ?, error = ?, coze_delivered_at = CASE
       WHEN ? = 'completed' THEN COALESCE(coze_delivered_at, ?)
       ELSE coze_delivered_at
     END, updated_at = unixepoch()
     WHERE id = ? AND user_id = ? AND task_id = ?
       AND (status IS NOT ? OR error IS NOT ? OR (? = 'completed' AND coze_delivered_at IS NULL))`
  ).run(status, error, status, deliveredAt, runId, userId, task.id, status, error, status);
  if (!changed.changes) return run;
  db.prepare(
    "INSERT INTO agent_run_events (id, run_id, user_id, type, payload) VALUES (?, ?, ?, ?, ?)"
  ).run(
    `event_${crypto.randomUUID()}`,
    runId,
    userId,
    `task.${status}`,
    JSON.stringify({ taskId: task.id, progress: Number(task.progress) || 0, error })
  );
  return db.prepare("SELECT * FROM agent_runs WHERE id = ? AND user_id = ?").get(runId, userId);
}

module.exports = { syncAgentRunFromTask };
