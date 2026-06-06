const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db.js");

const JWT_SECRET = process.env.JWT_SECRET || "stzh-secret-key-change-in-production";
const router = Router();

// === 注册 ===
router.post("/api/auth/register", (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: { message: "用户名和密码不能为空" } });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: { message: "用户名长度 2-20 个字符" } });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: { message: "密码至少 6 个字符" } });
    }

    // 检查用户名是否已存在
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return res.status(409).json({ error: { message: "用户名已存在" } });
    }

    // 加密密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 插入用户
    const result = db.prepare(
      "INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)"
    ).run(username, hashedPassword, displayName || username);

    const userId = result.lastInsertRowid;

    // 生成 token
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "10y" });

    res.json({
      token,
      user: { id: userId, username, displayName: displayName || username },
    });
  } catch (error) {
    console.error("[Auth] 注册失败:", error.message);
    res.status(500).json({ error: { message: "注册失败" } });
  }
});

// === 登录 ===
router.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: { message: "用户名和密码不能为空" } });
    }

    // 查找用户
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
      return res.status(401).json({ error: { message: "用户名或密码错误" } });
    }

    // 比对密码
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: { message: "用户名或密码错误" } });
    }

    // 生成 token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "10y" });

    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name || user.username },
    });
  } catch (error) {
    console.error("[Auth] 登录失败:", error.message);
    res.status(500).json({ error: { message: "登录失败" } });
  }
});

// === 获取当前用户信息 ===
router.get("/api/auth/me", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: { message: "未登录" } });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db.prepare("SELECT id, username, display_name, created_at FROM users WHERE id = ?").get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: { message: "用户不存在" } });
    }

    res.json({
      user: { id: user.id, username: user.username, displayName: user.display_name || user.username, createdAt: user.created_at },
    });
  } catch (error) {
    res.status(401).json({ error: { message: "token 无效或已过期" } });
  }
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
