"use strict";

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env.local") });

const app = require("./app.js");
const { attachRealtime } = require("./realtime.js");
const port = Number(process.env.PORT) || 8080;

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`腾昇智和服务已启动：http://0.0.0.0:${port}`);
});
attachRealtime(server);

server.on("error", (error) => {
  console.error("[Server] 启动失败:", error);
  process.exitCode = 1;
});

module.exports = server;
