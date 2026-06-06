# 后端对接 Coze（/api/agent）配置说明

目标：你的后端负责保存 Coze 密钥并调用 Coze 智能体 API；前端只请求本项目的 `POST /api/agent`，再由本项目转发到你的后端，避免密钥暴露在浏览器。

补充：前端页面采用“全屏背景 + HUD”形态，用户在 HUD 的“生成控制台”里提交 prompt，结果以视频/图片形式回显；背景图片由页面底部 Dock 上传并接管为全屏环境基底（不影响接口协议）。

## 1. 你需要提供的后端接口

- `POST /api/agent`
- 请求体（本项目发送）：

```json
{ "prompt": "用户输入文本" }
```

- 推荐响应（前端可直接渲染）：
  - 视频：
    ```json
    { "requestId": "xxx", "createdAt": "2026-05-02T00:00:00Z", "videoUrl": "https://..." }
    ```
  - 图片：
    ```json
    { "requestId": "xxx", "createdAt": "2026-05-02T00:00:00Z", "imageUrls": ["https://...", "https://..."] }
    ```

## 2. 你需要填写的 Coze 配置（推荐用环境变量）

把敏感信息写到后端的环境变量或部署平台的 Secret 中，不要写死在代码里：

```bash
COZE_API_KEY="你的 Coze API Key/Token"
COZE_BOT_ID="你的智能体/Bot ID"
COZE_BASE_URL="https://api.coze.cn"
```

说明：
- `COZE_BASE_URL` 取决于你的 Coze 接入地址（国内/国际版可能不同）
- `COZE_API_KEY` 应仅在服务端可见

## 3. 本项目如何转发到你的后端（你需要填哪里）

在本项目（Next.js）中设置：
- `AGENT_BACKEND_URL`

推荐写到 `.env.local`（不要提交）：

```bash
AGENT_BACKEND_URL="https://your-backend.example.com"
```

转发目标：
- 本项目会转发到 `${AGENT_BACKEND_URL}/api/agent`

实现文件：
- [route.ts](file:///workspace/app/api/agent/route.ts)

## 4. Node/Express 最小示例（可直接改成你的实现）

下面示例仅展示“读取环境变量 → 调用 Coze → 返回前端需要的数据结构”的形态；你需要把具体的 Coze 调用 URL/参数按你实际的智能体 API 补齐。

```js
import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/api/agent", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) return res.status(400).json({ error: { message: "prompt 不能为空" } });

  const apiKey = process.env.COZE_API_KEY;
  const botId = process.env.COZE_BOT_ID;
  const baseUrl = process.env.COZE_BASE_URL ?? "https://api.coze.cn";
  if (!apiKey || !botId) return res.status(500).json({ error: { message: "缺少 COZE_API_KEY 或 COZE_BOT_ID" } });

  const requestId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  const createdAt = new Date().toISOString();

  const upstream = await fetch(`${baseUrl}/...你的智能体调用路径...`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      bot_id: botId,
      input: prompt,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return res.status(502).json({ error: { message: `Coze 调用失败：${upstream.status} ${text}` } });
  }

  const data = await upstream.json();

  res.json({
    requestId,
    createdAt,
    videoUrl: data?.video_url,
    imageUrls: data?.image_urls,
  });
});

app.listen(8080);
```

## 5. 部署建议

- 本项目与后端都建议使用 HTTPS（PWA 安装也更稳定）
- 生产环境中把密钥写入部署平台的 Secret/Environment Variables
- 后端建议增加：
  - 鉴权（避免任意人调用你的 Coze 额度）
  - 速率限制/并发控制
  - 日志与 requestId 追踪
