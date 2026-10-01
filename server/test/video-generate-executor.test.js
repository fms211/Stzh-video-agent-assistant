"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function loadExecutor() {
  return require("../video-generate-executor.js");
}

function makeTask(overrides = {}) {
  return {
    id: "task-video-1",
    user_id: 42,
    kind: "video.generate",
    input: JSON.stringify({
      prompt: "生成一条产品短片",
      history: [{ role: "user", text: "历史消息" }],
      conversationId: "conv-existing",
      projectId: "project-fixture",
      currentConstraints: { aspect: "9:16", composition: "主体居中" },
      attachmentIds: ["attachment-1"],
    }),
    ...overrides,
  };
}

test("video.generate resolves bound attachments, reports stages and returns safe Agent output", async () => {
  const { createVideoGenerateExecutor } = loadExecutor();
  const calls = [];
  const stages = [];
  const attachmentService = {
    async resolveForTask(userId, taskId, attachmentIds) {
      calls.push({ kind: "resolve", userId, taskId, attachmentIds });
      return [{
        id: "attachment-1",
        name: "素材.png",
        mimeType: "image/png",
        path: "D:\\temporary-test-data\\attachments\\42\\safe.png",
      }];
    },
  };
  const agentService = {
    async generate(options) {
      calls.push({ kind: "generate", options });
      await options.onProgress({ stage: "uploading", progress: 35 });
      await options.onDelta("生成中");
      return {
        text: "已完成",
        videoUrl: "https://mock.invalid/video.mp4",
        imageUrls: ["https://mock.invalid/cover.png"],
        conversationId: "conv-remote",
        chatId: "chat-remote",
        followUps: ["调整节奏"],
      };
    },
  };
  const execute = createVideoGenerateExecutor({ agentService, attachmentService });
  const controller = new AbortController();

  const output = await execute(makeTask(), {
    signal: controller.signal,
    async reportProgress(progress, stage, partial) {
      stages.push({ progress, stage, partial });
    },
  });

  assert.deepEqual(calls[0], {
    kind: "resolve",
    userId: 42,
    taskId: "task-video-1",
    attachmentIds: ["attachment-1"],
  });
  assert.equal(calls[1].kind, "generate");
  assert.equal(calls[1].options.prompt, "生成一条产品短片");
  assert.equal(calls[1].options.accountId, 42);
  assert.deepEqual(calls[1].options.history, [{ role: "user", text: "历史消息" }]);
  assert.equal(calls[1].options.conversationId, "conv-existing");
  assert.equal(calls[1].options.projectId, "project-fixture");
  assert.deepEqual(calls[1].options.currentConstraints, { aspect: "9:16", composition: "主体居中" });
  assert.equal(calls[1].options.signal, controller.signal);
  assert.equal(calls[1].options.attachments[0].id, "attachment-1");
  assert.ok(stages.some((item) => item.stage.includes("校验")));
  assert.ok(stages.some((item) => item.stage.includes("附件")));
  assert.ok(stages.some((item) => item.stage.includes("生成")));
  assert.deepEqual(output, {
    text: "已完成",
    videoUrl: "https://mock.invalid/video.mp4",
    imageUrls: ["https://mock.invalid/cover.png"],
    conversationId: "conv-remote",
    chatId: "chat-remote",
    followUps: ["调整节奏"],
  });
  assert.equal(JSON.stringify(output).includes("temporary-test-data"), false);
});

test("executor rejects unsupported kind and missing prompt with readable errors", async () => {
  const { createVideoGenerateExecutor } = loadExecutor();
  const execute = createVideoGenerateExecutor({
    agentService: { generate: async () => ({}) },
    attachmentService: { resolveForTask: async () => [] },
  });
  const context = {
    signal: new AbortController().signal,
    reportProgress: async () => {},
  };

  await assert.rejects(
    execute(makeTask({ kind: "image.generate" }), context),
    /不支持的任务类型.*image\.generate/
  );
  await assert.rejects(
    execute(makeTask({ input: JSON.stringify({ prompt: "   " }) }), context),
    /prompt 不能为空/
  );
});

test("executor surfaces attachment and upstream errors without writing task state", async () => {
  const { createVideoGenerateExecutor } = loadExecutor();
  let agentCalls = 0;
  const resolveFailure = createVideoGenerateExecutor({
    attachmentService: {
      async resolveForTask() { throw new Error("附件已失效"); },
    },
    agentService: {
      async generate() { agentCalls += 1; return {}; },
    },
  });
  const context = {
    signal: new AbortController().signal,
    reportProgress: async () => {},
  };
  await assert.rejects(resolveFailure(makeTask(), context), /附件已失效/);
  assert.equal(agentCalls, 0);

  const upstreamFailure = createVideoGenerateExecutor({
    attachmentService: { async resolveForTask() { return []; } },
    agentService: { async generate() { throw new Error("mock upstream failed"); } },
  });
  await assert.rejects(upstreamFailure(makeTask({
    input: JSON.stringify({ prompt: "上游失败", attachmentIds: [] }),
  }), context), /mock upstream failed/);
});

test("executor preserves AbortError semantics", async () => {
  const { createVideoGenerateExecutor } = loadExecutor();
  const controller = new AbortController();
  let receivedSignal;
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  const execute = createVideoGenerateExecutor({
    attachmentService: { async resolveForTask() { return []; } },
    agentService: {
      async generate({ signal }) {
        receivedSignal = signal;
        startedResolve();
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    },
  });
  const pending = execute(makeTask({
    input: JSON.stringify({ prompt: "取消测试", attachmentIds: [] }),
  }), {
    signal: controller.signal,
    reportProgress: async () => {},
  });
  await started;
  controller.abort(new DOMException("任务取消", "AbortError"));

  await assert.rejects(pending, (error) => error?.name === "AbortError");
  assert.equal(receivedSignal, controller.signal);
});
