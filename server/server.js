require("dotenv").config({ path: ".env.local" });
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./routes/auth.js");
const { recordGeneration } = require("./routes/generations.js");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

// === 日志 ===
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logDir, `${date}.log`);
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] [${level}] ${args.join(" ")}`;
  console.log(msg);
  fs.appendFileSync(getLogFile(), msg + "\n");
}

// === 中间件 ===
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// JWT 用户提取中间件（非阻塞：有 token 就解析，没有也放行）—— 必须在 API Key 中间件之前
app.use((req, res, next) => {
  req.user = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {}
  }
  next();
});

// 鉴权中间件（API Key 或 JWT —— 只保护 agent 路由，调 Coze 花钱的）
app.use("/api/agent", (req, res, next) => {
  // 有 JWT token 就放行
  if (req.user) return next();
  // 没有 API Key 配置也放行
  if (!API_SECRET_KEY) return next();

  const key = req.headers["x-api-key"];
  if (key !== API_SECRET_KEY) {
    log("WARN", `鉴权失败: ${req.method} ${req.path}`);
    return res.status(401).json({ error: { message: "Invalid or missing API key" } });
  }
  next();
});

// === 健康检查 ===
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// === 挂载路由 ===
app.use(require("./routes/auth.js"));
app.use(require("./routes/conversations.js"));
app.use(require("./routes/templates.js"));
app.use(require("./routes/generations.js"));
app.use(require("./routes/settings.js"));

// === 工具函数 ===
function generateId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

const COZE_EVENTS = {
  MESSAGE_DELTA: "conversation.message.delta",
  MESSAGE_COMPLETED: "conversation.message.completed",
};

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

// === Coze API 调用（带重试） ===
async function callCozeStream(prompt, history, clientConversationId) {
  const token = process.env.COZE_API_TOKEN;
  const botId = process.env.COZE_BOT_ID;
  const userId = process.env.COZE_USER_ID || "stzh_user";
  const baseUrl = process.env.COZE_BASE_URL || "https://api.coze.cn";

  const maxRetries = 2;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      log("INFO", `重试第 ${attempt} 次，等待 ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      log("INFO", `调用 Coze: ${baseUrl}/v3/chat, bot=${botId}, attempt=${attempt + 1}`);

      const body = {
        bot_id: botId,
        user_id: userId,
        stream: true,
        auto_save_history: true,
        additional_messages: buildMessages(prompt, history),
        // 模型参数（与 Coze 调试页对齐）
        parameters: {
          thinking_type: "enabled",
          context_round: 6,
          max_tokens: 131072,
          temperature: 1,
        },
      };

      // 如果传了 conversation_id，加入请求（保持会话上下文）
      if (clientConversationId) {
        body.conversation_id = clientConversationId;
      }

      const resp = await fetch(`${baseUrl}/v3/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });

      log("INFO", `Coze 响应: ${resp.status}, content-type=${resp.headers.get("content-type")}`);

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Coze API error: ${resp.status} ${text}`);
      }

      if (!resp.body) throw new Error("Coze API: no response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const textParts = [];
      let conversationId = "";
      let buffer = "";
      let chunkCount = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunkCount++;

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
              if (data.conversation_id) conversationId = data.conversation_id;

              const isAssistantAnswer = data.role === "assistant" && data.type === "answer" && data.content;
              if (!isAssistantAnswer) continue;

              if (currentEvent === COZE_EVENTS.MESSAGE_DELTA) {
                textParts.push(data.content);
              } else if (currentEvent === COZE_EVENTS.MESSAGE_COMPLETED) {
                textParts.length = 0;
                textParts.push(data.content);
              }
            } catch {}
          }
        }
      } finally {
        reader.releaseLock();
      }

      const fullText = textParts.join("");
      log("INFO", `Coze 完成: chunks=${chunkCount}, textLen=${fullText.length}, convId=${conversationId}`);
      return { fullText, conversationId };

    } catch (error) {
      lastError = error;
      log("ERROR", `Coze 调用失败 (attempt ${attempt + 1}): ${error.message}`);
    }
  }

  throw lastError;
}

// === Coze 卡片响应解析 ===
function parseCozeCard(text) {
  try {
    const json = JSON.parse(text);
    // 检测卡片格式
    if (json.card_type && json.data) {
      const cardData = typeof json.data === "string" ? JSON.parse(json.data) : json.data;
      const results = [];

      // 从 variables 中提取知识库结果
      if (cardData.variables) {
        for (const [key, variable] of Object.entries(cardData.variables)) {
          if (variable.defaultValue && Array.isArray(variable.defaultValue)) {
            for (const item of variable.defaultValue) {
              if (item.con) {
                // 解析 con 字段中的 JSON
                try {
                  const conData = JSON.parse(item.con);
                  results.push({
                    title: conData["中文参数值"] || conData["参数键"] || item.title || "",
                    value: conData["英文Prompt值"] || "",
                    category: [conData["一级分类"], conData["二级分类"], conData["三级分类"]].filter(Boolean).join(" / "),
                    description: conData["效果说明"] || "",
                    usage: conData["适用场景"] || "",
                    pairing: conData["推荐搭配"] || "",
                    aliases: conData["aliases_cn"] || "",
                  });
                } catch {
                  // con 不是 JSON，直接用文本
                  results.push({ title: item.title || "知识库结果", content: item.con });
                }
              }
            }
          }
        }
      }

      if (results.length > 0) {
        // 格式化为可读文本
        const lines = results.map((r, i) => {
          if (r.content) return `${i + 1}. **${r.title}**\n${r.content}`;
          const parts = [`${i + 1}. **${r.title}**`];
          if (r.value) parts.push(`   英文值: ${r.value}`);
          if (r.category) parts.push(`   分类: ${r.category}`);
          if (r.description) parts.push(`   效果: ${r.description}`);
          if (r.usage) parts.push(`   适用: ${r.usage}`);
          if (r.pairing) parts.push(`   搭配: ${r.pairing}`);
          return parts.join("\n");
        });
        return lines.join("\n\n");
      }
    }
  } catch {}
  return null;
}

// === 媒体 URL 提取 ===
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
    const videos = [];
    const images = [];
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
app.post("/api/agent", upload.array("files", 10), async (req, res) => {
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: { message: "服务器繁忙，请稍后再试" } });
  }
  activeRequests++;

  const requestId = generateId();
  const createdAt = new Date().toISOString();

  try {
    // 兼容 JSON 和 multipart/form-data
    let prompt = req.body.prompt;
    let history = req.body.history;

    // FormData 中 history 是 JSON 字符串
    if (typeof history === "string") {
      try { history = JSON.parse(history); } catch { history = []; }
    }

    // 处理上传的文件
    const files = (req.files || []).map((f) => ({
      name: f.originalname,
      type: f.mimetype,
      size: f.size,
    }));

    if (files.length > 0) {
      log("INFO", `附件: ${files.map((f) => `${f.name}(${f.type})`).join(", ")}`);
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: { message: "prompt 不能为空" } });
    }
    if (prompt.length > 5000) {
      return res.status(400).json({ error: { message: "prompt 过长（最多 5000 字符）" } });
    }

    log("INFO", `请求: id=${requestId}, prompt="${prompt.slice(0, 80)}", files=${files.length}`);

    // 如果有文件，把文件信息附加到 prompt 中作为上下文
    let enrichedPrompt = prompt.trim();
    if (files.length > 0) {
      const fileInfo = files.map((f) => `[附件: ${f.name}, 类型: ${f.type}]`).join("\n");
      enrichedPrompt = `${enrichedPrompt}\n\n${fileInfo}`;
    }

    const result = await callCozeStream(enrichedPrompt, history, req.body.conversation_id);

    // 尝试解析 Coze 卡片响应（知识库检索结果）
    const cardText = parseCozeCard(result.fullText);
    const displayText = cardText || result.fullText;

    const media = extractMediaUrls(displayText);

    const response = { requestId, createdAt, ...media };
    if (!media.videoUrl && !media.imageUrls) {
      response.raw = { text: displayText };
    }

    log("INFO", `响应: id=${requestId}, video=${!!media.videoUrl}, images=${media.imageUrls?.length || 0}`);

    // 记录生成结果（如果有登录用户）
    if (req.user) {
      recordGeneration(req.user.userId, {
        conversationId: req.body.conversation_id,
        prompt: prompt.trim(),
        videoUrl: media.videoUrl,
        imageUrls: media.imageUrls,
        rawText: media.videoUrl || media.imageUrls ? null : displayText,
        cozeConversationId: result.conversationId,
      });
    }

    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("ERROR", `请求失败: id=${requestId}, error=${message}`);
    return res.status(502).json({ error: { message } });
  } finally {
    activeRequests--;
  }
});

// === SSE 流式端点 ===
app.post("/api/agent/stream", async (req, res) => {
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(429).json({ error: { message: "服务器繁忙，请稍后再试" } });
  }
  activeRequests++;

  try {
    const { prompt, history } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: { message: "prompt 不能为空" } });
    }
    if (prompt.length > 5000) {
      return res.status(400).json({ error: { message: "prompt 过长（最多 5000 字符）" } });
    }

    log("INFO", `SSE 请求: prompt="${prompt.slice(0, 80)}"`);

    const token = process.env.COZE_API_TOKEN;
    const botId = process.env.COZE_BOT_ID;
    const userId = process.env.COZE_USER_ID || "stzh_user";
    const baseUrl = process.env.COZE_BASE_URL || "https://api.coze.cn";

    const cozeBody = {
      bot_id: botId,
      user_id: userId,
      stream: true,
      auto_save_history: true,
      additional_messages: buildMessages(prompt.trim(), history),
    };
    if (req.body.conversation_id) {
      cozeBody.conversation_id = req.body.conversation_id;
    }

    const resp = await fetch(`${baseUrl}/v3/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cozeBody),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return res.status(502).json({ error: { message: `Coze API error: ${resp.status}` } });
    }

    if (!resp.body) {
      return res.status(502).json({ error: { message: "Coze API: no response body" } });
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

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

            // delta 事件：逐 token 转发
            if (currentEvent === COZE_EVENTS.MESSAGE_DELTA && data.role === "assistant" && data.type === "answer" && data.content) {
              res.write(`event: delta\ndata: ${JSON.stringify({ content: data.content })}\n\n`);
            }

            // completed 事件：解析卡片格式，暂存结果（等 chat.completed 再发送 done）
            if (currentEvent === COZE_EVENTS.MESSAGE_COMPLETED && data.type === "answer") {
              const cardText = parseCozeCard(data.content || "");
              lastCompletedContent = cardText || data.content || "";
            }

            // follow_up 事件：转发后续问题建议
            if (currentEvent === COZE_EVENTS.MESSAGE_COMPLETED && data.type === "follow_up" && data.content) {
              res.write(`event: follow_up\ndata: ${JSON.stringify({ suggestions: [data.content] })}\n\n`);
            }

            // chat.completed：所有消息完成，发送最终 done
            if (currentEvent === "conversation.chat.completed") {
              const media = extractMediaUrls(lastCompletedContent);
              res.write(`event: done\ndata: ${JSON.stringify({ ...media, text: lastCompletedContent, done: true })}\n\n`);
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
      res.end();
    }

    log("INFO", `SSE 请求完成`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("ERROR", `SSE 请求失败: ${message}`);
    if (!res.headersSent) {
      return res.status(502).json({ error: { message } });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  } finally {
    activeRequests--;
  }
});

// === 404 ===
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Not found" } });
});

// === 启动 ===
app.listen(PORT, () => {
  log("INFO", `腾昇智和 Agent 后端已启动 http://localhost:${PORT}`);
  console.log(`\n  腾昇智和 Agent 后端已启动`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  POST /api/agent  (JSON 响应)`);
  console.log(`  鉴权: ${API_SECRET_KEY ? "已启用" : "未启用"}\n`);
});
