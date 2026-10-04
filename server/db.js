const Database = require("better-sqlite3");
const crypto = require("crypto");
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
let databaseOptions = {};
if (process.versions.electron) {
  const electronBinding = path.join(
    __dirname,
    "native",
    `electron-v${process.versions.modules}`,
    "better_sqlite3.node"
  );
  if (!fs.existsSync(electronBinding)) {
    throw new Error(`Electron SQLite 原生绑定缺失：${electronBinding}`);
  }
  databaseOptions = { nativeBinding: electronBinding };
}
const db = new Database(DB_PATH, databaseOptions);

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

  -- Remote appearance settings are account-owned. Keep unowned legacy values
  -- and internal migration markers in app_settings; never guess their owner.
  CREATE TABLE IF NOT EXISTS account_app_settings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, key)
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

  CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    task_id TEXT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    bound_at INTEGER,
    cleanup_token TEXT,
    cleanup_started_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_task_attachment_stored_name
    ON task_attachments(user_id, stored_name);
  CREATE INDEX IF NOT EXISTS idx_task_attachment_user_task
    ON task_attachments(user_id, task_id);
  CREATE INDEX IF NOT EXISTS idx_task_attachment_cleanup
    ON task_attachments(task_id, created_at, bound_at);
  CREATE INDEX IF NOT EXISTS idx_task_attachment_cleanup_claim
    ON task_attachments(cleanup_token, cleanup_started_at);

  CREATE TABLE IF NOT EXISTS attachment_cleanup_queue (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stored_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    cleanup_token TEXT,
    cleanup_started_at INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_cleanup_queue_path
    ON attachment_cleanup_queue(user_id, stored_name);
  CREATE INDEX IF NOT EXISTS idx_attachment_cleanup_queue_claim
    ON attachment_cleanup_queue(cleanup_token, cleanup_started_at, created_at);

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

  CREATE TABLE IF NOT EXISTS creative_projects (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_creative_projects_user ON creative_projects(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS agent_roles (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    capabilities TEXT NOT NULL DEFAULT '[]',
    default_provider_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_agent_roles_user ON agent_roles(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS project_role_team (
    project_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    overrides TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (project_id, role_id),
    FOREIGN KEY (project_id) REFERENCES creative_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES agent_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    project_id TEXT NOT NULL,
    task TEXT NOT NULL,
    budget TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'draft',
    team_snapshot TEXT NOT NULL DEFAULT '[]',
    final_instruction TEXT,
    rationale TEXT,
    risks TEXT,
    task_id TEXT,
    coze_delivered_at INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES creative_projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS agent_run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_agent_run_events_run ON agent_run_events(run_id, created_at);

  CREATE TABLE IF NOT EXISTS plugin_manifests (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    name TEXT NOT NULL,
    entrypoint TEXT NOT NULL,
    integrity TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    installed_by INTEGER NOT NULL,
    change_note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (installed_by) REFERENCES users(id) ON DELETE RESTRICT
  );
`);

// Task2B 附件清理租约：兼容已存在的 task_attachments 表，不重建或删除旧数据。
for (const [column, declaration] of [
  ["cleanup_token", "TEXT"],
  ["cleanup_started_at", "INTEGER"],
]) {
  const columns = db.prepare("PRAGMA table_info(task_attachments)").all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE task_attachments ADD COLUMN ${column} ${declaration}`);
  }
}

for (const [column, declaration] of [
  ["task_id", "TEXT"],
  ["creative_constraints", "TEXT NOT NULL DEFAULT '{}'"],
]) {
  const columns = db.prepare("PRAGMA table_info(agent_runs)").all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE agent_runs ADD COLUMN ${column} ${declaration}`);
  }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id)");

// 新模型中心使用独立密文列；旧 config 仍保留以避免静默迁移或删除用户数据。
for (const [column, declaration] of [
  ["secret", "TEXT"],
  ["key_last4", "TEXT"],
  ["verified_at", "INTEGER"],
]) {
  const columns = db.prepare("PRAGMA table_info(llm_providers)").all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE llm_providers ADD COLUMN ${column} ${declaration}`);
  }
}

const TASK_LEASE_MIGRATION = "2026-08-10-task-lease-runtime";

function createDatabaseSnapshot() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const snapshotPath = `${DB_PATH}.snapshot-${timestamp}${suffix}`;
    if (fs.existsSync(snapshotPath)) continue;
    const escapedPath = snapshotPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);
    return snapshotPath;
  }
  throw new Error("无法创建不覆盖旧文件的 SQLite 迁移快照");
}

db.applyTaskLeaseMigrations = function () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch()),
      snapshot_path TEXT
    )
  `);
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get(TASK_LEASE_MIGRATION)) {
    return [];
  }

  const snapshotPath = createDatabaseSnapshot();
  const apply = db.transaction(() => {
    const existingColumns = new Set(
      db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name)
    );
    const additions = [
      ["worker_id", "TEXT"],
      ["lease_token", "TEXT"],
      ["lease_expires_at", "INTEGER"],
      ["attempt_count", "INTEGER NOT NULL DEFAULT 0"],
      ["execution_mode", "TEXT NOT NULL DEFAULT 'server'"],
    ];
    for (const [name, declaration] of additions) {
      if (!existingColumns.has(name)) {
        db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${declaration}`);
      }
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_claimable
        ON tasks(status, scheduled_at, created_at, user_id);
      CREATE INDEX IF NOT EXISTS idx_task_lease_expiry
        ON tasks(status, lease_expires_at);
      UPDATE tasks
      SET status = 'queued', worker_device_id = NULL, worker_id = NULL,
          lease_token = NULL, lease_expires_at = NULL, progress = 0, stage = '',
          started_at = NULL, updated_at = unixepoch(), revision = revision + 1
      WHERE status = 'running';
    `);
    db.prepare(
      "INSERT INTO schema_migrations (name, snapshot_path) VALUES (?, ?)"
    ).run(TASK_LEASE_MIGRATION, snapshotPath);
  });
  apply();
  return [TASK_LEASE_MIGRATION];
};

db.applyTaskLeaseMigrations();

// === OPC 创作助手数据库操作 ===

// === OPC 创作助手数据库操作 ===

function opcGenerateId(prefix = "opc") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// --- 会话 ---

db.opcCreateSession = function (id, title, userId) {
  require("./history-retention.js").assertAvailable(db, userId || 0, id);
  db.prepare("INSERT OR IGNORE INTO opc_sessions (id, user_id, title) VALUES (?, ?, ?)").run(id, userId || 0, title || "新对话");
  return id;
};

db.opcListSessions = function (userId, limit = 50, offset = 0) {
  const scope = require("./studio-session-scope.js");
  return db.prepare("SELECT * FROM opc_sessions WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?")
    .all(userId || 0, limit, offset).map(session => {
      const mode = scope.inferMode(db, userId || 0, session.id);
      return { ...session, mode: mode === "assistant" ? "chat" : mode };
    });
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

// Stable client IDs let completed replies update their earlier placeholder without duplicates.
db.opcSyncMessages = db.transaction(function (sessionId, messages) {
  const ids = messages.map((message) => {
    if (!message.id) return db.opcAddMessage(sessionId, message.role, message.content, message.metadata);
    const existing = db.prepare("SELECT id FROM opc_messages WHERE id = ? AND session_id = ?").get(message.id, sessionId);
    const id = existing?.id || `opc_sync_${crypto.createHash("sha256").update(JSON.stringify([sessionId, message.id])).digest("hex")}`;
    const metadata = JSON.stringify({ ...message.metadata, clientMessageId: message.id });
    db.prepare(`INSERT INTO opc_messages (id, session_id, role, content, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      role = excluded.role, content = excluded.content, metadata = excluded.metadata
      WHERE opc_messages.session_id = excluded.session_id`)
      .run(id, sessionId, message.role, message.content, metadata, message.timestamp ? Math.floor(message.timestamp / 1000) : Math.floor(Date.now() / 1000));
    return id;
  });
  const count = db.prepare("SELECT COUNT(*) as c FROM opc_messages WHERE session_id = ?").get(sessionId).c;
  db.opcUpdateSession(sessionId, { message_count: count });
  return ids;
});

db.opcGetMessages = function (sessionId, limit = 200, offset = 0) {
  return db.prepare(
    "SELECT * FROM (SELECT rowid AS ordering, * FROM opc_messages WHERE session_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?) ORDER BY timestamp ASC, ordering ASC"
  ).all(sessionId, limit, offset);
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

db.opcCompressSession = function (sessionId, summary, keepRecent = 10, userId) {
  const session=db.opcGetSession(sessionId,userId);
  if(!Number.isSafeInteger(userId)||!session)throw Object.assign(new Error("会话不可用"),{status:404});
  const mode=sessionId.startsWith("opc_workflow_")||db.prepare("SELECT 1 FROM opc_messages WHERE session_id=? AND role IN ('workflow','workflow-step','action-cards')").get(sessionId)?"workflow":"assistant";
  return require("./studio-summary-store.js").createStudioSummaryStore(db).build(userId,{mode,sessionId,summary,keepRecent});
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
  const uid = userId || 0;
  return db.transaction(() => {
    const result = db.prepare("DELETE FROM llm_providers WHERE id = ? AND user_id = ?").run(id, uid);
    if (result.changes) {
      db.prepare("UPDATE agent_roles SET default_provider_id = NULL, updated_at = unixepoch() WHERE user_id = ? AND default_provider_id = ?").run(uid, id);
    }
    return result;
  })();
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

db.accountSettingsGetAll = function (userId) {
  const rows = db.prepare("SELECT key, value FROM account_app_settings WHERE user_id = ?").all(userId);
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
};

db.accountSettingsSetBatch = db.transaction(function (userId, entries) {
  const write = db.prepare(`INSERT INTO account_app_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const [key, value] of entries) write.run(userId, key, value);
});

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

function taskStatuses(value) {
  const allowed = new Set(["queued", "running", "paused", "completed", "failed", "cancelled"]);
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((status) => String(status).trim()).filter((status) => allowed.has(status)))];
}

db.taskPage = function (userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const statuses = taskStatuses(options.status);
  const where = ["user_id = ?"];
  const baseParams = [userId];
  if (typeof options.conversationId === "string" && options.conversationId) {
    where.push("json_extract(CASE WHEN json_valid(input) THEN input ELSE '{}' END, '$.conversationId') = ?");
    baseParams.push(options.conversationId);
  }
  if (statuses.length) {
    where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    baseParams.push(...statuses);
  }
  const cursor = options.cursor;
  const pageWhere = [...where];
  const pageParams = [...baseParams];
  if (cursor) {
    pageWhere.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
    pageParams.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const rows = db.prepare(
    `SELECT * FROM tasks
     WHERE ${pageWhere.join(" AND ")}
     ORDER BY updated_at DESC, id DESC
     LIMIT ?${cursor ? "" : " OFFSET ?"}`
  ).all(...pageParams, limit + 1, ...(cursor ? [] : [offset]));
  const hasMore = rows.length > limit;
  const tasks = hasMore ? rows.slice(0, limit) : rows;
  const total = db.prepare(
    `SELECT COUNT(*) count FROM tasks WHERE ${where.join(" AND ")}`
  ).get(...baseParams).count;
  const last = hasMore ? tasks[tasks.length - 1] : null;
  return {
    tasks,
    total,
    next: last ? { updatedAt: last.updated_at, id: last.id } : null,
  };
};

db.taskList = function (userId, options = {}) {
  return db.taskPage(userId, options).tasks;
};

db.taskClaim = function (id, userId, deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) return null;
  const leaseToken = crypto.randomBytes(32).toString("hex");
  const result = db.prepare(
    `UPDATE tasks
     SET status = 'running', worker_device_id = ?, worker_id = ?,
         lease_token = ?, lease_expires_at = unixepoch() + 60,
         started_at = COALESCE(started_at, unixepoch()),
         attempt_count = attempt_count + 1, updated_at = unixepoch(), revision = revision + 1
     WHERE id = ? AND user_id = ? AND status = 'queued'
       AND (scheduled_at IS NULL OR scheduled_at <= unixepoch())
       AND NOT EXISTS (
         SELECT 1 FROM tasks active
         WHERE active.user_id = tasks.user_id
           AND active.status = 'running'
           AND (active.lease_expires_at IS NULL OR active.lease_expires_at > unixepoch())
       )`
  ).run(normalizedDeviceId, `legacy:${normalizedDeviceId}`, leaseToken, id, userId);
  return result.changes ? db.taskGet(id, userId) : null;
};

const claimNextTask = db.transaction((workerId, now, leaseSeconds, kinds, executionMode) => {
  const kindClause = kinds.length
    ? ` AND queued.kind IN (${kinds.map(() => "?").join(", ")})`
    : "";
  const modeClause = executionMode ? " AND queued.execution_mode = ?" : "";
  const candidate = db.prepare(
    `SELECT queued.id, queued.user_id
     FROM tasks queued
     WHERE queued.status = 'queued'
       AND (queued.scheduled_at IS NULL OR queued.scheduled_at <= ?)
       ${modeClause}${kindClause}
       AND NOT EXISTS (
         SELECT 1 FROM tasks active
         WHERE active.user_id = queued.user_id
           AND active.status = 'running'
           AND (active.lease_expires_at IS NULL OR active.lease_expires_at > ?)
       )
     ORDER BY COALESCE(queued.scheduled_at, queued.created_at), queued.created_at, queued.rowid
     LIMIT 1`
  ).get(now, ...(executionMode ? [executionMode] : []), ...kinds, now);
  if (!candidate) return null;

  const leaseToken = crypto.randomBytes(32).toString("hex");
  const result = db.prepare(
    `UPDATE tasks
     SET status = 'running', worker_id = ?, lease_token = ?, lease_expires_at = ?,
         started_at = ?, completed_at = NULL, attempt_count = attempt_count + 1,
         updated_at = ?, revision = revision + 1
     WHERE id = ? AND user_id = ? AND status = 'queued'
       AND (scheduled_at IS NULL OR scheduled_at <= ?)
       ${executionMode ? "AND execution_mode = ?" : ""}
       ${kinds.length ? `AND kind IN (${kinds.map(() => "?").join(", ")})` : ""}
       AND NOT EXISTS (
         SELECT 1 FROM tasks active
         WHERE active.user_id = tasks.user_id
           AND active.status = 'running'
           AND active.id <> tasks.id
           AND (active.lease_expires_at IS NULL OR active.lease_expires_at > ?)
       )`
  ).run(
    workerId,
    leaseToken,
    now + leaseSeconds,
    now,
    now,
    candidate.id,
    candidate.user_id,
    now,
    ...(executionMode ? [executionMode] : []),
    ...kinds,
    now
  );
  return result.changes
    ? db.prepare("SELECT * FROM tasks WHERE id = ?").get(candidate.id)
    : null;
});

db.taskClaimNext = function (workerId, options = {}) {
  const normalizedWorkerId = String(workerId || "").trim();
  if (!normalizedWorkerId) throw new TypeError("workerId 不能为空");
  const now = Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
  const leaseSeconds = Math.max(1, Math.floor(Number(options.leaseSeconds) || 60));
  const kinds = Array.isArray(options.kinds)
    ? [...new Set(options.kinds.map((kind) => String(kind || "").trim()).filter(Boolean))]
    : [];
  const executionMode = options.executionMode == null
    ? ""
    : String(options.executionMode).trim();
  return claimNextTask(normalizedWorkerId, now, leaseSeconds, kinds, executionMode);
};

function leaseFailure(id) {
  return db.prepare("SELECT id FROM tasks WHERE id = ?").get(id)
    ? { ok: false, reason: "lease_lost" }
    : { ok: false, reason: "not_found" };
}

db.taskRenewLease = function (id, leaseToken, options = {}) {
  const now = Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
  const leaseSeconds = Math.max(1, Math.floor(Number(options.leaseSeconds) || 60));
  const result = db.prepare(
    `UPDATE tasks
     SET lease_expires_at = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND status = 'running' AND lease_token = ? AND lease_expires_at > ?`
  ).run(now + leaseSeconds, now, id, leaseToken, now);
  return result.changes
    ? { ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) }
    : leaseFailure(id);
};

db.taskReportProgress = function (id, leaseToken, updates = {}) {
  const now = Number.isFinite(updates.now) ? Math.floor(updates.now) : Math.floor(Date.now() / 1000);
  const leaseSeconds = Math.max(1, Math.floor(Number(updates.leaseSeconds) || 60));
  const progress = Math.min(100, Math.max(0, Number(updates.progress) || 0));
  const output = updates.output === undefined ? null : JSON.stringify(updates.output);
  const result = db.prepare(
    `UPDATE tasks
     SET progress = ?, stage = ?, output = COALESCE(?, output),
         lease_expires_at = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND status = 'running' AND lease_token = ? AND lease_expires_at > ?`
  ).run(progress, updates.stage || "", output, now + leaseSeconds, now, id, leaseToken, now);
  return result.changes
    ? { ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) }
    : leaseFailure(id);
};

db.taskCompleteLease = function (id, leaseToken, updates = {}) {
  const now = Number.isFinite(updates.now) ? Math.floor(updates.now) : Math.floor(Date.now() / 1000);
  const output = updates.output === undefined ? null : JSON.stringify(updates.output);
  const result = db.prepare(
    `UPDATE tasks
     SET status = 'completed', progress = 100, stage = COALESCE(?, stage),
         output = COALESCE(?, output), error = NULL, completed_at = ?,
         worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
         updated_at = ?, revision = revision + 1
     WHERE id = ? AND status = 'running' AND lease_token = ? AND lease_expires_at > ?`
  ).run(updates.stage ?? null, output, now, now, id, leaseToken, now);
  return result.changes
    ? { ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) }
    : leaseFailure(id);
};

db.taskFailLease = function (id, leaseToken, updates = {}) {
  const now = Number.isFinite(updates.now) ? Math.floor(updates.now) : Math.floor(Date.now() / 1000);
  const output = updates.output === undefined ? null : JSON.stringify(updates.output);
  const result = db.prepare(
    `UPDATE tasks
     SET status = 'failed', stage = COALESCE(?, stage), error = ?,
         output = COALESCE(?, output), completed_at = ?,
         worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
         updated_at = ?, revision = revision + 1
     WHERE id = ? AND status = 'running' AND lease_token = ? AND lease_expires_at > ?`
  ).run(updates.stage ?? null, updates.error || "任务执行失败", output, now, now, id, leaseToken, now);
  return result.changes
    ? { ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) }
    : leaseFailure(id);
};

function requeueLeases(whereSql, parameters, now) {
  return db.transaction(() => {
    const active = db.prepare(
      `SELECT * FROM tasks WHERE status = 'running' AND ${whereSql} ORDER BY created_at, id`
    ).all(...parameters);
    if (active.length === 0) return [];
    const requeue = db.prepare(
      `UPDATE tasks
       SET status = 'queued', worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
           worker_device_id = NULL, progress = 0, stage = '', output = NULL, error = NULL,
           started_at = NULL, completed_at = NULL, updated_at = ?, revision = revision + 1
       WHERE id = ? AND status = 'running' AND revision = ?
         AND worker_id IS ? AND worker_device_id IS ?
         AND lease_token IS ? AND lease_expires_at IS ?`
    );
    const recovered = [];
    for (const task of active) {
      if (requeue.run(
        now,
        task.id,
        task.revision,
        task.worker_id,
        task.worker_device_id,
        task.lease_token,
        task.lease_expires_at
      ).changes) {
        recovered.push(db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id));
      }
    }
    return recovered;
  })();
}

db.taskRecoverExpiredLeases = function (options = {}) {
  const now = Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
  return requeueLeases(
    "((lease_expires_at IS NOT NULL AND lease_expires_at <= ?) OR (lease_token IS NULL AND lease_expires_at IS NULL))",
    [now],
    now
  );
};

db.taskReleaseWorkerLeases = function (workerId, options = {}) {
  const now = Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
  return requeueLeases("worker_id = ?", [workerId], now);
};

db.taskReleaseLease = function (id, leaseToken, options = {}) {
  const now = Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
  const released = requeueLeases("id = ? AND lease_token = ?", [id, leaseToken], now);
  return released.length
    ? { ok: true, task: released[0] }
    : leaseFailure(id);
};

db.taskProgress = function (id, userId, updates) {
  const current = db.taskGet(id, userId);
  if (!current || current.status !== "running" || !current.lease_token || !updates.leaseToken) {
    return null;
  }
  const result = db.taskReportProgress(id, updates.leaseToken, updates);
  return result.ok ? result.task : null;
};

db.taskAction = function (id, userId, action, payload = {}) {
  const current = db.taskGet(id, userId);
  if (!current) return { reason: "not_found" };
  if (["complete", "fail"].includes(action)) {
    if (!current.lease_token || !payload.leaseToken) {
      return { reason: "lease_required", task: current };
    }
    const result = action === "complete"
      ? db.taskCompleteLease(id, payload.leaseToken, payload)
      : db.taskFailLease(id, payload.leaseToken, payload);
    return result.ok
      ? { task: result.task }
      : { reason: result.reason, task: db.taskGet(id, userId) };
  }
  if (action === "retry") {
    const cleanupInProgress = db.prepare(
      `SELECT 1 FROM task_attachments
       WHERE user_id = ? AND task_id = ? AND cleanup_token IS NOT NULL
       LIMIT 1`
    ).get(userId, id);
    if (cleanupInProgress) {
      return { reason: "attachment_cleanup_in_progress", task: current };
    }
  }
  const transitions = {
    pause: { from: ["running"], to: "paused", clearWorker: true, clearLease: true },
    resume: { from: ["paused"], to: "queued", clearWorker: true, clearLease: true, reset: true },
    cancel: { from: ["queued", "running", "paused"], to: "cancelled", terminal: true },
    retry: { from: ["failed", "cancelled"], to: "queued", reset: true, clearWorker: true, clearLease: true },
    complete: { from: ["running"], to: "completed", terminal: true },
    fail: { from: ["running"], to: "failed", terminal: true },
  };
  const transition = transitions[action];
  if (!transition || !transition.from.includes(current.status)) {
    return { reason: "invalid_transition", task: current };
  }

  const output = transition.reset
    ? null
    : payload.output === undefined ? current.output : JSON.stringify(payload.output);
  const progress = action === "complete" ? 100 : transition.reset ? 0 : current.progress;
  const stage = transition.reset ? "" : (payload.stage ?? current.stage);
  const error = action === "fail"
    ? (payload.error || "任务执行失败")
    : transition.reset
      ? null
      : current.error;
  const clearLease = transition.clearLease || action === "cancel" || transition.terminal;
  const workerDevice = transition.clearWorker || clearLease ? null : current.worker_device_id;
  const worker = clearLease ? null : current.worker_id;
  const leaseToken = clearLease ? null : current.lease_token;
  const leaseExpiresAt = clearLease ? null : current.lease_expires_at;
  const completedAt = transition.terminal ? Math.floor(Date.now() / 1000) : null;
  const startedAt = transition.reset ? null : current.started_at;

  const result = db.prepare(
    `UPDATE tasks
     SET status = ?, progress = ?, stage = ?, error = ?, output = ?,
          worker_device_id = ?, worker_id = ?, lease_token = ?, lease_expires_at = ?,
          started_at = ?, completed_at = ?, updated_at = unixepoch(),
          revision = revision + 1
     WHERE id = ? AND user_id = ? AND status = ? AND revision = ?
       AND lease_token IS ?`
  ).run(
    transition.to,
    progress,
    stage,
    error,
    output,
    workerDevice,
    worker,
    leaseToken,
    leaseExpiresAt,
    startedAt,
    completedAt,
    id,
    userId,
    current.status,
    current.revision,
    current.lease_token
  );
  if (!result.changes) {
    return { reason: "conflict", task: db.taskGet(id, userId) };
  }
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

db.deviceRegister = db.transaction(function (device, userId) {
  const existing = db.prepare("SELECT * FROM devices WHERE id = ?").get(device.id);
  if (existing && Number(existing.user_id) !== Number(userId)) {
    return { reason: "owned_by_another_account" };
  }
  if (existing?.status === "revoked") return { reason: "revoked" };
  if (existing) {
    db.prepare(
      `UPDATE devices
       SET name = ?, type = ?, status = 'online', last_seen = unixepoch()
       WHERE id = ? AND user_id = ? AND status != 'revoked'`
    ).run(device.name, device.type, device.id, userId);
    return { device: db.deviceGet(device.id, userId), created: false };
  }
  db.prepare(
    `INSERT INTO devices (id, user_id, name, type, status)
     VALUES (?, ?, ?, ?, 'online')`
  ).run(device.id, userId, device.name, device.type);
  return { device: db.deviceGet(device.id, userId), created: true };
});

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

// 兼容旧启动入口：可靠性判断只依赖任务租约，不再依赖 devices 心跳。
db.taskRequeueStale = function () {
  const recovered = db.taskRecoverExpiredLeases();
  if (recovered.length > 0) {
    console.log(`[DB] 租约回收: ${recovered.length} 个任务已重新排队`);
  }
  return recovered.length;
};

db.startStaleReaper = function (intervalSec = 30) {
  if (db.__reaperStarted) return;
  db.__reaperStarted = true;
  const timer = setInterval(() => {
    try { db.taskRequeueStale(); } catch (e) { /* 不打断循环 */ }
  }, intervalSec * 1000);
  timer.unref?.();
};

module.exports = db;
