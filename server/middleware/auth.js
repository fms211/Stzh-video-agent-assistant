const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../routes/auth.js");

function attachUser(req, _res, next) {
  req.user = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user?.userId) {
    return res.status(401).json({ error: { message: "请先登录" } });
  }
  next();
}

module.exports = { attachUser, requireUser };
