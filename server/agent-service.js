"use strict";

const fs = require("node:fs");
const { prepareCozeHistory } = require("../shared/coze-history.cjs");

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>()[\]]+?\.(?:mp4|mov|avi|webm|jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>()[\]]*)?/gi;
const VIDEO_RE = /\.(?:mp4|mov|avi|webm)(?:\?|$)/i;

class AgentServiceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "AgentServiceError";
    this.status = options.status;
    this.code = options.code;
    this.upstreamCode = options.upstreamCode;
  }
}

function validatePrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new AgentServiceError("prompt 不能为空", { status: 400, code: "INVALID_PROMPT" });
  }
  const normalized = prompt.trim();
  if (normalized.length > 5000) {
    throw new AgentServiceError("prompt 过长（最多 5000 字符）", {
      status: 400,
      code: "PROMPT_TOO_LONG",
    });
  }
  return normalized;
}

function buildTextHistory(history) {
  return prepareCozeHistory(history).history;
}

function extractMediaUrls(text) {
  const result = { imageUrls: [] };
  const normalized = typeof text === "string" ? text.trim() : "";
  if (!normalized) return result;
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalized);
      const videoUrl = parsed.videoUrl || parsed.video_url || parsed.output_video;
      const imageUrls = parsed.imageUrls || parsed.image_urls || parsed.output_img;
      if (typeof videoUrl === "string") result.videoUrl = videoUrl;
      if (Array.isArray(imageUrls)) {
        result.imageUrls.push(...imageUrls.filter((url) => typeof url === "string"));
      }
    } catch {
      // 普通文本继续按 URL 提取。
    }
  }
  const matches = normalized.match(MEDIA_URL_RE) || [];
  for (const url of matches) {
    if (VIDEO_RE.test(url)) {
      if (!result.videoUrl) result.videoUrl = url;
    } else if (!result.imageUrls.includes(url)) {
      result.imageUrls.push(url);
    }
  }
  return result;
}

function parseSseBlock(block) {
  let event = "message";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    if (field === "data") dataLines.push(value);
  }
  return { event, data: dataLines.join("\n") };
}

async function* readSse(body, signal) {
  if (!body) throw new AgentServiceError("Coze API 未返回响应流");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const abortReader = () => {
    reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", abortReader, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (block) yield parseSseBlock(block);
        match = /\r?\n\r?\n/.exec(buffer);
      }
      if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    }
    if (buffer.trim()) yield parseSseBlock(buffer);
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
  } finally {
    signal?.removeEventListener("abort", abortReader);
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function createOperationSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(
    parentSignal.reason || new DOMException("Aborted", "AbortError")
  );
  if (parentSignal?.aborted) forwardAbort();
  else parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Agent 请求超时", "TimeoutError"));
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}

function failureMessage(data, fallback) {
  return data?.last_error?.msg
    || data?.last_error?.message
    || data?.error?.message
    || data?.msg
    || data?.message
    || fallback;
}

class AgentService {
  constructor(options = {}) {
    if (typeof options.fetchImpl !== "function") {
      throw new TypeError("fetchImpl 必须是函数");
    }
    this.fetchImpl = options.fetchImpl;
    this.baseUrl = String(options.baseUrl || "").replace(/\/+$/, "");
    this.token = String(options.token || "");
    this.botId = String(options.botId || "");
    this.userId = String(options.userId || "");
    this.timeoutMs = Math.max(1, Number(options.timeoutMs) || 10 * 60 * 1000);
    this.cancelTimeoutMs = Math.max(1, Number(options.cancelTimeoutMs) || 3000);
    if (!this.baseUrl || !this.token || !this.botId || !this.userId) {
      throw new TypeError("Agent Service 缺少 baseUrl、token、botId 或 userId");
    }
  }

  async uploadAttachment(attachment, signal) {
    if (!attachment || typeof attachment.path !== "string") {
      throw new AgentServiceError("附件解析结果无效", { code: "INVALID_ATTACHMENT" });
    }
    const bytes = await fs.promises.readFile(attachment.path);
    const form = new FormData();
    const mimeType = String(attachment.mimeType || "application/octet-stream");
    const name = String(attachment.name || "attachment");
    form.append("file", new Blob([bytes], { type: mimeType }), name);
    const response = await this.fetchImpl(`${this.baseUrl}/v1/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
      signal,
    });
    if (!response.ok) {
      throw new AgentServiceError(`Coze 文件上传失败（HTTP ${response.status}）`, {
        status: response.status,
        code: "UPLOAD_FAILED",
      });
    }
    const payload = await response.json().catch(() => null);
    const fileId = payload?.data?.id;
    if (!fileId) throw new AgentServiceError("Coze 文件上传响应缺少 file_id", { code: "UPLOAD_FAILED" });
    return {
      fileId: String(fileId),
      type: mimeType.toLowerCase().startsWith("image/") ? "image" : "file",
    };
  }

  async cancelRemote(conversationId, chatId) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException("远端取消超时", "TimeoutError"));
    }, this.cancelTimeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v3/chat/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          chat_id: chatId,
        }),
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status };
    } catch (error) {
      // best effort：本地取消语义不能被远端取消失败覆盖。
      return { ok: false, error: error instanceof Error ? error.name : "cancel_failed" };
    } finally {
      clearTimeout(timer);
    }
  }

  async generate(options = {}) {
    const prompt = validatePrompt(options.prompt);
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];
    const operation = createOperationSignal(options.signal, this.timeoutMs);
    let chatId = null;
    let conversationId = String(options.conversationId || "").trim() || null;
    let cancelAttempted = false;
    try {
      const uploaded = [];
      for (let index = 0; index < attachments.length; index += 1) {
        await Promise.resolve(options.onProgress?.({
          stage: "attachment.uploading",
          progress: Math.round(((index + 1) / attachments.length) * 20),
        }));
        uploaded.push(await this.uploadAttachment(attachments[index], operation.signal));
      }

      // Coze already stores history for a known remote conversation.
      const additionalMessages = Array.isArray(options.preparedMessages)
        ? options.preparedMessages.slice(0, -1).map(message => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content, content_type: "text" }))
        : conversationId ? [] : buildTextHistory(options.history);
      if (uploaded.length === 0) {
        additionalMessages.push({ role: "user", content: prompt, content_type: "text" });
      } else {
        additionalMessages.push({
          role: "user",
          content_type: "object_string",
          content: JSON.stringify([
            { type: "text", text: prompt },
            ...uploaded.map((item) => ({ type: item.type, file_id: item.fileId })),
          ]),
        });
      }

      const url = new URL(`${this.baseUrl}/v3/chat`);
      if (conversationId) {
        url.searchParams.set("conversation_id", conversationId);
      }
      const response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bot_id: this.botId,
          user_id: options.userId || this.userId,
          stream: true,
          auto_save_history: true,
          additional_messages: additionalMessages,
        }),
        signal: operation.signal,
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        throw new AgentServiceError(
          `Coze Chat 请求失败（HTTP ${response.status}）${detail ? `: ${detail}` : ""}`,
          { status: response.status, code: "CHAT_FAILED" }
        );
      }

      if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
        const payload = await response.json().catch(() => null);
        throw new AgentServiceError(
          payload?.code
            ? `Coze 返回业务错误（${payload.code}）：${failureMessage(payload, "请检查配置及权限")}`
            : "Coze 未返回预期的流式响应",
          { code: "UPSTREAM_ERROR", upstreamCode: payload?.code }
        );
      }

      const answers = new Map();
      let anonymousAnswerIndex = 0;
      let completed = false;
      let deltaText = "";
      const followUps = [];
      const toolMedia = { imageUrls: [] };
      const warnings = [];
      for await (const event of readSse(response.body, operation.signal)) {
        // Coze versions use both bare and JSON-quoted sentinels for `done`.
        // It is a transport terminator, never a chat object or proof of success.
        if (event.event === "done") break;
        if (!event.data || event.data === "[DONE]") continue;
        let data;
        try {
          data = JSON.parse(event.data);
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid event object");
        } catch {
          throw new AgentServiceError(`Coze SSE 数据格式无效（${event.event}）`, {
            code: "INVALID_SSE",
          });
        }
        if (event.event === "conversation.chat.created") {
          chatId = data.id || data.chat_id || chatId;
          conversationId = data.conversation_id || conversationId;
          await Promise.resolve(options.onProgress?.({
            stage: "chat.created",
            progress: 25,
            chatId,
            conversationId,
          }));
        } else if (
          event.event === "conversation.message.delta"
          && data.role === "assistant"
          && data.type === "answer"
          && typeof data.content === "string"
        ) {
          deltaText += data.content;
          await Promise.resolve(options.onDelta?.(data.content));
        } else if (event.event === "conversation.message.completed" && data.role === "assistant" && data.type === "answer") {
          if (typeof data.content === "string") {
            answers.set(data.id || `anonymous-${anonymousAnswerIndex++}`, data.content);
          }
        } else if (
          event.event === "conversation.message.completed"
          && data.type === "follow_up"
          && typeof data.content === "string"
        ) {
          followUps.push(data.content);
        } else if (event.event === "conversation.message.completed" && data.type === "tool_response") {
          const content = typeof data.content === "string" ? data.content : "";
          const media = extractMediaUrls(content);
          if (media.videoUrl) toolMedia.videoUrl = media.videoUrl;
          toolMedia.imageUrls.push(...media.imageUrls);
          let toolOutput;
          try { toolOutput = JSON.parse(content); } catch { /* Some tool failures are plain RPC error strings. */ }
          if (/model has been terminated/i.test(content)) {
            warnings.push({code:"UPSTREAM_MODEL_UNAVAILABLE",message:"Coze 工作流引用的模型已停止服务，请在扣子中更换模型并重新发布。"});
          } else if (toolOutput && Object.hasOwn(toolOutput, "output_video") && !toolOutput.output_video && !media.imageUrls.length) {
            warnings.push({code:"EMPTY_GENERATION_OUTPUT",message:"Coze 工作流未返回视频或图片，请检查下游节点输出。"});
          } else if (/^RPCError\b/.test(content)) {
            warnings.push({code:"UPSTREAM_TOOL_FAILED",message:"Coze 下游工具执行失败，请查看该次工作流的运行日志。"});
          }
        } else if (event.event === "conversation.chat.completed") {
          completed = true;
          chatId = data.id || data.chat_id || chatId;
          conversationId = data.conversation_id || conversationId;
          await Promise.resolve(options.onProgress?.({ stage: "chat.completed", progress: 100 }));
        } else if (event.event === "conversation.chat.requires_action") {
          throw new AgentServiceError("Coze 工作流正在等待外部工具回传，请检查智能体工具配置", { code: "ACTION_REQUIRED" });
        } else if (event.event === "conversation.chat.canceled" || event.event === "conversation.chat.cancelled") {
          throw new AgentServiceError("Coze 已取消本次生成", { code: "CHAT_CANCELLED" });
        } else if (event.event === "conversation.chat.failed" || event.event === "error") {
          throw new AgentServiceError(
            failureMessage(data, "Coze Chat 执行失败"),
            { code: "CHAT_FAILED" }
          );
        }
      }
      if (!completed) {
        throw new AgentServiceError("Coze 响应流提前结束，未收到生成完成确认", { code: "INCOMPLETE_STREAM" });
      }
      const text = [...answers.values()].filter(Boolean).join("\n\n") || deltaText;
      const media = extractMediaUrls(text);
      if (!media.videoUrl && toolMedia.videoUrl) media.videoUrl = toolMedia.videoUrl;
      media.imageUrls = [...new Set([...media.imageUrls, ...toolMedia.imageUrls])];
      if (warnings.length && !media.videoUrl && !media.imageUrls.length) {
        throw new AgentServiceError(warnings[0].message, { code: warnings[0].code });
      }
      return {
        ...media,
        text,
        followUps,
        conversationId,
        chatId,
        ...(warnings.length ? { warnings } : {}),
      };
    } catch (error) {
      if (operation.signal.aborted) {
        if (conversationId && chatId && !cancelAttempted) {
          cancelAttempted = true;
          const remoteCancel = await this.cancelRemote(conversationId, chatId);
          await Promise.resolve(options.onProgress?.({
            stage: remoteCancel.ok ? "remote.cancelled" : "remote.cancel_failed",
            progress: 100,
            remoteCancelOk: remoteCancel.ok,
            ...(remoteCancel.status ? { status: remoteCancel.status } : {}),
          })).catch(() => {});
        }
        throw operation.signal.reason || error;
      }
      throw error;
    } finally {
      operation.dispose();
    }
  }
}

function createConfiguredAgentService(options = {}) {
  const env = options.env || process.env;
  const token = String(env.COZE_API_TOKEN || "").trim();
  const botId = String(env.COZE_BOT_ID || "").trim();
  if (!token || !botId) {
    throw new AgentServiceError("Agent Service 缺少 COZE_API_TOKEN 或 COZE_BOT_ID", {
      status: 500,
      code: "MISSING_CONFIG",
    });
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new AgentServiceError("当前运行环境不支持 fetch", {
      status: 500,
      code: "MISSING_FETCH",
    });
  }
  return new AgentService({
    fetchImpl,
    baseUrl: String(env.COZE_BASE_URL || "https://api.coze.cn"),
    token,
    botId,
    userId: String(env.COZE_USER_ID || "stzh_user"),
    timeoutMs: options.timeoutMs || 10 * 60 * 1000,
    cancelTimeoutMs: options.cancelTimeoutMs || 3_000,
  });
}

module.exports = {
  AgentService,
  AgentServiceError,
  createConfiguredAgentService,
  buildTextHistory,
  extractMediaUrls,
  parseSseBlock,
  validatePrompt,
};
