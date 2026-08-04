const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Electron 打包后 __dirname 在 asar 内（只读），需要使用外部可写目录
let DB_PATH;
if (process.env.STZH_DATA_DIR) {
  // Electron 模式：使用 userData 目录
  DB_PATH = path.join(process.env.STZH_DATA_DIR, "stzh.db");
} else if (__dirname.includes(".asar")) {
  // 兜底：asar 内但没有设置环境变量
  DB_PATH = path.join(path.dirname(__dirname), "stzh.db");
} else {
  // 开发模式：使用当前目录
  DB_PATH = path.join(__dirname, "stzh.db");
}
const db = new Database(DB_PATH);

// 启用 WAL 模式（提升并发性能）
db.pragma("journal_mode = WAL");

// === 第一步：迁移旧表（在建表之前，避免 FOREIGN KEY 引用不存在的列） ===
const FIRST_USER_ID = 1;

try {
  const cols = db.prepare("PRAGMA table_info(opc_sessions)").all();
  if (cols.length > 0 && !cols.some(c => c.name === "user_id")) {
    console.log("[DB] 迁移: 给 opc_sessions 添加 user_id 列");
    db.exec("ALTER TABLE opc_sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT " + FIRST_USER_ID);
  }
} catch (e) { /* 表不存在 */ }

try {
  const cols = db.prepare("PRAGMA table_info(opc_memory)").all();
  if (cols.length > 0 && !cols.some(c => c.name === "user_id")) {
    console.log("[DB] 迁移: 重建 opc_memory 表");
    db.exec("ALTER TABLE opc_memory RENAME TO opc_memory_old");
    db.exec(`CREATE TABLE opc_memory (key TEXT NOT NULL, user_id INTEGER NOT NULL DEFAULT ${FIRST_USER_ID}, value TEXT NOT NULL, category TEXT DEFAULT 'general', updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (key, user_id))`);
    db.exec(`INSERT OR IGNORE INTO opc_memory (key, user_id, value, category, updated_at) SELECT key, ${FIRST_USER_ID}, value, category, updated_at FROM opc_memory_old`);
    db.exec("DROP TABLE IF EXISTS opc_memory_old");
  }
} catch (e) { /* 表不存在 */ }

try {
  const cols = db.prepare("PRAGMA table_info(llm_providers)").all();
  if (cols.length > 0 && !cols.some(c => c.name === "user_id")) {
    console.log("[DB] 迁移: 重建 llm_providers 表");
    db.exec("ALTER TABLE llm_providers RENAME TO llm_providers_old");
    db.exec(`CREATE TABLE llm_providers (id TEXT NOT NULL, user_id INTEGER NOT NULL DEFAULT ${FIRST_USER_ID}, config TEXT NOT NULL, is_active INTEGER DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (id, user_id))`);
    db.exec(`INSERT OR IGNORE INTO llm_providers (id, user_id, config, is_active, updated_at) SELECT id, ${FIRST_USER_ID}, config, is_active, updated_at FROM llm_providers_old`);
    db.exec("DROP TABLE IF EXISTS llm_providers_old");
  }
} catch (e) { /* 表不存在 */ }

try {
  const cols = db.prepare("PRAGMA table_info(user_prefs)").all();
  if (cols.length > 0 && !cols.some(c => c.name === "user_id")) {
    console.log("[DB] 迁移: 重建 user_prefs 表");
    db.exec("ALTER TABLE user_prefs RENAME TO user_prefs_old");
    db.exec(`CREATE TABLE user_prefs (key TEXT NOT NULL, user_id INTEGER NOT NULL DEFAULT ${FIRST_USER_ID}, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY (key, user_id))`);
    db.exec(`INSERT OR IGNORE INTO user_prefs (key, user_id, value, updated_at) SELECT key, ${FIRST_USER_ID}, value, updated_at FROM user_prefs_old`);
    db.exec("DROP TABLE IF EXISTS user_prefs_old");
  }
} catch (e) { /* 表不存在 */ }

try {
  const cols = db.prepare("PRAGMA table_info(notifications)").all();
  if (cols.length > 0 && !cols.some(c => c.name === "user_id")) {
    console.log("[DB] 迁移: 给 notifications 添加 user_id 列");
    db.exec("ALTER TABLE notifications ADD COLUMN user_id INTEGER NOT NULL DEFAULT " + FIRST_USER_ID);
  }
} catch (e) { /* 表不存在 */ }

// === 第二步：建表（IF NOT EXISTS 保证幂等，迁移后 user_id 列已存在） ===
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT '新对话',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
    content TEXT DEFAULT '',
    payload TEXT,
    is_error INTEGER DEFAULT 0,
    error_text TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    icon TEXT DEFAULT '＋',
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    conversation_id TEXT,
    prompt TEXT NOT NULL,
    video_url TEXT,
    image_urls TEXT,
    raw_text TEXT,
    status TEXT DEFAULT 'completed',
    coze_conversation_id TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    theme TEXT DEFAULT 'dark',
    language TEXT DEFAULT 'zh',
    opc_style TEXT DEFAULT '',
    opc_params TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id);
  CREATE INDEX IF NOT EXISTS idx_gen_date ON generations(created_at);
  CREATE INDEX IF NOT EXISTS idx_tpl_user ON templates(user_id);

  CREATE TABLE IF NOT EXISTS opc_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    message_count INTEGER DEFAULT 0,
    summary TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS opc_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
    metadata TEXT DEFAULT NULL,
    FOREIGN KEY (session_id) REFERENCES opc_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_opc_msg_session ON opc_messages(session_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_opc_session_user ON opc_sessions(user_id);

  CREATE TABLE IF NOT EXISTS opc_memory (
    key TEXT NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 0,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (key, user_id)
  );

  CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (id, user_id)
  );

  CREATE TABLE IF NOT EXISTS user_prefs (
    key TEXT NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 0,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (key, user_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK(status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    origin TEXT NOT NULL DEFAULT 'desktop'
      CHECK(origin IN ('desktop', 'mobile', 'server', 'migration')),
    input TEXT NOT NULL DEFAULT '{}',
    output TEXT,
    progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    stage TEXT DEFAULT '',
    error TEXT,
    idempotency_key TEXT,
    source_generation_id INTEGER UNIQUE,
    worker_device_id TEXT,
    scheduled_at INTEGER,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    revision INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_task_idempotency
    ON tasks(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_task_queue
    ON tasks(status, scheduled_at, created_at);
  CREATE INDEX IF NOT EXISTS idx_task_user
    ON tasks(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('desktop', 'mobile', 'web')),
    status TEXT NOT NULL DEFAULT 'online'
      CHECK(status IN ('online', 'offline', 'revoked')),
    paired_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_device_user
    ON devices(user_id, last_seen DESC);

  CREATE TABLE IF NOT EXISTS pairing_codes (
    code_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    desktop_name TEXT NOT NULL DEFAULT '桌面创作中心',
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// === OPC 创作助手数据库操作 ===

// === OPC 创作助手数据库操作 ===

const crypto = require("crypto");

function opcGenerateId(prefix = "opc") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// --- 会话 ---

db.opcCreateSession = function (id, title, userId) {
  db.prepare("INSERT OR IGNORE INTO opc_sessions (id, user_id, title) VALUES (?, ?, ?)").run(id, userId || 0, title || "新对话");
  return id;
};

db.opcListSessions = function (userId, limit = 50) {
  return db.prepare("SELECT * FROM opc_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?").all(userId || 0, limit);
};

db.opcGetSession = function (id, userId) {
  return db.prepare("SELECT * FROM opc_sessions WHERE id = ? AND user_id = ?").get(id, userId || 0);
};

db.opcUpdateSession = function (id, updates) {
  const sets = [];
  const values = [];
  if (updates.title !== undefined) { sets.push("title = ?"); values.push(updates.title); }
  if (updates.message_count !== undefined) { sets.push("message_count = ?"); values.push(updates.message_count); }
  if (updates.summary !== undefined) { sets.push("summary = ?"); values.push(updates.summary); }
  sets.push("updated_at = unixepoch()");
  values.push(id);
  db.prepare(`UPDATE opc_sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
};

db.opcDeleteSession = function (id, userId) {
  // 验证会话属于该用户
  const session = db.prepare("SELECT id FROM opc_sessions WHERE id = ? AND user_id = ?").get(id, userId || 0);
  if (!session) return false;
  db.prepare("DELETE FROM opc_messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM opc_sessions WHERE id = ?").run(id);
  return true;
};

// --- 消息 ---

db.opcAddMessage = function (sessionId, role, content, metadata) {
  const id = opcGenerateId("msg");
  const metaStr = metadata ? JSON.stringify(metadata) : null;
  db.prepare("INSERT INTO opc_messages (id, session_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)")
    .run(id, sessionId, role, content, metaStr);
  const count = db.prepare("SELECT COUNT(*) as c FROM opc_messages WHERE session_id = ?").get(sessionId).c;
  db.opcUpdateSession(sessionId, { message_count: count });
  return id;
};

db.opcGetMessages = function (sessionId, limit = 200) {
  return db.prepare(
    "SELECT * FROM opc_messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?"
  ).all(sessionId, limit);
};

db.opcDeleteMessage = function (id, userId) {
  // 通过 session 验证用户所有权
  const msg = db.prepare(
    "SELECT m.id, m.session_id FROM opc_messages m JOIN opc_sessions s ON m.session_id = s.id WHERE m.id = ? AND s.user_id = ?"
  ).get(id, userId || 0);
  if (msg) {
    db.prepare("DELETE FROM opc_messages WHERE id = ?").run(id);
    const count = db.prepare("SELECT COUNT(*) as c FROM opc_messages WHERE session_id = ?").get(msg.session_id).c;
    db.opcUpdateSession(msg.session_id, { message_count: count });
  }
};

// --- 对话压缩 ---

db.opcCompressSession = function (sessionId, summary, keepRecent = 10) {
  const all = db.prepare("SELECT * FROM opc_messages WHERE session_id = ? ORDER BY timestamp ASC").all(sessionId);
  if (all.length <= keepRecent) return;

  const toRemove = all.slice(0, -keepRecent);
  const ids = toRemove.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM opc_messages WHERE id IN (${placeholders})`).run(...ids);

  db.opcAddMessage(sessionId, "system", `[对话摘要]\n${summary}`, { compressed: true });
  db.opcUpdateSession(sessionId, { summary });
};

// --- 跨会话记忆 ---

db.opcGetMemory = function (key, userId) {
  const row = db.prepare("SELECT value FROM opc_memory WHERE key = ? AND user_id = ?").get(key, userId || 0);
  return row ? row.value : null;
};

db.opcSetMemory = function (key, value, category, userId) {
  db.prepare("INSERT OR REPLACE INTO opc_memory (key, user_id, value, category, updated_at) VALUES (?, ?, ?, ?, unixepoch())")
    .run(key, userId || 0, typeof value === "string" ? value : JSON.stringify(value), category || "general");
};

db.opcGetAllMemory = function (category, userId) {
  const uid = userId || 0;
  if (category) return db.prepare("SELECT * FROM opc_memory WHERE category = ? AND user_id = ? ORDER BY updated_at DESC").all(category, uid);
  return db.prepare("SELECT * FROM opc_memory WHERE user_id = ? ORDER BY updated_at DESC").all(uid);
};

db.opcDeleteMemory = function (key, userId) {
  db.prepare("DELETE FROM opc_memory WHERE key = ? AND user_id = ?").run(key, userId || 0);
};

// === LLM 模型配置 ===

db.llmGetProviders = function (userId) {
  return db.prepare("SELECT * FROM llm_providers WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC").all(userId || 0);
};

db.llmSaveProvider = function (id, config, isActive, userId) {
  db.prepare("INSERT OR REPLACE INTO llm_providers (id, user_id, config, is_active, updated_at) VALUES (?, ?, ?, ?, unixepoch())")
    .run(id, userId || 0, JSON.stringify(config), isActive ? 1 : 0);
};

db.llmDeleteProvider = function (id, userId) {
  db.prepare("DELETE FROM llm_providers WHERE id = ? AND user_id = ?").run(id, userId || 0);
};

db.llmSetActive = function (id, userId) {
  const uid = userId || 0;
  db.prepare("UPDATE llm_providers SET is_active = 0 WHERE user_id = ?").run(uid);
  db.prepare("UPDATE llm_providers SET is_active = 1, updated_at = unixepoch() WHERE id = ? AND user_id = ?").run(id, uid);
};

db.llmGetActive = function (userId) {
  return db.prepare("SELECT * FROM llm_providers WHERE is_active = 1 AND user_id = ? LIMIT 1").get(userId || 0);
};

// === 用户偏好 ===

db.prefsGetAll = function (userId) {
  const rows = db.prepare("SELECT * FROM user_prefs WHERE user_id = ?").all(userId || 0);
  const result = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
};

db.prefsSet = function (key, value, userId) {
  db.prepare("INSERT OR REPLACE INTO user_prefs (key, user_id, value, updated_at) VALUES (?, ?, ?, unixepoch())")
    .run(key, userId || 0, typeof value === "string" ? value : JSON.stringify(value));
};

db.prefsDelete = function (key, userId) {
  db.prepare("DELETE FROM user_prefs WHERE key = ? AND user_id = ?").run(key, userId || 0);
};

// === 通知 ===

db.notifList = function (userId, limit = 50) {
  return db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId || 0, limit);
};

db.notifAdd = function (id, title, message, type, userId) {
  db.prepare("INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId || 0, title, message, type || "info");
  return db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").get(id, userId || 0);
};

db.notifMarkRead = function (id, userId) {
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(id, userId || 0);
};

db.notifMarkAllRead = function (userId) {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(userId || 0);
};

db.notifClearAll = function (userId) {
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId || 0);
};

// === 应用设置（主题等） ===

db.settingsGet = function (key) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : null;
};

db.settingsSet = function (key, value) {
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())")
    .run(key, typeof value === "string" ? value : JSON.stringify(value));
};

db.settingsGetAll = function () {
  const rows = db.prepare("SELECT * FROM app_settings").all();
  const result = {};
  for (const row of rows) { result[row.key] = row.value; }
  return result;
};

// === 两端联动任务 ===

db.taskCreate = function (data) {
  const id = data.id || opcGenerateId("task");
  const input = JSON.stringify(data.input || {});
  try {
    db.prepare(
      `INSERT INTO tasks
       (id, user_id, kind, title, status, origin, input, idempotency_key, scheduled_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`
    ).run(
      id,
      data.userId,
      data.kind,
      data.title,
      data.origin || "desktop",
      input,
      data.idempotencyKey || null,
      data.scheduledAt || null
    );
    return { task: db.taskGet(id, data.userId), created: true };
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE" && data.idempotencyKey) {
      const task = db.prepare(
        "SELECT * FROM tasks WHERE user_id = ? AND idempotency_key = ?"
      ).get(data.userId, data.idempotencyKey);
      return { task, created: false };
    }
    throw error;
  }
};

db.taskGet = function (id, userId) {
  return db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, userId);
};

db.taskList = function (userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  if (options.status) {
    return db.prepare(
      "SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    ).all(userId, options.status, limit, offset);
  }
  return db.prepare(
    "SELECT * FROM tasks WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ).all(userId, limit, offset);
};

db.taskClaim = function (id, userId, deviceId) {
  const result = db.prepare(
    `UPDATE tasks
     SET status = 'running', worker_device_id = ?, started_at = COALESCE(started_at, unixepoch()),
         updated_at = unixepoch(), revision = revision + 1
     WHERE id = ? AND user_id = ? AND status = 'queued'
       AND (scheduled_at IS NULL OR scheduled_at <= unixepoch())`
  ).run(deviceId, id, userId);
  return result.changes ? db.taskGet(id, userId) : null;
};

db.taskProgress = function (id, userId, updates) {
  const current = db.taskGet(id, userId);
  if (!current || !["running", "paused"].includes(current.status)) return null;
  const progress = Math.min(100, Math.max(0, Number(updates.progress) || 0));
  db.prepare(
    `UPDATE tasks
     SET progress = ?, stage = ?, output = COALESCE(?, output),
         updated_at = unixepoch(), revision = revision + 1
     WHERE id = ? AND user_id = ?`
  ).run(
    progress,
    updates.stage || "",
    updates.output === undefined ? null : JSON.stringify(updates.output),
    id,
    userId
  );
  return db.taskGet(id, userId);
};

db.taskAction = function (id, userId, action, payload = {}) {
  const current = db.taskGet(id, userId);
  if (!current) return { reason: "not_found" };
  const transitions = {
    pause: { from: ["running"], to: "paused" },
    resume: { from: ["paused"], to: "queued", clearWorker: true },
    cancel: { from: ["queued", "running", "paused"], to: "cancelled", terminal: true },
    retry: { from: ["failed", "cancelled"], to: "queued", reset: true, clearWorker: true },
    complete: { from: ["running"], to: "completed", terminal: true },
    fail: { from: ["running"], to: "failed", terminal: true },
  };
  const transition = transitions[action];
  if (!transition || !transition.from.includes(current.status)) {
    return { reason: "invalid_transition", task: current };
  }

  const output = payload.output === undefined ? current.output : JSON.stringify(payload.output);
  const progress = action === "complete" ? 100 : transition.reset ? 0 : current.progress;
  const stage = transition.reset ? "" : (payload.stage ?? current.stage);
  const error = action === "fail"
    ? (payload.error || "任务执行失败")
    : transition.reset
      ? null
      : current.error;
  const worker = transition.clearWorker ? null : current.worker_device_id;
  const completedAt = transition.terminal ? Math.floor(Date.now() / 1000) : null;

  db.prepare(
    `UPDATE tasks
     SET status = ?, progress = ?, stage = ?, error = ?, output = ?,
         worker_device_id = ?, completed_at = ?, updated_at = unixepoch(),
         revision = revision + 1
     WHERE id = ? AND user_id = ?`
  ).run(
    transition.to,
    progress,
    stage,
    error,
    output,
    worker,
    completedAt,
    id,
    userId
  );
  return { task: db.taskGet(id, userId) };
};

db.migrateGenerationsToTasks = function () {
  const result = db.prepare(
    `INSERT OR IGNORE INTO tasks
     (id, user_id, kind, title, status, origin, input, output, progress,
      source_generation_id, completed_at, created_at, updated_at)
     SELECT
       'generation_' || id,
       user_id,
       'video.generate',
       CASE WHEN length(prompt) > 36 THEN substr(prompt, 1, 36) || '…' ELSE prompt END,
       CASE WHEN status = 'failed' THEN 'failed' ELSE 'completed' END,
       'migration',
       json_object('prompt', prompt, 'conversationId', conversation_id),
       json_object('videoUrl', video_url, 'imageUrls', json(image_urls), 'rawText', raw_text),
       CASE WHEN status = 'failed' THEN 0 ELSE 100 END,
       id,
       unixepoch(created_at),
       unixepoch(created_at),
       unixepoch(created_at)
     FROM generations`
  ).run();
  return result.changes;
};

// === 设备配对 ===

db.pairingCreate = function (codeHash, userId, desktopName, expiresAt) {
  db.prepare(
    `INSERT INTO pairing_codes (code_hash, user_id, desktop_name, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(codeHash, userId, desktopName || "桌面创作中心", expiresAt);
};

db.pairingConsume = db.transaction(function (codeHash, userId, device) {
  const pairing = db.prepare(
    `SELECT * FROM pairing_codes
     WHERE code_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > unixepoch()`
  ).get(codeHash, userId);
  if (!pairing) return null;
  db.prepare("UPDATE pairing_codes SET used_at = unixepoch() WHERE code_hash = ?").run(codeHash);
  db.prepare(
    `INSERT INTO devices (id, user_id, name, type)
     VALUES (?, ?, ?, ?)`
  ).run(device.id, userId, device.name, device.type);
  return db.prepare("SELECT * FROM devices WHERE id = ?").get(device.id);
});

db.deviceList = function (userId) {
  return db.prepare(
    "SELECT * FROM devices WHERE user_id = ? AND status != 'revoked' ORDER BY last_seen DESC"
  ).all(userId);
};

db.deviceGet = function (id, userId) {
  return db.prepare("SELECT * FROM devices WHERE id = ? AND user_id = ? AND status != 'revoked'").get(id, userId);
};

db.deviceTouch = function (id, userId, status = "online") {
  db.prepare(
    "UPDATE devices SET status = ?, last_seen = unixepoch() WHERE id = ? AND user_id = ?"
  ).run(status, id, userId);
};

db.deviceRevoke = function (id, userId) {
  return db.prepare(
    "UPDATE devices SET status = 'revoked', last_seen = unixepoch() WHERE id = ? AND user_id = ?"
  ).run(id, userId).changes > 0;
};

// 旧 conversations/messages 数据迁移到 opc_sessions/opc_messages（双端对话统一到 opc 表）
// datetime('now') 文本 → unixepoch 整数；role user/agent 保留；payload/is_error/error_text 打包进 metadata
db.migrateConversationsToOpc = function () {
  try {
    const marker = db.prepare("SELECT value FROM app_settings WHERE key = 'conversations_migrated'").get();
    if (marker) return;
  } catch (e) { /* 表不存在则跳过 */ }

  try {
    const convs = db.prepare("SELECT * FROM conversations").all();
    if (convs.length === 0) {
      // 即使无数据也标记，避免每次启动扫描
      try { db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('conversations_migrated', '1')").run(); } catch (e) {}
      return;
    }

    const insertSession = db.prepare(
      "INSERT OR IGNORE INTO opc_sessions (id, user_id, title, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertMsg = db.prepare(
      "INSERT OR IGNORE INTO opc_messages (id, session_id, role, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const migrate = db.transaction(() => {
      for (const conv of convs) {
        // datetime('now') 文本 → unixepoch
        const createdTs = Date.parse(conv.created_at + (conv.created_at.includes("T") ? "" : "Z")) / 1000 || 0;
        const updatedTs = Date.parse(conv.updated_at + (conv.updated_at.includes("T") ? "" : "Z")) / 1000 || 0;

        // 检查目标是否已存在同 id 的 opc 会话
        const existing = db.prepare("SELECT id FROM opc_sessions WHERE id = ?").get(conv.id);
        if (existing) continue;

        const msgs = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conv.id);
        insertSession.run(conv.id, conv.user_id, conv.title, createdTs, updatedTs, msgs.length);

        for (const msg of msgs) {
          const meta = {};
          if (msg.payload) meta.payload = JSON.parse(msg.payload);
          if (msg.is_error) meta.isError = true;
          if (msg.error_text) meta.errorText = msg.error_text;
          const msgTs = Date.parse(msg.created_at + (msg.created_at.includes("T") ? "" : "Z")) / 1000 || 0;
          insertMsg.run(
            msg.id, conv.id, msg.role, msg.content,
            Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
            msgTs
          );
        }
      }
    });

    migrate();
    console.log(`[DB] 迁移: ${convs.length} 个旧会话已复制到 opc_sessions`);
    try { db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('conversations_migrated', '1')").run(); } catch (e) {}
  } catch (e) {
    console.error("[DB] conversations→opc 迁移失败:", e.message);
  }
};

db.migrateGenerationsToTasks();
db.migrateConversationsToOpc();

// 僵尸任务回收：worker 设备心跳超时（默认 60s）的 running 任务 requeue 回 queued
// 避免桌面窗口关闭后任务永久卡在 running
db.taskRequeueStale = function (thresholdSec = 60) {
  const staleTasks = db.prepare(
    `SELECT t.id, t.user_id FROM tasks t
     JOIN devices d ON d.id = t.worker_device_id
     WHERE t.status = 'running'
       AND d.status = 'online'
       AND d.last_seen < unixepoch() - ?`
  ).all(thresholdSec);
  const requeue = db.prepare(
    `UPDATE tasks
     SET status = 'queued', worker_device_id = NULL, stage = '', progress = 0,
         updated_at = unixepoch(), revision = revision + 1
     WHERE id = ? AND user_id = ? AND status = 'running'`
  );
  let count = 0;
  for (const t of staleTasks) {
    count += requeue.run(t.id, t.user_id).changes;
  }
  if (count > 0) console.log(`[DB] 僵尸回收: ${count} 个任务已 requeue（worker 心跳超时）`);
  return count;
};

// 定期心跳检查：30s 一次（配合 60s 阈值）
db.startStaleReaper = function (intervalSec = 30, thresholdSec = 60) {
  if (db.__reaperStarted) return;
  db.__reaperStarted = true;
  setInterval(() => {
    try { db.taskRequeueStale(thresholdSec); } catch (e) { /* 不打断循环 */ }
  }, intervalSec * 1000);
};

module.exports = db;
