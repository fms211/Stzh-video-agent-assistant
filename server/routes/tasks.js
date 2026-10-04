"use strict";

const { Router } = require("express");
const db = require("../db.js");
const { publish } = require("../events.js");
const { AttachmentService, AttachmentServiceError } = require("../attachment-service.js");
const { syncAgentRunFromTask } = require("../agent-run-linkage.js");
const { createTaskNotification } = require("../task-notifications.js");

const router = Router();
const VALID_ORIGINS = new Set(["desktop", "mobile", "server"]);
let defaultAttachmentService;

function attachmentServiceFor(req) {
  if (req.app.locals.attachmentService) return req.app.locals.attachmentService;
  defaultAttachmentService ||= new AttachmentService({ db });
  return defaultAttachmentService;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}

function canonicalAttachmentIds(value) {
  if (!Array.isArray(value)) return value;
  return value.map((id) => String(id || "").trim()).sort();
}

function canonicalTaskPayload(values) {
  const input = values.input && typeof values.input === "object" && !Array.isArray(values.input)
    ? { ...values.input }
    : {};
  delete input.attachmentIds;
  return JSON.stringify(stableJson({
    kind: String(values.kind || "").trim(),
    title: String(values.title || "").trim().slice(0, 120),
    input,
    attachmentIds: canonicalAttachmentIds(values.attachmentIds || []),
    origin: values.origin,
    scheduledAt: values.scheduledAt ?? null,
  }));
}

function hasSameIdempotentPayload(task, values) {
  const input = parseJson(task.input, {});
  const taskAttachmentIds = Array.isArray(input?.attachmentIds) ? input.attachmentIds : [];
  return canonicalTaskPayload({
    kind: task.kind,
    title: task.title,
    input,
    attachmentIds: taskAttachmentIds,
    origin: task.origin,
    scheduledAt: task.scheduled_at ?? null,
  }) === canonicalTaskPayload(values);
}

function encodeCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!Number.isSafeInteger(parsed.updatedAt) || typeof parsed.id !== "string" || !parsed.id) return null;
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}

function serializeTask(row) {
  if (!row) return null;
  const input = parseJson(row.input, {});
  const prefix = typeof input?.conversationId === "string" ? `chat_${input.conversationId}_` : null;
  // Recover the exact original reply, including requests created by older clients.
  const conversationMessageId = row.kind === "video.generate" && prefix &&
    typeof row.idempotency_key === "string" && row.idempotency_key.startsWith(prefix)
    ? row.idempotency_key.slice(prefix.length) || null : null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    origin: row.origin,
    input,
    conversationMessageId,
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

function runtimeFor(req) {
  return req.app?.locals?.taskRuntime || null;
}

function wakeRuntime(req) {
  const runtime = runtimeFor(req);
  runtime?.wake?.();
}

router.get("/api/tasks", (req, res) => {
  const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
  if (req.query.cursor && !cursor) {
    return res.status(400).json({ error: { message: "任务游标无效" } });
  }
  const page = db.taskPage(req.user.userId, { ...req.query, cursor });
  res.json({
    tasks: page.tasks.map(serializeTask),
    total: page.total,
    nextCursor: page.next ? encodeCursor(page.next) : null,
  });
});

router.post("/api/tasks", (req, res) => {
  const {
    kind,
    title,
    input,
    origin,
    idempotencyKey,
    scheduledAt,
    attachmentIds: topLevelAttachmentIds,
  } = req.body || {};
  if (!kind || !title || typeof kind !== "string" || typeof title !== "string") {
    return res.status(400).json({ error: { message: "任务类型和标题不能为空" } });
  }
  const parsedSchedule = scheduledAt ? Math.floor(new Date(scheduledAt).getTime() / 1000) : null;
  if (scheduledAt && !Number.isFinite(parsedSchedule)) {
    return res.status(400).json({ error: { message: "定时时间无效" } });
  }
  const normalizedInput = input && typeof input === "object" && !Array.isArray(input)
    ? { ...input }
    : {};
  const hasTopLevelAttachmentIds = Object.prototype.hasOwnProperty.call(
    req.body || {},
    "attachmentIds"
  );
  const hasInputAttachmentIds = Object.prototype.hasOwnProperty.call(
    normalizedInput,
    "attachmentIds"
  );
  const attachmentIds = hasTopLevelAttachmentIds
    ? topLevelAttachmentIds
    : hasInputAttachmentIds
      ? normalizedInput.attachmentIds
      : [];
  if (hasTopLevelAttachmentIds || hasInputAttachmentIds) {
    normalizedInput.attachmentIds = attachmentIds;
  }
  const normalizedKind = kind.trim();
  const normalizedTitle = title.trim().slice(0, 120);
  const normalizedOrigin = VALID_ORIGINS.has(origin) ? origin : "desktop";
  const requestPayload = {
    kind: normalizedKind,
    title: normalizedTitle,
    input: normalizedInput,
    attachmentIds,
    origin: normalizedOrigin,
    scheduledAt: parsedSchedule,
  };
  let result;
  try {
    result = db.transaction(() => {
      const created = db.taskCreate({
        userId: req.user.userId,
        kind: normalizedKind,
        title: normalizedTitle,
        input: normalizedInput,
        origin: normalizedOrigin,
        idempotencyKey: idempotencyKey || null,
        scheduledAt: parsedSchedule,
      });
      if (!created.created) {
        if (!hasSameIdempotentPayload(created.task, requestPayload)) {
          throw new AttachmentServiceError(
            "同一个幂等键不能用于不同的任务内容",
            409,
            "IDEMPOTENCY_PAYLOAD_MISMATCH"
          );
        }
        return created;
      }
      attachmentServiceFor(req).bindToTask(
        req.user.userId,
        created.task.id,
        attachmentIds
      );
      return created;
    })();
  } catch (error) {
    if (error instanceof AttachmentServiceError) {
      return res.status(error.status).json({ error: { message: error.message, code: error.code } });
    }
    throw error;
  }
  const task = result.created
    ? emitTask(req.user.userId, result.task)
    : serializeTask(result.task);
  if (result.created) wakeRuntime(req);
  res.status(result.created ? 201 : 200).json({ task, created: result.created });
});

router.get("/api/tasks/:id", (req, res) => {
  const task = db.taskGet(req.params.id, req.user.userId);
  if (!task) return res.status(404).json({ error: { message: "任务不存在" } });
  res.json({ task: serializeTask(task) });
});

router.post("/api/tasks/:id/claim", (req, res) => {
  if (runtimeFor(req)?.started) {
    return res.status(409).json({
      error: {
        message: "该服务已启用服务器任务运行时，桌面端仅观察和控制任务",
        code: "SERVER_MANAGED_TASK",
      },
    });
  }
  const deviceId = String(req.body?.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: { message: "缺少执行设备" } });
  const existing = db.taskGet(req.params.id, req.user.userId);
  if (!existing) return res.status(404).json({ error: { message: "任务不存在" } });
  const claimed = db.taskClaim(req.params.id, req.user.userId, deviceId);
  if (!claimed) return res.status(409).json({ error: { message: "任务当前不可领取" } });
  res.json({
    task: emitTask(req.user.userId, claimed),
    leaseToken: claimed.lease_token,
  });
});

router.post("/api/tasks/:id/lease/renew", (req, res) => {
  const existing = db.taskGet(req.params.id, req.user.userId);
  if (!existing) return res.status(404).json({ error: { message: "任务不存在" } });

  const leaseToken = String(req.body?.leaseToken || "").trim();
  if (!leaseToken) return res.status(400).json({ error: { message: "缺少租约令牌" } });

  const result = db.taskRenewLease(req.params.id, leaseToken);
  if (!result.ok) {
    return res.status(409).json({
      error: { message: "任务租约已失效，不能续租" },
      task: serializeTask(db.taskGet(req.params.id, req.user.userId)),
    });
  }
  res.json({ task: serializeTask(result.task) });
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
  const runtime = runtimeFor(req);
  if (action === "pause" || action === "cancel") runtime?.abortTask?.(req.params.id);
  if (action === "resume" || action === "retry") runtime?.wake?.();
  syncAgentRunFromTask(db, result.task, req.user.userId);
  const notification = createTaskNotification(db, result.task, req.user.userId);
  if (notification?.created) {
    publish(req.user.userId, "notification.created", { notification: notification.notification });
  }
  res.json({ task: emitTask(req.user.userId, result.task) });
});

module.exports = router;
module.exports.serializeTask = serializeTask;
module.exports.canonicalTaskPayload = canonicalTaskPayload;
