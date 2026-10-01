"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const { createStudioMemoryStore } = require("../studio-memory-store.js");

function fixture(t, handler) {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1), (2);");
  t.after(() => db.close());
  const { createAccountAgentService } = require("../account-agent-service.js");
  const calls = [];
  const service = { baseUrl: "https://coze.mock.invalid", botId: "bot-a", async generate(options) {
    calls.push(options);
    return handler ? handler(options, calls.length) : { text: "answer", conversationId: `remote-${calls.length}` };
  } };
  return { db, calls, service, create: (namespace) => createAccountAgentService({ db, service, namespace }) };
}

test("local UUID is not sent as a remote ID; next turn resumes the persisted Coze conversation", async (t) => {
  const { calls, create } = fixture(t);
  await create().generate({ accountId: 1, conversationId: "local-uuid", prompt: "first" });
  assert.equal(calls[0].conversationId, null);
  await create().generate({ accountId: 1, conversationId: "local-uuid", prompt: "next" });
  assert.equal(calls[1].conversationId, "remote-1");
  assert.equal(calls[0].userId, calls[1].userId);
});

test("accounts and Bot namespaces have independent conversations and upstream identities", async (t) => {
  const { calls, create } = fixture(t);
  await create().generate({ accountId: 1, conversationId: "same-local", prompt: "a", userId: "client-forged" });
  await create().generate({ accountId: 2, conversationId: "same-local", prompt: "b" });
  await create("different-bot").generate({ accountId: 1, conversationId: "same-local", prompt: "c" });
  assert.ok(calls.every(x => x.conversationId === null));
  assert.notEqual(calls[0].userId, "client-forged");
  assert.equal(new Set(calls.map(x => x.userId)).size, 3);
});

test("failed generation cannot poison the saved conversation", async (t) => {
  const { calls, create } = fixture(t, (_options, index) => {
    if (index === 2) throw new Error("upstream failed");
    return { conversationId: "remote-good" };
  });
  const service = create();
  await service.generate({ accountId: 1, conversationId: "local", prompt: "a" });
  await assert.rejects(service.generate({ accountId: 1, conversationId: "local", prompt: "b" }), /upstream failed/);
  await service.generate({ accountId: 1, conversationId: "local", prompt: "c" });
  assert.equal(calls[2].conversationId, "remote-good");
});

test("missing account identity is rejected before any upstream call", async (t) => {
  const { calls, create } = fixture(t);
  await assert.rejects(create().generate({ prompt: "bad" }), { code: "INVALID_ACCOUNT" });
  assert.equal(calls.length, 0);
});

test("Coze project scopes authorize before provider access and isolate remote conversations", async(t)=>{
  const {db,calls,create}=fixture(t);
  db.exec("CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO creative_projects VALUES('a',1),('b',1),('foreign',2)");
  const priorMode=process.env.STZH_CONTEXT_MODE;process.env.STZH_CONTEXT_MODE="enforce";
  t.after(()=>{if(priorMode===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=priorMode;});
  const notes=require("../studio-project-notes.js").createStudioProjectNotes(db);
  for(const id of ["a","b"])notes.save(1,id,{expectedRevision:0,enabled:true,fields:{taskState:"",conclusion:`project-${id}-only`,blocker:"未批准",action:"",reference:""}});
  const service=create();
  const request={accountId:1,conversationId:"local-project-test",prompt:"继续讨论"};
  await service.generate({...request,projectId:"a"});
  await service.generate({...request,projectId:"b"});
  await service.generate({...request,projectId:"a"});
  await service.generate(request);
  assert.deepEqual(calls.map(call=>call.conversationId),[null,null,"remote-1",null]);
  assert.match(JSON.stringify(calls[0].preparedMessages),/project-a-only/);
  assert.ok(!JSON.stringify(calls[1].preparedMessages).includes("project-a-only"));
  assert.match(JSON.stringify(calls[1].preparedMessages),/project-b-only/);
  assert.ok(!JSON.stringify(calls[3].preparedMessages).includes("project-a-only"));
  await assert.rejects(service.generate({...request,projectId:"foreign"}),error=>error.status===404);
  await assert.rejects(service.generate({...request,projectId:12}),error=>error.code==="INVALID_PROJECT");
  assert.equal(calls.length,4);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM coze_conversation_links").get().count,3);
});

test("concurrent requests for one account conversation are refused until the first settles", async (t) => {
  let finish;
  const { create } = fixture(t, () => new Promise(resolve => { finish = resolve; }));
  const pending = create().generate({ accountId: 1, conversationId: "local", prompt: "first" });
  await assert.rejects(create().generate({ accountId: 1, conversationId: "local", prompt: "duplicate" }), { code: "CONVERSATION_BUSY" });
  finish({text:"ok",conversationId:"remote"});
  await pending;
});

test("late results after abort do not persist a conversation mapping", async (t) => {
  const controller = new AbortController();
  const { db, create } = fixture(t, () => {
    controller.abort(new DOMException("cancelled", "AbortError"));
    return {conversationId:"stale-remote"};
  });
  await assert.rejects(create().generate({accountId:1,conversationId:"local",prompt:"cancel",signal:controller.signal}), {name:"AbortError"});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM coze_conversation_links").get().n,0);
});

test("Coze adapter retrieves fresh memory but never repeats remote history", async (t) => {
  const previous = process.env.STZH_CONTEXT_MODE;
  process.env.STZH_CONTEXT_MODE = "enforce";
  t.after(() => { if (previous === undefined) delete process.env.STZH_CONTEXT_MODE; else process.env.STZH_CONTEXT_MODE = previous; });
  const { db, calls, create } = fixture(t);
  const store = createStudioMemoryStore(db);
  let item = store.create(1, { requestKey: "coze-memory", mode: "coze", content: "工业极简，保留负空间" }).item;
  item = store.confirm(1, item.id, item.revision);
  const service = create();
  const history = [{ role: "user", text: "old-first-turn" }, { role: "agent", text: "old-answer" }];
  const first = await service.generate({ accountId: 1, conversationId: "new-local", prompt: "工业极简构图", history });
  assert.ok(JSON.stringify(calls[0].preparedMessages).includes("old-first-turn"));
  assert.ok(JSON.stringify(calls[0].preparedMessages).includes(item.id));
  assert.equal(first.contextTrace.remoteHistoryTokens, "unknown");
  store.remove(1, item.id, item.revision);
  const next = await service.generate({ accountId: 1, conversationId: "new-local", prompt: "工业极简构图", history });
  assert.equal(calls[1].conversationId, "remote-1");
  assert.ok(!JSON.stringify(calls[1].preparedMessages).includes("old-first-turn"));
  assert.ok(!JSON.stringify(calls[1].preparedMessages).includes(item.id));
  assert.deepEqual(next.contextTrace.selected, []);
  assert.equal(calls[1].preparedMessages.at(-1).content, "工业极简构图");
});

test("Coze trace records local history omissions without claiming remote history is known", async (t) => {
  const previous = process.env.STZH_CONTEXT_MODE;
  process.env.STZH_CONTEXT_MODE = "enforce";
  t.after(() => { if (previous === undefined) delete process.env.STZH_CONTEXT_MODE; else process.env.STZH_CONTEXT_MODE = previous; });
  const { calls, create } = fixture(t);
  const service = create();
  const history = Array.from({length:25}, (_,i)=>({role:i%2 ? "agent" : "user",text:`history-${i}`}));
  const first = await service.generate({accountId:1,conversationId:"local",prompt:"current",history});
  assert.equal(first.contextTrace.clientHistoryOmitted,true);
  assert.ok(!JSON.stringify(calls[0].preparedMessages).includes("history-5"));
  const next = await service.generate({accountId:1,conversationId:"local",prompt:"next",history:[],historyOmitted:true});
  assert.equal(next.contextTrace.clientHistoryOmitted,true);
  assert.equal(next.contextTrace.remoteHistoryTokens,"unknown");
  assert.ok(!JSON.stringify(calls[1].preparedMessages).includes("history-"));
  await assert.rejects(service.generate({accountId:1,prompt:"bad",historyOmitted:"true"}),{code:"INVALID_CONTEXT"});
  assert.equal(calls.length,2);
});

test("Coze current creative parameters suppress older preferences and reach prepared user state", async (t) => {
  const previous=process.env.STZH_CONTEXT_MODE;
  process.env.STZH_CONTEXT_MODE="enforce";
  t.after(()=>{if(previous===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=previous;});
  const {db,calls,create}=fixture(t), store=createStudioMemoryStore(db), service=create();
  const candidate=store.create(1,{requestKey:"old-coze-style",mode:"coze",slot:"style",content:"工业极简构图"}).item;
  const old=store.confirm(1,candidate.id,candidate.revision);
  const currentConstraints={style:"暖色写实",composition:"主体居中",duration:"8",aspect:"9:16"};
  const result=await service.generate({accountId:1,prompt:"工业极简构图比较，以正文明确要求为准",currentConstraints});
  assert.ok(!result.contextTrace.selected.some(item=>item.id===old.id));
  const state=calls[0].preparedMessages.find(message=>message.content.includes('"section":"Current Creative State"'));
  assert.equal(state.role,"user");
  assert.deepEqual(JSON.parse(state.content).constraints,currentConstraints);
  await assert.rejects(service.generate({accountId:1,prompt:"bad",currentConstraints:{aspect:123}}),{code:"INVALID_CONTEXT"});
  assert.equal(calls.length,1);
});

test("saved foreign Coze conversation is denied before upstream access", async (t) => {
  const { db, calls, create } = fixture(t);
  db.exec("CREATE TABLE conversations(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO conversations VALUES('foreign-local',2)");
  await assert.rejects(create().generate({ accountId: 1, conversationId: "foreign-local", prompt: "hello" }), { code: "CONVERSATION_UNAVAILABLE" });
  assert.equal(calls.length, 0);
});

test("saved assistant and workflow sessions cannot enter Coze even with optimization disabled",async(t)=>{
  const {db,calls,create}=fixture(t);
  db.exec("CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); CREATE TABLE opc_messages(session_id TEXT,role TEXT); INSERT INTO opc_sessions VALUES('opc_assistant',1),('opc_workflow_local',1),('coze-local',1)");
  require("../studio-session-scope.js").register(db,1,"coze-local","coze");
  const prior=process.env.STZH_CONTEXT_MODE;process.env.STZH_CONTEXT_MODE="off";
  t.after(()=>{if(prior===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=prior;});
  const service=create();
  for(const conversationId of ["opc_assistant","opc_workflow_local"]){
    await assert.rejects(service.generate({accountId:1,conversationId,prompt:"hello"}),error=>error.code==="SESSION_MODE_CONFLICT"&&error.status===409);
  }
  assert.equal(calls.length,0);
  await service.generate({accountId:1,conversationId:"coze-local",prompt:"hello"});
  assert.equal(calls.length,1);
});

test("Coze request exclusions affect only the prepared request and not the next turn",async(t)=>{
  const previous=process.env.STZH_CONTEXT_MODE;process.env.STZH_CONTEXT_MODE="enforce";
  t.after(()=>{if(previous===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=previous;});
  const {db,calls,create}=fixture(t);const store=createStudioMemoryStore(db);
  let item=store.create(1,{mode:"coze",requestKey:"temporary-exclusion",content:"工业极简留白"}).item;
  item=store.confirm(1,item.id,item.revision);
  const service=create();
  const first=await service.generate({accountId:1,prompt:"工业极简留白",excludedMemoryIds:[item.id]});
  assert.equal(first.contextTrace.dropped.user_excluded,1);
  assert.ok(!JSON.stringify(calls[0].preparedMessages).includes(item.id));
  await service.generate({accountId:1,prompt:"工业极简留白"});
  assert.ok(JSON.stringify(calls[1].preparedMessages).includes(item.id));
  assert.equal(store.get(1,item.id).enabled,true);
});
