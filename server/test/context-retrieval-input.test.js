"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const httpFetch = global.fetch;
const fixtureRoot = path.resolve(__dirname, "../../output/stage4");
fs.mkdirSync(fixtureRoot, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(fixtureRoot, "retrieval-input-test-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "retrieval-input-fixture-secret-with-at-least-32-characters";
process.env.STZH_LLM_ENCRYPTION_KEY = "retrieval-input-fixture-encryption-key-with-at-least-32-characters";
process.env.COZE_API_TOKEN = "";
process.env.COZE_BOT_ID = "";
const previousMode = process.env.STZH_CONTEXT_MODE;
process.env.STZH_CONTEXT_MODE = "enforce";
const app = require("../server-express.js");
const db = require("../db.js");

const task = "工业极简，留白构图";
const unrelated = "珊瑚礁水下生态摄影";
let server, base, owner, stranger, providerId, relevant, irrelevant, wires;

async function request(route, token, method = "GET", body) {
  const response = await httpFetch(base + route, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function memory(content, token = owner.token) {
  const created = await request("/api/studio/memories", token, "POST", { requestKey: randomUUID(), mode: "workflow", content });
  assert.equal(created.status, 201);
  const confirmed = await request(`/api/studio/memories/${created.body.item.id}/confirm`, token, "POST", { expectedRevision: created.body.item.revision });
  assert.equal(confirmed.status, 200);
  return confirmed.body.item;
}
async function session() {
  const id = `opc_workflow_${randomUUID()}`;
  assert.equal((await request("/api/opc/sessions", owner.token, "POST", { id, title: "检索边界测试" })).status, 200);
  return id;
}
async function planned(input, currentConstraints = {}) {
  const sessionId = await session(), runId = randomUUID();
  const plan = { version: 1, workflowId: "fixture", input, steps: [{ id: "first", name: "首步" }, { id: "next", name: "下一步" }], originalStepCount: 2,
    execution: { providerId, currentConstraints, excludedMemoryIds: [] } };
  const route = `/api/opc/sessions/${sessionId}/workflow-runs/${runId}`;
  assert.equal((await request(route + "/plan", owner.token, "POST", plan)).status, 201);
  return { sessionId, runId, route, currentConstraints };
}
function payload(run, index, content, hasPlan = true) {
  const stepId = i => hasPlan ? `${run.runId}:${i}:${i ? "next" : "first"}` : `step-${i}`;
  return { providerId, messages: [{ role: "user", content }], studioContext: {
    mode: "workflow", scope: { sessionId: run.sessionId }, currentConstraints: run.currentConstraints || {},
    // An HTTP caller must never choose the trusted retrieval query or its label.
    retrievalQuery: unrelated, retrievalBasis: "adapter_task_and_role",
    workflow: { runId: run.runId, workflowId: "fixture", stepId: stepId(index), stepIndex: index, previousStepIds: index ? [stepId(0)] : [] },
  } };
}
function selected(trace, expectedBasis) {
  assert.ok(trace.selected.some(item => item.id === relevant.id), "original user task should recall its own memory");
  assert.ok(!trace.selected.some(item => item.id === irrelevant.id), "reference text must not expand memory selection");
  assert.equal(trace.retrievalBasis, expectedBasis);
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = (await request("/api/auth/register", null, "POST", { username: "retrieval-owner", password: "test-password-123" })).body;
  stranger = (await request("/api/auth/register", null, "POST", { username: "retrieval-stranger", password: "test-password-123" })).body;
  const provider = await request("/api/model-providers", owner.token, "POST", { name: "检索传输夹具", protocol: "openai", baseUrl: "https://retrieval-input-fixture.invalid/v1", model: "fixture", apiKey: "synthetic-retrieval-key" });
  assert.equal(provider.status, 201);
  providerId = provider.body.provider.id;
  relevant = await memory(task);
  irrelevant = await memory(unrelated);
  await memory(task, stranger.token);
});
test.beforeEach(() => {
  wires = [];
  global.fetch = async (url, options) => {
    assert.equal(url, "https://retrieval-input-fixture.invalid/v1/chat/completions", "only the synthetic model transport is allowed");
    wires.push(JSON.parse(options.body));
    return Response.json({ choices: [{ message: { content: unrelated + "；仅为模拟产物" } }] });
  };
});
test.afterEach(() => { global.fetch = httpFetch; });
test.after(async () => {
  global.fetch = httpFetch;
  if (previousMode === undefined) delete process.env.STZH_CONTEXT_MODE; else process.env.STZH_CONTEXT_MODE = previousMode;
  await app.locals.researchRuntime?.stop();
  await app.locals.pluginService?.stop();
  await new Promise(resolve => server.close(resolve));
  db.close();
  assert.ok(path.resolve(dataDir).startsWith(fixtureRoot + path.sep));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("assistant uses the current user turn, preserving older references without recalling their memories", async () => {
  const messages = [{ role: "assistant", content: unrelated }, { role: "user", content: task }];
  const result = await request("/api/model/chat", owner.token, "POST", { providerId, messages, studioContext: { mode: "assistant", retrievalQuery: unrelated } });
  assert.equal(result.status, 200);
  selected(result.body.contextTrace, "current_input");
  assert.deepEqual(wires[0].messages.at(-1), messages.at(-1));
  assert.ok(wires[0].messages.some(message => message.role === "assistant" && message.content === unrelated));
});

test("legacy workflow excludes server-prepended predecessor outputs from the selection query", async () => {
  const run = { sessionId: await session(), runId: randomUUID() };
  assert.equal((await request("/api/model/chat", owner.token, "POST", payload(run, 0, "准备一个示例", false))).status, 200);
  const next = await request("/api/model/chat", owner.token, "POST", payload(run, 1, task, false));
  assert.equal(next.status, 200);
  selected(next.body.contextTrace, "workflow_current_input");
  assert.match(wires[1].messages.at(-1).content, /server_workflow_results/);
  assert.ok(wires[1].messages.at(-1).content.includes(unrelated));
  assert.ok(wires[1].messages.at(-1).content.endsWith(task));
});

test("saved original workflow input governs recall while references, replay and owner checks remain intact", async () => {
  const run = await planned({ topic: task }, { aspect: "9:16" });
  const body = payload(run, 0, `当前步骤：${task}\n外部检索参考：${unrelated}`);
  body.referenceNotes = ["外部参考未经事实核验。"];
  const first = await request("/api/model/chat", owner.token, "POST", body);
  assert.equal(first.status, 200);
  selected(first.body.contextTrace, "workflow_original_input");
  assert.equal(wires[0].messages.at(-1).content, body.messages[0].content);
  const replay = await request("/api/model/chat", owner.token, "POST", body);
  assert.deepEqual(replay.body, first.body);
  assert.equal(wires.length, 1);
  const next = await request("/api/model/chat", owner.token, "POST", payload(run, 1, `引用前序产物：${unrelated}`));
  assert.equal(next.status, 200);
  selected(next.body.contextTrace, "workflow_original_input");
  const sent = wires[1].messages.at(-1).content;
  assert.ok(sent.includes(unrelated));
  assert.ok(sent.includes(body.referenceNotes[0]));
  assert.equal((await request(run.route, stranger.token)).status, 404);
  assert.equal((await request(`/api/studio/memories/${relevant.id}`, stranger.token)).status, 404);
  assert.equal(wires.length, 2);
});

test("empty saved input cannot fall back to words in external references or model artifacts", async () => {
  for (const input of [{}, { topic: "  " }]) {
    const run = await planned(input);
    const result = await request("/api/model/chat", owner.token, "POST", payload(run, 0, unrelated));
    assert.equal(result.status, 200);
    assert.equal(result.body.contextTrace.selected.length, 0);
    assert.equal(result.body.contextTrace.retrievalBasis, "workflow_original_input");
    assert.equal(wires.at(-1).messages.at(-1).content, unrelated);
  }
});

test("frozen user creative parameters remain a valid retrieval basis when plan fields are blank", async () => {
  const run = await planned({}, { style: "工业极简", layout: "留白构图" });
  const result = await request("/api/model/chat", owner.token, "POST", payload(run, 0, unrelated));
  assert.equal(result.status, 200);
  selected(result.body.contextTrace, "workflow_original_input");
  assert.deepEqual(result.body.contextTrace.creativeState.constraints, run.currentConstraints);
  assert.equal(wires[0].messages.at(-1).content, unrelated);
});

test("production research adapter selects by owned task rather than source or plugin result text", async () => {
  const created = await request("/api/research/runs", owner.token, "POST", { styleName: "工业极简", useCase: "留白构图", providerId });
  assert.equal(created.status, 201);
  const run = created.body.run;
  const synthesisInput = { objective: run.plan.objective, input: run.input,
    sources: [{ id: "source-fixture", excerpt: unrelated }], pluginResults: [{ result: unrelated, trust: "untrusted" }] };
  let trace;
  await app.locals.researchRuntime.model(synthesisInput, {
    userId: owner.user.id, runId: run.runId, input: run.input, signal: new AbortController().signal,
    toolState: { status: "awaiting_plan_approval", mediaGenerationApproved: false }, onContextTrace: value => { trace = value; },
  });
  selected(trace, "research_original_input");
  assert.equal(wires[0].messages.at(-1).content, JSON.stringify(synthesisInput));
  assert.equal((await request(`/api/research/runs/${run.runId}`, owner.token)).body.run.status, "awaiting_plan_approval");
  assert.equal((await request(`/api/research/runs/${run.runId}`, stranger.token)).status, 404);
});

test("saved workflow retains restrictions in its last input field beyond 32000 characters",async()=>{
  const rejected=await memory("用户喜欢水墨和留白构图");
  const input={topic:"水墨和留白构图",...Object.fromEntries(Array.from({length:8},(_,i)=>[`detail${i}`,"background ".repeat(365)])),finalRestriction:"不要水墨，改为油画"};
  const length=Object.values(input).join("\n").trim().length;
  assert.ok(length>32000);
  const run=await planned(input);
  const result=await request("/api/model/chat",owner.token,"POST",payload(run,0,"请按保存的原始输入处理；这里附带留白参考。"));
  assert.equal(result.status,200,JSON.stringify(result.body));
  const trace=result.body.contextTrace;
  assert.ok(!trace.selected.some(item=>item.id===rejected.id));
  assert.equal(trace.retrieval.inputCharacters,length);
  assert.equal(trace.retrieval.restrictionCoverage,"full_input");
  assert.equal(trace.retrieval.recallTruncated,true);
  assert.equal(trace.retrievalBasis,"workflow_original_input");
});
