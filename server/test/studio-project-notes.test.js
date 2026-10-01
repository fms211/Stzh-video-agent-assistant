"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Database=require("better-sqlite3");
const {createStudioProjectNotes}=require("../studio-project-notes.js");
const {createStudioContextService}=require("../studio-context-service.js");
const fields=patch=>({taskState:"草稿",conclusion:"可能采用水墨",blocker:"尚未批准",action:"核对来源",reference:"项目原文",...patch});
function setup(t){
  const db=new Database(":memory:");t.after(()=>db.close());
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO creative_projects VALUES('a',1),('b',2);");
  return {db,notes:createStudioProjectNotes(db)};
}
test("project notes enforce ownership, explicit use, version conflicts and delete tombstones",t=>{
  const {notes}=setup(t);
  assert.equal(notes.get(1,"a").enabled,false);
  const saved=notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields()});
  assert.equal(saved.revision,1);assert.equal(saved.verification,"unverified");
  assert.throws(()=>notes.get(2,"a"),error=>error.status===404);
  assert.throws(()=>notes.save(2,"a",{expectedRevision:1,enabled:true,fields:fields()}),error=>error.status===404);
  assert.throws(()=>notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields()}),error=>error.status===409);
  const removed=notes.remove(1,"a",1);assert.equal(removed.revision,2);assert.equal(removed.enabled,false);
  assert.ok(Object.values(removed.fields).every(value=>value===""));
  assert.throws(()=>notes.save(1,"a",{expectedRevision:1,enabled:true,fields:fields()}),error=>error.status===409);
  assert.equal(notes.save(1,"a",{expectedRevision:2,enabled:false,fields:fields()}).revision,3);
});
test("project note references preserve uncertainty and never become tool approval",t=>{
  const {db,notes}=setup(t),previous=process.env.STZH_CONTEXT_MODE;
  process.env.STZH_CONTEXT_MODE="enforce";
  t.after(()=>{if(previous===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=previous;});
  notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields()});
  notes.save(2,"b",{expectedRevision:0,enabled:true,fields:fields({conclusion:"foreign-note-marker"})});
  const context=createStudioContextService(db),input={userId:1,mode:"collaboration",scope:{projectId:"a"},messages:[{role:"user",content:"讨论水墨"}],toolState:'{"deliveryApproved":false}'};
  const result=context.prepare(input);
  assert.equal(result.trace.projectNote.included,true);
  const text=JSON.stringify(result.messages);
  assert.match(text,/可能采用水墨/);assert.match(text,/尚未批准/);assert.ok(!text.includes("foreign-note-marker"));
  assert.ok(result.messages[0].content.includes('"deliveryApproved":false'));
  notes.remove(1,"a",1);
  assert.ok(!JSON.stringify(context.prepare(input).messages).includes("可能采用水墨"));
});

test("assistant and ordinary workflow project switching changes notes without crossing account or session scope",t=>{
  const {db,notes}=setup(t),previous=process.env.STZH_CONTEXT_MODE;
  process.env.STZH_CONTEXT_MODE="enforce";
  t.after(()=>{if(previous===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=previous;});
  db.exec("INSERT INTO creative_projects VALUES('same-owner-second',1); CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); CREATE TABLE opc_messages(session_id TEXT,role TEXT); INSERT INTO opc_sessions VALUES('opc_chat',1),('opc_workflow_local',1),('opc_foreign',2)");
  notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields({conclusion:"FIRST_PROJECT_MARKER"})});
  notes.save(1,"same-owner-second",{expectedRevision:0,enabled:true,fields:fields({conclusion:"SECOND_PROJECT_MARKER"})});
  const context=createStudioContextService(db);
  for(const [mode,sessionId] of [["assistant","opc_chat"],["workflow","opc_workflow_local"]]){
    const input={userId:1,mode,scope:{sessionId,projectId:"a"},messages:[{role:"user",content:"继续讨论"}]};
    const first=context.prepare(input);assert.match(JSON.stringify(first.messages),/FIRST_PROJECT_MARKER/);
    const second=context.prepare({...input,scope:{sessionId,projectId:"same-owner-second"}});
    assert.match(JSON.stringify(second.messages),/SECOND_PROJECT_MARKER/);assert.ok(!JSON.stringify(second.messages).includes("FIRST_PROJECT_MARKER"));
    assert.equal(context.prepare({...input,scope:{sessionId}}).trace.projectNote,null);
    assert.throws(()=>context.prepare({...input,scope:{sessionId,projectId:"b"}}),error=>error.status===404);
    assert.throws(()=>context.prepare({...input,scope:{sessionId:"opc_foreign",projectId:"a"}}),error=>error.status===404);
  }
});
test("oversize notes are omitted whole while current task and tool state remain",t=>{
  const {db,notes}=setup(t),priorMode=process.env.STZH_CONTEXT_MODE,priorBytes=process.env.STZH_CONTEXT_INPUT_BYTES;
  process.env.STZH_CONTEXT_MODE="enforce";process.env.STZH_CONTEXT_INPUT_BYTES="4096";
  t.after(()=>{if(priorMode===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=priorMode;if(priorBytes===undefined)delete process.env.STZH_CONTEXT_INPUT_BYTES;else process.env.STZH_CONTEXT_INPUT_BYTES=priorBytes;});
  notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields({conclusion:"可能".repeat(1500)})});
  const result=createStudioContextService(db).prepare({userId:1,mode:"collaboration",scope:{projectId:"a"},messages:[{role:"user",content:"当前完整输入"}],toolState:"尚未批准"});
  assert.equal(result.trace.projectNote.reason,"budget");assert.equal(result.trace.projectNote.included,false);
  assert.equal(result.messages.at(-1).content,"当前完整输入");assert.match(result.messages[0].content,/尚未批准/);
  assert.ok(!JSON.stringify(result.messages).includes("可能可能"));
});
test("project notes reject secret-like content and unsupported authority fields",t=>{
  const {notes}=setup(t);
  assert.throws(()=>notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields({reference:"sk-"+"x".repeat(25)})}),error=>error.code==="SENSITIVE_MEMORY");
  assert.throws(()=>notes.save(1,"a",{expectedRevision:0,enabled:true,fields:fields(),verified:true}),error=>error.code==="INVALID_PROJECT_NOTE");
});
