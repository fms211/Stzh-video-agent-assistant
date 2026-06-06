const { Router } = require("express");
const crypto = require("crypto");
const db = require("../db.js");

const router = Router();

function generateId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

// === 获取用户的所有会话 ===
router.get("/api/conversations", (req, res) => {
  try {
    const userId = req.user.userId;
    const conversations = db.prepare(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    ).all(userId);

    // 获取每个会话的消息数量
    const result = conversations.map((conv) => {
      const msgCount = db.prepare(
        "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?"
      ).get(conv.id);
      return { ...conv, messageCount: msgCount.count };
    });

    res.json({ conversations: result });
  } catch (error) {
    console.error("[Conversations] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询会话失败" } });
  }
});

// === 获取单个会话的消息 ===
router.get("/api/conversations/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    const conv = db.prepare(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?"
    ).get(req.params.id, userId);

    if (!conv) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }

    const messages = db.prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    ).all(conv.id);

    // 解析 payload JSON
    const parsedMessages = messages.map((m) => ({
      ...m,
      payload: m.payload ? JSON.parse(m.payload) : undefined,
    }));

    res.json({ conversation: conv, messages: parsedMessages });
  } catch (error) {
    console.error("[Conversations] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询消息失败" } });
  }
});

// === 创建会话 ===
router.post("/api/conversations", (req, res) => {
  try {
    const userId = req.user.userId;
    const { id, title } = req.body;
    const convId = id || generateId();

    db.prepare(
      "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)"
    ).run(convId, userId, title || "新对话");

    res.json({ id: convId, title: title || "新对话" });
  } catch (error) {
    console.error("[Conversations] 创建失败:", error.message);
    res.status(500).json({ error: { message: "创建会话失败" } });
  }
});

// === 更新会话标题 ===
router.put("/api/conversations/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    const { title } = req.body;

    db.prepare(
      "UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(title, req.params.id, userId);

    res.json({ ok: true });
  } catch (error) {
    console.error("[Conversations] 更新失败:", error.message);
    res.status(500).json({ error: { message: "更新会话失败" } });
  }
});

// === 删除会话 ===
router.delete("/api/conversations/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(req.params.id);
    db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  } catch (error) {
    console.error("[Conversations] 删除失败:", error.message);
    res.status(500).json({ error: { message: "删除会话失败" } });
  }
});

// === 保存消息 ===
router.post("/api/conversations/:id/messages", (req, res) => {
  try {
    const userId = req.user.userId;
    const convId = req.params.id;

    // 验证会话属于当前用户
    const conv = db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?").get(convId, userId);
    if (!conv) {
      return res.status(404).json({ error: { message: "会话不存在" } });
    }

    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: { message: "消息格式错误" } });
    }

    const insert = db.prepare(
      "INSERT OR REPLACE INTO messages (id, conversation_id, role, content, payload, is_error, error_text) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    const insertMany = db.transaction((msgs) => {
      for (const msg of msgs) {
        insert.run(
          msg.id || generateId(),
          convId,
          msg.role,
          msg.text || msg.content || "",
          msg.payload ? JSON.stringify(msg.payload) : null,
          msg.isError ? 1 : 0,
          msg.errorText || ""
        );
      }
    });

    insertMany(messages);

    // 更新会话时间
    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);

    res.json({ ok: true });
  } catch (error) {
    console.error("[Conversations] 保存消息失败:", error.message);
    res.status(500).json({ error: { message: "保存消息失败" } });
  }
});

module.exports = router;
