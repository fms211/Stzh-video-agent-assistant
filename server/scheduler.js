"use strict";

// 定时任务调度器
// 职责：轮询 scheduled_at <= now 且 status='queued' 的任务，发布 WS 通知桌面接手执行。
// 桌面浏览器是执行者（B 阶段决策），scheduler 只负责"到期唤醒"，不做 LLM 创作。

const db = require("./db.js");
const { publish } = require("./events.js");

// 找所有到期的 queued 定时任务（跨所有用户）
function dueScheduledTasks() {
  return db.prepare(
    `SELECT * FROM tasks
     WHERE status = 'queued'
       AND scheduled_at IS NOT NULL
       AND scheduled_at <= unixepoch()
     ORDER BY scheduled_at ASC
     LIMIT 50`
  ).all();
}

// 触发一轮：把到期任务标记为"已调度就绪"并推送 WS
function tickScheduler() {
  try {
    const due = dueScheduledTasks();
    if (due.length === 0) return 0;

    // 把 stage 标记为"定时任务已触发，等待桌面接手"，并 bumped updated_at 触发 WS
    const touch = db.prepare(
      `UPDATE tasks
       SET stage = CASE WHEN stage = '' THEN '定时任务已触发' ELSE stage END,
           updated_at = unixepoch(), revision = revision + 1
       WHERE id = ? AND user_id = ?`
    );
    for (const task of due) {
      touch.run(task.id, task.user_id);
      // 重新读取以推送最新状态
      const fresh = db.taskGet(task.id, task.user_id);
      if (fresh) publish(task.user_id, "task.updated", { task: fresh });
    }
    return due.length;
  } catch (e) {
    console.error("[Scheduler] tick 失败:", e.message);
    return 0;
  }
}

let started = false;
function startScheduler(intervalSec = 15) {
  if (started) return;
  started = true;
  // 启动立即跑一次 + 定时
  setTimeout(tickScheduler, 1000);
  setInterval(tickScheduler, intervalSec * 1000);
  console.log(`[Scheduler] 定时任务调度器已启动（每 ${intervalSec}s 检查）`);
}

module.exports = { startScheduler, tickScheduler };
