// 云服务器启动入口
// 用法: node start.js

require("dotenv").config({ path: __dirname + "/.env.local" });

const app = require("./app.js");
const { attachRealtime } = require("./realtime.js");
const db = require("./db.js");
const { startScheduler } = require("./scheduler.js");
const PORT = Number(process.env.PORT) || 80;

// 僵尸任务回收：worker 心跳超时自动 requeue（每 30s 检查，60s 阈值）
db.startStaleReaper(30, 60);
// 定时任务调度器：到期任务推送桌面接手（每 15s 检查）
startScheduler(15);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  腾昇智和 · Video Workspace`);
  console.log  (`  监听: http://0.0.0.0:${PORT}`);
  console.log  (`  鉴权: ${process.env.API_SECRET_KEY ? "已启用" : "未启用"}\n`);
});
attachRealtime(server);
