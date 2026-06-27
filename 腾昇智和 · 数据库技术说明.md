# 腾昇智和 · 数据库技术说明

> 版本: v1.0 | 更新: 2026-06-05 | 引擎: SQLite (better-sqlite3)

---

## 1. 概述

项目采用 **SQLite** 作为唯一持久化存储，通过 `better-sqlite3` (Node.js 同步绑定) 访问。数据库文件位于 `server/stzh.db`，启用 **WAL (Write-Ahead Logging)** 模式以提升并发读性能。

### 核心特征

| 特性 | 说明 |
|------|------|
| 引擎 | SQLite 3.x via better-sqlite3 v12.10.0 |
| 文件 | `server/stzh.db` (+ `-shm`, `-wal` 辅助文件) |
| 日志模式 | WAL (写前日志) |
| 并发模型 | 单写多读 (WAL 允许读写并发) |
| 前端同步 | localStorage 双写 + 服务端异步同步 |

---

## 2. 表结构总览

数据库包含 **12 张表**，分为两个逻辑组：

### 2.1 用户认证组 (server.js 路由)

服务于独立开发模式，包含用户认证、对话、生成记录等。

```sql
-- 用户账户
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT UNIQUE NOT NULL,          -- 登录名
  password    TEXT NOT NULL,                 -- bcrypt 哈希
  display_name TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- 对话会话
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,              -- UUID
  user_id     INTEGER NOT NULL,             -- FK → users.id
  title       TEXT DEFAULT '新对话',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 对话消息
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,          -- UUID
  conversation_id TEXT NOT NULL,             -- FK → conversations.id
  role            TEXT NOT NULL CHECK(role IN ('user', 'agent')),
  content         TEXT DEFAULT '',
  payload         TEXT,                      -- JSON: 媒体URL、元数据
  is_error        INTEGER DEFAULT 0,
  error_text      TEXT DEFAULT '',
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 提示词模板
CREATE TABLE templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,             -- FK → users.id
  category    TEXT NOT NULL,
  icon        TEXT DEFAULT '＋',
  label       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 生成记录
CREATE TABLE generations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL,     -- FK → users.id
  conversation_id     TEXT,
  prompt              TEXT NOT NULL,
  video_url           TEXT,
  image_urls          TEXT,                  -- JSON 数组
  raw_text            TEXT,
  status              TEXT DEFAULT 'completed',
  coze_conversation_id TEXT,
  tokens_used         INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 用户设置 (per-user 行)
CREATE TABLE user_settings (
  user_id     INTEGER PRIMARY KEY,          -- FK → users.id
  theme       TEXT DEFAULT 'dark',
  language    TEXT DEFAULT 'zh',
  opc_style   TEXT DEFAULT '',
  opc_params  TEXT DEFAULT '{}',            -- JSON
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**索引:**
```sql
CREATE INDEX idx_conv_user  ON conversations(user_id);
CREATE INDEX idx_msg_conv   ON messages(conversation_id);
CREATE INDEX idx_gen_user   ON generations(user_id);
CREATE INDEX idx_gen_date   ON generations(created_at);
CREATE INDEX idx_tpl_user   ON templates(user_id);
```

### 2.2 OPC / 应用组 (server-express.js 路由)

服务于 Electron 桌面模式，包含 AI 助手、LLM 配置、偏好、通知等。

```sql
-- OPC 创作助手：会话
CREATE TABLE opc_sessions (
  id            TEXT PRIMARY KEY,            -- 自定义ID: opc_{timestamp}_{hex}
  title         TEXT NOT NULL DEFAULT '新对话',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  message_count INTEGER DEFAULT 0,
  summary       TEXT DEFAULT NULL            -- 压缩后的对话摘要
);

-- OPC 创作助手：消息
CREATE TABLE opc_messages (
  id         TEXT PRIMARY KEY,               -- 自定义ID: msg_{timestamp}_{hex}
  session_id TEXT NOT NULL,                  -- FK → opc_sessions.id
  role       TEXT NOT NULL,                  -- 'user' | 'assistant' | 'system' | 'workflow-step'
  content    TEXT NOT NULL DEFAULT '',
  timestamp  INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata   TEXT DEFAULT NULL,              -- JSON: 工作流步骤、RAG来源等
  FOREIGN KEY (session_id) REFERENCES opc_sessions(id) ON DELETE CASCADE
);

-- OPC 创作助手：跨会话记忆
CREATE TABLE opc_memory (
  key         TEXT PRIMARY KEY,              -- 记忆键名
  value       TEXT NOT NULL,                 -- 记忆内容 (纯文本或JSON)
  category    TEXT DEFAULT 'general',        -- 分类: general | preference | context
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- LLM 模型配置
CREATE TABLE llm_providers (
  id          TEXT PRIMARY KEY,              -- 自定义ID: provider_{timestamp}_{hex}
  config      TEXT NOT NULL,                 -- JSON: 完整配置含 API Key
  is_active   INTEGER DEFAULT 0,            -- 0=未激活, 1=当前使用
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 用户偏好
CREATE TABLE user_prefs (
  key         TEXT PRIMARY KEY,              -- 如: notificationSound, autoSave
  value       TEXT NOT NULL,                 -- JSON 值
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 通知消息
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT DEFAULT 'info',           -- info | success | warning | error
  read        INTEGER DEFAULT 0,            -- 0=未读, 1=已读
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 应用设置
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,              -- 如: currentTheme
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**索引:**
```sql
CREATE INDEX idx_opc_msg_session ON opc_messages(session_id, timestamp);
```

---

## 3. 服务端架构

项目存在 **两个 Express 服务器**，共享同一个 `db.js` 和 `stzh.db`：

### 3.1 server.js — 独立开发模式

| 配置 | 值 |
|------|-----|
| 端口 | 8080 |
| 认证 | JWT (bcrypt 密码哈希, 10年令牌有效期) |
| 路由 | 模块化 (`server/routes/`) |
| 表 | users, conversations, messages, templates, generations, user_settings |
| 特性 | 文件上传 (multer), 日志记录, Coze API 代理 |

### 3.2 server-express.js — Electron 内嵌模式

| 配置 | 值 |
|------|-----|
| 端口 | 从 8080 起自动寻找可用端口 |
| 认证 | 无 (单用户桌面场景) |
| 路由 | 内联定义 |
| 表 | opc_sessions, opc_messages, opc_memory, llm_providers, user_prefs, notifications, app_settings |
| 特性 | SPA 静态文件服务, 并发控制 (max 5) |

---

## 4. API 端点清单

### 4.1 OPC 创作助手

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/opc/sessions` | 列出会话 (最多50条) |
| POST | `/api/opc/sessions` | 创建会话 |
| DELETE | `/api/opc/sessions/:id` | 删除会话 (级联删除消息) |
| GET | `/api/opc/sessions/:id/messages` | 获取消息 (最多200条) |
| POST | `/api/opc/sessions/:id/messages` | 添加单条消息 |
| POST | `/api/opc/sessions/:id/messages/batch` | 批量添加消息 |
| DELETE | `/api/opc/messages/:id` | 删除单条消息 |
| POST | `/api/opc/sessions/:id/compress` | 压缩对话 (保留最近N条) |
| GET | `/api/opc/memory` | 列出跨会话记忆 |
| POST | `/api/opc/memory` | 设置记忆 |
| DELETE | `/api/opc/memory/:key` | 删除记忆 |

### 4.2 LLM 模型管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm/providers` | 列出所有模型配置 |
| POST | `/api/llm/providers` | 保存/更新模型 |
| DELETE | `/api/llm/providers/:id` | 删除模型 |
| POST | `/api/llm/providers/:id/activate` | 激活模型 |
| GET | `/api/llm/active` | 获取当前激活模型 |

### 4.3 用户偏好

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/prefs` | 获取所有偏好 |
| POST | `/api/prefs` | 设置单条偏好 |
| POST | `/api/prefs/batch` | 批量设置偏好 |

### 4.4 通知

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 列出通知 (最多50条) |
| POST | `/api/notifications` | 添加通知 |
| POST | `/api/notifications/:id/read` | 标记单条已读 |
| POST | `/api/notifications/read-all` | 标记全部已读 |
| DELETE | `/api/notifications` | 清空所有通知 |

### 4.5 应用设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取所有设置 |
| POST | `/api/settings` | 设置单条 |
| POST | `/api/settings/batch` | 批量设置 |

---

## 5. 前端同步层

### 5.1 双写架构

```
用户操作 → 前端组件
  │
  ├─ 读取: 服务端优先 → localStorage 回退
  │
  └─ 写入: localStorage 立即写 → 服务端异步同步 (fire-and-forget)
                                    │
                                    └─ 失败时静默忽略，数据已在 localStorage
```

### 5.2 文件职责

| 文件 | 职责 | 同步策略 |
|------|------|---------|
| `app/lib/opc-agent-api.ts` | OPC API 薄封装 | — (纯 API 调用) |
| `app/lib/opc-agent-persist.ts` | OPC 消息持久化 | 服务端优先读 + 双写 |
| `app/lib/llm-config.ts` | LLM 配置管理 | localStorage 优先 + fire-and-forget |
| `app/lib/preferences.ts` | 用户偏好 | localStorage 优先 + async batch |
| `app/lib/notifications.ts` | 通知管理 | localStorage 优先 + CustomEvent |
| `app/lib/server-sync.ts` | 通用服务端同步 | API 辅助函数 |

### 5.3 localStorage 键名

| 键 | 类型 | 说明 |
|----|------|------|
| `tszh_opc_agent_sessions` | JSON Array | OPC 会话列表 (最多50) |
| `tszh_opc_agent_active` | String | 当前活跃会话 ID |
| `tszh_opc_msg_{sessionId}` | JSON Array | 单会话消息 (最多200) |
| `tszh_opc_providers` | JSON Array | LLM 模型配置 (XOR 混淆) |
| `tszh_opc_active_pid` | String | 当前激活模型 ID |
| `tszh_preferences` | JSON Object | 用户偏好 |
| `tszh_notifications` | JSON Array | 通知列表 (最多50) |

### 5.4 XOR 混淆 (API Key 保护)

```typescript
// 前端混淆 (仅防肉眼读取，非加密)
const SEED = "tszh_opc_v1";
function xorEncode(text: string): string {
  const xored = text.split("").map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ SEED.charCodeAt(i % SEED.length))
  ).join("");
  return btoa(xored);
}
```

> ⚠️ **安全提示**: 服务端以明文 JSON 存储 API Key。XOR 仅前端混淆，非加密。

---

## 6. 数据库操作函数

### 6.1 ID 生成策略

| 表 | ID 格式 | 示例 |
|----|---------|------|
| users | AUTOINCREMENT | `1`, `2`, `3` |
| conversations | UUID | `a1b2c3d4-e5f6-...` |
| opc_sessions | 自定义 | `opc_1717500000000_a3f2b1c4` |
| opc_messages | 自定义 | `msg_1717500000000_d7e8f9a0` |
| llm_providers | 自定义 | `provider_1717500000000_b2c3d4e5` |
| notifications | UUID | 通过前端生成 |

### 6.2 对话压缩机制

```javascript
db.opcCompressSession = function(sessionId, summary, keepRecent = 10) {
  // 1. 获取所有消息
  // 2. 删除 keepRecent 条之外的旧消息
  // 3. 插入一条 [对话摘要] 系统消息
  // 4. 更新会话的 summary 字段
};
```

触发条件: 前端检测到消息数 > 40 时，调用 LLM 生成摘要后触发压缩。

### 6.3 跨会话记忆

```javascript
// 存储记忆 (自动 JSON 序列化)
db.opcSetMemory("user_style_preference", { color: "warm", tone: "professional" }, "preference");

// 读取记忆
const pref = db.opcGetMemory("user_style_preference"); // 返回字符串，需 JSON.parse

// 按分类查询
db.opcGetAllMemory("preference"); // 返回该分类所有记忆
```

---

## 7. ER 关系图

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│  users   │──┐  │ conversations │──┐  │ messages │
│          │  └─→│              │  └─→│          │
│ id (PK)  │     │ id (PK)      │     │ id (PK)  │
│ username │     │ user_id (FK) │     │ conv_id  │
│ password │     │ title        │     │ role     │
└──────────┘     └──────────────┘     │ content  │
     │                                 │ payload  │
     │          ┌───────────┐          └──────────┘
     ├─────────→│ templates │
     │          │ id (PK)   │
     │          │ user_id   │
     │          └───────────┘
     │
     └─────────→┌─────────────┐
                │ generations │
                │ id (PK)     │
                │ user_id     │
                │ prompt      │
                │ video_url   │
                └─────────────┘

┌──────────────┐     ┌──────────────┐
│ opc_sessions │──┐  │ opc_messages │
│              │  └─→│              │
│ id (PK)      │     │ id (PK)      │
│ title        │     │ session_id   │
│ summary      │     │ role         │
└──────────────┘     │ content      │
                     │ metadata     │
                     └──────────────┘

┌─────────────┐  ┌──────────────┐  ┌───────────────┐
│ opc_memory  │  │ llm_providers│  │ notifications │
│ key (PK)    │  │ id (PK)      │  │ id (PK)       │
│ value       │  │ config (JSON)│  │ title         │
│ category    │  │ is_active    │  │ message       │
└─────────────┘  └──────────────┘  └───────────────┘

┌──────────────┐  ┌──────────────┐
│ user_prefs   │  │ app_settings │
│ key (PK)     │  │ key (PK)     │
│ value        │  │ value        │
└──────────────┘  └──────────────┘
```

---

## 8. 已知问题与改进方向

### 8.1 高优先级

| 问题 | 说明 | 建议方案 |
|------|------|---------|
| API Key 明文存储 | 服务端 JSON 中 API Key 明文 | 使用 `sqlcipher` 或 AES 加密 config 字段 |
| 无冲突解决 | 双写无 merge 策略 | 引入 `updated_at` 时间戳比较，保留最新 |
| 无备份机制 | db 文件损坏即丢失 | 定时复制 + `VACUUM INTO` |

### 8.2 中优先级

| 问题 | 说明 | 建议方案 |
|------|------|---------|
| 无迁移系统 | 靠 `CREATE TABLE IF NOT EXISTS` | 引入 `PRAGMA user_version` + 迁移脚本 |
| 三套设置表重叠 | `user_settings` + `user_prefs` + `app_settings` | 统一为一套，保留兼容层 |
| 外键未强制 | 需 `PRAGMA foreign_keys = ON` | 在 db.js 初始化时启用 |

### 8.3 低优先级

| 问题 | 说明 | 建议方案 |
|------|------|---------|
| 索引不足 | `opc_sessions` 等无索引 | 按查询频率添加 |
| 无 VACUUM | 长期使用后碎片化 | 定时任务或 auto_vacuum |
| server-sync.ts 重复 | 与各模块内同步函数重复 | 统一到一个模块 |
| 无软删除 | 删除即永久丢失 | 添加 `deleted_at` 字段 |

---

## 9. 运维指南

### 9.1 启动服务

```bash
# 独立开发模式 (含用户认证)
cd server && node server.js

# Electron 内嵌模式 (由 electron/main.js 自动启动)
npm run electron:dev
```

### 9.2 数据库文件位置

```
server/
├── stzh.db          # 主数据库
├── stzh.db-shm      # WAL 共享内存 (自动生成)
└── stzh.db-wal      # WAL 日志 (自动生成)
```

### 9.3 手动查看数据库

```bash
# 安装 sqlite3 CLI
# Windows: winget install SQLite.SQLite

# 查看表结构
sqlite3 server/stzh.db ".schema"

# 查看数据
sqlite3 server/stzh.db "SELECT * FROM opc_sessions LIMIT 10;"

# 查看 WAL 模式
sqlite3 server/stzh.db "PRAGMA journal_mode;"
```

### 9.4 备份

```bash
# 在线备份 (推荐，不影响运行中的服务)
sqlite3 server/stzh.db "VACUUM INTO 'server/stzh_backup.db';"

# 或直接复制 (需先停止服务)
cp server/stzh.db server/stzh_backup.db
```

### 9.5 清理空间

```bash
# 压缩数据库 (回收已删除数据的空间)
sqlite3 server/stzh.db "VACUUM;"

# 查看数据库大小
ls -lh server/stzh.db
```

---

## 10. 性能注意事项

| 场景 | 注意点 |
|------|--------|
| 大量消息 | `opcGetMessages` 默认 LIMIT 200，避免全表扫描 |
| 批量写入 | 使用 `opcAddMessage` 时已包含事务包装 |
| 并发读 | WAL 模式支持，但写操作仍需串行 |
| localStorage | 同步读写，大量数据时可能阻塞 UI (已设 50/200 上限) |
| 服务端同步 | 异步非阻塞，失败静默 — 不影响用户体验 |

---

## 11. 技术依赖

```json
{
  "better-sqlite3": "^12.10.0",  // SQLite 绑定 (同步API)
  "express": "^4.x",             // HTTP 服务器
  "cors": "^2.x",                // 跨域中间件
  "bcryptjs": "^2.x",            // 密码哈希
  "jsonwebtoken": "^9.x",        // JWT 令牌
  "multer": "^1.x",              // 文件上传
  "dotenv": "^16.x",             // 环境变量
  "crypto": "built-in"           // UUID 生成
}
```

---

*文档维护: 随数据库结构变更同步更新*
