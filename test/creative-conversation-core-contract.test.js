"use strict";

// 08-29 — Task 9: CreativeConversationCore 抽离契约
// core 保留可靠任务链路（uploadAttachments/createTask/getTask/idempotencyKey）；
// ChatFlow 变纯 wrapper（无 portal 无 composer）。

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

describe("CreativeConversationCore（规划 §5.2 拆解）", () => {
  const core = read("app/components/CreativeConversationCore.tsx");

  test("可靠任务链路保留：uploadAttachments/createTask/getTask/idempotencyKey", () => {
    assert.match(core, /uploadAttachments/);
    assert.match(core, /createTask/);
    assert.match(core, /getTask/);
    assert.match(core, /idempotencyKey/);
  });

  test("11 分钟轮询边界保留", () => {
    assert.match(core, /waitForTask/);
    assert.match(read("app/lib/wait-for-task.ts"), /11 \* 60 \* 1000|11\s*\*\s*60/);
  });

  test("会话持久化（saveMessages/loadMessages/loadSessions）保留", () => {
    assert.match(core, /saveMessages/);
    assert.match(core, /loadMessages/);
    assert.match(core, /loadSessions/);
  });

  test("原样导出（json/txt/markdown 三格式）", () => {
    assert.match(core, /exportFormat/);
    assert.match(core, /text\/markdown/);
    assert.match(core, /application\/json/);
    assert.match(core, /text\/plain/);
  });

  test("不再自行 portal 侧栏、不渲染 ChatInput（Composer 移出）", () => {
    // 源码级断言只检查 JSX 形态（<ChatInput / <LeftSidebar），注释/类型导入不触发
    assert.doesNotMatch(core, /<ChatInput/);
    assert.doesNotMatch(core, /<LeftSidebar/);
    assert.doesNotMatch(core, /createPortal\(/);
  });

  test("接收 collabPanel 注入（由 Workspace 层组装）", () => {
    assert.match(core, /collabPanel/);
  });

  test("draft/insertFragment 接线（Composer 协调）", () => {
    assert.match(core, /insertFragment/);
    assert.match(core, /onDraftChange|draft/);
  });
});

describe("ChatFlow 变兼容 wrapper", () => {
  const chatflow = read("app/components/ChatFlow.tsx");

  test("不再包含 submitPrompt 任务链路主体（已移至 core）", () => {
    assert.doesNotMatch(chatflow, /idempotencyKey/);
  });

  test("转发到 CreativeConversationCore", () => {
    assert.match(chatflow, /CreativeConversationCore/);
  });
});
