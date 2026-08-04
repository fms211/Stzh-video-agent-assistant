"use strict";

// 唯一的 Express 应用入口。
// Electron、独立服务与云端启动器都必须从这里加载，避免接口能力分叉。
module.exports = require("./server-express.js");
