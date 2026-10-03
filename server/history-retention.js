"use strict";

function initialize(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS history_retention_policy (
    user_id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
    days INTEGER NOT NULL DEFAULT 30, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
    CREATE TABLE IF NOT EXISTS history_current_sessions (
      user_id INTEGER NOT NULL, client_id TEXT NOT NULL, session_id TEXT NOT NULL,
      PRIMARY KEY(user_id,client_id,session_id));
    CREATE TABLE IF NOT EXISTS history_retention_tombstones (
      user_id INTEGER NOT NULL, session_id TEXT NOT NULL, deleted_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,session_id));`);
}

function exists(db, table) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)); }
function isRemoved(db, userId, sessionId) {
  return exists(db, "history_retention_tombstones") && Boolean(db.prepare("SELECT 1 FROM history_retention_tombstones WHERE user_id=? AND session_id=?").get(userId, sessionId));
}
function assertAvailable(db, userId, sessionId) {
  if (isRemoved(db, userId, sessionId)) throw Object.assign(new Error("此对话已按保留策略清理，请开始新对话"), { status: 410, code: "HISTORY_EXPIRED" });
}
function policy(db, userId) {
  const row = db.prepare("SELECT enabled,days FROM history_retention_policy WHERE user_id=?").get(userId);
  return row ? { enabled: row.enabled === 1, days: row.days } : { enabled: false, days: 30 };
}
function configure(db, userId, value) {
  if (!value || typeof value.enabled !== "boolean" || !Number.isSafeInteger(value.days) || value.days < 1 || value.days > 90 || (value.enabled && value.confirm !== true)) {
    throw Object.assign(new Error("开启清理需明确确认，保留天数应为1至90的整数"), { status: 400 });
  }
  db.prepare("INSERT INTO history_retention_policy(user_id,enabled,days) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,days=excluded.days,updated_at=unixepoch()").run(userId, Number(value.enabled), value.days);
  return policy(db, userId);
}
function registerCurrent(db, userId, clientId, sessionIds) {
  if (typeof clientId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientId) || !Array.isArray(sessionIds) || sessionIds.length > 12 || sessionIds.some(id => typeof id !== "string" || !id || id.length > 200)) {
    throw Object.assign(new Error("当前会话保护信息无效"), { status: 400 });
  }
  // Current sessions stay protected until this browser/device explicitly changes
  // them. Do not expire protection merely because a tab is suspended/offline.
  db.transaction(() => {
    db.prepare("DELETE FROM history_current_sessions WHERE user_id=? AND client_id=?").run(userId, clientId);
    const insert = db.prepare("INSERT OR IGNORE INTO history_current_sessions VALUES(?,?,?)");
    for (const id of sessionIds) insert.run(userId, clientId, id);
  })();
}
function sweep(db, userId, now = Math.floor(Date.now() / 1000)) {
  return db.transaction(() => {
    const setting = policy(db, userId);
    if (!setting.enabled) return { deletedIds: [], enabled: false };
    const protectedIds = new Set(db.prepare("SELECT session_id FROM history_current_sessions WHERE user_id=?").all(userId).map(row => row.session_id));
    // A task with invalid input has unknown ownership of a conversation: fail
    // closed for this account instead of deleting potentially associated data.
    if (exists(db, "tasks")) for (const task of db.prepare("SELECT input FROM tasks WHERE user_id=? AND status NOT IN ('completed','failed','cancelled')").all(userId)) {
      let input;
      try { input = JSON.parse(task.input); } catch { return { deletedIds: [], enabled: true, deferred: "TASK_LINK_UNKNOWN" }; }
      for (const key of ["conversationId", "sessionId"]) if (typeof input?.[key] === "string") protectedIds.add(input[key]);
    }
    const deletedIds = [];
    const cutoff = now - setting.days * 86400;
    const candidates = db.prepare("SELECT id FROM opc_sessions WHERE user_id=? AND updated_at < ?").all(userId, cutoff);
    for (const { id } of candidates) {
      if (protectedIds.has(id)) continue;
      // Research and collaboration runs are separate business records, never
      // targets for retention. Unknown registered modes also stay untouched.
      if (exists(db, "studio_session_modes")) {
        const mode = db.prepare("SELECT mode FROM studio_session_modes WHERE user_id=? AND session_id=?").get(userId, id)?.mode;
        if (mode && !["coze", "assistant", "workflow"].includes(mode)) continue;
      }
      // Workflow runs can still be waiting for approval without a TaskRuntime
      // row. Keep their session while a plan is not terminal.
      if (exists(db, "studio_workflow_plans")) {
        let unfinished = false;
        for (const run of db.prepare("SELECT run_id,plan FROM studio_workflow_plans WHERE user_id=? AND session_id=?").all(userId, id)) {
          let plan;
          try { plan = JSON.parse(run.plan); } catch { unfinished = true; break; }
          if (!Array.isArray(plan?.steps) || !plan.steps.length || !exists(db, "studio_workflow_results")) { unfinished = true; break; }
          const results = new Map(db.prepare("SELECT step_id,status FROM studio_workflow_results WHERE user_id=? AND session_id=? AND run_id=?").all(userId, id, run.run_id).map(row => [row.step_id, row.status]));
          if (plan.steps.some((step, index) => !step?.id || results.get(`${run.run_id}:${index}:${step.id}`) !== "completed")) { unfinished = true; break; }
        }
        if (unfinished) continue;
      }
      db.prepare("INSERT OR IGNORE INTO history_retention_tombstones VALUES(?,?,?)").run(userId, id, now);
      db.prepare("DELETE FROM opc_messages WHERE session_id=?").run(id);
      db.prepare("DELETE FROM opc_sessions WHERE id=? AND user_id=?").run(id, userId);
      // Retire the migrated legacy copy as well; otherwise a future migration
      // could re-create an expired conversation. Works and memories stay intact.
      if (exists(db, "conversations") && db.prepare("SELECT 1 FROM conversations WHERE id=? AND user_id=?").get(id, userId)) {
        if (exists(db, "messages")) db.prepare("DELETE FROM messages WHERE conversation_id=?").run(id);
        db.prepare("DELETE FROM conversations WHERE id=? AND user_id=?").run(id, userId);
      }
      deletedIds.push(id);
    }
    return { deletedIds, enabled: true };
  })();
}

module.exports = { initialize, policy, configure, registerCurrent, sweep, isRemoved, assertAvailable };
