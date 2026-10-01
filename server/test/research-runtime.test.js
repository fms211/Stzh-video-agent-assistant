"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

function setup(t, overrides = {}) {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);");
  const { ResearchRuntime } = require("../research-runtime.js");
  const calls = [];
  const runtime = new ResearchRuntime({db,
    tools: {
      web_search: async (input) => { calls.push(input); return {sources:[{title:"真实响应测试资料",url:"https://example.org/style",excerpt:"external tool content"}]}; },
      get_opc_context: async (input) => ({context: input}),
      rag_search: async () => ({sources:[]}),
      ...overrides.tools,
    },
    model: overrides.model || (async ({sources}) => JSON.stringify({report:"有来源的研究报告",styleFeaturePack:{colors:["蓝色"]},applicationPromptPack:{positive:"blue studio"},sourceIds:sources.map(s=>s.id)})),
  });
  t.after(async()=>{await runtime.stop();db.close();});
  return {runtime,db,calls};
}

async function waitFor(runtime, userId, id, status) {
  const deadline = Date.now()+2000;
  while (Date.now()<deadline) {
    const run = runtime.getRun(userId,id);
    if (run.status===status) return run;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error(`run did not reach ${status}`);
}

test("research requires plan approval, executes injected tools, persists sources and three model artifacts",async(t)=>{
  const {runtime,calls,db}=setup(t);
  const run=runtime.createRun(1,{styleName:"工业风",useCase:"产品短片",providerId:null,projectId:null});
  assert.equal(run.status,"awaiting_plan_approval");
  assert.equal(calls.length,0);
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:run.plan.revision});
  const final=await waitFor(runtime,1,run.runId,"completed");
  assert.equal(final.sources.length,1);
  assert.equal(final.sources[0].url,"https://example.org/style");
  assert.equal(final.artifacts.length,3);
  assert.equal(final.metrics.modelCalls,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM research_run_events").get().n,final.lastSeq);
  assert.ok(runtime.events(1,run.runId,0).every((e,i)=>e.seq===i+1));
  assert.throws(()=>runtime.getRun(2,run.runId),{code:"RUN_NOT_FOUND"});
  assert.equal(runtime.listRuns(2,20).length,0);
});

test("standalone research exports retain unverified status, field origin and owned reference scope",async(t)=>{
  const {runtime}=setup(t,{model:async({sources})=>({report:"色彩摘录与创作建议",styleFeaturePack:{光影:"均匀平光",材质:"哑光"},applicationPromptPack:{中文正向:"几何校园片头",English_positive:"geometric campus title"},sourceIds:sources.map(s=>s.id)})});
  const run=runtime.createRun(1,{styleName:"包豪斯",useCase:"校园片头"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  const completed=await waitFor(runtime,1,run.runId,"completed");
  for(const artifact of completed.artifacts){
    const evidence=artifact.evidence;
    assert.equal(evidence.verification,"unverified");
    assert.equal(evidence.origin,"model_output");
    assert.equal(evidence.runId,completed.runId);
    assert.equal(evidence.approvedPlanRevision,1);
    assert.deepEqual(evidence.scope,{styleName:"包豪斯",useCase:"校园片头",projectId:null});
    assert.deepEqual(evidence.references.map(s=>s.id),artifact.sourceIds);
    assert.ok(evidence.references.every(s=>s.url==="https://example.org/style"&&s.trust==="untrusted"));
    assert.match(evidence.note,/不代表逐字段事实核验/);
    if(artifact.mimeType==="application/json"){
      const exported=JSON.parse(artifact.content);
      assert.deepEqual(exported._researchContext,evidence);
      assert.ok(Object.values(evidence.fields).every(field=>field.verification==="unverified"));
      if(artifact.type==="style-feature-pack")assert.equal(exported.光影,"均匀平光");
    }else{assert.match(artifact.content,/色彩摘录与创作建议/);assert.match(artifact.content,/"verification": "unverified"/);}
  }
  const restored=new (require("../research-runtime.js").ResearchRuntime)({db:runtime.db,tools:{},model:()=>{throw new Error("No model on restore");}});
  assert.deepEqual(restored.getRun(1,run.runId).artifacts,completed.artifacts);
  await restored.stop();
});

test("model-supplied verified export labels cannot replace server-owned provenance",async(t)=>{
  const forged={verification:"verified",runId:"another-run",references:[{id:"foreign"}]};
  const {runtime}=setup(t,{model:async({sources})=>({report:"模型声称已核验",styleFeaturePack:{color:"blue",_researchContext:forged},applicationPromptPack:{positive:"blue scene",_researchContext:forged},sourceIds:sources.map(s=>s.id)})});
  const run=runtime.createRun(1,{styleName:"水彩"});await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  const completed=await waitFor(runtime,1,run.runId,"completed");
  for(const artifact of completed.artifacts.filter(a=>a.mimeType==="application/json")){
    const metadata=JSON.parse(artifact.content)._researchContext;
    assert.equal(metadata.verification,"unverified");assert.equal(metadata.runId,run.runId);
    assert.ok(metadata.references.every(s=>s.id!=="foreign"));
    assert.ok(!Object.hasOwn(metadata.fields,"_researchContext"));
  }
});

test("metadata-only pack fails without partially committing a report or promoting a memory candidate",async(t)=>{
  const {runtime}=setup(t,{model:async({sources})=>({report:"可解析报告",styleFeaturePack:{color:"blue"},applicationPromptPack:{_researchContext:{verification:"verified"}},sourceIds:sources.map(s=>s.id)})});
  const run=runtime.createRun(1,{styleName:"水彩"});await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  const failed=await waitFor(runtime,1,run.runId,"recovering");
  assert.equal(failed.error.code,"UPSTREAM_OUTPUT_INVALID");assert.equal(failed.artifacts.length,0);
  assert.ok(failed.sources.every(s=>s.citedBy.length===0));
  assert.ok(runtime.events(1,run.runId).every(event=>!["artifact.created","memory.candidate"].includes(event.type)));
});

for(const [stage,condition] of [
  ["second artifact","json_extract(NEW.event, '$.type') = 'artifact.created' AND json_extract(NEW.event, '$.payload.artifact.type') = 'style-feature-pack'"],
  ["citation link","json_extract(NEW.event, '$.type') = 'source.added' AND json_array_length(NEW.event, '$.payload.source.citedBy') > 0"],
]){
  test(`research bundle rolls back SQLite failure at ${stage} and explicit retry commits once`,async(t)=>{
    let modelCalls=0;
    const {runtime,db}=setup(t,{model:async({sources})=>{modelCalls++;return {report:"事务测试报告",styleFeaturePack:{color:"blue"},applicationPromptPack:{positive:"blue scene"},sourceIds:sources.map(s=>s.id)};}});
    db.exec(`CREATE TRIGGER fail_research_bundle BEFORE INSERT ON research_run_events WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'injected_bundle_write_failure'); END;`);
    const run=runtime.createRun(1,{styleName:"水彩"});
    await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
    const failed=await waitFor(runtime,1,run.runId,"recovering");
    assert.equal(modelCalls,1,"database failure must not automatically call the model again");
    assert.equal(failed.error.stepId,"synthesis");
    assert.equal(failed.artifacts.length,0,"no report may remain after a later bundle write fails");
    assert.ok(failed.sources.every(source=>source.citedBy.length===0));
    const failureEvents=runtime.events(1,run.runId);
    assert.equal(failureEvents.filter(event=>event.type==="artifact.created").length,0);
    assert.equal(failureEvents.at(-1).seq,failed.lastSeq);
    assert.ok(failureEvents.every((event,index)=>event.seq===index+1));
    db.exec("DROP TRIGGER fail_research_bundle");
    await runtime.act(1,run.runId,{type:"retry_step",stepId:"synthesis"});
    const completed=await waitFor(runtime,1,run.runId,"completed");
    assert.equal(modelCalls,2,"only the explicit retry may spend another model call");
    assert.equal(completed.artifacts.length,3);
    assert.equal(new Set(completed.artifacts.map(a=>a.id)).size,3);
    assert.equal(runtime.events(1,run.runId).filter(event=>event.type==="artifact.created").length,3);
    assert.ok(completed.sources.every(source=>source.citedBy.length===3));
    const finalEvents=runtime.events(1,run.runId);assert.ok(finalEvents.every((event,index)=>event.seq===index+1));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM research_run_events WHERE run_id=?").get(run.runId).n,completed.lastSeq);
  });
}

test("plan revisions reject stale writers and dependency-breaking reorder",async(t)=>{
  const {runtime}=setup(t);const run=runtime.createRun(1,{styleName:"水彩",useCase:"广告"});
  runtime.updatePlan(1,run.runId,1,[{type:"set_objective",value:"新的研究目标"}]);
  assert.throws(()=>runtime.updatePlan(1,run.runId,1,[]),{code:"PLAN_REVISION_CONFLICT"});
  assert.throws(()=>runtime.updatePlan(1,run.runId,2,[{type:"move_step",stepId:"synthesis",toIndex:0}]),{code:"INVALID_PLAN_OPERATION"});
  assert.equal(runtime.getRun(1,run.runId).plan.revision,2);
});

test("research snapshots temporary exclusions without approving a plan",t=>{
  const {runtime}=setup(t);
  const run=runtime.createRun(1,{styleName:"水墨",excludedMemoryIds:["memory-a","memory-a"]});
  assert.deepEqual(run.input.excludedMemoryIds,["memory-a"]);
  assert.equal(run.status,"awaiting_plan_approval");
  assert.throws(()=>runtime.createRun(1,{styleName:"水墨",excludedMemoryIds:"all"}),error=>error.code==="INVALID_CONTEXT");
  assert.equal(runtime.listRuns(1,20).length,1);
});

test("research model receives the approved revision and records context trace without creating media approval",async(t)=>{
  let seen;
  const {runtime}=setup(t,{model:async({sources},ctx)=>{
    seen=ctx.toolState;
    ctx.onContextTrace({rollout:"shadow",applied:false,selected:[]});
    return JSON.stringify({report:"研究报告",styleFeaturePack:{colors:["蓝"]},applicationPromptPack:{positive:"blue"},sourceIds:sources.map(source=>source.id)});
  }});
  const run=runtime.createRun(1,{styleName:"水墨",useCase:"广告"});
  runtime.updatePlan(1,run.runId,1,[{type:"set_objective",value:"水墨研究修订"}]);
  assert.equal(seen,undefined);
  assert.equal(runtime.getRun(1,run.runId).approvedPlanRevision,undefined);
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const final=await waitFor(runtime,1,run.runId,"completed");
  assert.equal(seen.planRevision,2); assert.equal(seen.approvedPlanRevision,2);
  assert.equal(seen.mediaGenerationApproved,false);
  assert.equal(seen.status,"running"); assert.ok(seen.completedStepIds.includes("web"));
  assert.equal(final.approvedPlanRevision,2);
  assert.ok(runtime.events(1,run.runId,0).some(event=>event.type==="context.prepared"&&event.payload.trace.applied===false));
});

test("upstream failures remain recoverable and cannot fabricate report artifacts",async(t)=>{
  let fail=true;
  const {runtime}=setup(t,{tools:{web_search:async()=>{if(fail)throw new Error("搜索服务不可用");return {sources:[]};}}});
  const run=runtime.createRun(1,{styleName:"水彩",useCase:"广告"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  const failed=await waitFor(runtime,1,run.runId,"recovering");
  assert.equal(failed.artifacts.length,0);
  assert.match(failed.error.message,/搜索服务不可用/);
  fail=false;
  await runtime.act(1,run.runId,{type:"retry_step",stepId:"web"});
  await waitFor(runtime,1,run.runId,"completed");
});

test("edited retry creates a new unapproved revision and spends only after its approval",async(t)=>{
  const searches=[];let seen;
  const {runtime}=setup(t,{tools:{web_search:async(input)=>{
    searches.push(input.query);if(searches.length===1)throw new Error("temporary search failure");return {sources:[]};
  }},model:async(_input,ctx)=>{
    seen=ctx.toolState;return JSON.stringify({report:"修订后的报告",styleFeaturePack:{colors:["蓝"]},applicationPromptPack:{positive:"oil"},sourceIds:[]});
  }});
  const run=runtime.createRun(1,{styleName:"水墨",useCase:"广告"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  const failed=await waitFor(runtime,1,run.runId,"recovering"),seq=failed.lastSeq;
  await assert.rejects(()=>runtime.act(1,run.runId,{type:"retry_step",stepId:"web",expectedRevision:999,input:{query:"油画主题"}}),{code:"PLAN_REVISION_CONFLICT"});
  assert.equal(runtime.getRun(1,run.runId).lastSeq,seq);
  assert.equal(searches.length,1);
  await runtime.act(1,run.runId,{type:"retry_step",stepId:"web",expectedRevision:1,input:{query:"油画主题"}});
  const revised=runtime.getRun(1,run.runId);
  assert.equal(revised.status,"awaiting_plan_approval");assert.equal(revised.plan.revision,2);
  assert.equal(revised.approvedPlanRevision,1);assert.equal(revised.error,null);
  assert.equal(revised.plan.steps.find(step=>step.id==="context").status,"completed");
  assert.equal(revised.plan.steps.find(step=>step.id==="web").status,"pending");
  assert.equal(searches.length,1);assert.equal(seen,undefined);
  await assert.rejects(()=>runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1}),{code:"PLAN_REVISION_CONFLICT"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const final=await waitFor(runtime,1,run.runId,"completed");
  assert.deepEqual(searches,[run.plan.steps.find(step=>step.id==="web").input.query,"油画主题"]);
  assert.equal(final.approvedPlanRevision,2);assert.equal(seen.planRevision,2);assert.equal(seen.approvedPlanRevision,2);
  assert.equal(seen.mediaGenerationApproved,false);
  assert.deepEqual(runtime.events(1,run.runId).filter(event=>event.type==="plan.approved").map(event=>event.payload.revision),[1,2]);
});

test("unchanged retry checks an optional revision and preserves the approved plan",async(t)=>{
  let fail=true;
  const {runtime}=setup(t,{tools:{web_search:async()=>{if(fail)throw new Error("temporary");return {sources:[]};}}});
  const run=runtime.createRun(1,{styleName:"水墨"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  await waitFor(runtime,1,run.runId,"recovering");
  await assert.rejects(()=>runtime.act(1,run.runId,{type:"retry_step",stepId:"web",expectedRevision:2}),{code:"PLAN_REVISION_CONFLICT"});
  fail=false;
  await runtime.act(1,run.runId,{type:"retry_step",stepId:"web",expectedRevision:1,input:run.plan.steps.find(step=>step.id==="web").input});
  const final=await waitFor(runtime,1,run.runId,"completed");
  assert.equal(final.plan.revision,1);assert.equal(final.approvedPlanRevision,1);
  assert.equal(runtime.events(1,run.runId).filter(event=>event.type==="plan.approved").length,1);
});

test("pause aborts the active operation and ignores its late results; resume continues the run",async(t)=>{
  let release,signal,calls=0;
  const {runtime}=setup(t,{tools:{web_search:async(_input,ctx)=>{calls++;if(calls>1)return {sources:[]};signal=ctx.signal;return new Promise(resolve=>{release=resolve;});}}});
  const run=runtime.createRun(1,{styleName:"水彩",useCase:"广告"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  while(!release)await new Promise(resolve=>setTimeout(resolve,5));
  await runtime.act(1,run.runId,{type:"pause"});
  assert.equal(signal.aborted,true);
  release({sources:[{title:"late",url:"https://example.org/late",excerpt:"must be ignored"}]});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(runtime.getRun(1,run.runId).sources.length,0);
  await runtime.act(1,run.runId,{type:"resume"});
  await waitFor(runtime,1,run.runId,"completed");
});

for (const [name, invalid] of [
  ["array style pack", value=>({...value,styleFeaturePack:["blue"]})],
  ["array prompt pack", value=>({...value,applicationPromptPack:["blue"]})],
  ["empty style pack", value=>({...value,styleFeaturePack:{}})],
  ["empty prompt pack", value=>({...value,applicationPromptPack:{}})],
  ["blank report", value=>({...value,report:"  "})],
  ["unknown mixed citation", value=>({...value,sourceIds:[...value.sourceIds,"source_not_in_this_run"]})],
  ["non-string citation", value=>({...value,sourceIds:[...value.sourceIds,42]})],
  ["missing citations", value=>({...value,sourceIds:undefined})],
  ["malformed JSON", ()=>"{invalid"],
]) {
  test(`invalid research output (${name}) creates no partial artifacts and can be retried`,async(t)=>{
    let bad=true;
    const {runtime}=setup(t,{model:async({sources})=>{
      const value={report:"有引用的报告",styleFeaturePack:{colors:["蓝色"]},applicationPromptPack:{positive:"blue studio"},sourceIds:sources.map(source=>source.id)};
      // A valid retry also proves fenced JSON and repeated known citations remain supported.
      return bad?invalid(value):"```json\n"+JSON.stringify({...value,sourceIds:[...value.sourceIds,...value.sourceIds]})+"\n```";
    }});
    const run=runtime.createRun(1,{styleName:"工业风",useCase:"短片"});
    await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
    const failed=await waitFor(runtime,1,run.runId,"recovering");
    assert.equal(failed.error.code,"UPSTREAM_OUTPUT_INVALID");
    assert.equal(failed.error.stepId,"synthesis");
    assert.equal(failed.artifacts.length,0);
    assert.ok(failed.sources.every(source=>source.citedBy.length===0));
    assert.equal(runtime.events(1,run.runId).filter(event=>event.type==="artifact.created").length,0);
    bad=false;
    await runtime.act(1,run.runId,{type:"retry_step",stepId:"synthesis"});
    const completed=await waitFor(runtime,1,run.runId,"completed");
    assert.equal(completed.artifacts.length,3);
    assert.equal(completed.metrics.modelCalls,2);
    assert.equal(completed.metrics.toolCalls,2);
    assert.ok(completed.artifacts.every(artifact=>artifact.sourceIds.length===1&&artifact.sourceIds[0]===completed.sources[0].id));
    assert.equal(completed.sources[0].citedBy.length,3);
  });
}
