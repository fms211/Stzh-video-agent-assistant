import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";
import { corsMiddleware } from "./middleware/cors.ts";
import { loggerMiddleware } from "./middleware/logger.ts";
import { authMiddleware } from "./middleware/auth.ts";
import agentRouter from "./routes/agent.ts";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// === 中间件 ===
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// === 健康检查 ===
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// === API 路由（带鉴权） ===
app.use(authMiddleware);
app.use(agentRouter);

// === 404 ===
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Not found" } });
});

// === 全局错误处理 ===
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server] Unhandled error:", err.message);
  res.status(500).json({ error: { message: "Internal server error" } });
});

// === 启动 ===
app.listen(PORT, () => {
  console.log(`\n  ┌──────────────────────────────────────┐`);
  console.log(`  │  腾昇智和 Agent 后端已启动             │`);
  console.log(`  │  http://localhost:${PORT}               │`);
  console.log(`  │                                      │`);
  console.log(`  │  POST /api/agent      (JSON 响应)     │`);
  console.log(`  │  POST /api/agent/stream (SSE 响应)    │`);
  console.log(`  │  GET  /health         (健康检查)      │`);
  console.log(`  └──────────────────────────────────────┘\n`);
});
