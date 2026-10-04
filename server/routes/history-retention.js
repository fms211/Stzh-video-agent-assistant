"use strict";
const router = require("express").Router();
const db = require("../db.js");
const retention = require("../history-retention.js");
retention.initialize(db);
function handle(action) {
  return (req, res) => {
    try { res.json(action(req)); }
    catch (error) { res.status(error.status || 500).json({ error: { message: error.status ? error.message : "历史清理暂时不可用，未确认的记录不会从本地移除" } }); }
  };
}
router.get("/api/history-retention", handle(req => ({ policy: retention.policy(db, req.user.userId) })));
router.post("/api/history-retention", handle(req => ({ policy: retention.configure(db, req.user.userId, req.body) })));
router.post("/api/history-retention/sweep", handle(req => {
  const userId = req.user.userId;
  retention.registerCurrent(db, userId, req.body.clientId, req.body.sessionIds);
  const result = retention.sweep(db, userId);
  return { ...result, expiredIds: db.prepare("SELECT session_id FROM history_retention_tombstones WHERE user_id=?").all(userId).map(row => row.session_id) };
}));
module.exports = router;
