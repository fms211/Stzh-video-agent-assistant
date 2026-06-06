import type {
  CozeChatRequest,
  CozeChatResponse,
  CozeMessageData,
  CozeSSEData,
  CozeStreamResult,
  HistoryItem,
} from "../types.ts";

function getConfig() {
  return {
    token: process.env.COZE_API_TOKEN!,
    botId: process.env.COZE_BOT_ID!,
    userId: process.env.COZE_USER_ID || "stzh_user",
    baseUrl: process.env.COZE_BASE_URL || "https://api.coze.cn",
  };
}

function buildMessages(prompt: string, history?: HistoryItem[]) {
  const messages: { role: "user" | "assistant"; content: string; content_type: "text" }[] = [];

  if (history && history.length > 0) {
    const recent = history.slice(-20);
    for (const msg of recent) {
      if (msg.role === "user" && msg.text) {
        messages.push({ role: "user", content: msg.text, content_type: "text" });
      } else if (msg.role === "agent" && msg.text) {
        messages.push({ role: "assistant", content: msg.text, content_type: "text" });
      }
    }
  }

  messages.push({ role: "user", content: prompt, content_type: "text" });
  return messages;
}

/**
 * 流式调用：返回可读流，逐事件推送
 */
export async function chatStream(
  prompt: string,
  history?: HistoryItem[]
): Promise<ReadableStream<Uint8Array>> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/v3/chat`;
  const body: CozeChatRequest = {
    bot_id: cfg.botId,
    user_id: cfg.userId,
    stream: true,
    auto_save_history: true,
    additional_messages: buildMessages(prompt, history),
  };

  console.log(`[Coze] 请求: ${url}, bot=${cfg.botId}, stream=true`);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  console.log(`[Coze] 响应: ${resp.status}, content-type=${resp.headers.get("content-type")}`);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Coze API error: ${resp.status} ${text}`);
  }

  if (!resp.body) {
    throw new Error("Coze API: no response body for streaming");
  }

  return resp.body;
}

/**
 * 解析 SSE 事件流，返回完整结果
 */
export async function collectStreamResult(
  stream: ReadableStream<Uint8Array>
): Promise<CozeStreamResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let conversationId: string | undefined;
  let chatId: string | undefined;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // event:conversation.xxx 或 event: conversation.xxx
        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        // data:{...} 或 data: {...}
        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();

          try {
            const data: CozeSSEData = JSON.parse(dataStr);

            if (data.conversation_id) conversationId = data.conversation_id;
            if (data.id && !chatId) chatId = data.id;

            // 收集 assistant 的 answer 内容（delta 事件）
            if (
              currentEvent === "conversation.message.delta" &&
              data.role === "assistant" &&
              data.type === "answer" &&
              data.content
            ) {
              fullText += data.content;
            }

            // message.completed 事件中有完整内容
            if (
              currentEvent === "conversation.message.completed" &&
              data.role === "assistant" &&
              data.type === "answer" &&
              data.content
            ) {
              fullText = data.content;
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log(`[Coze] 解析完成: textLen=${fullText.length}, convId=${conversationId}`);
  return { fullText, conversationId, chatId };
}

/**
 * 从 Coze 响应文本中提取 videoUrl / imageUrls
 */
export function extractMediaUrls(text: string): {
  videoUrl?: string;
  imageUrls?: string[];
} {
  const result: { videoUrl?: string; imageUrls?: string[] } = {};

  // 尝试解析为 JSON
  try {
    const json = JSON.parse(text);
    if (json.videoUrl) result.videoUrl = json.videoUrl;
    if (json.video_url) result.videoUrl = json.video_url;
    if (Array.isArray(json.imageUrls)) result.imageUrls = json.imageUrls;
    if (Array.isArray(json.image_urls)) result.imageUrls = json.image_urls;
    if (result.videoUrl || result.imageUrls) return result;
  } catch {
    // 不是 JSON，继续用正则
  }

  // 正则提取视频 URL
  const videoMatch = text.match(/https?:\/\/[^\s"'<>]+\.(mp4|mov|avi|webm)/i);
  if (videoMatch) {
    result.videoUrl = videoMatch[0];
  }

  // 正则提取图片 URL
  const imageMatches = text.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp|gif)/gi);
  if (imageMatches && imageMatches.length > 0) {
    result.imageUrls = [...new Set(imageMatches)];
  }

  return result;
}
