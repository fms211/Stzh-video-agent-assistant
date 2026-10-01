const { Router } = require("express");
const crypto = require("crypto");
const db = require("../db.js");
const sessionScope=require("../studio-session-scope.js");

const router = Router();

function generateId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

// unixepoch 整数 → 前端期望的 ISO 文本
function tsToIso(ts) {
  if (!ts) return new Date().toISOString();
  // opc_sessions 存的是 unixepoch 整数秒
  const num = typeof ts === "number" ? ts : parseInt(ts, 10);
  return isNaN(num) ? String(ts) : new Date(num * 1000).toISOString();
}

// opc_sessions 行 → conversations 前端形状
function mapSession(s) {
  return {
    id: s.id,
    title: s.title,
    created_at: tsToIso(s.created_at),
    updated_at: tsToIso(s.updated_at),
    messageCount: s.message_count || 0,
  };
}

// opc_messages 行 → messages 前端形状（payload 从 metadata 解出，is_error 从 metadata.isError 推）
function mapMessage(m) {
  let payload;
  let contextTrace;
  let isError = 0;
  let errorText = "";
  if (m.metadata) {
    try {
      const meta = JSON.parse(m.metadata);
      payload = meta.payload;
      contextTrace = meta.contextTrace;
      isError = meta.isError ? 1 : 0;
      errorText = meta.errorText || "";
    } catch { payload = m.metadata; }
  }
  return {
    id: m.id,
    conversation_id: m.session_id,
    role: m.role,
    content: m.content,
    payload,
    contextTrace,
    is_error: isError,
    error_text: errorText,
    created_at: tsToIso(m.timestamp),
  };
}

// === 获取用户的所有会话（读 opc_sessions）===
router.get("/api/conversations", (req, res) => {
  try {
    const userId = req.user.userId;
    if (req.query.mode !== undefined && req.query.mode !== "coze") return res.status(400).json({error:{message:"会话模式无效"}});
    const sessions = [];
    for (const session of db.prepare("SELECT * FROM opc_sessions WHERE user_id = ? ORDER BY updated_at DESC").iterate(userId)) {
      if (req.query.mode === "coze" && sessionScope.inferMode(db,userId,session.id) !== "coze") continue;
      sessions.push(session);
      if (sessions.length === 200) break;
    }
    res.json({ conversations: sessions.map(mapSession) });
  } catch (error) {
    console.error("[Conversations] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询会话失败" } });
  }
});

// === 获取单个会话的消息（读 opc_sessions/opc_messages）===
router.get("/api/conversations/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    const session = db.prepare(
      "SELECT * FROM opc_sessions WHERE id = ? AND user_id = ?"
    ).get(req.params.id, userId);

    if (!session) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }

    const messages = db.prepare(
      "SELECT * FROM opc_messages WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(session.id);

    res.json({ conversation: { ...mapSession(session), mode: sessionScope.inferMode(db, userId, session.id) }, messages: messages.map(mapMessage) });
  } catch (error) {
    console.error("[Conversations] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询消息失败" } });
  }
});

// === 创建/更新会话（写 opc_sessions）===
router.post("/api/conversations", (req, res) => {
  try {
    const userId = req.user.userId;
    const { id, title } = req.body;
    const convId = id || generateId();
    const existing = db.prepare(
      "SELECT id, user_id FROM opc_sessions WHERE id = ?"
    ).get(convId);

    if (existing && existing.user_id !== userId) {
      return res.status(409).json({ error: { message: "会话 ID 已被占用" } });
    }

    db.transaction(()=>{
    if (existing) {
      db.prepare(
        "UPDATE opc_sessions SET title = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?"
      ).run(title || "新对话", convId, userId);
    } else {
      db.prepare(
        "INSERT INTO opc_sessions (id, user_id, title) VALUES (?, ?, ?)"
      ).run(convId, userId, title || "新对话");
    }

    sessionScope.initialize(db);
    const known=db.prepare("SELECT mode FROM studio_session_modes WHERE session_id=? AND user_id=?").get(convId,userId);
    sessionScope.register(db,userId,convId,known?.mode||(convId.startsWith("opc_")?sessionScope.inferMode(db,userId,convId):"coze"));
    })();
    res.json({ id: convId, title: title || "新对话" });
  } catch (error) {
    console.error("[Conversations] 创建失败:", error.message);
    res.status(500).json({ error: { message: "创建会话失败" } });
  }
});

// === 更新会话标题（写 opc_sessions）===
router.put("/api/conversations/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    const { title } = req.body;
    db.prepare(
      "UPDATE opc_sessions SET title = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?"
    ).run(title, req.params.id, userId);
    res.json({ ok: true });
  } catch (error) {
    console.error("[Conversations] 更新失败:", error.message);
    res.status(500).json({ error: { message: "更新会话失败" } });
  }
});

// === 删除会话（写 opc_sessions）===
router.delete("/api/conversations/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    const session = db.prepare(
      "SELECT id FROM opc_sessions WHERE id = ? AND user_id = ?"
    ).get(req.params.id, userId);
    if (!session) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }
    db.prepare("DELETE FROM opc_messages WHERE session_id = ?").run(req.params.id);
    db.prepare("DELETE FROM opc_sessions WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  } catch (error) {
    console.error("[Conversations] 删除失败:", error.message);
    res.status(500).json({ error: { message: "删除会话失败" } });
  }
});

// === 保存消息（写 opc_messages，payload/isError/errorText 打包进 metadata）===
router.post("/api/conversations/:id/messages", (req, res) => {
  try {
    const userId = req.user.userId;
    const convId = req.params.id;

    const session = db.prepare("SELECT id FROM opc_sessions WHERE id = ? AND user_id = ?").get(convId, userId);
    if (!session) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }

    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: { message: "消息格式错误" } });
    }

    const insert = db.prepare(
      "INSERT OR REPLACE INTO opc_messages (id, session_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)"
    );

    const insertMany = db.transaction((msgs) => {
      const ids=[];
      for (const msg of msgs) {
        const messageId=msg.id || generateId();
        const occupied=db.prepare("SELECT session_id FROM opc_messages WHERE id=?").get(messageId);
        if(occupied&&occupied.session_id!==convId)throw Object.assign(new Error("消息ID已被其他会话占用"),{status:409});
        const meta = {};
        if (msg.payload !== undefined) meta.payload = msg.payload;
        if (msg.contextTrace !== undefined) meta.contextTrace = msg.contextTrace;
        if (msg.isError) meta.isError = true;
        if (msg.errorText) meta.errorText = msg.errorText;
        insert.run(
          messageId,
          convId,
          msg.role || "user",
          msg.text || msg.content || "",
          Object.keys(meta).length > 0 ? JSON.stringify(meta) : null
        );
        ids.push(messageId);
      }
      return ids;
    });

    const savedIds=insertMany(messages);

    const count = db.prepare("SELECT COUNT(*) as c FROM opc_messages WHERE session_id = ?").get(convId).c;
    db.prepare("UPDATE opc_sessions SET updated_at = unixepoch(), message_count = ? WHERE id = ?").run(count, convId);

    const memoryCandidates=require("../studio-memory-candidates.js").createStudioCandidateService(db).messages(userId,convId,savedIds);
    res.json({ ok: true, memoryCandidates });
  } catch (error) {
    console.error("[Conversations] 保存消息失败:", error.message);
    res.status(error.status||500).json({ error: { message: error.status===409?error.message:"保存消息失败" } });
  }
});

module.exports = router;
