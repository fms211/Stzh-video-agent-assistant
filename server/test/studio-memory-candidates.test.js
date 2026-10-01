"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const Database=require("better-sqlite3");
const {register}=require("../studio-session-scope.js");
const {createStudioCandidateService}=require("../studio-memory-candidates.js");
const {createStudioMemoryStore}=require("../studio-memory-store.js");
function setup(t){
  const db=new Database(":memory:");t.after(()=>db.close());
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO opc_sessions VALUES('coze-current',1),('assistant-current',1),('opc_workflow_current',1); CREATE TABLE opc_messages(id TEXT PRIMARY KEY,session_id TEXT,role TEXT,content TEXT,metadata TEXT);");
  register(db,1,"coze-current","coze");register(db,1,"assistant-current","assistant");register(db,1,"opc_workflow_current","workflow");
  return {db,service:createStudioCandidateService(db),store:createStudioMemoryStore(db)};
}
test("explicit remember requests create scoped unverified candidates in current Coze storage",t=>{
  const {db,service,store}=setup(t);
  db.prepare("INSERT INTO opc_messages VALUES('m1','coze-current','user',?,NULL)").run("请记住：工业极简，但不要负空间");
  const result=service.messages(1,"coze-current",["m1"]);
  assert.equal(result.created,1);
  const item=store.get(1,result.ids[0]);
  assert.equal(item.source.mode,"coze");assert.equal(item.status,"candidate");assert.equal(item.verification.state,"unverified");
  assert.equal(item.content,"工业极简，但不要负空间");assert.ok(store.available(1,item));
  assert.equal(store.search(1,{mode:"coze",sessionId:"coze-current",query:"工业极简"}).selected.length,0);
  assert.throws(()=>store.search(1,{mode:"assistant",sessionId:"coze-current",query:"工业极简"}),error=>error.status===404);
  assert.equal(service.messages(2,"coze-current",["m1"]).created,0);
});
test("candidate retries do not resurrect deleted records or turn ordinary chat into memory",t=>{
  const {db,service,store}=setup(t);
  db.prepare("INSERT INTO opc_messages VALUES('m1','assistant-current','user',?,NULL)").run("记住：水墨留白");
  db.prepare("INSERT INTO opc_messages VALUES('m2','assistant-current','user',?,NULL)").run("不要记住：私人内容");
  const first=service.messages(1,"assistant-current",["m1","m2"]);
  assert.equal(first.created,1);
  const retry=service.messages(1,"assistant-current",["m1"]);assert.equal(retry.created,0);assert.deepEqual(retry.ids,first.ids);
  store.remove(1,first.ids[0],1);
  assert.deepEqual(service.messages(1,"assistant-current",["m1"]).skipped,["MEMORY_DELETED"]);
});
test("workflow results retain whole text and errors never become successful candidate extraction",t=>{
  const {db,service,store}=setup(t);
  db.prepare("INSERT INTO opc_messages VALUES('result','opc_workflow_current','action-cards',?,?)").run("可能可行，仍需确认，不代表已生成视频",JSON.stringify({workflowName:"测试"}));
  const result=service.messages(1,"opc_workflow_current",["result"]);
  assert.match(store.get(1,result.ids[0]).content,/仍需确认，不代表已生成视频/);
  db.prepare("INSERT INTO opc_messages VALUES('secret','assistant-current','user',?,NULL)").run("记住：sk-"+"x".repeat(25));
  assert.deepEqual(service.messages(1,"assistant-current",["secret"]).skipped,["SENSITIVE_MEMORY"]);
  db.exec("DROP TABLE opc_messages");
  assert.equal(service.messages(1,"assistant-current",["result"]).created,0);
});
