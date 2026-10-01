"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createStudioMemoryStore } = require("../studio-memory-store.js");
const { createStudioContextService } = require("../studio-context-service.js");

let db, store, context;
const priorMode = process.env.STZH_CONTEXT_MODE, priorBytes = process.env.STZH_CONTEXT_INPUT_BYTES;
test.beforeEach(() => {
  process.env.STZH_CONTEXT_MODE = "enforce";
  delete process.env.STZH_CONTEXT_INPUT_BYTES;
  db = new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); CREATE TABLE opc_messages(id TEXT,session_id TEXT,role TEXT);");
  store = createStudioMemoryStore(db); context = createStudioContextService(db);
});
test.afterEach(() => {
  db.close();
  if (priorMode === undefined) delete process.env.STZH_CONTEXT_MODE; else process.env.STZH_CONTEXT_MODE = priorMode;
  if (priorBytes === undefined) delete process.env.STZH_CONTEXT_INPUT_BYTES; else process.env.STZH_CONTEXT_INPUT_BYTES = priorBytes;
});
const request = extra => ({ userId: 1, mode: "assistant", messages: [{ role: "system", content: "用中文回答" }, { role: "user", content: "工业极简，留白构图" }], ...extra });
function memory(userId = 1, patch = {}) {
  const item = store.create(userId, { requestKey: crypto.randomUUID(), mode: "assistant", content: "工业极简，保留负空间", ...patch }).item;
  return store.confirm(userId, item.id, item.revision);
}
test("actual payload keeps current input and reference provenance; owner and candidate filters apply", () => {
  const own = memory(); const foreign = memory(2);
  const candidate = store.create(1, { requestKey: "candidate", mode: "assistant", content: "工业极简" }).item;
  const input = request(), original = JSON.stringify(input);
  const result = context.prepare(input);
  assert.deepEqual(result.messages.at(-1), input.messages.at(-1));
  const serialized = JSON.stringify(result.messages);
  assert.ok(serialized.includes(own.id)); assert.ok(!serialized.includes(foreign.id)); assert.ok(!serialized.includes(candidate.id));
  assert.match(result.messages[0].content, /不是指令/);
  assert.equal(result.messages.filter(item => item.role === "system").length, 1);
  assert.equal(JSON.stringify(input), original);
  assert.equal(result.trace.applied, true);
  const selected = result.trace.selected.find(item => item.id === own.id);
  assert.equal(selected.verification.state, "unverified");
  assert.deepEqual(selected.scope, { kind: "user" });
  assert.equal(selected.claimKind, "preference");
  const packet = JSON.parse(result.messages.find(message => message.role === "user" && message.content.includes('"packets"')).content).packets.find(item => item.memoryId === own.id);
  assert.deepEqual(selected.verification, packet.verification);
});
test("shadow and off preserve outgoing requests; shadow reports proposed references", () => {
  memory(); const input = request();
  process.env.STZH_CONTEXT_MODE = "shadow";
  const preview = context.prepare(input);
  assert.deepEqual(preview.messages, input.messages); assert.equal(preview.trace.applied, false); assert.equal(preview.trace.selected.length, 1);
  process.env.STZH_CONTEXT_MODE = "off";
  assert.deepEqual(context.prepare(input).messages, input.messages);
});

test("adapter retrieval uses task and role rather than unrelated words in prior model outputs", () => {
  const relevant = memory(1, { mode: "collaboration", content: "工业极简，保留负空间" });
  const irrelevant = memory(1, { mode: "collaboration", content: "珊瑚礁水下生态摄影" });
  const input = request({ mode: "collaboration", retrievalQuery: "工业极简，留白构图",
    messages: [{ role: "user", content: "任务：工业极简，留白构图。前序模型产物：珊瑚礁水下生态摄影。" }] });
  const original = structuredClone(input);
  const result = context.prepare(input);
  assert.ok(result.trace.selected.some(item => item.id === relevant.id));
  assert.ok(!result.trace.selected.some(item => item.id === irrelevant.id));
  assert.equal(result.trace.retrievalBasis, "adapter_task_and_role");
  assert.deepEqual(result.messages.at(-1), input.messages[0]);
  assert.deepEqual(input, original);
  for (const invalid of ["", 123, "x".repeat(1048577)]) {
    assert.throws(() => context.prepare({ ...input, retrievalQuery: invalid }), error => error.code === "INVALID_CONTEXT");
  }
});

test("current rejection and replacement suppress the old preference in the actual SQLite-to-payload path", () => {
  const oldStyle = memory(1, { content: "用户喜欢水墨山水" });
  const newStyle = memory(1, { content: "用户希望油画肖像" });
  for (const content of ["不要水墨，改为油画", "把水墨改成油画", "别再用水墨，换成油画", "不再使用水墨，改成油画"]) {
    const input = request({ messages: [{ role: "user", content }] });
    const result = context.prepare(input);
    assert.ok(result.trace.selected.some(item => item.id === newStyle.id), content);
    assert.ok(!result.trace.selected.some(item => item.id === oldStyle.id), content);
    const wire = JSON.stringify(result.messages);
    assert.ok(!wire.includes(oldStyle.id), content);
    assert.ok(wire.includes(newStyle.id), content);
    assert.deepEqual(result.messages.at(-1), input.messages[0]);
  }
});

test("all four modes exclude a mixed preference rejected after the recall prefix", () => {
  const own=memory(1,{content:"用户喜欢水墨和留白构图"});
  const content="水墨和留白构图。"+"背景说明。".repeat(1600)+"不要水墨，改为油画。";
  assert.ok(content.length>8000);
  for(const mode of ["coze","assistant","workflow","collaboration"]){
    const input=request({mode,messages:[{role:"user",content}]});
    const result=context.prepare(input);
    assert.ok(!result.trace.selected.some(item=>item.id===own.id),mode);
    assert.equal(result.trace.dropped.current_negation,1,mode);
    assert.deepEqual(result.messages.at(-1),input.messages[0]);
    assert.equal(result.trace.retrieval.inputCharacters,content.length);
    assert.equal(result.trace.retrieval.recallCharacters,8000);
    assert.equal(result.trace.retrieval.recallTruncated,true);
    assert.equal(result.trace.retrieval.restrictionCoverage,"full_input");
  }
});

test("owned run scope resolves project consistently for memory packets and project notes", () => {
  db.exec("CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO creative_projects VALUES('own',1),('other',1),('foreign',2); CREATE TABLE agent_runs(id TEXT PRIMARY KEY,user_id INTEGER,project_id TEXT); INSERT INTO agent_runs VALUES('collab',1,'own'),('foreign-run',2,'foreign'); CREATE TABLE research_runs(id TEXT PRIMARY KEY,user_id INTEGER,snapshot TEXT);");
  db.prepare("INSERT INTO research_runs VALUES(?,?,?)").run("research",1,JSON.stringify({input:{projectId:"own"}}));
  const notes = require("../studio-project-notes.js").createStudioProjectNotes(db);
  notes.save(1,"own",{expectedRevision:0,enabled:true,fields:{taskState:"草稿",conclusion:"OWN_NOTE",blocker:"",action:"",reference:""}});
  notes.save(2,"foreign",{expectedRevision:0,enabled:true,fields:{taskState:"",conclusion:"FOREIGN_NOTE",blocker:"",action:"",reference:""}});
  for (const [mode,runId] of [["collaboration","collab"],["workflow","research"]]) {
    const own = memory(1,{mode,scope:{kind:"project",projectId:"own"}});
    const other = memory(1,{mode,scope:{kind:"project",projectId:"other"}});
    const input = request({mode,scope:{runId}}), before = structuredClone(input);
    const result = context.prepare(input);
    assert.ok(result.trace.selected.some(item=>item.id===own.id));
    assert.ok(!result.trace.selected.some(item=>item.id===other.id));
    assert.equal(result.trace.projectNote.projectId,"own");
    assert.equal(result.trace.projectNote.included,true);
    assert.match(JSON.stringify(result.messages),/OWN_NOTE/);
    assert.ok(!JSON.stringify(result.messages).includes("FOREIGN_NOTE"));
    assert.deepEqual(input,before);
    assert.throws(()=>context.prepare(request({mode,scope:{runId,projectId:"other"}})),error=>error.status===404);
  }
  assert.throws(()=>context.prepare(request({mode:"collaboration",scope:{runId:"foreign-run"}})),error=>error.status===404);
});

test("operational requests receive only their mode's versioned mechanism as reference data", () => {
  for (const mode of ["coze", "assistant", "workflow", "collaboration"]) {
    const input = request({ mode, messages: [{ role: "user", content: "请求失败后能否重试？先检查实际状态。" }] });
    const result = context.prepare(input);
    assert.equal(result.trace.mechanism.id, `studio.${mode}.v1`);
    assert.equal(result.trace.mechanism.included, true);
    assert.equal(result.trace.mechanism.appliesTo.deploymentId, "unknown");
    const entry = result.messages.find(message => message.content.includes('"section":"Mechanism Reference"'));
    assert.equal(entry.role, "user");
    assert.equal(JSON.parse(entry.content).id, `studio.${mode}.v1`);
    assert.deepEqual(result.messages.at(-1), input.messages.at(-1));
    assert.ok(!result.messages[0].content.includes(`studio.${mode}.v1`));
    assert.ok(result.trace.inputBytes <= result.trace.ceiling);
  }
  assert.equal(context.prepare(request()).trace.mechanism, null);
});

test("mechanism reference preserves shadow/off and never displaces required content or splits boundaries", () => {
  const input = request({ messages: [{ role: "user", content: "失败后如何同步恢复？" }] });
  process.env.STZH_CONTEXT_MODE = "shadow";
  const preview = context.prepare(input);
  assert.equal(preview.trace.mechanism.included, true);
  assert.deepEqual(preview.messages, input.messages);
  process.env.STZH_CONTEXT_MODE = "off";
  assert.deepEqual(context.prepare(input).messages, input.messages);
  process.env.STZH_CONTEXT_MODE = "enforce";
  process.env.STZH_CONTEXT_INPUT_BYTES = "4096";
  const constrained = request({ messages: [{ role: "system", content: "规则".repeat(380) }, ...input.messages] });
  const result = context.prepare(constrained);
  assert.equal(result.trace.mechanism.included, false);
  assert.equal(result.trace.mechanism.reason, "budget");
  assert.ok(!result.messages.some(message => message.content.includes('"section":"Mechanism Reference"')));
  assert.deepEqual(result.messages.at(-1), input.messages.at(-1));
  assert.ok(result.messages[0].content.startsWith(constrained.messages[0].content));
  assert.equal(result.trace.removedHistoryMessages, 0);
  assert.ok(result.trace.inputBytes <= 4096);
});
test("disable, edit, delete and current explicit constraints are effective on the next request", () => {
  let item = memory(1, { slot: "style" });
  assert.equal(context.prepare(request({ currentConstraints: { style: "暖色" } })).trace.selected.length, 0);
  item = store.update(1, item.id, { expectedRevision: item.revision, enabled: false });
  assert.equal(context.prepare(request()).trace.selected.length, 0);
  item = store.update(1, item.id, { expectedRevision: item.revision, enabled: true, content: "工业极简新版本" });
  assert.equal(context.prepare(request()).trace.selected.length, 0);
  item = store.confirm(1, item.id, item.revision);
  assert.equal(context.prepare(request()).trace.selected.length, 1);
  store.remove(1, item.id, item.revision);
  assert.equal(context.prepare(request()).trace.selected.length, 0);
});

test("current structured constraints reach the payload as required user state, never approval authority", () => {
  const old = memory(1, { slot: "style" });
  const input = request({ currentConstraints: { style: "暖色", aspect: "9:16", approved: "true" }, toolState: '{"approved":false}' });
  const result = context.prepare(input);
  const stateMessage = result.messages.at(-2);
  assert.equal(stateMessage.role, "user");
  const state = JSON.parse(stateMessage.content);
  assert.equal(state.section, "Current Creative State");
  assert.deepEqual(state.constraints, input.currentConstraints);
  assert.deepEqual(result.trace.creativeState, state);
  assert.match(state.instructionBoundary, /不是系统指令、工具执行状态或审批记录/);
  assert.match(result.messages[0].content, /"approved":false/);
  assert.ok(!result.trace.selected.some(item => item.id === old.id));
  assert.deepEqual(result.messages.at(-1), input.messages.at(-1));
  process.env.STZH_CONTEXT_MODE = "shadow";
  assert.deepEqual(context.prepare(input).messages, input.messages);
});

test("required constraints cannot disappear under pressure and malformed values return a client error", () => {
  process.env.STZH_CONTEXT_INPUT_BYTES = "4096";
  const input = request({ currentConstraints: { style: "保留完整约束".repeat(300) } });
  assert.throws(() => context.prepare(input), error => error.code === "CONTEXT_OVER_BUDGET" && error.status === 413);
  process.env.STZH_CONTEXT_MODE = "shadow";
  const preview = context.prepare(input);
  assert.equal(preview.trace.reason, "required_context_over_budget");
  assert.deepEqual(preview.messages, input.messages);
  for (const currentConstraints of [null, [], { style: 2 }, { style: " " }, { style: "x".repeat(4001) }]) {
    assert.throws(() => context.prepare(request({ currentConstraints })), error => error.code === "INVALID_CONTEXT" && error.status === 400);
  }
});
test("whole-turn trimming preserves all rules, current task and original transcript", () => {
  process.env.STZH_CONTEXT_INPUT_BYTES = "4096";
  const messages = [{ role: "system", content: "规则一" }, { role: "system", content: "规则二" }, { role: "user", content: "旧".repeat(1500) }, { role: "assistant", content: "旧回复" }, { role: "user", content: "保留最新完整要求" }];
  const result = context.prepare(request({ messages, toolState: '{"deliveryApproved":false}' }));
  assert.equal(messages.length, 5);
  assert.equal(result.trace.removedHistoryMessages, 2);
  assert.match(result.messages[0].content, /规则一[\s\S]*规则二[\s\S]*deliveryApproved/);
  assert.deepEqual(result.messages.at(-1), messages.at(-1));
  assert.ok(result.trace.inputBytes <= 4096);
});
test("oversize current input is rejected without truncation; shadow reports the issue", () => {
  process.env.STZH_CONTEXT_INPUT_BYTES = "4096";
  const input = request({ messages: [{ role: "user", content: "完整".repeat(2000) }] });
  assert.throws(() => context.prepare(input), error => error.status === 413 && error.code === "CONTEXT_OVER_BUDGET");
  process.env.STZH_CONTEXT_MODE = "shadow";
  assert.equal(context.prepare(input).trace.reason, "required_context_over_budget");
  assert.deepEqual(context.prepare(input).messages, input.messages);
});
test("unowned session and a forged scope cannot reach the provider request", () => {
  db.exec("INSERT INTO opc_sessions VALUES('other',2)");
  assert.throws(() => context.prepare(request({ scope: { sessionId: "other" } })), error => error.status === 404);
  assert.throws(() => context.prepare(request({ scope: { ownerUserId: 2 } })), error => error.code === "INVALID_CONTEXT");
  assert.throws(() => context.prepare(request({ messages: [{ role: "assistant", content: "不是当前请求" }] })), error => error.code === "INVALID_CONTEXT");
});

test("off disables retrieval, not account/scope validation or the current-turn contract",()=>{
  memory();
  db.exec("INSERT INTO opc_sessions VALUES('opc_own',1),('opc_other',2); CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO creative_projects VALUES('project-own',1),('project-other',2)");
  process.env.STZH_CONTEXT_MODE="off";
  const before=db.prepare("SELECT COUNT(*) count FROM studio_memory_fts").get().count;
  const input=request({scope:{sessionId:"opc_own",projectId:"project-own"}});
  assert.deepEqual(context.prepare(input).messages,input.messages);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM studio_memory_fts").get().count,before);
  for(const scope of [{sessionId:"opc_other"},{projectId:"project-other"}]){
    assert.throws(()=>context.prepare(request({scope})),error=>error.status===404);
  }
  assert.throws(()=>context.prepare(request({scope:{ownerUserId:2}})),error=>error.code==="INVALID_CONTEXT");
  assert.throws(()=>context.prepare(request({mode:"invalid"})),error=>error.status===400);
  assert.throws(()=>context.prepare(request({messages:[{role:"assistant",content:"not current user"}]})),error=>error.code==="INVALID_CONTEXT");
});

test("provider-specific capacity reserves output and trims history against the complete wire payload", () => {
  const providerConfig = { protocol: "anthropic", model: "capacity-fixture", contextWindowTokens: 4096, maxOutputTokens: 1000, safetyMarginTokens: 1000 };
  const messages = [{ role: "user", content: "旧记录".repeat(500) }, { role: "assistant", content: "旧回答" }, { role: "user", content: "保留当前输入" }];
  const result = context.prepare(request({ providerConfig, messages }));
  assert.equal(result.trace.ceiling, 2096);
  assert.equal(result.trace.modelCapacity.maxOutputTokens, 1000);
  assert.equal(result.trace.capacitySource, "user_configuration");
  assert.equal(result.trace.removedHistoryMessages, 2);
  assert.equal(result.trace.inputBytes, require("../lib/provider-context.js").estimatePayload(providerConfig, result.messages));
  assert.ok(result.trace.inputBytes <= 2096);
  assert.deepEqual(result.messages.at(-1), messages.at(-1));
});

test("request exclusions remove references without mutating persistent memory or later requests", () => {
  const item=memory();
  const baseline=store.get(1,item.id);
  const excluded=context.prepare(request({excludedMemoryIds:[item.id,item.id,"unknown-memory"]}));
  assert.deepEqual(excluded.trace.selected,[]);
  assert.equal(excluded.trace.dropped.user_excluded,1);
  assert.ok(!JSON.stringify(excluded.messages).includes(item.id));
  assert.deepEqual(store.get(1,item.id),baseline);
  assert.equal(context.prepare(request()).trace.selected.length,1);
  process.env.STZH_CONTEXT_MODE="shadow";
  const input=request({excludedMemoryIds:[item.id]});
  const shadow=context.prepare(input);
  assert.deepEqual(shadow.messages,input.messages);assert.deepEqual(shadow.trace.selected,[]);
  assert.throws(()=>context.prepare(request({excludedMemoryIds:"all"})),error=>error.code==="INVALID_CONTEXT");
  assert.throws(()=>context.prepare(request({excludedMemoryIds:Array(101).fill(item.id)})),error=>error.code==="INVALID_CONTEXT");
});

test("excluded top-ranked memories do not prevent lower-ranked authorized matches from filling the request", () => {
  const preferred = Array.from({ length: 20 }, (_, index) => memory(1, { content: `工业极简，留白构图；偏好编号${index}`, importance: 1 }));
  const fallback = memory(1, { content: "工业极简，留白构图；可用备选", importance: 0 });
  const foreign = memory(2, { content: "工业极简，留白构图；其他账户", importance: 1 });
  const excludedMemoryIds = preferred.map(item => item.id);
  const baseline = context.prepare(request());
  assert.equal(baseline.trace.selected.length, 20);
  assert.ok(!baseline.trace.selected.some(item => item.id === fallback.id));
  const result = context.prepare(request({ excludedMemoryIds: [...excludedMemoryIds, foreign.id] }));
  assert.deepEqual(result.trace.selected.map(item => item.id), [fallback.id]);
  assert.equal(result.trace.dropped.user_excluded, 20);
  assert.ok(!JSON.stringify(result.messages).includes(foreign.id));
  assert.equal(store.get(1, preferred[0].id).enabled, true);
});

test("client-omitted history can recover an owned old qualification without changing stored messages", () => {
  db.exec("ALTER TABLE opc_messages ADD COLUMN content TEXT; ALTER TABLE opc_messages ADD COLUMN metadata TEXT; ALTER TABLE opc_messages ADD COLUMN timestamp INTEGER; INSERT INTO opc_sessions VALUES('older-session',1)");
  const insert = db.prepare("INSERT INTO opc_messages(id,session_id,role,content,timestamp) VALUES(?,'older-session',?,?,?)");
  for (let i = 0; i < 14; i++) insert.run(`old-${i}`, i % 2 ? "assistant" : "user", i === 0 ? "水墨只是待选方案，尚未批准生成。" : `旧消息${i}`, i);
  const before = db.prepare("SELECT * FROM opc_messages ORDER BY timestamp").all();
  const input = request({ scope: { sessionId: "older-session" }, historyOmitted: true, messages: [{role:"user",content:"水墨方案批准了吗？"}], toolState:'{"approved":false}' });
  const result = context.prepare(input);
  assert.equal(result.trace.removedHistoryMessages, 0);
  assert.equal(result.trace.clientHistoryOmitted, true);
  assert.ok(result.trace.summary.includedExcerpts > 0);
  assert.match(JSON.stringify(result.messages), /水墨只是待选方案，尚未批准生成/);
  assert.deepEqual(db.prepare("SELECT * FROM opc_messages ORDER BY timestamp").all(), before);
  assert.deepEqual(result.messages.at(-1), input.messages.at(-1));
  assert.throws(() => context.prepare({...input,userId:2}), error => error.status === 404);
  assert.throws(() => context.prepare({...input,historyOmitted:"true"}), error => error.code === "INVALID_CONTEXT");
});

test("wire-budget summary selection includes a qualification and answer together or omits both", () => {
  process.env.STZH_CONTEXT_INPUT_BYTES = "4096";
  db.exec("ALTER TABLE opc_messages ADD COLUMN content TEXT; ALTER TABLE opc_messages ADD COLUMN metadata TEXT; ALTER TABLE opc_messages ADD COLUMN timestamp INTEGER; INSERT INTO opc_sessions VALUES('paired-summary',1)");
  const insert = db.prepare("INSERT INTO opc_messages(id,session_id,role,content,timestamp) VALUES(?,'paired-summary',?,?,?)");
  insert.run("qualified","user","尚未批准："+"q".repeat(600),0);
  insert.run("answer","assistant","仅方案讨论："+"a".repeat(600),1);
  insert.run("recent-user","user","近期问题",2);
  insert.run("recent-answer","assistant","近期回答",3);
  const included=[];
  for (const length of [200,2500]) {
    const result=context.prepare(request({scope:{sessionId:"paired-summary"},historyOmitted:true,messages:[{role:"user",content:"尚未批准"+"x".repeat(length)}]}));
    const section=result.messages.find(message=>message.content.includes('"section":"Recent Conversation"'));
    const excerpts=section?JSON.parse(section.content).excerpts:[];
    const hasUser=excerpts.some(entry=>entry.messageId==="qualified");
    assert.equal(excerpts.some(entry=>entry.messageId==="answer"),hasUser);
    assert.ok(result.trace.inputBytes<=4096);
    included.push(hasUser);
  }
  assert.deepEqual(included,[true,false]);
});
