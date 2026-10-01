"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const Database=require("better-sqlite3");
const {PluginStore}=require("../plugin-system/store.js");
const {GenerationManager}=require("../plugin-system/generation-manager.js");
const {researchPluginSteps,invokeResearchPlugin}=require("../plugin-system/research-tools.js");
const {ResearchRuntime}=require("../research-runtime.js");

async function setup(t,script,inputSchema={type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-research-plugin-")),db=new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2);CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER,name TEXT);INSERT INTO creative_projects VALUES('p1',1,'Owner'),('p2',2,'Other'),('p3',1,'No plugins');");
  const store=new PluginStore({db,root}),generations=new GenerationManager({store});
  let modelInput;
  const runtime=new ResearchRuntime({db,planTools:(uid,input)=>researchPluginSteps(generations,uid,input.projectId),pluginTool:(...args)=>invokeResearchPlugin(generations,...args),
    tools:{get_opc_context:async()=>({}),web_search:async()=>({sources:[]})},
    model:async input=>{modelInput=input;return {report:"test report",styleFeaturePack:{color:"blue"},applicationPromptPack:{positive:"blue"},sourceIds:input.sources.map(source=>source.id)};}});
  t.after(async()=>{await runtime.stop();await generations.stop();db.close();fs.rmSync(root,{recursive:true,force:true});});
  const manifest={schemaVersion:1,id:"owned.research",name:"项目资料",version:"1.0.0",description:"fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs"},requestedPermissionTier:"safe",contributes:{tools:[{
    name:"lookup",description:"读取测试项目资料",risk:"read",inputSchema,outputSchema:{type:"object",required:["sources"],properties:{sources:{type:"array"}}},timeoutMs:2000,
  }]}};
  const pkg=store.installPackage(1,{manifest,files:{"index.cjs":script||"module.exports={tools:{lookup:async input=>({sources:[{title:input.query,excerpt:'project material'}]})}};"},source:{type:"local"},resolvedRef:"fixture",signatureStatus:"unsigned",confirmations:{acceptsWeakSandboxRisk:true,acceptsUnsignedRisk:true,acceptedPermissionTier:"safe"}});
  store.bind(1,"p1",{pluginId:pkg.pluginId,version:pkg.version,installationId:pkg.installationId,enabled:true,permissionTier:"safe",config:{}});
  assert.equal((await generations.restart(1,"p1")).status,"healthy");
  const create=()=>runtime.createRun(1,{styleName:"工业风",useCase:"短片",projectId:"p1"});
  const enable=(run,input={query:"风格资料"})=>runtime.updatePlan(1,run.runId,1,[{type:"set_optional_enabled",stepId:"plugin:owned.research:lookup",enabled:true},{type:"set_step_input",stepId:"plugin:owned.research:lookup",input:{arguments:input}}]);
  return {runtime,generations,create,enable,getModelInput:()=>modelInput};
}
async function wait(runtime,id,status) {
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){const run=runtime.getRun(1,id);if(run.status===status)return run;await new Promise(resolve=>setTimeout(resolve,5));}
  throw new Error(`Expected ${status}; got ${runtime.getRun(1,id).status}`);
}

test("project tools are optional, account scoped and excluded until explicitly enabled",async t=>{
  const {runtime,generations,create,getModelInput}=await setup(t);
  const run=create(),step=run.plan.steps.find(step=>step.plugin);
  assert.equal(step.enabled,false);assert.equal(step.plugin.permissionTier,"safe");assert.equal(step.plugin.version,"1.0.0");
  assert.deepEqual(researchPluginSteps(generations,1,"p3"),[]);
  assert.throws(()=>researchPluginSteps(generations,2,"p1"),{code:"PROJECT_NOT_FOUND"});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:1});
  const final=await wait(runtime,run.runId,"completed");
  assert.equal(final.metrics.toolCalls,2);assert.deepEqual(getModelInput().pluginResults,[]);
});

test("approved plugin step executes a real host with schema checks and traceable model evidence",async t=>{
  const {runtime,create,enable,getModelInput}=await setup(t);const run=create();enable(run);
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const final=await wait(runtime,run.runId,"completed");
  assert.equal(final.metrics.toolCalls,3);assert.equal(final.artifacts.length,3);
  assert.equal(final.sources[0].sourceType,"plugin");assert.equal(final.sources[0].trust,"untrusted");assert.equal(final.sources[0].pluginId,"owned.research");
  assert.equal(final.sources[0].citedBy.length,3);
  assert.equal(getModelInput().pluginResults[0].result.sources[0].excerpt,"project material");
  assert.equal(getModelInput().pluginResults[0].trust,"untrusted");
});

test("invalid plugin input recovers without model execution and retry uses the same pinned tool",async t=>{
  const {runtime,create,enable}=await setup(t);const run=create();enable(run,{});
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const failed=await wait(runtime,run.runId,"recovering");assert.equal(failed.error.code,"PLUGIN_INPUT_INVALID");assert.equal(failed.metrics.modelCalls,0);
  await runtime.act(1,run.runId,{type:"retry_step",stepId:failed.error.stepId,expectedRevision:failed.plan.revision,input:{arguments:{query:"fixed"}}});
  const revised=runtime.getRun(1,run.runId);
  assert.equal(revised.status,"awaiting_plan_approval");assert.equal(revised.plan.revision,failed.plan.revision+1);
  assert.equal(revised.metrics.modelCalls,0);
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:revised.plan.revision});
  assert.equal((await wait(runtime,run.runId,"completed")).sources[0].title,"fixed");
});

test("a changed generation cannot silently replace an approved plugin and safe mode removes new contributions",async t=>{
  const {runtime,generations,create,enable}=await setup(t);const run=create();enable(run);
  await generations.restart(1,"p1");
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const failed=await wait(runtime,run.runId,"recovering");assert.equal(failed.error.code,"GENERATION_CONFLICT");assert.equal(failed.metrics.modelCalls,0);
  await generations.enterSafeMode(1,"p1");assert.deepEqual(researchPluginSteps(generations,1,"p1"),[]);
});

test("plugin output schema failures cannot reach synthesis",async t=>{
  const {runtime,create,enable}=await setup(t,"module.exports={tools:{lookup:async()=>({wrong:true})}};");const run=create();enable(run);
  await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const failed=await wait(runtime,run.runId,"recovering");assert.equal(failed.error.code,"PLUGIN_OUTPUT_INVALID");assert.equal(failed.metrics.modelCalls,0);assert.equal(failed.artifacts.length,0);
});

test("JSON scalar tool inputs survive the object-shaped plan operation boundary",async t=>{
  const {runtime,create,enable}=await setup(t,"module.exports={tools:{lookup:async input=>({sources:[{title:input,excerpt:'scalar input'}]})}};",{type:"string",minLength:1});
  const run=create();enable(run,"scalar query");await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  assert.equal((await wait(runtime,run.runId,"completed")).sources[0].title,"scalar query");
});

test("cancelled research does not adopt a late plugin result or start synthesis",async t=>{
  const {runtime,create,enable}=await setup(t,"module.exports={tools:{lookup:async()=>{await new Promise(resolve=>setTimeout(resolve,150));return {sources:[{title:'late',excerpt:'ignored'}]};}}};");
  const run=create();enable(run);await runtime.act(1,run.runId,{type:"approve_plan",expectedRevision:2});
  const deadline=Date.now()+2000;
  while(runtime.getRun(1,run.runId).activeStepId!=="plugin:owned.research:lookup"&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(runtime.getRun(1,run.runId).activeStepId,"plugin:owned.research:lookup");
  await runtime.act(1,run.runId,{type:"cancel"});
  await new Promise(resolve=>setTimeout(resolve,220));
  const final=runtime.getRun(1,run.runId);assert.equal(final.status,"cancelled");assert.equal(final.sources.length,0);assert.equal(final.metrics.modelCalls,0);
});
