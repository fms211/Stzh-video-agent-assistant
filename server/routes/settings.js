const { Router } = require("express");
const db = require("../db.js");

const router = Router();

// === 获取用户设置 ===
router.get("/api/settings", (req, res) => {
  try {
    const userId = req.user.userId;
    let settings = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);

    // 如果没有设置记录，创建默认值
    if (!settings) {
      db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
      settings = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
    }

    // 解析 JSON 字段
    res.json({
      theme: settings.theme,
      language: settings.language,
      opcStyle: settings.opc_style,
      opcParams: settings.opc_params ? JSON.parse(settings.opc_params) : {},
    });
  } catch (error) {
    console.error("[Settings] 查询失败:", error.message);
    res.status(500).json({ error: { message: "查询设置失败" } });
  }
});

// === 更新用户设置 ===
router.put("/api/settings", (req, res) => {
  try {
    const userId = req.user.userId;
    const { theme, language, opcStyle, opcParams } = req.body;

    // 确保记录存在
    db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(userId);

    // 逐字段更新（只更新传入的字段）
    if (theme !== undefined) {
      db.prepare("UPDATE user_settings SET theme = ?, updated_at = datetime('now') WHERE user_id = ?").run(theme, userId);
    }
    if (language !== undefined) {
      db.prepare("UPDATE user_settings SET language = ?, updated_at = datetime('now') WHERE user_id = ?").run(language, userId);
    }
    if (opcStyle !== undefined) {
      db.prepare("UPDATE user_settings SET opc_style = ?, updated_at = datetime('now') WHERE user_id = ?").run(opcStyle, userId);
    }
    if (opcParams !== undefined) {
      db.prepare("UPDATE user_settings SET opc_params = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(opcParams), userId);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[Settings] 更新失败:", error.message);
    res.status(500).json({ error: { message: "更新设置失败" } });
  }
});

module.exports = router;
