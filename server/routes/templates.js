const { Router } = require("express");
const db = require("../db.js");

const router = Router();

// === 获取用户的所有模板 ===
router.get("/api/templates", (req, res) => {
  try {
    const userId = req.user.userId;
    const templates = db.prepare(
      "SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC"
    ).all(userId);
    res.json({ templates });
  } catch (error) {
    console.error("[Templates] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询模板失败" } });
  }
});

// === 创建模板 ===
router.post("/api/templates", (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, icon, label, prompt } = req.body;

    if (!category || !label || !prompt) {
      return res.status(400).json({ error: { message: "分类、名称和提示词不能为空" } });
    }

    const result = db.prepare(
      "INSERT INTO templates (user_id, category, icon, label, prompt) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, category, icon || "＋", label, prompt);

    res.json({ id: result.lastInsertRowid, category, icon: icon || "＋", label, prompt });
  } catch (error) {
    console.error("[Templates] 创建失败:", error.message);
    res.status(500).json({ error: { message: "创建模板失败" } });
  }
});

// === 删除模板 ===
router.delete("/api/templates/:id", (req, res) => {
  try {
    const userId = req.user.userId;
    db.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  } catch (error) {
    console.error("[Templates] 删除失败:", error.message);
    res.status(500).json({ error: { message: "删除模板失败" } });
  }
});

module.exports = router;
