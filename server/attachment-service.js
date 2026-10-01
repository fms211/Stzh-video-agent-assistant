"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TASK_BYTES = 50 * 1024 * 1024;
const ORPHAN_RETENTION_SECONDS = 60 * 60;
const TERMINAL_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const CLEANUP_CLAIM_TTL_SECONDS = 10 * 60;
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
const MIME_EXTENSIONS = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/bmp", ".bmp"],
  ["image/tiff", ".tiff"],
  ["image/avif", ".avif"],
  ["image/heic", ".heic"],
  ["application/pdf", ".pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["text/csv", ".csv"],
  ["application/csv", ".csv"],
]);

class AttachmentServiceError extends Error {
  constructor(message, status = 400, code = "ATTACHMENT_ERROR") {
    super(message);
    this.name = "AttachmentServiceError";
    this.status = status;
    this.code = code;
  }
}

function safeOriginalName(value) {
  const normalized = String(value || "attachment").replace(/\\/g, "/");
  const basename = path.posix.basename(normalized).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return basename.slice(0, 255) || "attachment";
}

function extensionFor(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  if (MIME_EXTENSIONS.has(mime)) return MIME_EXTENSIONS.get(mime);
  if (mime.startsWith("image/")) return ".img";
  throw new AttachmentServiceError(`不支持的附件类型：${mime || "unknown"}`, 400, "UNSUPPORTED_TYPE");
}

function validateIds(attachmentIds) {
  if (!Array.isArray(attachmentIds)) {
    throw new AttachmentServiceError("attachmentIds 必须是数组", 400, "INVALID_IDS");
  }
  const ids = attachmentIds.map((id) => String(id || "").trim());
  if (ids.some((id) => !id)) {
    throw new AttachmentServiceError("附件 ID 不能为空", 400, "INVALID_IDS");
  }
  if (ids.length > MAX_FILES) {
    throw new AttachmentServiceError(`每个任务最多 ${MAX_FILES} 个附件`, 400, "TOO_MANY_FILES");
  }
  if (new Set(ids).size !== ids.length) {
    throw new AttachmentServiceError("attachmentIds 不能重复", 400, "DUPLICATE_IDS");
  }
  return ids;
}

class AttachmentService {
  constructor(options = {}) {
    if (!options.db) throw new TypeError("AttachmentService 缺少 db");
    this.db = options.db;
    this.dataDir = path.resolve(options.dataDir || process.env.STZH_DATA_DIR || path.join(__dirname, "data"));
    this.rootDir = path.resolve(this.dataDir, "attachments");
    this.writeFileImpl = options.writeFileImpl || fs.promises.writeFile.bind(fs.promises);
    this.unlinkImpl = options.unlinkImpl || fs.promises.unlink.bind(fs.promises);
    this.mkdirImpl = options.mkdirImpl || fs.promises.mkdir.bind(fs.promises);
    this.rmdirImpl = options.rmdirImpl || fs.promises.rmdir.bind(fs.promises);
    this.lstatImpl = options.lstatImpl || fs.promises.lstat.bind(fs.promises);
  }

  userDir(userId) {
    const normalized = String(userId);
    if (!/^\d+$/.test(normalized) || Number(normalized) <= 0) {
      throw new AttachmentServiceError("用户标识无效", 400, "INVALID_USER");
    }
    return path.join(this.rootDir, normalized);
  }

  containedPath(userId, storedName) {
    const userDir = path.resolve(this.userDir(userId));
    const target = path.resolve(userDir, String(storedName || ""));
    const relative = path.relative(userDir, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return target;
  }

  async ensureUserDirectory(userId) {
    const rootDir = path.resolve(this.rootDir);
    const userDir = path.resolve(this.userDir(userId));
    await this.mkdirImpl(rootDir, { recursive: true });
    const rootStat = await this.lstatImpl(rootDir);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new AttachmentServiceError("附件根目录不安全", 400, "UNSAFE_PATH");
    }
    await this.mkdirImpl(userDir, { recursive: true });
    const userStat = await this.lstatImpl(userDir);
    if (!userStat.isDirectory() || userStat.isSymbolicLink()) {
      throw new AttachmentServiceError("附件用户目录不安全", 400, "UNSAFE_PATH");
    }
    return userDir;
  }

  async storedFileState(userId, storedName) {
    const target = this.containedPath(userId, storedName);
    if (!target) return { safe: false, target: null, missing: false };
    const rootDir = path.resolve(this.rootDir);
    const userDir = path.resolve(this.userDir(userId));
    for (const directory of [rootDir, userDir]) {
      try {
        const stat = await this.lstatImpl(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          return { safe: false, target, missing: false };
        }
      } catch (error) {
        if (error?.code === "ENOENT") return { safe: true, target, missing: true };
        return { safe: false, target, missing: false };
      }
    }
    try {
      const stat = await this.lstatImpl(target);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        return { safe: false, target, missing: false };
      }
      return { safe: true, target, missing: false };
    } catch (error) {
      if (error?.code === "ENOENT") return { safe: true, target, missing: true };
      return { safe: false, target, missing: false };
    }
  }

  validateBatch(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new AttachmentServiceError("请至少选择一个附件", 400, "EMPTY_BATCH");
    }
    if (files.length > MAX_FILES) {
      throw new AttachmentServiceError(`每次最多上传 ${MAX_FILES} 个附件`, 400, "TOO_MANY_FILES");
    }
    let total = 0;
    return files.map((file) => {
      const extension = extensionFor(file);
      if (!Buffer.isBuffer(file?.buffer)) {
        throw new AttachmentServiceError("附件内容无效", 400, "INVALID_CONTENT");
      }
      const actualSize = file.buffer.length;
      const declaredSize = file.size == null ? actualSize : Number(file.size);
      if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
        throw new AttachmentServiceError("附件大小无效", 400, "INVALID_SIZE");
      }
      if (declaredSize !== actualSize) {
        throw new AttachmentServiceError("附件声明大小与实际内容不一致", 400, "SIZE_MISMATCH");
      }
      const size = actualSize;
      if (size > MAX_FILE_BYTES) {
        throw new AttachmentServiceError("单个附件不能超过 20 MiB", 400, "FILE_TOO_LARGE");
      }
      total += size;
      return {
        id: crypto.randomUUID(),
        originalName: safeOriginalName(file.originalname),
        storedName: `${crypto.randomBytes(32).toString("hex")}${extension}`,
        mimeType: String(file.mimetype).toLowerCase(),
        size,
        buffer: file.buffer,
      };
    }).map((file, _index, normalized) => {
      if (total > MAX_TASK_BYTES) {
        throw new AttachmentServiceError("附件总计不能超过 50 MiB", 400, "BATCH_TOO_LARGE");
      }
      return file;
    });
  }

  async saveBatch(userId, files) {
    const normalized = this.validateBatch(files);
    const userDir = await this.ensureUserDirectory(userId);
    const queued = normalized.map((file) => ({
      id: crypto.randomUUID(),
      userId,
      storedName: file.storedName,
    }));
    const enqueue = this.db.transaction(() => {
      const insert = this.db.prepare(
        `INSERT INTO attachment_cleanup_queue (id, user_id, stored_name)
         VALUES (?, ?, ?)`
      );
      for (const item of queued) insert.run(item.id, item.userId, item.storedName);
    });
    enqueue();
    try {
      for (const file of normalized) {
        const target = this.containedPath(userId, file.storedName);
        if (!target) throw new AttachmentServiceError("附件存储路径无效", 400, "UNSAFE_PATH");
        await this.writeFileImpl(target, file.buffer);
      }
      const insertAll = this.db.transaction(() => {
        const insert = this.db.prepare(
          `INSERT INTO task_attachments
           (id, user_id, original_name, stored_name, mime_type, size_bytes)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const file of normalized) {
          insert.run(
            file.id,
            userId,
            file.originalName,
            file.storedName,
            file.mimeType,
            file.size
          );
        }
        const clearQueue = this.db.prepare(
          "DELETE FROM attachment_cleanup_queue WHERE id = ?"
        );
        for (const item of queued) clearQueue.run(item.id);
      });
      insertAll();
      return normalized.map((file) => ({
        id: file.id,
        name: file.originalName,
        mime: file.mimeType,
        size: file.size,
      }));
    } catch (error) {
      await this.cleanup({
        queueIds: queued.map((item) => item.id),
        queueOnly: true,
      }).catch(() => {});
      await this.rmdirImpl(userDir).catch(() => {});
      throw error;
    }
  }

  rowsForIds(ids) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db.prepare(
      `SELECT * FROM task_attachments WHERE id IN (${placeholders})`
    ).all(...ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id) || null);
  }

  assertRows(userId, ids) {
    const rows = this.rowsForIds(ids);
    for (let index = 0; index < ids.length; index += 1) {
      const row = rows[index];
      if (!row) throw new AttachmentServiceError(`附件不存在：${ids[index]}`, 400, "NOT_FOUND");
      if (Number(row.user_id) !== Number(userId)) {
        throw new AttachmentServiceError("无权访问该附件", 403, "FORBIDDEN");
      }
      if (row.cleanup_token) {
        throw new AttachmentServiceError("附件正在安全清理中，请稍后重试", 409, "CLEANUP_IN_PROGRESS");
      }
    }
    return rows;
  }

  bindToTask(userId, taskId, attachmentIds) {
    const ids = validateIds(attachmentIds);
    if (ids.length === 0) return [];
    const task = this.db.prepare("SELECT id, user_id FROM tasks WHERE id = ?").get(taskId);
    if (!task) throw new AttachmentServiceError("任务不存在", 400, "TASK_NOT_FOUND");
    if (Number(task.user_id) !== Number(userId)) {
      throw new AttachmentServiceError("无权绑定到该任务", 403, "FORBIDDEN");
    }
    const rows = this.assertRows(userId, ids);
    for (const row of rows) {
      if (row.task_id && row.task_id !== taskId) {
        throw new AttachmentServiceError("附件已绑定到其他任务", 409, "ALREADY_BOUND");
      }
    }
    const current = this.db.prepare(
      "SELECT id, size_bytes FROM task_attachments WHERE user_id = ? AND task_id = ?"
    ).all(userId, taskId);
    const combined = new Map(current.map((row) => [row.id, row]));
    for (const row of rows) combined.set(row.id, row);
    if (combined.size > MAX_FILES) {
      throw new AttachmentServiceError(`每个任务最多 ${MAX_FILES} 个附件`, 400, "TOO_MANY_FILES");
    }
    const total = [...combined.values()].reduce((sum, row) => sum + Number(row.size_bytes), 0);
    if (total > MAX_TASK_BYTES) {
      throw new AttachmentServiceError("任务附件总计不能超过 50 MiB", 400, "TASK_TOO_LARGE");
    }
    const bindAll = this.db.transaction(() => {
      const update = this.db.prepare(
        `UPDATE task_attachments
         SET task_id = ?, bound_at = COALESCE(bound_at, unixepoch())
         WHERE id = ? AND user_id = ? AND cleanup_token IS NULL
           AND (task_id IS NULL OR task_id = ?)`
      );
      for (const row of rows) {
        if (!update.run(taskId, row.id, userId, taskId).changes) {
          throw new AttachmentServiceError("附件绑定发生冲突", 409, "BIND_CONFLICT");
        }
      }
    });
    bindAll();
    return this.rowsForIds(ids);
  }

  async resolveForTask(userId, taskId, attachmentIds) {
    const ids = validateIds(attachmentIds);
    const rows = this.assertRows(userId, ids);
    const resolved = [];
    for (const row of rows) {
      if (row.task_id !== taskId) {
        throw new AttachmentServiceError("附件未绑定到当前任务", 409, "WRONG_TASK");
      }
      const state = await this.storedFileState(userId, row.stored_name);
      if (!state.safe) {
        throw new AttachmentServiceError("附件存储路径不安全", 400, "UNSAFE_PATH");
      }
      if (state.missing) {
        throw new AttachmentServiceError("附件文件已失效", 400, "MISSING_FILE");
      }
      resolved.push({
        id: row.id,
        name: row.original_name,
        mimeType: row.mime_type,
        size: row.size_bytes,
        path: state.target,
      });
    }
    return resolved;
  }

  isCleanupEligible(row, now) {
    if (!row.task_id) return row.created_at <= now - ORPHAN_RETENTION_SECONDS;
    return TERMINAL_STATES.has(row.task_status)
      && row.completed_at != null
      && row.completed_at <= now - TERMINAL_RETENTION_SECONDS;
  }

  releaseStaleCleanupClaims(now) {
    const staleAt = now - CLEANUP_CLAIM_TTL_SECONDS;
    this.db.prepare(
      `UPDATE task_attachments
       SET cleanup_token = NULL, cleanup_started_at = NULL
       WHERE cleanup_token IS NOT NULL
         AND (cleanup_started_at IS NULL OR cleanup_started_at <= ?)`
    ).run(staleAt);
    this.db.prepare(
      `UPDATE attachment_cleanup_queue
       SET cleanup_token = NULL, cleanup_started_at = NULL
       WHERE cleanup_token IS NOT NULL
         AND (cleanup_started_at IS NULL OR cleanup_started_at <= ?)`
    ).run(staleAt);
  }

  claimQueuedFile(id, now) {
    const token = crypto.randomUUID();
    const claimed = this.db.prepare(
      `UPDATE attachment_cleanup_queue
       SET cleanup_token = ?, cleanup_started_at = ?, attempt_count = attempt_count + 1
       WHERE id = ? AND cleanup_token IS NULL`
    ).run(token, now, id);
    if (!claimed.changes) return null;
    return this.db.prepare(
      "SELECT * FROM attachment_cleanup_queue WHERE id = ? AND cleanup_token = ?"
    ).get(id, token);
  }

  releaseQueuedClaim(id, token, error) {
    this.db.prepare(
      `UPDATE attachment_cleanup_queue
       SET cleanup_token = NULL, cleanup_started_at = NULL, last_error = ?
       WHERE id = ? AND cleanup_token = ?`
    ).run(error || null, id, token);
  }

  deleteQueuedClaim(id, token) {
    return this.db.prepare(
      "DELETE FROM attachment_cleanup_queue WHERE id = ? AND cleanup_token = ?"
    ).run(id, token).changes > 0;
  }

  claimAttachmentForCleanup(id, now) {
    const token = crypto.randomUUID();
    const claimed = this.db.prepare(
      `UPDATE task_attachments
       SET cleanup_token = ?, cleanup_started_at = ?
       WHERE id = ? AND cleanup_token IS NULL
         AND (
           (task_id IS NULL AND created_at <= ?)
           OR EXISTS (
             SELECT 1 FROM tasks t
             WHERE t.id = task_attachments.task_id
               AND t.status IN ('completed', 'failed', 'cancelled')
               AND t.completed_at IS NOT NULL
               AND t.completed_at <= ?
           )
         )`
    ).run(
      token,
      now,
      id,
      now - ORPHAN_RETENTION_SECONDS,
      now - TERMINAL_RETENTION_SECONDS
    );
    if (!claimed.changes) return null;
    return this.db.prepare(
      "SELECT * FROM task_attachments WHERE id = ? AND cleanup_token = ?"
    ).get(id, token);
  }

  releaseAttachmentClaim(id, token) {
    this.db.prepare(
      `UPDATE task_attachments
       SET cleanup_token = NULL, cleanup_started_at = NULL
       WHERE id = ? AND cleanup_token = ?`
    ).run(id, token);
  }

  deleteAttachmentClaim(id, token) {
    return this.db.prepare(
      "DELETE FROM task_attachments WHERE id = ? AND cleanup_token = ?"
    ).run(id, token).changes > 0;
  }

  async cleanupQueuedFiles(now, queueIds, report) {
    const ids = Array.isArray(queueIds)
      ? queueIds.map((id) => String(id || "")).filter(Boolean)
      : null;
    if (ids && ids.length === 0) return;
    const placeholders = ids?.map(() => "?").join(", ");
    const candidates = this.db.prepare(
      `SELECT id FROM attachment_cleanup_queue
       WHERE cleanup_token IS NULL${ids ? ` AND id IN (${placeholders})` : ""}`
    ).all(...(ids || []));
    for (const candidate of candidates) {
      const row = this.claimQueuedFile(candidate.id, now);
      if (!row) continue;
      const state = await this.storedFileState(row.user_id, row.stored_name);
      if (!state.safe) {
        this.releaseQueuedClaim(row.id, row.cleanup_token, "附件清理路径不安全");
        report.skippedUnsafe.push(row.id);
        continue;
      }
      try {
        if (!state.missing) await this.unlinkImpl(state.target);
        if (this.deleteQueuedClaim(row.id, row.cleanup_token)) report.queueDeleted.push(row.id);
      } catch (error) {
        if (error?.code === "ENOENT") {
          if (this.deleteQueuedClaim(row.id, row.cleanup_token)) report.queueDeleted.push(row.id);
          continue;
        }
        const message = error?.message || "删除失败";
        this.releaseQueuedClaim(row.id, row.cleanup_token, message);
        report.queueFailed.push({ id: row.id, message });
      }
    }
  }

  async cleanup(options = {}) {
    const now = Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
    this.releaseStaleCleanupClaims(now);
    const report = { deleted: [], failed: [], skippedUnsafe: [], queueDeleted: [], queueFailed: [] };
    await this.cleanupQueuedFiles(now, options.queueIds, report);
    if (options.queueOnly) return report;
    const candidates = this.db.prepare(
      `SELECT a.*, t.status AS task_status, t.completed_at
       FROM task_attachments a
       LEFT JOIN tasks t ON t.id = a.task_id
       WHERE a.cleanup_token IS NULL
          AND ((a.task_id IS NULL AND a.created_at <= ?)
           OR (t.status IN ('completed', 'failed', 'cancelled') AND t.completed_at IS NOT NULL AND t.completed_at <= ?))`
    ).all(now - ORPHAN_RETENTION_SECONDS, now - TERMINAL_RETENTION_SECONDS);
    for (const candidate of candidates) {
      const current = this.claimAttachmentForCleanup(candidate.id, now);
      if (!current) continue;
      const state = await this.storedFileState(current.user_id, current.stored_name);
      if (!state.safe) {
        this.releaseAttachmentClaim(current.id, current.cleanup_token);
        report.skippedUnsafe.push(current.id);
        continue;
      }
      try {
        if (!state.missing) await this.unlinkImpl(state.target);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          this.releaseAttachmentClaim(current.id, current.cleanup_token);
          report.failed.push({ id: current.id, message: error?.message || "删除失败" });
          continue;
        }
      }
      if (this.deleteAttachmentClaim(current.id, current.cleanup_token)) report.deleted.push(current.id);
    }
    return report;
  }
}

module.exports = {
  AttachmentService,
  AttachmentServiceError,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TASK_BYTES,
  ORPHAN_RETENTION_SECONDS,
  TERMINAL_RETENTION_SECONDS,
  CLEANUP_CLAIM_TTL_SECONDS,
};
