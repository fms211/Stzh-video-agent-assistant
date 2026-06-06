const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "stzh.db");
const db = new Database(DB_PATH);

// 启用 WAL 模式（提升并发性能）
db.pragma("journal_mode = WAL");

// === 建表 ===
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

  -- OPC 创作助手：会话表
  CREATE TABLE IF NOT EXISTS opc_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    message_count INTEGER DEFAULT 0,
    summary TEXT DEFAULT NULL
  );

  -- OPC 创作助手：消息表（支持工作流、普通对话、系统消息）
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

  -- OPC 创作助手：跨会话记忆
  CREATE TABLE IF NOT EXISTS opc_memory (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- LLM 模型配置（含 API Key）
  CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- 用户偏好
  CREATE TABLE IF NOT EXISTS user_prefs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- 通知
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- 主题选择
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// === OPC 创作助手数据库操作 ===

const crypto = require("crypto");

function opcGenerateId(prefix = "opc") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// --- 会话 ---

db.opcCreateSession = function (id, title) {
  db.prepare("INSERT OR IGNORE INTO opc_sessions (id, title) VALUES (?, ?)").run(id, title || "新对话");
  return id;
};

db.opcListSessions = function (limit = 50) {
  return db.prepare("SELECT * FROM opc_sessions ORDER BY updated_at DESC LIMIT ?").all(limit);
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

db.opcDeleteSession = function (id) {
  db.prepare("DELETE FROM opc_messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM opc_sessions WHERE id = ?").run(id);
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

db.opcDeleteMessage = function (id) {
  const msg = db.prepare("SELECT session_id FROM opc_messages WHERE id = ?").get(id);
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

db.opcGetMemory = function (key) {
  const row = db.prepare("SELECT value FROM opc_memory WHERE key = ?").get(key);
  return row ? row.value : null;
};

db.opcSetMemory = function (key, value, category) {
  db.prepare("INSERT OR REPLACE INTO opc_memory (key, value, category, updated_at) VALUES (?, ?, ?, unixepoch())")
    .run(key, typeof value === "string" ? value : JSON.stringify(value), category || "general");
};

db.opcGetAllMemory = function (category) {
  if (category) return db.prepare("SELECT * FROM opc_memory WHERE category = ? ORDER BY updated_at DESC").all(category);
  return db.prepare("SELECT * FROM opc_memory ORDER BY updated_at DESC").all();
};

db.opcDeleteMemory = function (key) {
  db.prepare("DELETE FROM opc_memory WHERE key = ?").run(key);
};

// === LLM 模型配置 ===

db.llmGetProviders = function () {
  return db.prepare("SELECT * FROM llm_providers ORDER BY is_active DESC, updated_at DESC").all();
};

db.llmSaveProvider = function (id, config, isActive) {
  db.prepare("INSERT OR REPLACE INTO llm_providers (id, config, is_active, updated_at) VALUES (?, ?, ?, unixepoch())")
    .run(id, JSON.stringify(config), isActive ? 1 : 0);
};

db.llmDeleteProvider = function (id) {
  db.prepare("DELETE FROM llm_providers WHERE id = ?").run(id);
};

db.llmSetActive = function (id) {
  db.prepare("UPDATE llm_providers SET is_active = 0").run();
  db.prepare("UPDATE llm_providers SET is_active = 1, updated_at = unixepoch() WHERE id = ?").run(id);
};

db.llmGetActive = function () {
  return db.prepare("SELECT * FROM llm_providers WHERE is_active = 1 LIMIT 1").get();
};

// === 用户偏好 ===

db.prefsGetAll = function () {
  const rows = db.prepare("SELECT * FROM user_prefs").all();
  const result = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
};

db.prefsSet = function (key, value) {
  db.prepare("INSERT OR REPLACE INTO user_prefs (key, value, updated_at) VALUES (?, ?, unixepoch())")
    .run(key, typeof value === "string" ? value : JSON.stringify(value));
};

db.prefsDelete = function (key) {
  db.prepare("DELETE FROM user_prefs WHERE key = ?").run(key);
};

// === 通知 ===

db.notifList = function (limit = 50) {
  return db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?").all(limit);
};

db.notifAdd = function (id, title, message, type) {
  db.prepare("INSERT INTO notifications (id, title, message, type) VALUES (?, ?, ?, ?)")
    .run(id, title, message, type || "info");
};

db.notifMarkRead = function (id) {
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
};

db.notifMarkAllRead = function () {
  db.prepare("UPDATE notifications SET read = 1").run();
};

db.notifClearAll = function () {
  db.prepare("DELETE FROM notifications").run();
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
