"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function loadAgentService() {
  return require("../agent-service.js");
}

function responseFromTextChunks(chunks, options = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (options.keepOpen) {
        options.signal?.addEventListener("abort", () => {
          controller.error(options.signal.reason || new DOMException("Aborted", "AbortError"));
        }, { once: true });
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function splitArbitrarily(text) {
  const widths = [1, 7, 2, 19, 3, 5, 11, 4, 23];
  const chunks = [];
  let offset = 0;
  let index = 0;
  while (offset < text.length) {
    const width = widths[index % widths.length];
    chunks.push(text.slice(offset, offset + width));
    offset += width;
    index += 1;
  }
  return chunks;
}

function completedSse(answer = "生成完成") {
  return [
    "event: conversation.chat.created\n",
    "data: {\"id\":\"chat-basic\",\"conversation_id\":\"conv-basic\"}\n\n",
    "event: conversation.message.completed\n",
    `data: ${JSON.stringify({ role: "assistant", type: "answer", content: answer })}\n\n`,
    "event: conversation.chat.completed\n",
    "data: {\"id\":\"chat-basic\",\"conversation_id\":\"conv-basic\"}\n\n",
    "event: done\n",
    "data: [DONE]\n\n",
  ].join("");
}

function serviceWithResponse(response) {
  const { AgentService } = loadAgentService();
  return new AgentService({
    fetchImpl: async () => response,
    baseUrl: "https://coze.mock.invalid", token: "fake-token", botId: "fake-bot", userId: "fake-user",
  });
}

test("prepared Coze context goes on the wire once and preserves the complete current prompt", async () => {
  const { AgentService } = loadAgentService();
  let payload;
  const service = new AgentService({ baseUrl: "https://coze.mock.invalid", token: "fake", botId: "bot", userId: "fixture", fetchImpl: async (_url, options) => {
    payload = JSON.parse(options.body);
    return responseFromTextChunks([completedSse()]);
  } });
  await service.generate({ prompt: "current prompt", conversationId: "existing-remote", history: [{ role: "user", content: "must-not-repeat" }],
    preparedMessages: [{ role: "system", content: "reference boundary" }, { role: "user", content: '{"memory":"reference only"}' }, { role: "user", content: "current prompt" }],
  });
  assert.deepEqual(payload.additional_messages.map(message => message.content), ["reference boundary", '{"memory":"reference only"}', "current prompt"]);
  assert.ok(payload.additional_messages.every(message => message.content_type === "text" && message.role === "user"));
});

test("signed Markdown media URLs exclude closing link punctuation", () => {
  const { extractMediaUrls } = loadAgentService();
  const url = "https://media.mock.invalid/video.mp4?X-Tos-Signature=abc123&X-Tos-Expires=604800";
  assert.equal(extractMediaUrls(`[点击查看](${url})`).videoUrl, url);
  assert.deepEqual(extractMediaUrls("![封面](https://media.mock.invalid/cover.png?sig=xyz)").imageUrls, ["https://media.mock.invalid/cover.png?sig=xyz"]);
});

test("workflow media are retained even when the final assistant text omits the URLs", async () => {
  const tool = `event: conversation.message.completed\ndata: ${JSON.stringify({role:"assistant",type:"tool_response",content:JSON.stringify({output_video:"https://media.invalid/result.mp4",output_img:["https://media.invalid/shot.png"]})})}\n\n`;
  const result = await serviceWithResponse(responseFromTextChunks([tool,completedSse("制作完成")])).generate({prompt:"制作"});
  assert.equal(result.videoUrl,"https://media.invalid/result.mp4");
  assert.deepEqual(result.imageUrls,["https://media.invalid/shot.png"]);
});

test("empty workflow output cannot be disguised as completed by assistant reassurance", async () => {
  const tool = 'event: conversation.message.completed\ndata: {"role":"assistant","type":"tool_response","content":"{\\"output_video\\":\\"\\"}"}\n\n';
  await assert.rejects(serviceWithResponse(responseFromTextChunks([tool,completedSse("正在生成，稍后交付")])).generate({prompt:"制作"}), {code:"EMPTY_GENERATION_OUTPUT"});
});

test("terminated downstream model is surfaced even if the chat completes", async () => {
  const tool = `event: conversation.message.completed\ndata: ${JSON.stringify({role:"assistant",type:"tool_response",content:"RPCError BizStatusMessage:[[702192316] model has been terminated]"})}\n\n`;
  await assert.rejects(serviceWithResponse(responseFromTextChunks([tool,completedSse("请稍候")])).generate({prompt:"参考图"}), {code:"UPSTREAM_MODEL_UNAVAILABLE"});
});

test("a fallback asset preserves the original workflow warning", async () => {
  const tool = `event: conversation.message.completed\ndata: ${JSON.stringify({role:"assistant",type:"tool_response",content:"RPCError: model has been terminated"})}\n\n`;
  const result = await serviceWithResponse(responseFromTextChunks([tool,completedSse("替代视频 https://media.invalid/fallback.mp4")])).generate({prompt:"参考图"});
  assert.equal(result.warnings[0].code,"UPSTREAM_MODEL_UNAVAILABLE");
});

test("a truncated stream with partial answer is not a completed generation", async () => {
  const service = serviceWithResponse(responseFromTextChunks([
    'event: conversation.message.delta\ndata: {"role":"assistant","type":"answer","content":"尚未完成"}\n\n',
    'event: done\ndata: [DONE]\n\n',
  ]));
  await assert.rejects(service.generate({ prompt: "测试断流" }), { code: "INCOMPLETE_STREAM" });
});

test("Coze done event may carry a JSON string sentinel after chat completion", async () => {
  const sse = completedSse("联调连通").replace("data: [DONE]", 'data: "[DONE]"');
  const result = await serviceWithResponse(responseFromTextChunks([sse])).generate({ prompt: "验收" });
  assert.equal(result.text, "联调连通");
});

test("HTTP 200 JSON business errors remain failures with an upstream code", async () => {
  const service = serviceWithResponse(Response.json({ code: 4100, msg: "authentication is invalid" }));
  await assert.rejects(service.generate({ prompt: "测试业务错误" }), (error) => {
    assert.equal(error.code, "UPSTREAM_ERROR");
    assert.equal(error.upstreamCode, 4100);
    assert.match(error.message, /4100/);
    return true;
  });
});

test("all completed answer messages are retained once and their media are extracted", async () => {
  const answer = (id, content) => `event: conversation.message.completed\ndata: ${JSON.stringify({id, role: "assistant", type: "answer", content})}\n\n`;
  const service = serviceWithResponse(responseFromTextChunks([
    answer("a", "分镜与封面 https://mock.invalid/cover.png"),
    answer("a", "分镜与封面 https://mock.invalid/cover.png"),
    answer("b", "成片 https://mock.invalid/final.mp4"),
    'event: conversation.chat.completed\ndata: {"id":"c","conversation_id":"v"}\n\n',
  ]));
  const result = await service.generate({ prompt: "生成完整结果" });
  assert.equal(result.text, "分镜与封面 https://mock.invalid/cover.png\n\n成片 https://mock.invalid/final.mp4");
  assert.deepEqual(result.imageUrls, ["https://mock.invalid/cover.png"]);
  assert.equal(result.videoUrl, "https://mock.invalid/final.mp4");
});

for (const [event, code] of [["conversation.chat.requires_action", "ACTION_REQUIRED"], ["conversation.chat.canceled", "CHAT_CANCELLED"]]) {
  test(`${event} cannot be returned as success`, async () => {
    const service = serviceWithResponse(responseFromTextChunks([`event: ${event}\ndata: {"id":"chat-action"}\n\n`]));
    await assert.rejects(service.generate({ prompt: "测试非成功终态" }), { code });
  });
}

test("continuing a saved remote conversation does not resend local history", async () => {
  const { AgentService } = loadAgentService();
  let request;
  const service = new AgentService({
    baseUrl: "https://coze.mock.invalid", token: "fake-token", botId: "fake-bot", userId: "fake-user",
    fetchImpl: async (_url, options) => { request = JSON.parse(options.body); return responseFromTextChunks([completedSse()]); },
  });
  await service.generate({ prompt: "继续", conversationId: "remote-existing", history: [{role: "user", text: "旧消息"}] });
  assert.deepEqual(request.additional_messages, [{ role: "user", content: "继续", content_type: "text" }]);
});

test("Agent Service parses arbitrary SSE chunks, CRLF/LF and multiline data", async () => {
  const { AgentService } = loadAgentService();
  const requests = [];
  const deltas = [];
  const progress = [];
  const history = Array.from({ length: 25 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "agent",
    text: `history-${index}`,
  }));
  const sse = [
    "event: conversation.chat.created\r\n",
    "data: {\r\n",
    "data: \"id\":\"chat-123\",\"conversation_id\":\"conv-456\"}\r\n\r\n",
    "event: conversation.message.delta\n",
    "data: {\"role\":\"assistant\",\"type\":\"answer\",\"content\":\"前半\"}\n\n",
    "event: conversation.message.completed\r\n",
    "data: {\"role\":\"assistant\",\"type\":\"follow_up\",\"content\":\"继续优化吗？\"}\r\n\r\n",
    "event: conversation.message.completed\n",
    "data: {\"role\":\"assistant\",\"type\":\"answer\",\"content\":\"作品 https://mock.invalid/final.mp4 和 https://mock.invalid/cover.png\"}\n\n",
    "event: conversation.chat.completed\r\n",
    "data: {\"id\":\"chat-123\",\"conversation_id\":\"conv-456\"}\r\n\r\n",
    "event: done\n",
    "data: [DONE]\n\n",
  ].join("");
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return responseFromTextChunks(splitArbitrarily(sse));
  };
  const service = new AgentService({
    fetchImpl,
    baseUrl: "https://coze.mock.invalid/",
    token: "fake-token",
    botId: "fake-bot",
    userId: "fake-user",
    timeoutMs: 2_000,
  });

  const result = await service.generate({
    prompt: "  制作一条测试视频  ",
    history,
    onDelta: (content) => deltas.push(content),
    onProgress: (event) => progress.push(event),
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://coze.mock.invalid/v3/chat");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.bot_id, "fake-bot");
  assert.equal(body.user_id, "fake-user");
  assert.equal(body.additional_messages.length, 20);
  assert.deepEqual(body.additional_messages[0], {
    role: "user",
    content: "history-6",
    content_type: "text",
  });
  assert.deepEqual(body.additional_messages.at(-1), {
    role: "user",
    content: "制作一条测试视频",
    content_type: "text",
  });
  assert.deepEqual(deltas, ["前半"]);
  assert.ok(progress.some((event) => event.stage === "chat.created"));
  assert.equal(result.text, "作品 https://mock.invalid/final.mp4 和 https://mock.invalid/cover.png");
  assert.equal(result.videoUrl, "https://mock.invalid/final.mp4");
  assert.deepEqual(result.imageUrls, ["https://mock.invalid/cover.png"]);
  assert.deepEqual(result.followUps, ["继续优化吗？"]);
  assert.equal(result.chatId, "chat-123");
  assert.equal(result.conversationId, "conv-456");
  assert.equal("token" in result, false);
});

test("Agent Service uploads multipart files before an official object_string chat message", async () => {
  const { AgentService } = loadAgentService();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-agent-files-"));
  const imagePath = path.join(tempDir, "safe-image.png");
  const documentPath = path.join(tempDir, "safe-document.pdf");
  fs.writeFileSync(imagePath, Buffer.from("fake image bytes"));
  fs.writeFileSync(documentPath, Buffer.from("fake pdf bytes"));
  const calls = [];
  const service = new AgentService({
    baseUrl: "https://coze.mock.invalid",
    token: "fake-token",
    botId: "fake-bot",
    userId: "fake-user",
    fetchImpl: async (url, options) => {
      const target = String(url);
      if (target.endsWith("/v1/files/upload")) {
        const file = options.body.get("file");
        calls.push({ kind: "upload", file });
        return Response.json({ data: { id: `file-${calls.length}` } });
      }
      calls.push({ kind: "chat", url: target, body: JSON.parse(options.body) });
      return responseFromTextChunks([completedSse()]);
    },
  });

  try {
    const result = await service.generate({
      prompt: "组合素材",
      conversationId: "existing conversation",
      attachments: [
        { path: imagePath, name: "参考图.png", mimeType: "image/png" },
        { path: documentPath, name: "说明.pdf", mimeType: "application/pdf" },
      ],
    });

    assert.deepEqual(calls.map((call) => call.kind), ["upload", "upload", "chat"]);
    assert.equal(calls[0].file.name, "参考图.png");
    assert.equal(calls[0].file.type, "image/png");
    assert.equal(calls[1].file.name, "说明.pdf");
    assert.equal(calls[1].file.type, "application/pdf");
    assert.equal(calls[2].url, "https://coze.mock.invalid/v3/chat?conversation_id=existing+conversation");
    const current = calls[2].body.additional_messages.at(-1);
    assert.equal(current.role, "user");
    assert.equal(current.content_type, "object_string");
    assert.deepEqual(JSON.parse(current.content), [
      { type: "text", text: "组合素材" },
      { type: "image", file_id: "file-1" },
      { type: "file", file_id: "file-2" },
    ]);
    assert.equal(result.chatId, "chat-basic");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("abort after chat.created cancels upstream exactly once with independent signal", async () => {
  const { AgentService } = loadAgentService();
  const controller = new AbortController();
  const cancelCalls = [];
  const progressEvents = [];
  let createdResolve;
  const created = new Promise((resolve) => { createdResolve = resolve; });
  const service = new AgentService({
    baseUrl: "https://coze.mock.invalid",
    token: "fake-token",
    botId: "fake-bot",
    userId: "fake-user",
    cancelTimeoutMs: 500,
    fetchImpl: async (url, options) => {
      const target = String(url);
      if (target.endsWith("/v3/chat/cancel")) {
        cancelCalls.push({
          body: JSON.parse(options.body),
          signal: options.signal,
        });
        return new Response("{}", { status: 500 });
      }
      const stream = [
        "event: conversation.chat.created\n",
        "data: {\"id\":\"chat-abort\",\"conversation_id\":\"conv-abort\"}\n\n",
      ].join("");
      return responseFromTextChunks([stream], { keepOpen: true, signal: options.signal });
    },
  });

  const pending = service.generate({
    prompt: "需要取消",
    signal: controller.signal,
    onProgress: (event) => {
      progressEvents.push(event);
      if (event.stage === "chat.created") createdResolve();
    },
  });
  await created;
  controller.abort(new DOMException("用户取消", "AbortError"));

  await assert.rejects(pending, (error) => error?.name === "AbortError");
  assert.equal(cancelCalls.length, 1);
  assert.deepEqual(cancelCalls[0].body, {
    conversation_id: "conv-abort",
    chat_id: "chat-abort",
  });
  assert.equal(cancelCalls[0].signal.aborted, false);
  assert.ok(progressEvents.some((event) => event.stage === "remote.cancel_failed"));
});

test("abort uses the requested conversation id when chat.created omits it", async () => {
  const { AgentService } = loadAgentService();
  const controller = new AbortController();
  const cancelCalls = [];
  let createdResolve;
  const created = new Promise((resolve) => { createdResolve = resolve; });
  const service = new AgentService({
    baseUrl: "https://coze.mock.invalid",
    token: "fake-token",
    botId: "fake-bot",
    userId: "fake-user",
    fetchImpl: async (url, options) => {
      const target = String(url);
      if (target.endsWith("/v3/chat/cancel")) {
        cancelCalls.push(JSON.parse(options.body));
        return Response.json({});
      }
      const stream = [
        "event: conversation.chat.created\n",
        "data: {\"id\":\"chat-with-existing-conversation\"}\n\n",
      ].join("");
      return responseFromTextChunks([stream], { keepOpen: true, signal: options.signal });
    },
  });

  const pending = service.generate({
    prompt: "继续已有会话后取消",
    conversationId: "  existing-conversation  ",
    signal: controller.signal,
    onProgress: (event) => {
      if (event.stage === "chat.created") createdResolve();
    },
  });
  await created;
  controller.abort(new DOMException("用户取消", "AbortError"));

  await assert.rejects(pending, (error) => error?.name === "AbortError");
  assert.deepEqual(cancelCalls, [{
    conversation_id: "existing-conversation",
    chat_id: "chat-with-existing-conversation",
  }]);
});

test("abort before remote IDs never calls cancel endpoint", async () => {
  const { AgentService } = loadAgentService();
  const controller = new AbortController();
  let cancelCount = 0;
  const service = new AgentService({
    baseUrl: "https://coze.mock.invalid",
    token: "fake-token",
    botId: "fake-bot",
    userId: "fake-user",
    fetchImpl: async (url, options) => {
      if (String(url).endsWith("/v3/chat/cancel")) {
        cancelCount += 1;
        return Response.json({});
      }
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(
          options.signal.reason || new DOMException("Aborted", "AbortError")
        ), { once: true });
      });
    },
  });

  const pending = service.generate({ prompt: "提前取消", signal: controller.signal });
  controller.abort(new DOMException("用户取消", "AbortError"));
  await assert.rejects(pending, (error) => error?.name === "AbortError");
  assert.equal(cancelCount, 0);
});

test("upstream chat.failed becomes a readable business error", async () => {
  const { AgentService } = loadAgentService();
  const failed = [
    "event: conversation.chat.created\n",
    "data: {\"id\":\"chat-failed\",\"conversation_id\":\"conv-failed\"}\n\n",
    "event: conversation.chat.failed\n",
    "data: {\"last_error\":{\"msg\":\"mock quota exhausted\"}}\n\n",
  ].join("");
  const service = new AgentService({
    fetchImpl: async () => responseFromTextChunks([failed]),
    baseUrl: "https://coze.mock.invalid",
    token: "fake-token",
    botId: "fake-bot",
    userId: "fake-user",
  });

  await assert.rejects(
    service.generate({ prompt: "失败测试" }),
    /mock quota exhausted/
  );
});
