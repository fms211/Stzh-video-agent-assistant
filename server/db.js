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

module.exports = db;
