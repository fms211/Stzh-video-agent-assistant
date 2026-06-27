// 云服务器启动入口
// 用法: node start.js

require("dotenv").config({ path: __dirname + "/.env.local" });

const app = require("./server-express.js");
const PORT = Number(process.env.PORT) || 80;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  腾昇智和 · Video Workspace`);
  console.log  (`  监听: http://0.0.0.0:${PORT}`);
  console.log  (`  鉴权: ${process.env.API_SECRET_KEY ? "已启用" : "未启用"}\n`);
});
