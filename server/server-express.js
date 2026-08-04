// 内嵌版 Express 服务器 —— Electron 打包用
// 不依赖外部 node_modules，所有逻辑内联

// 加载环境变量
try { require("dotenv").config(); } catch {}

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

// === 中间件 ===
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// === 健康检查 ===
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// === JWT 中间件（非阻塞：有 token 就解析，没有也放行） ===
const { attachUser, requireUser } = require("./middleware/auth.js");
app.use(attachUser);

// === 挂载路由模块（auth / conversations / templates / generations / user-settings） ===
app.use(require("./routes/auth.js"));
app.use("/api", requireUser);
app.use(require("./routes/conversations.js"));
app.use(require("./routes/templates.js"));
app.use(require("./routes/generations.js"));
app.use(require("./routes/settings.js"));
app.use(require("./routes/tasks.js"));
app.use(require("./routes/devices.js"));

// === 静态文件服务（前端） ===
// 优先使用环境变量，否则自动检测（兼容 Electron 打包和云服务器部署）
const OUT_DIR = process.env.STZH_OUT_DIR
  || (fs.existsSync(path.join(__dirname, "out")) ? path.join(__dirname, "out") : path.join(__dirname, "..", "out"));
console.log("[Express] OUT_DIR:", OUT_DIR, "exists:", fs.existsSync(OUT_DIR));

// === 工具函数 ===
function generateId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

function buildMessages(prompt, history) {
  const messages = [];
  if (history && history.length > 0) {
    const start = Math.max(0, history.length - 20);
    for (let i = start; i < history.length; i++) {
      const msg = history[i];
      if (msg.role === "user" && msg.text) {
        messages.push({ role: "user", content: msg.text, content_type: "text" });
      } else if (msg.role === "agent") {
        const content = msg.text || msg.payload?.raw?.text || "已生成结果";
        messages.push({ role: "assistant", content, content_type: "text" });
      }
    }
  }
  messages.push({ role: "user", content: prompt, content_type: "text" });
  return messages;
}

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+\.(mp4|mov|avi|webm|jpg|jpeg|png|webp|gif)/gi;

function extractMediaUrls(text) {
  const result = {};
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const json = JSON.parse(text);
      if (json.videoUrl || json.video_url) result.videoUrl = json.videoUrl || json.video_url;
      if (Array.isArray(json.imageUrls) || Array.isArray(json.image_urls)) result.imageUrls = json.imageUrls || json.image_urls;
      if (result.videoUrl || result.imageUrls) return result;
    } catch {}
  }
  const matches = text.match(MEDIA_URL_RE);
  if (matches) {
    const videos = [], images = [];
    for (const url of matches) {
      if (/\.(mp4|mov|avi|webm)$/i.test(url)) videos.push(url);
      else images.push(url);
    }
    if (videos.length > 0) result.videoUrl = videos[0];
    if (images.length > 0) result.imageUrls = [...new Set(images)];
  }
  return result;
}

// === 并发控制 ===
let activeRequests = 0;
const MAX_CONCURRENT = 5;

// === POST /api/agent ===
app.post("/api/agent", async (req, res) => {
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: { message: "服务器繁忙，请稍后再试" } });
  }
  activeRequests++;

  const requestId = generateId();
  const createdAt = new Date().toISOString();

  try {
    let { prompt, history } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: { message: "prompt 不能为空" } });
    }
    if (prompt.length > 5000) {
      return res.status(400).json({ error: { message: "prompt 过长（最多 5000 字符）" } });
    }

    console.log(`[Agent] 请求: id=${requestId}, prompt="${prompt.slice(0, 80)}"`);

    const token = process.env.COZE_API_TOKEN;
    const botId = process.env.COZE_BOT_ID;
    const userId = process.env.COZE_USER_ID || "stzh_user";
    const baseUrl = process.env.COZE_BASE_URL || "https://api.coze.cn";

    const resp = await fetch(`${baseUrl}/v3/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId,
        stream: true,
        auto_save_history: true,
        additional_messages: buildMessages(prompt.trim(), history),
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    console.log(`[Coze] 响应: ${resp.status}, content-type=${resp.headers.get("content-type")}`);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Coze API error: ${resp.status} ${text}`);
    }
    if (!resp.body) throw new Error("Coze API: no response body");

    // 解析 SSE 流
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastCompletedContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          let currentEvent = "";
          let dataStr = "";
          for (const line of event.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("event:")) currentEvent = trimmed.slice(6).trim();
            else if (trimmed.startsWith("data:")) dataStr = trimmed.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (currentEvent === "conversation.message.completed" && data.type === "answer") {
              lastCompletedContent = data.content || "";
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    const media = extractMediaUrls(lastCompletedContent);
    const response = { requestId, createdAt, ...media };
    if (!media.videoUrl && !media.imageUrls) {
      response.raw = { text: lastCompletedContent };
    }

    console.log(`[Agent] 响应: video=${!!media.videoUrl}, images=${media.imageUrls?.length || 0}`);
    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error(`[Agent] 错误: ${message}`);
    return res.status(502).json({ error: { message } });
  } finally {
    activeRequests--;
  }
});

// === POST /api/agent/stream ===
app.post("/api/agent/stream", async (req, res) => {
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: { message: "服务器繁忙，请稍后再试" } });
  }
  activeRequests++;

  try {
    const { prompt, history, conversation_id: conversationId } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: { message: "prompt 不能为空" } });
    }
    if (prompt.length > 5000) {
      return res.status(400).json({ error: { message: "prompt 过长（最大 5000 字符）" } });
    }

    const token = process.env.COZE_API_TOKEN;
    const botId = process.env.COZE_BOT_ID;
    const userId = process.env.COZE_USER_ID || "stzh_user";
    const baseUrl = process.env.COZE_BASE_URL || "https://api.coze.cn";
    const requestBody = {
      bot_id: botId,
      user_id: userId,
      stream: true,
      auto_save_history: true,
      additional_messages: buildMessages(prompt.trim(), history),
    };
    if (conversationId) requestBody.conversation_id = conversationId;

    const upstream = await fetch(`${baseUrl}/v3/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: { message: `Coze API error: ${upstream.status}` } });
    }
    if (!upstream.body) {
      return res.status(502).json({ error: { message: "Coze API: no response body" } });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastCompletedContent = "";
    let doneSent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          let eventName = "";
          let eventData = "";
          for (const line of event.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event:")) eventName = trimmed.slice(6).trim();
            else if (trimmed.startsWith("data:")) eventData = trimmed.slice(5).trim();
          }
          if (!eventData) continue;

          try {
            const data = JSON.parse(eventData);
            if (
              eventName === "conversation.message.delta" &&
              data.role === "assistant" &&
              data.type === "answer" &&
              data.content
            ) {
              res.write(`event: delta\ndata: ${JSON.stringify({ content: data.content })}\n\n`);
            }
            if (eventName === "conversation.message.completed" && data.type === "answer") {
              lastCompletedContent = data.content || "";
            }
            if (
              eventName === "conversation.message.completed" &&
              data.type === "follow_up" &&
              data.content
            ) {
              res.write(`event: follow_up\ndata: ${JSON.stringify({ suggestions: [data.content] })}\n\n`);
            }
            if (eventName === "conversation.chat.completed") {
              const media = extractMediaUrls(lastCompletedContent);
              res.write(`event: done\ndata: ${JSON.stringify({
                ...media,
                text: lastCompletedContent,
                done: true,
              })}\n\n`);
              doneSent = true;
            }
          } catch {}
        }
      }

      if (!doneSent && lastCompletedContent) {
        const media = extractMediaUrls(lastCompletedContent);
        res.write(`event: done\ndata: ${JSON.stringify({
          ...media,
          text: lastCompletedContent,
          done: true,
        })}\n\n`);
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (!res.headersSent) {
      return res.status(502).json({ error: { message } });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  } finally {
    activeRequests--;
  }
});

// === OPC 创作助手 API ===
const db = require("./db");

// 会话列表
app.get("/api/opc/sessions", (req, res) => {
  const userId = req.user?.userId || 0;
  const sessions = db.opcListSessions(userId);
  res.json({ sessions });
});

// 创建会话
app.post("/api/opc/sessions", (req, res) => {
  const userId = req.user?.userId || 0;
  const { id, title } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  db.opcCreateSession(id, title, userId);
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
  const limit = parseInt(req.query.limit) || 200;
  const messages = db.opcGetMessages(req.params.id, limit);
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
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
  const ids = [];
  for (const msg of messages) {
    ids.push(db.opcAddMessage(req.params.id, msg.role, msg.content, msg.metadata));
  }
  res.json({ ids, count: ids.length });
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
  db.opcCompressSession(req.params.id, summary, keepRecent || 10);
  res.json({ ok: true });
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
  const userId = req.user?.userId || 0;
  const rows = db.llmGetProviders(userId);
  const providers = rows.map((r) => ({ ...r, config: JSON.parse(r.config) }));
  res.json({ providers });
});

app.post("/api/llm/providers", (req, res) => {
  const userId = req.user?.userId || 0;
  const { id, config, isActive } = req.body;
  if (!id || !config) return res.status(400).json({ error: "id and config required" });
  db.llmSaveProvider(id, config, isActive, userId);
  res.json({ ok: true });
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
  const userId = req.user?.userId || 0;
  const row = db.llmGetActive(userId);
  if (row) res.json({ provider: { ...row, config: JSON.parse(row.config) } });
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
  db.notifAdd(id || `notif_${Date.now()}`, title, message, type, userId);
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

// === 应用级设置 API（主题等，非用户级） ===
// 注意：用户级设置 (/api/settings) 由 routes/settings.js 提供
// 这里是应用级 key-value 存储，路径改为 /api/app-settings 避免冲突

app.get("/api/app-settings", (_req, res) => {
  res.json({ settings: db.settingsGetAll() });
});

app.post("/api/app-settings", (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });
  db.settingsSet(key, value);
  res.json({ ok: true });
});

app.post("/api/app-settings/batch", (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== "object") return res.status(400).json({ error: "settings object required" });
  for (const [key, value] of Object.entries(settings)) {
    db.settingsSet(key, value);
  }
  res.json({ ok: true });
});

// === RAG 知识库代理（转发到 Python RAG 服务） ===

const RAG_BASE = "http://localhost:5000";

app.post("/api/rag/retrieve", async (req, res) => {
  const { query, top_k, score_threshold } = req.body;
  if (!query) return res.json({ results: [], query: "", total: 0 });
  try {
    const ragRes = await fetch(`${RAG_BASE}/rag/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: top_k || 5, score_threshold: score_threshold || 0.45 }),
      signal: AbortSignal.timeout(120000),
    });
    if (!ragRes.ok) return res.json({ results: [], query, total: 0 });
    const data = await ragRes.json();
    res.json(data);
  } catch {
    res.json({ results: [], query, total: 0 });
  }
});

app.get("/api/rag/health", async (_req, res) => {
  try {
    const ragRes = await fetch(`${RAG_BASE}/rag/health`, { signal: AbortSignal.timeout(2000) });
    if (!ragRes.ok) return res.json({ ok: false, entries: 0 });
    const data = await ragRes.json();
    res.json(data);
  } catch {
    res.json({ ok: false, entries: 0 });
  }
});

// === 网络搜索代理（多引擎：Google/SerpApi → 搜狗 → Bing + GitHub） ===

const { search } = require("./search-engines");

app.post("/api/search", async (req, res) => {
  const query = req.body?.query?.trim();
  if (!query) return res.json({ results: [] });
  try {
    const result = await search(query, { maxResults: 5 });
    res.json(result);
  } catch (err) {
    res.json({ results: [], error: err instanceof Error ? err.message : "Search failed" });
  }
});

// === 所有非 API 请求 → 静态文件 / index.html（SPA） ===
app.use((req, res, next) => {
  // API 路由直接跳过
  if (req.path.startsWith("/api/") || req.path === "/health") {
    return next();
  }
  // 尝试静态文件
  const filePath = path.join(OUT_DIR, req.path);
  if (req.path !== "/" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  // SPA fallback → index.html
  const indexPath = path.join(OUT_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: { message: "Not found" } });
  }
});

module.exports = app;
