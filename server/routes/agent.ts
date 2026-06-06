import { Router } from "express";
import type { Request, Response } from "express";
import {
  chatStream,
  collectStreamResult,
  extractMediaUrls,
} from "../services/coze.ts";
import type { AgentRequest, AgentResponse, ErrorResponse, HistoryItem } from "../types.ts";

const router = Router();

function generateId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * POST /api/agent — JSON 响应（兼容现有前端）
 *
 * 接收 { prompt, history? }，调用 Coze 工作流，等待完成后返回结果
 */
router.post("/api/agent", async (req: Request, res: Response) => {
  const requestId = generateId();
  const createdAt = new Date().toISOString();
  console.log(`[Agent] >>> 收到请求: requestId=${requestId}`);

  try {
    const { prompt, history } = req.body as AgentRequest;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      const errResp: ErrorResponse = { error: { message: "prompt 不能为空" } };
      return res.status(400).json(errResp);
    }

    console.log(`[Agent] 收到请求: requestId=${requestId}, prompt="${prompt.slice(0, 100)}..."`);

    // 调用 Coze（流式收集完整结果）
    const stream = await chatStream(prompt.trim(), history as HistoryItem[] | undefined);
    const result = await collectStreamResult(stream);

    console.log(`[Agent] Coze 响应: textLen=${result.fullText.length}, convId=${result.conversationId}`);

    // 从响应文本中提取媒体 URL
    const media = extractMediaUrls(result.fullText);

    const response: AgentResponse = {
      requestId,
      createdAt,
      ...media,
    };

    // 如果没有提取到视频/图片，把原始文本作为 raw 返回
    if (!media.videoUrl && !media.imageUrls) {
      console.log(`[Agent] 未提取到媒体 URL，返回原始文本`);
      (response as any).raw = { text: result.fullText };
    }

    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error(`[Agent] 错误: requestId=${requestId}, error=${message}`);
    const errResp: ErrorResponse = { error: { message } };
    return res.status(502).json(errResp);
  }
});

/**
 * POST /api/agent/stream — SSE 响应（供未来前端流式使用）
 *
 * 实时转发 Coze 的 SSE 事件给前端
 */
router.post("/api/agent/stream", async (req: Request, res: Response) => {
  try {
    const { prompt, history } = req.body as AgentRequest;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: { message: "prompt 不能为空" } });
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const stream = await chatStream(prompt.trim(), history as HistoryItem[] | undefined);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // 发送开始事件
    res.write(`event: start\ndata: ${JSON.stringify({ requestId: generateId() })}\n\n`);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // 转发 Coze 原始 SSE 事件
          res.write(`${trimmed}\n\n`);
        }
      }

      // 发送结束事件
      res.write(`event: done\ndata: {}\n\n`);
    } catch (streamError) {
      const msg = streamError instanceof Error ? streamError.message : "Stream error";
      res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    // 如果还没写入响应头，返回 JSON 错误
    if (!res.headersSent) {
      return res.status(502).json({ error: { message } });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  }
});

export default router;
