"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-agent-routes-test-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "agent-route-test-secret-that-is-longer-than-thirty-two-characters";
process.env.COZE_API_TOKEN = "fake-token-never-used";
process.env.COZE_BOT_ID = "fake-bot-never-used";
process.env.COZE_USER_ID = "fake-user-never-used";
process.env.COZE_BASE_URL = "https://no-network.invalid";

const nativeFetch = global.fetch;
global.fetch = async () => {
  throw new Error("legacy global fetch must not be used by injected route tests");
};

const app = require("../app.js");
const db = require("../db.js");
const { AttachmentService } = require("../attachment-service.js");

let server;
let baseUrl;

async function request(endpoint, options = {}) {
  const { token, ...fetchOptions } = options;
  const headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  if (typeof options.body === "string" && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  return nativeFetch(`${baseUrl}${endpoint}`, { ...fetchOptions, headers });
}

async function register(username) {
  const response = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: "secure-pass-123",
      displayName: username,
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  app.locals.attachmentService = new AttachmentService({ db, dataDir });
});

test.after(async () => {
  global.fetch = nativeFetch;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("JSON and SSE Agent routes share the injected core service", async () => {
  const account = await register("agent-route-owner");
  const calls = [];
  app.locals.agentService = {
    async generate(options) {
      calls.push(options);
      await options.onDelta?.("mock-delta");
      return {
        text: "mock-answer",
        videoUrl: "https://mock.invalid/video.mp4",
        imageUrls: [],
        followUps: ["继续吗"],
        conversationId: "conv-route",
        chatId: "chat-route",
      };
    },
  };

  const jsonResponse = await request("/api/agent", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ prompt: "JSON 请求", history: [], conversationId: "existing-route-conv" }),
  });
  assert.equal(jsonResponse.status, 200);
  const json = await jsonResponse.json();
  assert.equal(json.videoUrl, "https://mock.invalid/video.mp4");
  assert.equal(json.text, "mock-answer");
  assert.equal(json.conversationId, "conv-route");
  assert.equal(json.chatId, "chat-route");
  assert.ok(json.requestId);
  assert.ok(json.createdAt);

  const streamResponse = await request("/api/agent/stream", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ prompt: "SSE 请求", conversation_id: "existing-route-conv" }),
  });
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get("content-type"), /^text\/event-stream/);
  const streamText = await streamResponse.text();
  assert.match(streamText, /event: delta\ndata: \{"content":"mock-delta"\}/);
  assert.match(streamText, /event: follow_up/);
  assert.match(streamText, /event: done/);
  assert.match(streamText, /"chatId":"chat-route"/);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].prompt, "JSON 请求");
  assert.equal(calls[1].prompt, "SSE 请求");
  assert.equal(calls[0].conversationId, null, "本地会话标识不得直接发往 Coze");
  assert.equal(calls[1].conversationId, "conv-route", "流式入口应续接 JSON 入口已保存的远端会话");
  assert.equal(calls[0].userId, calls[1].userId);
});

test("SSE errors use an error event after headers are sent", async () => {
  const account = await register("agent-stream-error");
  app.locals.agentService = {
    async generate(options) {
      await options.onDelta("partial");
      throw new Error("mock stream failure");
    },
  };
  const response = await request("/api/agent/stream", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ prompt: "错误测试" }),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /event: delta/);
  assert.match(text, /event: error/);
  assert.match(text, /mock stream failure/);
});

test("client disconnect aborts the injected Agent request", async () => {
  const account = await register("agent-disconnect");
  const started = deferred();
  const aborted = deferred();
  app.locals.agentService = {
    async generate({ signal }) {
      started.resolve();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted.resolve(signal.reason);
          reject(signal.reason);
        }, { once: true });
      });
    },
  };

  const target = new URL(`${baseUrl}/api/agent/stream`);
  const client = http.request({
    hostname: target.hostname,
    port: target.port,
    path: target.pathname,
    method: "POST",
    headers: {
      authorization: `Bearer ${account.token}`,
      "content-type": "application/json",
    },
  });
  client.on("error", () => {});
  client.write(JSON.stringify({ prompt: "断连测试" }));
  client.end();
  await Promise.race([
    started.promise,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error("injected Agent service was not called")), 500)),
  ]);
  client.destroy();
  const reason = await Promise.race([
    aborted.promise,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error("disconnect did not abort upstream")), 500)),
  ]);
  assert.equal(reason?.name, "AbortError");
});

test("concurrency count returns to zero after failures", async () => {
  const account = await register("agent-concurrency");
  const gates = Array.from({ length: 5 }, () => deferred());
  let started = 0;
  app.locals.agentService = {
    async generate() {
      const gate = gates[started];
      started += 1;
      if (!gate) throw new Error("post-failure probe");
      return gate.promise;
    },
  };
  const requests = gates.map((_gate, index) => request("/api/agent", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ prompt: `并发-${index}` }),
  }));
  const deadline = Date.now() + 500;
  while (started < 5 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(started, 5, "five injected requests should be active");
  const limited = await request("/api/agent", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ prompt: "第六个请求" }),
  });
  assert.equal(limited.status, 429);
  for (const gate of gates) gate.reject(new Error("mock failure"));
  const failedResponses = await Promise.all(requests);
  assert.ok(failedResponses.every((response) => response.status === 502));

  const probe = await request("/api/agent", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({ prompt: "计数归零探针" }),
  });
  assert.equal(probe.status, 502);
  assert.equal(started, 6);
});

test("authenticated multipart upload returns descriptors and task binding is atomic", async () => {
  const owner = await register("attachment-owner");
  const stranger = await register("attachment-other");
  const anonymousForm = new FormData();
  anonymousForm.append("file", new Blob(["anonymous"], { type: "image/png" }), "anonymous.png");
  const anonymous = await request("/api/attachments", { method: "POST", body: anonymousForm });
  assert.equal(anonymous.status, 401);

  const form = new FormData();
  form.append("file", new Blob(["safe-image"], { type: "image/png" }), "../../unsafe.png");
  const uploaded = await request("/api/attachments", {
    method: "POST",
    token: owner.token,
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const uploadBody = await uploaded.json();
  assert.equal(uploadBody.attachments.length, 1);
  assert.deepEqual(Object.keys(uploadBody.attachments[0]).sort(), ["id", "mime", "name", "size"]);
  assert.equal(uploadBody.attachments[0].name, "unsafe.png");

  const created = await request("/api/tasks", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({
      kind: "video.generate",
      title: "带附件任务",
      input: { prompt: "使用附件" },
      attachmentIds: [uploadBody.attachments[0].id],
      idempotencyKey: "attachment-route-idempotent",
    }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.deepEqual(createdBody.task.input.attachmentIds, [uploadBody.attachments[0].id]);
  const row = db.prepare("SELECT task_id FROM task_attachments WHERE id = ?").get(uploadBody.attachments[0].id);
  assert.equal(row.task_id, createdBody.task.id);

  const repeated = await request("/api/tasks", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({
      kind: "video.generate",
      title: "带附件任务",
      input: { prompt: "使用附件" },
      attachmentIds: [uploadBody.attachments[0].id],
      idempotencyKey: "attachment-route-idempotent",
    }),
  });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).task.id, createdBody.task.id);

  const before = db.prepare("SELECT COUNT(*) count FROM tasks").get().count;
  const crossUser = await request("/api/tasks", {
    method: "POST",
    token: stranger.token,
    body: JSON.stringify({
      kind: "video.generate",
      title: "越权附件任务",
      input: { prompt: "越权" },
      attachmentIds: [uploadBody.attachments[0].id],
    }),
  });
  assert.equal(crossUser.status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM tasks").get().count, before);

  const missing = await request("/api/tasks", {
    method: "POST",
    token: owner.token,
    body: JSON.stringify({
      kind: "video.generate",
      title: "缺失附件任务",
      input: { prompt: "缺失" },
      attachmentIds: ["missing-attachment"],
    }),
  });
  assert.equal(missing.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM tasks").get().count, before);
});

test("task idempotency compares canonical immutable semantics before binding attachments", async () => {
  const account = await register("idem-canonical");
  const service = app.locals.attachmentService;
  const attachments = await service.saveBatch(account.user.id, [
    {
      originalname: "first.png",
      mimetype: "image/png",
      size: 5,
      buffer: Buffer.from("first"),
    },
    {
      originalname: "second.pdf",
      mimetype: "application/pdf",
      size: 6,
      buffer: Buffer.from("second"),
    },
    {
      originalname: "different.csv",
      mimetype: "text/csv",
      size: 9,
      buffer: Buffer.from("different"),
    },
  ]);
  const [first, second, different] = attachments;
  const idempotencyKey = "canonical-immutable-task";
  const baseBody = {
    kind: "video.generate",
    title: "规范化任务",
    input: { prompt: "相同提示词", params: { width: 1920, height: 1080 } },
    origin: "mobile",
    scheduledAt: "2030-01-02T03:04:05.000Z",
    attachmentIds: [first.id, second.id],
    idempotencyKey,
  };
  const created = await request("/api/tasks", {
    method: "POST",
    token: account.token,
    body: JSON.stringify(baseBody),
  });
  assert.equal(created.status, 201);
  const createdTask = (await created.json()).task;

  const canonicalRetry = await request("/api/tasks", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({
      ...baseBody,
      input: { params: { height: 1080, width: 1920 }, prompt: "相同提示词" },
      attachmentIds: [second.id, first.id],
    }),
  });
  assert.equal(canonicalRetry.status, 200);
  assert.equal((await canonicalRetry.json()).task.id, createdTask.id);

  const mismatches = [
    { kind: "image.generate" },
    { title: "不同标题" },
    { input: { prompt: "不同提示词", params: { width: 1920, height: 1080 } } },
    { origin: "desktop" },
    { scheduledAt: "2030-01-02T03:04:06.000Z" },
    { attachmentIds: [first.id, different.id] },
  ];
  for (const mismatch of mismatches) {
    const response = await request("/api/tasks", {
      method: "POST",
      token: account.token,
      body: JSON.stringify({ ...baseBody, ...mismatch }),
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "IDEMPOTENCY_PAYLOAD_MISMATCH");
  }
  assert.equal(
    db.prepare("SELECT task_id FROM task_attachments WHERE id = ?").get(different.id).task_id,
    null
  );
});

test("omitted and empty attachmentIds are equivalent for legacy idempotent tasks", async () => {
  const account = await register("idem-empty");
  const first = await request("/api/tasks", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({
      kind: "video.generate",
      title: "无附件任务",
      input: { prompt: "兼容旧输入" },
      idempotencyKey: "legacy-no-attachment-key",
    }),
  });
  assert.equal(first.status, 201);
  const taskId = (await first.json()).task.id;

  const repeated = await request("/api/tasks", {
    method: "POST",
    token: account.token,
    body: JSON.stringify({
      kind: "video.generate",
      title: "无附件任务",
      input: { prompt: "兼容旧输入", attachmentIds: [] },
      attachmentIds: [],
      idempotencyKey: "legacy-no-attachment-key",
    }),
  });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).task.id, taskId);
});

test("missing Agent env fails closed even when global fetch is wrapped", async () => {
  const account = await register("agent-missing-config");
  const previousService = app.locals.agentService;
  const previousFactory = app.locals.agentServiceFactory;
  const previousFetch = global.fetch;
  const previousToken = process.env.COZE_API_TOKEN;
  const previousBot = process.env.COZE_BOT_ID;
  let networkCalls = 0;
  delete app.locals.agentService;
  delete app.locals.agentServiceFactory;
  delete process.env.COZE_API_TOKEN;
  delete process.env.COZE_BOT_ID;
  global.fetch = async (...args) => {
    networkCalls += 1;
    return previousFetch(...args);
  };
  try {
    const response = await request("/api/agent", {
      method: "POST",
      token: account.token,
      body: JSON.stringify({ prompt: "不得访问网络" }),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error.code, "MISSING_CONFIG");
    assert.equal(networkCalls, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.COZE_API_TOKEN;
    else process.env.COZE_API_TOKEN = previousToken;
    if (previousBot === undefined) delete process.env.COZE_BOT_ID;
    else process.env.COZE_BOT_ID = previousBot;
    if (previousService === undefined) delete app.locals.agentService;
    else app.locals.agentService = previousService;
    if (previousFactory === undefined) delete app.locals.agentServiceFactory;
    else app.locals.agentServiceFactory = previousFactory;
  }
});
