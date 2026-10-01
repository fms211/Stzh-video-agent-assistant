"use strict";

// Disposable UI fixture. No production database, provider or task executor.
const express = require("../server/node_modules/express");
const path = require("node:path");
const app = express();
const user = { id: 98123, username: "coze-ui", displayName: "Coze布局验收（本地模拟）" };
const outputText = "### 本地模拟回复\n\n这是用于检查中文段落与链接的回复，不调用模型。\n\n- 第一项内容\n- 第二项内容\n\n```js\nconst example = 'a'.repeat(180);\nconsole.log(example);\n```\n\n| 项目 | 说明 |\n| --- | --- |\n| 排版 | 保持文字清晰 |\n\n[示例链接](https://example.com/)";
const records = new Map([
  ["coze-layout-history", { id: "coze-layout-history", title: "排版与旧状态文字验收", messages: [
    { id: "single-character", role: "user", text: "1" },
    { id: "normal-answer", role: "agent", text: outputText },
    { id: "long-chinese", role: "user", text: "这是包含较长中文与链接的布局验收内容。".repeat(14) + "\nhttps://example.com/" + "long-path-".repeat(24) },
    { id: "historic-status-text", role: "agent", text: "已排队，等待服务器调度\n\n这是一条已保存的普通回复，用来确认历史文字不会被当作当前任务状态。" },
  ] }],
  ["coze-layout-media", { id: "coze-layout-media", title: "已有媒体卡片验收（静态素材）", messages: [
    { id: "media-user", role: "user", text: "查看本地现有素材" },
    { id: "media-answer", role: "agent", text: "本地现有图标，仅检查结果卡片布局。", payload: { requestId: "existing-media", imageUrls: ["/icons/icon-192.png"] } },
  ] }],
]);
const tasks = new Map();
const control = { phase: "queued", stage: "正在整理分镜", memoryError: false, projectError: false, createDelayMs: 0, uploadDelayMs: 0 };
const counts = { simulatedTaskCreates: 0, simulatedUploads: 0, externalRequests: 0, modelCalls: 0, mediaGenerationCalls: 0 };
const projects = [{ id: "layout-project", name: "布局验收项目" }, { id: "long-project", name: "一个用于检查省略与窄屏排版的很长很长的项目名称" }];
const memory = [
  { id: "layout-memory", content: "使用中文，并保留清楚的段落层次。", scope: { kind: "user" }, enabled: true, status: "confirmed", claimKind: "preference", revision: 1 },
  { id: "layout-project-memory", content: "仅用于当前布局验收项目的参考记忆。", scope: { kind: "project", projectId: "layout-project" }, enabled: true, status: "confirmed", claimKind: "preference", revision: 1 },
];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.use(express.json());
app.get("/__fixture/status", (_req, res) => res.json({ ...counts, control, tasks: [...tasks.values()], fixture: "local_ui_only" }));
app.post("/__fixture/control", (req, res) => {
  for (const key of Object.keys(control)) if (Object.hasOwn(req.body, key)) control[key] = req.body[key];
  res.json({ control });
});
app.get("/health", (_req, res) => res.json({ ok: true, taskRuntime: { enabled: false } }));
app.post("/api/auth/login", (req, res) => req.body.username === user.username && req.body.password === "Coze-UI-Only!"
  ? res.json({ user, token: "local-coze-layout-fixture-token" }) : res.status(401).json({ error: { message: "仅接受本地验收账号" } }));
app.get("/api/auth/me", (_req, res) => res.json({ user }));
app.get("/api/conversations", (_req, res) => res.json({ conversations: [...records.values()].map(({ messages, ...record }) => ({ ...record, messageCount: messages.length, updated_at: new Date().toISOString() })) }));
app.post("/api/conversations", (req, res) => {
  const previous = records.get(req.body.id);
  records.set(req.body.id, { id: req.body.id, title: req.body.title, messages: previous?.messages || [] });
  res.json({ conversation: records.get(req.body.id) });
});
app.get("/api/conversations/:id/messages", (req, res) => res.json({ messages: records.get(req.params.id)?.messages || [] }));
app.get("/api/conversations/:id", (req, res) => res.json({ conversation: records.get(req.params.id) || { id: req.params.id }, messages: (records.get(req.params.id)?.messages || []).map(message => ({ ...message, content: message.text, is_error: message.isError, error_text: message.errorText })) }));
app.post("/api/conversations/:id/messages", (req, res) => {
  const record = records.get(req.params.id) || { id: req.params.id, title: "本地模拟会话" };
  record.messages = req.body.messages || []; records.set(req.params.id, record); res.json({ ok: true });
});
app.delete("/api/conversations/:id", (req, res) => { records.delete(req.params.id); res.json({ ok: true }); });
app.get("/api/creative-projects", (_req, res) => control.projectError ? res.status(503).json({ error: { message: "本地模拟：项目读取失败" } }) : res.json({ projects }));
app.get("/api/studio/memories", (_req, res) => control.memoryError ? res.status(503).json({ error: { message: "本地模拟：记忆读取失败" } }) : res.json({ items: memory, nextCursor: null }));
app.get("/api/studio/memories/context-status", (_req, res) => res.json({ rollout: "off" }));
app.get("/api/studio/projects/:id/notes", (_req, res) => res.json({ notes: [] }));
app.get("/api/studio/project-notes/:id", (req, res) => res.json({ item: { projectId: req.params.id, revision: 1, enabled: false,
  fields: { taskState: "本地布局验收", conclusion: "", blocker: "", action: "", reference: "" }, updatedAt: null, verification: "unverified" } }));
app.post("/api/attachments", async (req, res) => {
  req.resume(); counts.simulatedUploads++; await delay(control.uploadDelayMs);
  res.json({ attachments: [{ id: "local-attachment", name: "layout.txt", mime: "text/plain", size: 6 }] });
});
app.post("/api/tasks", async (req, res) => {
  counts.simulatedTaskCreates++; await delay(control.createDelayMs);
  const task = { id: `layout-task-${counts.simulatedTaskCreates}`, status: "queued", kind: req.body.kind, input: req.body.input, title: req.body.title, stage: "", progress: 0, origin: "desktop", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  tasks.set(task.id, task); res.json({ task, created: true });
});
app.get("/api/tasks/:id", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: { message: "任务不存在" } });
  res.json({ task: { ...task, status: control.phase, stage: control.stage, error: control.phase === "failed" ? "本地模拟：任务失败，未调用任何生成接口" : null,
    output: control.phase === "completed" ? { text: outputText } : null } });
});
app.get("/api/tasks", (_req, res) => res.json({ tasks: [...tasks.values()].map(task => ({ ...task, status: control.phase, updatedAt: new Date().toISOString() })), total: tasks.size, nextCursor: null }));
app.get("/api/opc/providers", (_req, res) => res.json({ providers: [] }));
app.get("/api/opc/roles", (_req, res) => res.json({ roles: [] }));
app.get("/api/opc/sessions", (_req, res) => res.json({ sessions: [] }));
app.get("/api/notifications", (_req, res) => res.json({ items: [], notifications: [], unreadCount: 0, nextCursor: null }));
app.get("/api/preferences", (_req, res) => res.json({ preferences: {} }));
app.get(/^\/api\/plugins\/.*(?:packages|contributions|quarantine|builds)$/, (_req, res) => res.json([]));
app.use("/api", (_req, res) => res.json({ items: [], projects: [], runs: [], notes: [], sessions: [], roles: [], providers: [], plugins: [], entries: [], tools: [], data: [], total: 0, nextCursor: null }));
app.use(express.static(path.resolve(__dirname, "../out")));
app.listen(18081, "127.0.0.1", () => console.log("Coze UI fixture: http://127.0.0.1:18081 (no external calls)"));
