"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-attachments-test-"));
process.env.STZH_DATA_DIR = dataDir;

const db = require("../db.js");

function loadAttachmentService() {
  return require("../attachment-service.js");
}

let sequence = 0;
function createUser(label = "attachment-user") {
  sequence += 1;
  return Number(db.prepare(
    "INSERT INTO users (username, password) VALUES (?, 'unused')"
  ).run(`${label}-${sequence}`).lastInsertRowid);
}

function createTask(userId, id = `attachment-task-${++sequence}`) {
  return db.taskCreate({
    id,
    userId,
    kind: "video.generate",
    title: id,
    input: { prompt: id },
    origin: "server",
  }).task;
}

function mockFile(name, mimeType, options = {}) {
  const hasDeclaredSize = Object.prototype.hasOwnProperty.call(options, "size");
  const buffer = options.buffer || (hasDeclaredSize
    ? Buffer.alloc(Number(options.size), 1)
    : Buffer.from(`mock:${name}`));
  return {
    originalname: name,
    mimetype: mimeType,
    size: options.size ?? buffer.length,
    buffer,
  };
}

test.afterEach(() => {
  db.prepare("DELETE FROM task_attachments").run();
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM users").run();
  fs.rmSync(path.join(dataDir, "attachments"), { recursive: true, force: true });
});

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("batch upload uses random user-scoped paths and only returns safe descriptors", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const service = new AttachmentService({ db, dataDir });

  const descriptors = await service.saveBatch(userId, [
    mockFile("../../server/stzh.db", "image/png"),
    mockFile("同名文件.pdf", "application/pdf"),
  ]);

  assert.equal(descriptors.length, 2);
  for (const descriptor of descriptors) {
    assert.deepEqual(Object.keys(descriptor).sort(), ["id", "mime", "name", "size"]);
    assert.equal(path.isAbsolute(descriptor.name), false);
  }
  const rows = db.prepare(
    "SELECT * FROM task_attachments WHERE user_id = ? ORDER BY created_at, id"
  ).all(userId);
  assert.equal(rows.length, 2);
  const rowsByMime = new Map(rows.map((row) => [row.mime_type, row]));
  assert.match(rowsByMime.get("image/png").stored_name, /^[a-f0-9]{64}\.png$/);
  assert.match(rowsByMime.get("application/pdf").stored_name, /^[a-f0-9]{64}\.pdf$/);
  assert.notEqual(rows[0].stored_name, rows[1].stored_name);
  for (const row of rows) {
    const storedPath = path.join(dataDir, "attachments", String(userId), row.stored_name);
    assert.equal(fs.existsSync(storedPath), true);
    assert.equal(path.relative(path.join(dataDir, "attachments", String(userId)), storedPath).startsWith(".."), false);
  }
});

test("type/count/per-file/batch limits reject before persistence with zero residue", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const service = new AttachmentService({ db, dataDir });
  const invalidCases = [
    [mockFile("script.exe", "application/x-msdownload")],
    Array.from({ length: 6 }, (_, index) => mockFile(`${index}.png`, "image/png")),
    [mockFile("huge.pdf", "application/pdf", { size: 20 * 1024 * 1024 + 1 })],
    Array.from({ length: 5 }, (_, index) => mockFile(`${index}.pdf`, "application/pdf", {
      size: 11 * 1024 * 1024,
    })),
    [mockFile("ok.png", "image/png"), mockFile("bad.exe", "application/x-msdownload")],
  ];

  for (const files of invalidCases) {
    await assert.rejects(service.saveBatch(userId, files));
    assert.equal(db.prepare("SELECT COUNT(*) count FROM task_attachments").get().count, 0);
    const root = path.join(dataDir, "attachments");
    const storedFiles = fs.existsSync(root)
      ? fs.readdirSync(root, { recursive: true }).filter((entry) => path.extname(String(entry)))
      : [];
    assert.deepEqual(storedFiles, []);
  }
});

test("buffer length is authoritative and a mismatched declared size is rejected", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const service = new AttachmentService({ db, dataDir });
  const buffer = Buffer.from("authoritative bytes");

  await assert.rejects(
    service.saveBatch(userId, [mockFile("mismatch.png", "image/png", {
      buffer,
      size: buffer.length - 1,
    })]),
    (error) => error?.code === "SIZE_MISMATCH"
  );
  assert.equal(db.prepare("SELECT COUNT(*) count FROM task_attachments").get().count, 0);
});

test("a filesystem failure rolls the entire batch back", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  let writes = 0;
  const service = new AttachmentService({
    db,
    dataDir,
    writeFileImpl: async (target, buffer) => {
      writes += 1;
      if (writes === 2) {
        await fs.promises.writeFile(target, Buffer.from("partial bytes"));
        throw new Error("mock disk failure");
      }
      await fs.promises.writeFile(target, buffer);
    },
  });

  await assert.rejects(service.saveBatch(userId, [
    mockFile("first.png", "image/png"),
    mockFile("second.pdf", "application/pdf"),
  ]), /mock disk failure/);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM task_attachments").get().count, 0);
  const userDir = path.join(dataDir, "attachments", String(userId));
  assert.equal(fs.existsSync(userDir) ? fs.readdirSync(userDir).length : 0, 0);
});

test("failed compensation is durably quarantined and cleanup retries injected unlink", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  let writes = 0;
  const unlinkAttempts = [];
  const service = new AttachmentService({
    db,
    dataDir,
    writeFileImpl: async (target, buffer) => {
      writes += 1;
      await fs.promises.writeFile(target, buffer);
      if (writes === 2) throw new Error("mock partial write failure");
    },
    unlinkImpl: async (target) => {
      unlinkAttempts.push(target);
      throw new Error("mock compensation lock");
    },
  });

  await assert.rejects(service.saveBatch(userId, [
    mockFile("first.png", "image/png"),
    mockFile("second.pdf", "application/pdf"),
  ]), /mock partial write failure/);
  assert.equal(unlinkAttempts.length, 2);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM task_attachments").get().count, 0);
  const quarantined = db.prepare(
    "SELECT * FROM attachment_cleanup_queue WHERE user_id = ? ORDER BY stored_name"
  ).all(userId);
  assert.equal(quarantined.length, 2);
  for (const row of quarantined) {
    assert.ok(row.last_error.includes("mock compensation lock"));
    assert.equal(fs.existsSync(path.join(dataDir, "attachments", String(userId), row.stored_name)), true);
  }

  const retryService = new AttachmentService({ db, dataDir });
  const report = await retryService.cleanup();
  assert.equal(report.failed.length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM attachment_cleanup_queue").get().count, 0);
  for (const row of quarantined) {
    assert.equal(fs.existsSync(path.join(dataDir, "attachments", String(userId), row.stored_name)), false);
  }
});

test("binding is user-isolated, idempotent for one task, and rejects duplicates or another task", async () => {
  const { AttachmentService } = loadAttachmentService();
  const ownerId = createUser("attachment-owner");
  const strangerId = createUser("attachment-stranger");
  const firstTask = createTask(ownerId, "attachment-first-task");
  const secondTask = createTask(ownerId, "attachment-second-task");
  const service = new AttachmentService({ db, dataDir });
  const [descriptor] = await service.saveBatch(ownerId, [mockFile("owner.png", "image/png")]);

  assert.throws(
    () => service.bindToTask(strangerId, firstTask.id, [descriptor.id]),
    (error) => error.status === 403
  );
  assert.throws(
    () => service.bindToTask(ownerId, firstTask.id, [descriptor.id, descriptor.id]),
    (error) => error.status === 400
  );
  service.bindToTask(ownerId, firstTask.id, [descriptor.id]);
  service.bindToTask(ownerId, firstTask.id, [descriptor.id]);
  assert.throws(
    () => service.bindToTask(ownerId, secondTask.id, [descriptor.id]),
    (error) => error.status === 409
  );
  const row = db.prepare("SELECT * FROM task_attachments WHERE id = ?").get(descriptor.id);
  assert.equal(row.user_id, ownerId);
  assert.equal(row.task_id, firstTask.id);
  assert.ok(row.bound_at);
});

test("binding enforces five-file and 50 MiB totals without partial updates", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const countTask = createTask(userId, "attachment-count-task");
  const sizeTask = createTask(userId, "attachment-size-task");
  const service = new AttachmentService({ db, dataDir });
  const firstFive = await service.saveBatch(userId, Array.from({ length: 5 }, (_, index) =>
    mockFile(`${index}.png`, "image/png")
  ));
  service.bindToTask(userId, countTask.id, firstFive.map((item) => item.id));
  const [sixth] = await service.saveBatch(userId, [mockFile("sixth.pdf", "application/pdf")]);
  assert.throws(
    () => service.bindToTask(userId, countTask.id, [sixth.id]),
    (error) => error.status === 400
  );
  assert.equal(db.prepare("SELECT task_id FROM task_attachments WHERE id = ?").get(sixth.id).task_id, null);

  const oversized = [];
  for (let index = 0; index < 4; index += 1) {
    const [item] = await service.saveBatch(userId, [
      mockFile(`large-${index}.pdf`, "application/pdf", { size: 13 * 1024 * 1024 }),
    ]);
    oversized.push(item);
  }
  assert.throws(
    () => service.bindToTask(userId, sizeTask.id, oversized.map((item) => item.id)),
    (error) => error.status === 400
  );
  assert.equal(db.prepare(
    "SELECT COUNT(*) count FROM task_attachments WHERE task_id = ?"
  ).get(sizeTask.id).count, 0);
});

test("resolver accepts only database-bound user attachments and never task input paths", async () => {
  const { AttachmentService } = loadAttachmentService();
  const ownerId = createUser("resolver-owner");
  const strangerId = createUser("resolver-stranger");
  const task = createTask(ownerId, "resolver-task");
  const service = new AttachmentService({ db, dataDir });
  const [descriptor] = await service.saveBatch(ownerId, [mockFile("asset.png", "image/png")]);
  service.bindToTask(ownerId, task.id, [descriptor.id]);

  const [resolved] = await service.resolveForTask(ownerId, task.id, [descriptor.id]);
  assert.equal(resolved.id, descriptor.id);
  assert.equal(resolved.mimeType, "image/png");
  assert.equal(path.isAbsolute(resolved.path), true);
  assert.equal(resolved.path.startsWith(path.join(dataDir, "attachments", String(ownerId))), true);
  await assert.rejects(
    service.resolveForTask(strangerId, task.id, [descriptor.id]),
    (error) => error.status === 403
  );
  await assert.rejects(
    service.resolveForTask(ownerId, "other-task", [descriptor.id]),
    (error) => error.status === 409
  );
});

test("cleanup applies orphan/terminal retention, contains paths, and keeps failed rows retryable", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const terminalTask = createTask(userId, "cleanup-terminal-task");
  const activeTask = createTask(userId, "cleanup-active-task");
  const normalService = new AttachmentService({ db, dataDir });
  const [orphan, terminal, active, failedDelete] = await normalService.saveBatch(userId, [
    mockFile("orphan.png", "image/png"),
    mockFile("terminal.pdf", "application/pdf"),
    mockFile("active.csv", "text/csv"),
    mockFile("retry.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  ]);
  normalService.bindToTask(userId, terminalTask.id, [terminal.id, failedDelete.id]);
  normalService.bindToTask(userId, activeTask.id, [active.id]);
  const now = 2_000_000_000;
  db.prepare("UPDATE task_attachments SET created_at = ? WHERE id = ?").run(now - 3601, orphan.id);
  db.prepare(
    "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?"
  ).run(now - 30 * 24 * 60 * 60 - 1, terminalTask.id);

  const outsidePath = path.join(dataDir, "outside-do-not-delete.txt");
  fs.writeFileSync(outsidePath, "keep");
  db.prepare(
    `INSERT INTO task_attachments
     (id, user_id, original_name, stored_name, mime_type, size_bytes, created_at)
     VALUES ('unsafe-row', ?, 'outside.txt', '..\\..\\outside-do-not-delete.txt', 'text/csv', 4, ?)`
  ).run(userId, now - 3601);

  const failedPath = (await normalService.resolveForTask(
    userId,
    terminalTask.id,
    [failedDelete.id]
  ))[0].path;
  const service = new AttachmentService({
    db,
    dataDir,
    unlinkImpl: async (target) => {
      if (target === failedPath) throw new Error("mock locked file");
      await fs.promises.unlink(target);
    },
  });

  const report = await service.cleanup({ now });
  assert.ok(report.deleted.includes(orphan.id));
  assert.ok(report.deleted.includes(terminal.id));
  assert.ok(report.failed.some((item) => item.id === failedDelete.id));
  assert.ok(report.skippedUnsafe.includes("unsafe-row"));
  assert.equal(db.prepare("SELECT 1 FROM task_attachments WHERE id = ?").get(orphan.id), undefined);
  assert.equal(db.prepare("SELECT 1 FROM task_attachments WHERE id = ?").get(terminal.id), undefined);
  assert.ok(db.prepare("SELECT 1 FROM task_attachments WHERE id = ?").get(active.id));
  assert.ok(db.prepare("SELECT 1 FROM task_attachments WHERE id = ?").get(failedDelete.id));
  const failedRow = db.prepare(
    "SELECT cleanup_token, cleanup_started_at FROM task_attachments WHERE id = ?"
  ).get(failedDelete.id);
  assert.equal(failedRow.cleanup_token, null);
  assert.equal(failedRow.cleanup_started_at, null);
  assert.ok(db.prepare("SELECT 1 FROM task_attachments WHERE id = 'unsafe-row'").get());
  assert.equal(fs.existsSync(outsidePath), true);
});

test("an orphan cleanup claim blocks binding until deferred unlink completes", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const task = createTask(userId, "cleanup-bind-target");
  const normalService = new AttachmentService({ db, dataDir });
  const [orphan] = await normalService.saveBatch(userId, [mockFile("claimed.png", "image/png")]);
  const now = 2_100_000_000;
  db.prepare("UPDATE task_attachments SET created_at = ? WHERE id = ?").run(now - 3601, orphan.id);
  let releaseUnlink;
  let unlinkStartedResolve;
  const unlinkStarted = new Promise((resolve) => { unlinkStartedResolve = resolve; });
  const cleanupService = new AttachmentService({
    db,
    dataDir,
    unlinkImpl: async (target) => {
      unlinkStartedResolve();
      await new Promise((resolve) => { releaseUnlink = resolve; });
      await fs.promises.unlink(target);
    },
  });

  const pendingCleanup = cleanupService.cleanup({ now });
  await unlinkStarted;
  const claimed = db.prepare(
    "SELECT cleanup_token, cleanup_started_at FROM task_attachments WHERE id = ?"
  ).get(orphan.id);
  assert.ok(claimed.cleanup_token);
  assert.equal(claimed.cleanup_started_at, now);
  assert.throws(
    () => normalService.bindToTask(userId, task.id, [orphan.id]),
    (error) => error?.code === "CLEANUP_IN_PROGRESS"
  );
  releaseUnlink();
  const report = await pendingCleanup;
  assert.ok(report.deleted.includes(orphan.id));
  assert.equal(db.prepare("SELECT 1 FROM task_attachments WHERE id = ?").get(orphan.id), undefined);
});

test("a terminal cleanup claim blocks resolution and retry while unlink is deferred", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const task = createTask(userId, "cleanup-terminal-claim");
  const normalService = new AttachmentService({ db, dataDir });
  const [attachment] = await normalService.saveBatch(userId, [mockFile("terminal.png", "image/png")]);
  normalService.bindToTask(userId, task.id, [attachment.id]);
  const now = 2_200_000_000;
  db.prepare(
    "UPDATE tasks SET status = 'failed', completed_at = ? WHERE id = ?"
  ).run(now - 30 * 24 * 60 * 60 - 1, task.id);
  let releaseUnlink;
  let unlinkStartedResolve;
  const unlinkStarted = new Promise((resolve) => { unlinkStartedResolve = resolve; });
  const cleanupService = new AttachmentService({
    db,
    dataDir,
    unlinkImpl: async (target) => {
      unlinkStartedResolve();
      await new Promise((resolve) => { releaseUnlink = resolve; });
      await fs.promises.unlink(target);
    },
  });

  const pendingCleanup = cleanupService.cleanup({ now });
  await unlinkStarted;
  await assert.rejects(
    normalService.resolveForTask(userId, task.id, [attachment.id]),
    (error) => error?.code === "CLEANUP_IN_PROGRESS"
  );
  const retry = db.taskAction(task.id, userId, "retry");
  assert.equal(retry.reason, "attachment_cleanup_in_progress");
  assert.equal(db.taskGet(task.id, userId).status, "failed");
  releaseUnlink();
  await pendingCleanup;
});

test("stale attachment cleanup claims are reclaimed after a crashed process", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const service = new AttachmentService({ db, dataDir });
  const [orphan] = await service.saveBatch(userId, [mockFile("stale.png", "image/png")]);
  const now = 2_300_000_000;
  db.prepare(
    `UPDATE task_attachments
     SET created_at = ?, cleanup_token = 'crashed-worker', cleanup_started_at = ?
     WHERE id = ?`
  ).run(now - 3601, now - 601, orphan.id);

  const report = await service.cleanup({ now });
  assert.ok(report.deleted.includes(orphan.id));
  assert.equal(db.prepare("SELECT 1 FROM task_attachments WHERE id = ?").get(orphan.id), undefined);
});

test("symlink-like stored files are never resolved or deleted", async () => {
  const { AttachmentService } = loadAttachmentService();
  const userId = createUser();
  const task = createTask(userId, "symlink-guard-task");
  const normalService = new AttachmentService({ db, dataDir });
  const [attachment] = await normalService.saveBatch(userId, [mockFile("link.png", "image/png")]);
  normalService.bindToTask(userId, task.id, [attachment.id]);
  const row = db.prepare("SELECT stored_name FROM task_attachments WHERE id = ?").get(attachment.id);
  const target = path.join(dataDir, "attachments", String(userId), row.stored_name);
  const unlinkCalls = [];
  const guardedService = new AttachmentService({
    db,
    dataDir,
    lstatImpl: async (candidate) => {
      if (path.resolve(candidate) === path.resolve(target)) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => true,
        };
      }
      return fs.promises.lstat(candidate);
    },
    unlinkImpl: async (candidate) => {
      unlinkCalls.push(candidate);
      await fs.promises.unlink(candidate);
    },
  });

  await assert.rejects(
    guardedService.resolveForTask(userId, task.id, [attachment.id]),
    (error) => error?.code === "UNSAFE_PATH"
  );
  const now = 2_400_000_000;
  db.prepare(
    "UPDATE tasks SET status = 'failed', completed_at = ? WHERE id = ?"
  ).run(now - 30 * 24 * 60 * 60 - 1, task.id);
  const report = await guardedService.cleanup({ now });
  assert.ok(report.skippedUnsafe.includes(attachment.id));
  assert.equal(unlinkCalls.length, 0);
  assert.equal(fs.existsSync(target), true);
});
