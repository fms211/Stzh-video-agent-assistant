"use strict";

function parseInput(value) {
  if (value == null) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("任务输入不是有效 JSON");
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || new DOMException("Aborted", "AbortError");
  }
}

function createVideoGenerateExecutor(options = {}) {
  const { agentService, attachmentService } = options;
  if (!agentService || typeof agentService.generate !== "function") {
    throw new TypeError("video.generate 执行器缺少 Agent Service");
  }
  if (!attachmentService || typeof attachmentService.resolveForTask !== "function") {
    throw new TypeError("video.generate 执行器缺少附件服务");
  }

  return async function executeVideoGenerate(task, context = {}) {
    if (task?.kind !== "video.generate") {
      throw new Error(`不支持的任务类型：${task?.kind || "unknown"}`);
    }
    const signal = context.signal;
    throwIfAborted(signal);
    await context.reportProgress?.(5, "正在校验生成参数");
    const input = parseInput(task.input);
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) throw new Error("prompt 不能为空");
    if (prompt.length > 5000) throw new Error("prompt 过长（最多 5000 字符）");
    const attachmentIds = input.attachmentIds == null ? [] : input.attachmentIds;
    if (!Array.isArray(attachmentIds)) throw new Error("attachmentIds 必须是数组");

    await context.reportProgress?.(15, "正在解析任务附件");
    const attachments = await attachmentService.resolveForTask(
      task.user_id,
      task.id,
      attachmentIds
    );
    throwIfAborted(signal);
    await context.reportProgress?.(25, "正在调用 Agent 生成");

    const result = await agentService.generate({
      accountId: task.user_id,
      prompt,
      history: Array.isArray(input.history) ? input.history : [],
      historyOmitted: input.historyOmitted,
      currentConstraints: input.currentConstraints,
      excludedMemoryIds: input.excludedMemoryIds,
      projectId: input.projectId,
      conversationId: input.conversationId || null,
      attachments,
      signal,
      onProgress: async (event = {}) => {
        const upstream = Math.max(0, Math.min(100, Number(event.progress) || 0));
        const progress = Math.min(90, 25 + Math.round(upstream * 0.65));
        await context.reportProgress?.(progress, "Agent 正在生成", {
          upstreamStage: event.stage || "",
        });
      },
      onDelta: async (content) => {
        await context.reportProgress?.(75, "Agent 正在生成", { textDelta: content });
      },
    });
    throwIfAborted(signal);
    await context.reportProgress?.(95, "正在整理生成结果");
    return {
      text: typeof result.text === "string" ? result.text : "",
      ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
      imageUrls: Array.isArray(result.imageUrls) ? result.imageUrls : [],
      conversationId: result.conversationId || null,
      chatId: result.chatId || null,
      followUps: Array.isArray(result.followUps) ? result.followUps : [],
      ...(result.contextTrace ? { contextTrace: result.contextTrace } : {}),
      ...(Array.isArray(result.warnings) && result.warnings.length ? { warnings: result.warnings } : {}),
    };
  };
}

module.exports = { createVideoGenerateExecutor, parseInput };
