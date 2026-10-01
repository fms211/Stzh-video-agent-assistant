"use strict";

function notificationCopy(task) {
  const title = String(task.title || "创作任务");
  if (task.status === "completed") {
    return { title: "任务已完成", message: `“${title}”已完成，可在任务中心查看结果。`, type: "success" };
  }
  if (task.status === "failed") {
    return { title: "任务执行失败", message: `“${title}”：${task.error || "请打开任务中心查看原因。"}`, type: "error" };
  }
  if (task.status === "cancelled") {
    return { title: "任务已取消", message: `“${title}”已停止，不会继续消耗生成资源。`, type: "info" };
  }
  return null;
}

function createTaskNotification(db, task, explicitUserId) {
  const copy = notificationCopy(task);
  if (!copy) return null;
  const userId = Number(task.user_id ?? explicitUserId);
  if (!Number.isFinite(userId)) return null;
  const id = `task:${task.id}:${task.status}`;
  const inserted = db.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, title, message, type)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, copy.title, copy.message, copy.type);
  const notification = db.prepare(
    "SELECT * FROM notifications WHERE id = ? AND user_id = ?"
  ).get(id, userId);
  return { notification, created: inserted.changes > 0 };
}

module.exports = { createTaskNotification };
