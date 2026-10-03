// 内嵌版 Express 服务器 —— Electron 打包用
// 不依赖外部 node_modules，所有逻辑内联

// 加载环境变量
try { require("dotenv").config(); } catch {}

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

// === 中间件 ===
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// === 健康检查 ===
app.get("/health", (req, res) => {
  const runtimeState = req.app.locals.taskRuntimeState;
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    taskRuntime: {
      enabled: Boolean(req.app.locals.taskRuntime?.started),
      active: Number(req.app.locals.taskRuntime?.activeCount) || 0,
      reason: runtimeState?.reason || null,
    },
  });
});

// === JWT 中间件（非阻塞：有 token 就解析，没有也放行） ===
const { attachUser, requireUser } = require("./middleware/auth.js");
app.use(attachUser);

// === 挂载路由模块（auth / conversations / templates / generations / user-settings） ===
app.use(require("./routes/auth.js"));
app.use("/api", requireUser);
app.use(require("./routes/history-retention.js"));
app.use(require("./routes/conversations.js"));
app.use(require("./routes/templates.js"));
app.use(require("./routes/generations.js"));
app.use(require("./routes/settings.js"));
app.use(require("./routes/tasks.js"));
app.use(require("./routes/devices.js"));
app.use(require("./routes/attachments.js"));
app.use(require("./routes/agent.js"));
app.use(require("./routes/creative-agent.js"));
app.use(require("./routes/research.js"));
app.use(require("./routes/plugins.js"));
app.use(require("./routes/studio-memory.js"));
app.use(require("./routes/retrieval.js"));

// === 静态文件服务（前端） ===
// 优先使用环境变量，否则自动检测（兼容 Electron 打包和云服务器部署）
const OUT_DIR = process.env.STZH_OUT_DIR
  || (fs.existsSync(path.join(__dirname, "out")) ? path.join(__dirname, "out") : path.join(__dirname, "..", "out"));
console.log("[Express] OUT_DIR:", OUT_DIR, "exists:", fs.existsSync(OUT_DIR));

// === OPC 创作助手 API ===
const db = require("./db");
const { publish } = require("./events");
const { encryptSecret, redactProvider } = require("./lib/secret-crypto.js");

// 会话列表
app.get("/api/opc/sessions", (req, res) => {
  const userId = req.user?.userId || 0;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const sessions = db.opcListSessions(userId, limit, offset);
  res.json({ sessions });
});

// 创建会话
app.post("/api/opc/sessions", (req, res) => {
  const userId = req.user?.userId || 0;
  const { id, title } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  try { require("./history-retention.js").assertAvailable(db, userId, id); }
  catch (error) { return res.status(error.status).json({ error: { code: error.code, message: error.message } }); }
  db.opcCreateSession(id, title, userId);
  if (!db.opcGetSession(id, userId)) return res.status(409).json({ error: "session ID unavailable" });
  try { const scope=require("./studio-session-scope.js");scope.register(db,userId,id,scope.inferMode(db,userId,id)); }
  catch(error){return res.status(error.status||400).json({error:error.message});}
  if (typeof title === "string" && title.trim()) db.opcUpdateSession(id, { title: title.slice(0, 200) });
  res.json({ ok: true });
});

// 删除会话
app.delete("/api/opc/sessions/:id", (req, res) => {
  const userId = req.user?.userId || 0;
  db.opcDeleteSession(req.params.id, userId);
  res.json({ ok: true });
});

// 获取消息
app.get("/api/opc/sessions/:id/messages", (req, res) => {
  const userId = req.user.userId;
  if (!db.opcGetSession(req.params.id, userId)) {
    return res.status(404).json({ error: "session not found" });
  }
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const messages = db.opcGetMessages(req.params.id, limit, offset);
  res.json({ messages });
});

// 添加消息
app.post("/api/opc/sessions/:id/messages", (req, res) => {
  const userId = req.user.userId;
  if (!db.opcGetSession(req.params.id, userId)) {
    return res.status(404).json({ error: "session not found" });
  }
  const { role, content, metadata } = req.body;
  if (!role || content === undefined) return res.status(400).json({ error: "role and content required" });
  const msgId = db.opcAddMessage(req.params.id, role, content, metadata);
  res.json({ id: msgId });
});

// 批量添加消息（用于同步本地消息到服务端）
app.post("/api/opc/sessions/:id/messages/batch", (req, res) => {
  const userId = req.user.userId;
  if (!db.opcGetSession(req.params.id, userId)) {
    return res.status(404).json({ error: "session not found" });
  }
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length > 200) return res.status(400).json({ error: "messages array required (maximum 200)" });
  if (messages.some(msg => !msg || !["system", "user", "assistant", "workflow", "workflow-step", "action-cards"].includes(msg.role)
    || typeof msg.content !== "string"
    || (msg.id !== undefined && (typeof msg.id !== "string" || !msg.id || msg.id.length > 200))
    || (msg.timestamp !== undefined && (!Number.isFinite(msg.timestamp) || msg.timestamp <= 0 || msg.timestamp > 8640000000000000))
    || (msg.metadata !== undefined && (msg.metadata === null || typeof msg.metadata !== "object" || Array.isArray(msg.metadata))))) {
    return res.status(400).json({ error: "invalid message" });
  }
  const ids = db.opcSyncMessages(req.params.id, messages);
  const memoryCandidates=require("./studio-memory-candidates.js").createStudioCandidateService(db).messages(userId,req.params.id,ids);
  res.json({ ids, count: ids.length, memoryCandidates });
});

// 删除消息
app.delete("/api/opc/messages/:id", (req, res) => {
  const userId = req.user?.userId || 0;
  db.opcDeleteMessage(req.params.id, userId);
  res.json({ ok: true });
});

// 压缩对话
app.post("/api/opc/sessions/:id/compress", (req, res) => {
  const userId = req.user.userId;
  if (!db.opcGetSession(req.params.id, userId)) {
    return res.status(404).json({ error: "session not found" });
  }
  const { summary, keepRecent } = req.body;
  if (!summary) return res.status(400).json({ error: "summary required" });
  try {
    const result=db.opcCompressSession(req.params.id,summary,keepRecent??10,userId);
    res.json({ok:true,...result,originalMessagesPreserved:true});
  } catch(error) { res.status(error.status||500).json({error:{code:error.code,message:error.message}}); }
});

// 获取跨会话记忆
app.get("/api/opc/memory", (req, res) => {
  const userId = req.user?.userId || 0;
  const category = req.query.category;
  const memory = category ? db.opcGetAllMemory(category, userId) : db.opcGetAllMemory(undefined, userId);
  res.json({ memory });
});

// 设置记忆
app.post("/api/opc/memory", (req, res) => {
  const userId = req.user?.userId || 0;
  const { key, value, category } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });
  db.opcSetMemory(key, value, category, userId);
  res.json({ ok: true });
});

// 删除记忆
app.delete("/api/opc/memory/:key", (req, res) => {
  const userId = req.user?.userId || 0;
  db.opcDeleteMemory(req.params.key, userId);
  res.json({ ok: true });
});

// === LLM 模型配置 API ===

app.get("/api/llm/providers", (req, res) => {
  const userId = req.user.userId;
  const rows = db.llmGetProviders(userId);
  const providers = rows.map((row) => {
    const safe = redactProvider(row);
    return { id: safe.id, is_active: Number(safe.isActive), config: { name: safe.name, protocol: safe.protocol, baseUrl: safe.baseUrl, model: safe.model, hasSecret: safe.hasSecret, keyLast4: safe.keyLast4 } };
  });
  res.json({ providers });
});

app.post("/api/llm/providers", (req, res) => {
  const userId = req.user.userId;
  const { id, config, isActive } = req.body;
  if (!id || !config) return res.status(400).json({ error: "id and config required" });
  try {
    const metadata = { ...config };
    const apiKey = typeof metadata.apiKey === "string" ? metadata.apiKey.trim() : "";
    delete metadata.apiKey;
    const existing = db.prepare("SELECT * FROM llm_providers WHERE id = ? AND user_id = ?").get(id, userId);
    const previousConfig = existing ? JSON.parse(existing.config) : {};
    const connectionChanged = Boolean(apiKey) || ["protocol", "baseUrl", "model"].some(key => previousConfig[key] !== metadata[key]);
    const secret = apiKey ? encryptSecret(apiKey) : existing?.secret || null;
    const keyLast4 = apiKey ? apiKey.slice(-4) : existing?.key_last4 || null;
    const save = db.transaction(() => {
      if (isActive) db.prepare("UPDATE llm_providers SET is_active = 0 WHERE user_id = ?").run(userId);
      db.prepare(`INSERT INTO llm_providers (id, user_id, config, secret, key_last4, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(id, user_id) DO UPDATE SET config = excluded.config, secret = excluded.secret,
          key_last4 = excluded.key_last4, is_active = excluded.is_active, updated_at = unixepoch()`)
        .run(id, userId, JSON.stringify(metadata), secret, keyLast4, isActive ? 1 : 0);
      if (connectionChanged) db.prepare("UPDATE llm_providers SET verified_at = NULL WHERE id = ? AND user_id = ?").run(id, userId);
    });
    save();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/llm/providers/:id", (req, res) => {
  const userId = req.user?.userId || 0;
  db.llmDeleteProvider(req.params.id, userId);
  res.json({ ok: true });
});

app.post("/api/llm/providers/:id/activate", (req, res) => {
  const userId = req.user?.userId || 0;
  db.llmSetActive(req.params.id, userId);
  res.json({ ok: true });
});

app.get("/api/llm/active", (req, res) => {
  const userId = req.user.userId;
  const row = db.llmGetActive(userId);
  if (row) {
    const safe = redactProvider(row);
    res.json({ provider: { id: safe.id, is_active: Number(safe.isActive), config: { name: safe.name, protocol: safe.protocol, baseUrl: safe.baseUrl, model: safe.model, hasSecret: safe.hasSecret, keyLast4: safe.keyLast4 } } });
  }
  else res.json({ provider: null });
});

// === 用户偏好 API ===

app.get("/api/prefs", (req, res) => {
  const userId = req.user?.userId || 0;
  res.json({ prefs: db.prefsGetAll(userId) });
});

app.post("/api/prefs", (req, res) => {
  const userId = req.user?.userId || 0;
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });
  db.prefsSet(key, value, userId);
  res.json({ ok: true });
});

app.post("/api/prefs/batch", (req, res) => {
  const userId = req.user?.userId || 0;
  const { prefs } = req.body;
  if (!prefs || typeof prefs !== "object") return res.status(400).json({ error: "prefs object required" });
  for (const [key, value] of Object.entries(prefs)) {
    db.prefsSet(key, value, userId);
  }
  res.json({ ok: true });
});

// === 通知 API ===

app.get("/api/notifications", (req, res) => {
  const userId = req.user?.userId || 0;
  res.json({ notifications: db.notifList(userId) });
});

app.post("/api/notifications", (req, res) => {
  const userId = req.user?.userId || 0;
  const { id, title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: "title and message required" });
  const notif = db.notifAdd(id || `notif_${Date.now()}`, title, message, type, userId);
  // 实时推送：手机/桌面 WS 订阅 notification.created 即时刷新
  publish(userId, "notification.created", { notification: notif });
  res.json({ ok: true });
});

app.post("/api/notifications/:id/read", (req, res) => {
  const userId = req.user?.userId || 0;
  db.notifMarkRead(req.params.id, userId);
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", (req, res) => {
  const userId = req.user?.userId || 0;
  db.notifMarkAllRead(userId);
  res.json({ ok: true });
});

app.delete("/api/notifications", (req, res) => {
  const userId = req.user?.userId || 0;
  db.notifClearAll(userId);
  res.json({ ok: true });
});

// === 兼容旧设置 API 路径，远程读写必须按认证账户隔离 ===
// /api/settings 的主题字段仍由 routes/settings.js 提供。
// 全局 app_settings 保留内部迁移标记和无归属旧数据，不通过 HTTP 暴露。

app.get("/api/app-settings", (req, res) => {
  res.json({ settings: db.accountSettingsGetAll(req.user.userId) });
});

app.post("/api/app-settings", (req, res) => {
  const { key, value } = req.body || {};
  if (typeof key !== "string" || !key.trim() || typeof value !== "string") {
    return res.status(400).json({ error: "setting key and value must be strings" });
  }
  db.accountSettingsSetBatch(req.user.userId, [[key, value]]);
  res.json({ ok: true });
});

app.post("/api/app-settings/batch", (req, res) => {
  const { settings } = req.body || {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return res.status(400).json({ error: "settings object required" });
  }
  const entries = Object.entries(settings);
  if (entries.some(([key, value]) => !key.trim() || typeof value !== "string")) {
    return res.status(400).json({ error: "setting key and value must be strings" });
  }
  db.accountSettingsSetBatch(req.user.userId, entries);
  res.json({ ok: true });
});

// === 所有非 API 请求 → 静态文件 / index.html（SPA） ===
app.use((req, res, next) => {
  // API 路由直接跳过
  if (req.path.startsWith("/api/") || req.path === "/health") {
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const notFound = () => res.status(404).json({ error: { message: "Not found" } });
  const isWithin = (root, target) => {
    const relative = path.relative(root, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  try {
    // Decode once for real filenames. Never treat Windows separators or NUL as URL paths.
    const requestPath = decodeURIComponent(req.path);
    if (requestPath.includes("\\") || requestPath.includes("\0")) {
      return res.status(400).json({ error: { message: "Invalid file path" } });
    }
    const outputRoot = path.resolve(OUT_DIR);
    const filePath = path.resolve(outputRoot, `.${requestPath}`);
    if (!isWithin(outputRoot, filePath) || !fs.existsSync(outputRoot)) return notFound();
    const realRoot = fs.realpathSync(outputRoot);
    const sendOutput = target => {
      // Directory links must not expose files outside the exported Web tree.
      const realFile = fs.realpathSync(target);
      if (!isWithin(realRoot, realFile)) return notFound();
      return res.sendFile(realFile);
    };
    if (requestPath !== "/" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return sendOutput(filePath);
    }
    const indexPath = path.join(outputRoot, "index.html");
    return fs.existsSync(indexPath) ? sendOutput(indexPath) : notFound();
  } catch (error) {
    if (error instanceof URIError) {
      return res.status(400).json({ error: { message: "Invalid file path" } });
    }
    console.error("[Static] Read failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: { message: "Static file unavailable" } });
  }
});

module.exports = app;
