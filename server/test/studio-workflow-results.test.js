const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createWorkflowResults } = require("../studio-workflow-results.js");
function setup(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); CREATE TABLE opc_messages(session_id TEXT,role TEXT); INSERT INTO opc_sessions VALUES('opc_workflow_a',1),('opc_workflow_b',2)");
  t.after(()=>db.close());
  return { db, store:createWorkflowResults(db) };
}
const ref = { sessionId:"opc_workflow_a",runId:"run",workflowId:"wf",stepId:"one",stepIndex:0,previousStepIds:[] };
function complete(store, value=ref) {
  const request={prompt:value.stepId};
  const check=store.inspect(1,value,request);
  store.claim(1,value,check.requestHash);
  store.complete(1,value,{text:"尚未批准的水墨方案",contextTrace:{applied:false}});
  return request;
}
test("server results survive store recreation, replay identical requests, and supply original predecessor text",t=>{
  const {db,store}=setup(t);
  const request=complete(store);
  const restarted=createWorkflowResults(db);
  assert.equal(restarted.inspect(1,ref,request).cached.text,"尚未批准的水墨方案");
  const next={...ref,stepId:"two",stepIndex:1,previousStepIds:["one"]};
  const found=restarted.inspect(1,next,{prompt:"继续"});
  assert.equal(found.predecessors[0].text,"尚未批准的水墨方案");
  assert.match(found.predecessors[0].fingerprint,/^[a-f0-9]{64}$/);
  assert.throws(()=>restarted.inspect(1,ref,{prompt:"changed"}),e=>e.code==="WORKFLOW_REQUEST_CONFLICT");
});
test("missing, other-account, other-session, other-run and wrong-order predecessors are rejected",t=>{
  const {store}=setup(t);complete(store);
  const next={...ref,stepId:"two",stepIndex:1,previousStepIds:["one"]};
  for(const patch of [{runId:"other"},{workflowId:"other"},{previousStepIds:["missing"]},{stepIndex:2,previousStepIds:["one","one"]}]) {
    assert.throws(()=>store.inspect(1,{...next,...patch},{}),e=>e.code==="WORKFLOW_PREDECESSOR_UNAVAILABLE");
  }
  assert.throws(()=>store.inspect(2,next,{}),e=>e.status===404);
  assert.throws(()=>store.inspect(1,{...next,sessionId:"opc_workflow_b"},{}),e=>e.status===404);
});
test("concurrent or uncertain requests cannot repeat provider work and cannot authorize a successor",t=>{
  const {db,store}=setup(t),request={prompt:"one"};
  const check=store.inspect(1,ref,request);
  store.claim(1,ref,check.requestHash);
  assert.throws(()=>store.claim(1,ref,check.requestHash),e=>e.status===409);
  assert.throws(()=>createWorkflowResults(db).inspect(1,ref,request),e=>e.code==="WORKFLOW_RESULT_UNCERTAIN");
  store.uncertain(1,ref);
  assert.throws(()=>store.inspect(1,ref,request),e=>e.code==="WORKFLOW_RESULT_UNCERTAIN");
  assert.throws(()=>store.inspect(1,{...ref,stepId:"two",stepIndex:1,previousStepIds:["one"]},{}),e=>e.code==="WORKFLOW_PREDECESSOR_UNAVAILABLE");
});
test("deleting a session removes authoritative workflow results",t=>{
  const {db,store}=setup(t);complete(store);
  db.prepare("DELETE FROM opc_sessions WHERE id=?").run(ref.sessionId);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM studio_workflow_results").get().count,0);
  assert.throws(()=>store.inspect(1,ref,{prompt:"one"}),e=>e.status===404);
});

test("a new process reads committed replies and refuses an interrupted running step",t=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{execFileSync}=require("node:child_process");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"studio-workflow-restart-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const filename=path.join(dir,"fixture.sqlite");
  const bootstrap=`const Database=require(${JSON.stringify(require.resolve("better-sqlite3"))});
    const db=new Database(${JSON.stringify(filename)});
    const {createWorkflowResults}=require(${JSON.stringify(require.resolve("../studio-workflow-results.js"))});
    const ref=${JSON.stringify(ref)};`;
  execFileSync(process.execPath,["-e",bootstrap+`
    db.exec("CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); CREATE TABLE opc_messages(session_id TEXT,role TEXT); INSERT INTO opc_sessions VALUES('opc_workflow_a',1)");
    const store=createWorkflowResults(db),request={prompt:'one'};
    store.claim(1,ref,store.inspect(1,ref,request).requestHash);
    store.complete(1,ref,{text:'committed before exit'});
    const next={...ref,stepId:'two',stepIndex:1,previousStepIds:['one']};
    store.claim(1,next,store.inspect(1,next,{prompt:'two'}).requestHash);
    // Exit while this step has no recorded response, like an interrupted call.
    process.exit(0);
  `],{timeout:10000});
  const output=execFileSync(process.execPath,["-e",bootstrap+`
    const store=createWorkflowResults(db);
    const saved=store.inspect(1,ref,{prompt:'one'}).cached;
    let code;
    try{store.inspect(1,{...ref,stepId:'two',stepIndex:1,previousStepIds:['one']},{prompt:'two'});}catch(error){code=error.code;}
    console.log(JSON.stringify({saved,code,steps:store.readRun(1,ref.sessionId,ref.runId)}));
    db.close();
  `],{timeout:10000,encoding:"utf8"});
  const result=JSON.parse(output);
  assert.equal(result.saved.text,"committed before exit");
  assert.equal(result.code,"WORKFLOW_RESULT_UNCERTAIN");
  assert.deepEqual(result.steps.map(step=>step.status),["completed","running"]);
});

test("workflow plans survive reload, are immutable and validate ordered execution",t=>{
 const {db,store}=setup(t);
 const plan={version:1,workflowId:'wf',input:{topic:'水墨',goal:'尚未批准'},steps:[{id:'draft',name:'草稿'},{id:'review',name:'审校'}],originalStepCount:2};
 assert.equal(store.savePlan(1,ref.sessionId,'planned',plan).created,true);
 assert.deepEqual(createWorkflowResults(db).readPlan(1,ref.sessionId,'planned'),plan);
 assert.deepEqual(Object.keys(createWorkflowResults(db).readPlan(1,ref.sessionId,'planned').input),['topic','goal']);
 assert.equal(store.savePlan(1,ref.sessionId,'planned',{...plan,input:{goal:'尚未批准',topic:'水墨'}}).created,false);
 assert.throws(()=>store.savePlan(1,ref.sessionId,'planned',{...plan,input:{topic:'其他'}}),e=>e.status===409);
 const first={...ref,runId:'planned',stepId:'planned:0:draft'};
 complete(store,first);
 const next={...first,stepId:'planned:1:review',stepIndex:1,previousStepIds:['planned:0:draft']};
 assert.equal(store.inspect(1,next,{prompt:'review'}).predecessors.length,1);
 assert.throws(()=>store.inspect(1,{...next,stepId:'planned:1:other'},{prompt:'wrong'}),e=>e.code==='WORKFLOW_PLAN_CONFLICT');
 assert.throws(()=>store.readPlan(2,ref.sessionId,'planned'),e=>e.status===404);
 db.prepare('DELETE FROM opc_sessions WHERE id=?').run(ref.sessionId);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM studio_workflow_plans').get().n,0);
});

test("plans cannot retrofit old execution or accept authority fields and malformed steps",t=>{
 const {store}=setup(t);complete(store);
 const plan={version:1,workflowId:'wf',input:{},steps:[{id:'draft',name:'草稿'}],originalStepCount:1};
 assert.throws(()=>store.savePlan(1,ref.sessionId,'run',plan),e=>e.status===409);
 for(const patch of [{approved:true},{steps:[]},{steps:[{id:'draft',name:'草稿',approved:true}]},{input:{topic:42}},{originalStepCount:0}]){
  assert.throws(()=>store.savePlan(1,ref.sessionId,'new',{...plan,...patch}),e=>e.status===400);
 }
});
