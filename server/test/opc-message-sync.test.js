"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),test=require("node:test");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-opc-sync-"));
process.env.STZH_DATA_DIR=directory;
process.env.JWT_SECRET="opc-sync-tests-only-secret-longer-than-thirty-two-characters";
const app=require("../app.js"),db=require("../db.js");
let server,base,owner,other;
async function request(route,token,body){
  const response=await fetch(`${base}${route}`,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
test.before(async()=>{
  server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;
  owner=(await request("/api/auth/register",null,{username:"opc-owner",password:"Synthetic-Only-123!"})).body;
  other=(await request("/api/auth/register",null,{username:"opc-other",password:"Synthetic-Only-123!"})).body;
});
test.after(async()=>{
  await new Promise(resolve=>server.close(resolve));db.close();
  assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("stzh-opc-sync-"));fs.rmSync(directory,{recursive:true,force:true});
});
test("OPC HTTP updates placeholder replies idempotently and restores final content and cards",async()=>{
  assert.equal((await request("/api/opc/sessions",owner.token,{id:"sync-1",title:"before"})).status,200);
  const message={id:"stable-reply",role:"assistant",content:"",timestamp:1720000000000};
  const route="/api/opc/sessions/sync-1/messages/batch";
  const first=await request(route,owner.token,{messages:[message]});
  message.content="完整回复";message.metadata={cards:[{id:"save",type:"save-report"}]};
  const second=await request(route,owner.token,{messages:[message]});
  await request(route,owner.token,{messages:[message]});
  assert.deepEqual(second.body.ids,first.body.ids);
  const rows=(await request("/api/opc/sessions/sync-1/messages",owner.token)).body.messages;
  assert.equal(rows.length,1);assert.equal(rows[0].content,"完整回复");
  assert.equal(JSON.parse(rows[0].metadata).clientMessageId,"stable-reply");
  assert.equal(JSON.parse(rows[0].metadata).cards[0].id,"save");
  await request("/api/opc/sessions",owner.token,{id:"sync-1",title:"after"});
  assert.equal(db.opcGetSession("sync-1",owner.user.id).title,"after");
  assert.equal((await request("/api/conversations/sync-1",owner.token)).body.conversation.mode,"assistant");
});
test("Coze conversation sync restores per-reply context traces only to the owning account",async()=>{
  const sessionId="coze-trace-fixture";
  const created=await request("/api/conversations",owner.token,{id:sessionId,title:"合成Coze引用"});
  assert.ok([200,201].includes(created.status));
  const contextTrace={rollout:"shadow",applied:false,selected:[{id:"synthetic-memory",revision:2,verification:{state:"unverified"}}]};
  const message={id:"coze-trace-reply",role:"agent",text:"合成回复，无模型调用",contextTrace};
  assert.equal((await request(`/api/conversations/${sessionId}/messages`,owner.token,{messages:[message]})).status,200);
  const restored=await request(`/api/conversations/${sessionId}`,owner.token);
  assert.equal(restored.status,200);
  assert.equal(restored.body.conversation.mode,"coze");
  assert.deepEqual(restored.body.messages[0].contextTrace,contextTrace);
  assert.equal(restored.body.messages[0].role,"agent");
  assert.equal(restored.body.messages[0].content,message.text);
  assert.equal((await request(`/api/conversations/${sessionId}`,other.token)).status,404);
});

test("OPC sync isolates accounts and sessions even when client IDs collide",async()=>{
  const message={id:"stable-reply",role:"assistant",content:"other",timestamp:1720000000000};
  assert.equal((await request("/api/opc/sessions",other.token,{id:"sync-1",title:"hijack"})).status,409);
  assert.equal((await request("/api/opc/sessions/sync-1/messages/batch",other.token,{messages:[message]})).status,404);
  await request("/api/opc/sessions",other.token,{id:"sync-2"});
  assert.equal((await request("/api/opc/sessions/sync-2/messages/batch",other.token,{messages:[message]})).status,200);
  assert.equal((await request("/api/opc/sessions/sync-1/messages",owner.token)).body.messages[0].content,"完整回复");
});
test("OPC validates whole batches before writing and preserves legacy append behavior",async()=>{
  const route="/api/opc/sessions/sync-1/messages/batch";
  const good={role:"user",content:"legacy message"};
  assert.equal((await request(route,owner.token,{messages:[good,{role:"assistant",content:null}]})).status,400);
  assert.equal(db.opcGetMessages("sync-1").length,1);
  assert.equal((await request(route,owner.token,{messages:[good]})).status,200);
  assert.equal(db.opcGetMessages("sync-1").length,2);
});
test("OPC history returns the most recent messages in stable chronological order",async()=>{
  await request("/api/opc/sessions",owner.token,{id:"ordered"});
  const messages=Array.from({length:5},(_,i)=>({id:`m${i}`,role:"user",content:String(i),timestamp:1720000000000}));
  await request("/api/opc/sessions/ordered/messages/batch",owner.token,{messages});
  assert.deepEqual((await request("/api/opc/sessions/ordered/messages?limit=2",owner.token)).body.messages.map(row=>row.content),["3","4"]);
});


test("OPC paged history exposes stable pages and workflow classification without changing legacy defaults",async()=>{
  await request("/api/opc/sessions",owner.token,{id:"opc_workflow_history",title:"workflow"});
  const first=(await request("/api/opc/sessions?limit=2&offset=0",owner.token)).body.sessions;
  const second=(await request("/api/opc/sessions?limit=2&offset=2",owner.token)).body.sessions;
  assert.equal(new Set([...first,...second].map(row=>row.id)).size,first.length+second.length);
  assert.equal([...first,...second].find(row=>row.id==="opc_workflow_history").mode,"workflow");
  assert.deepEqual((await request("/api/opc/sessions/ordered/messages?limit=2&offset=2",owner.token)).body.messages.map(row=>row.content),["1","2"]);
  assert.equal((await request("/api/opc/sessions/ordered/messages?offset=2",other.token)).status,404);
});

test("OPC history uses registered modes without mislabelling Coze or exposing another account",async()=>{
  await request("/api/conversations",owner.token,{id:"registered-coze",title:"registered Coze"});
  await request("/api/conversations",other.token,{id:"coze-mode-foreign",title:"foreign"});
  const response=await request("/api/opc/sessions?limit=100",owner.token);
  assert.equal(response.status,200);
  const rows=response.body.sessions;
  assert.equal(rows.find(row=>row.id==="registered-coze").mode,"coze");
  assert.equal(rows.find(row=>row.id==="coze-trace-fixture").mode,"coze");
  assert.equal(rows.find(row=>row.id==="sync-1").mode,"chat");
  assert.equal(rows.find(row=>row.id==="opc_workflow_history").mode,"workflow");
  assert.ok(!rows.some(row=>row.id==="coze-mode-foreign"));
});

test("Coze history filters modes before its limit and retains account isolation",async()=>{
  await request("/api/conversations",owner.token,{id:"coze-filter-owned",title:"Coze owned"});
  await request("/api/conversations",other.token,{id:"coze-filter-other",title:"Coze foreign"});
  const insert=db.prepare("INSERT INTO opc_sessions(id,user_id,title,updated_at) VALUES(?,?,?,?)");
  db.transaction(()=>{for(let i=0;i<205;i++)insert.run(`opc_filter_${i}`,owner.user.id,"assistant",2147480000+i);})();
  const filtered=await request("/api/conversations?mode=coze",owner.token);
  assert.equal(filtered.status,200);
  assert.ok(filtered.body.conversations.some(row=>row.id==="coze-filter-owned"));
  assert.ok(filtered.body.conversations.every(row=>row.id!=="coze-filter-other"&&!row.id.startsWith("opc_filter_")));
  assert.equal((await request("/api/conversations",owner.token)).body.conversations.length,200);
  assert.equal((await request("/api/conversations?mode=invalid",owner.token)).status,400);
});
