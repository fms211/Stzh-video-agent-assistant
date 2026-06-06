const { Router } = require("express");
const db = require("../db.js");

const router = Router();

// === 获取用户的生成记录 ===
router.get("/api/generations", (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, offset = 0 } = req.query;

    const generations = db.prepare(
      "SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(userId, Number(limit), Number(offset));

    const total = db.prepare(
      "SELECT COUNT(*) as count FROM generations WHERE user_id = ?"
    ).get(userId);

    // 解析 JSON 字段
    const result = generations.map((g) => ({
      ...g,
      imageUrls: g.image_urls ? JSON.parse(g.image_urls) : undefined,
    }));

    res.json({ generations: result, total: total.count });
  } catch (error) {
    console.error("[Generations] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询记录失败" } });
  }
});

// === 写入生成记录（内部使用） ===
function recordGeneration(userId, data) {
  try {
    db.prepare(
      `INSERT INTO generations (user_id, conversation_id, prompt, video_url, image_urls, raw_text, status, coze_conversation_id, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      data.conversationId || null,
      data.prompt || "",
      data.videoUrl || null,
      data.imageUrls ? JSON.stringify(data.imageUrls) : null,
      data.rawText || null,
      data.status || "completed",
      data.cozeConversationId || null,
      data.tokensUsed || 0
    );
  } catch (error) {
    console.error("[Generations] 写入失败:", error.message);
  }
}

// === 统计信息 ===
router.get("/api/generations/stats", (req, res) => {
  try {
    const userId = req.user.userId;

    const total = db.prepare("SELECT COUNT(*) as count FROM generations WHERE user_id = ?").get(userId);
    const today = db.prepare(
      "SELECT COUNT(*) as count FROM generations WHERE user_id = ? AND date(created_at) = date('now')"
    ).get(userId);
    const totalVideos = db.prepare(
      "SELECT COUNT(*) as count FROM generations WHERE user_id = ? AND video_url IS NOT NULL"
    ).get(userId);

    res.json({
      total: total.count,
      today: today.count,
      totalVideos: totalVideos.count,
    });
  } catch (error) {
    console.error("[Generations] 统计失败:", error.message);
    res.status(500).json({ error: { message: "查询统计失败" } });
  }
});

module.exports = router;
module.exports.recordGeneration = recordGeneration;
