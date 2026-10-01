"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-research-routes-"));
process.env.STZH_DATA_DIR=dir;
process.env.JWT_SECRET="research-route-test-secret-longer-than-32-characters";
process.env.STZH_LLM_ENCRYPTION_KEY="research-route-test-encryption-key-longer-than-32-characters";
const app=require("../app.js"),db=require("../db.js");
const {ResearchRuntime}=require("../research-runtime.js");
let server,base,owner,stranger;
const runtime=new ResearchRuntime({db,tools:{get_opc_context:async()=>({}),web_search:async()=>({sources:[{title:"Transport fixture",url:"https://example.org/ref",excerpt:"test"}]}),rag_search:async()=>({sources:[]})},model:async({sources})=>({report:"fixture report",styleFeaturePack:{color:"blue"},applicationPromptPack:{prompt:"blue"},sourceIds:sources.map(source=>source.id)})});
async function request(route,token,body,method=body?"POST":"GET"){
  const response=await fetch(base+route,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
test.before(async()=>{
  app.locals.researchRuntime=runtime;
  server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;
  owner=(await request("/api/auth/register",null,{username:"research-owner",password:"test-password-123"})).body;
  stranger=(await request("/api/auth/register",null,{username:"research-stranger",password:"test-password-123"})).body;
});
test.after(async()=>{await runtime.stop();await app.locals.researchRuntime?.stop();await app.locals.pluginService?.stop();await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test("authenticated research HTTP chain returns persisted plans, artifacts and resumable events",async()=>{
  assert.equal((await request("/api/research/runs")).status,401);
  const created=await request("/api/research/runs",owner.token,{styleName:"工业风",useCase:"短片"});
  assert.equal(created.status,201);
  const id=created.body.run.runId;
  assert.equal((await request(`/api/research/runs/${id}`,stranger.token)).status,404);
  assert.equal((await request(`/api/research/runs/${id}/events`,stranger.token)).status,404);
  assert.equal((await request(`/api/research/runs/${id}/plan`,owner.token,{expectedRevision:99,operations:[]},"PATCH")).status,409);
  const approved=await request(`/api/research/runs/${id}/actions`,owner.token,{type:"approve_plan",expectedRevision:1});
  assert.equal(approved.status,200);
  let result;
  for(let attempt=0;attempt<30;attempt++){result=await request(`/api/research/runs/${id}`,owner.token);if(result.body.run.status==="completed")break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(result.body.run.status,"completed");
  assert.equal(result.body.run.artifacts.length,3);
  const events=await request(`/api/research/runs/${id}/events?afterSeq=2`,owner.token);
  assert.equal(events.body.events[0].seq,3);
  assert.equal(events.body.events.at(-1).payload.snapshot.status,"completed");
  assert.equal((await request("/api/research/runs",stranger.token)).body.runs.length,0);
});

test("real runtime refuses approval before spending calls when no account model is configured",async()=>{
  delete app.locals.researchRuntime;
  const created=await request("/api/research/runs",owner.token,{styleName:"水彩",useCase:"广告"});
  const id=created.body.run.runId;
  const approved=await request(`/api/research/runs/${id}/actions`,owner.token,{type:"approve_plan",expectedRevision:1});
  assert.equal(approved.status,400);
  assert.equal(approved.body.error.code,"MODEL_NOT_CONFIGURED");
  assert.equal((await request(`/api/research/runs/${id}`,owner.token)).body.run.status,"awaiting_plan_approval");
});

test("production research route discovers only the authenticated project's active plugin steps",async()=>{
  delete app.locals.researchRuntime;
  const project=(await request("/api/creative-projects",owner.token,{name:"研究插件测试"})).body.project;
  const service=require("../routes/plugins.js").getService({app});
  const userId=owner.user.id;
  const manifest={schemaVersion:1,id:"owned.route-test",name:"路线测试",version:"1.0.0",description:"fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs"},requestedPermissionTier:"safe",contributes:{tools:[{name:"lookup",description:"fixture",risk:"read",inputSchema:{type:"object"},outputSchema:{type:"object"},timeoutMs:1000}]}};
  const pkg=service.store.installPackage(userId,{manifest,files:{"index.cjs":"module.exports={tools:{lookup:async()=>({sources:[]})}};"},source:{type:"local"},resolvedRef:"test",signatureStatus:"unsigned",confirmations:{acceptsWeakSandboxRisk:true,acceptsUnsignedRisk:true,acceptedPermissionTier:"safe"}});
  const bound=await service.bind(userId,project.id,{pluginId:pkg.pluginId,version:pkg.version,installationId:pkg.installationId,enabled:true,permissionTier:"safe",config:{}});
  assert.equal(bound.status,"healthy");
  const input={styleName:"工业风",projectId:project.id};
  assert.equal((await request("/api/research/runs",stranger.token,input)).status,404);
  const created=await request("/api/research/runs",owner.token,input);
  assert.equal(created.status,201);
  const step=created.body.run.plan.steps.find(step=>step.plugin);
  assert.equal(step.plugin.generationId,bound.id);assert.equal(step.enabled,false);
  // Client-supplied tool metadata never becomes an executable plan.
  const detached=await request("/api/research/runs",owner.token,{styleName:"工业风",pluginSteps:[step]});
  assert.equal(detached.body.run.plan.steps.some(step=>step.plugin),false);
  await service.disable(userId,project.id,pkg.pluginId);
  const disabled=await request("/api/research/runs",owner.token,input);
  assert.equal(disabled.body.run.plan.steps.some(step=>step.plugin),false);
});

test("production research model adapter keeps current style and excludes conflicting saved preferences",async(t)=>{
  const provider=await request("/api/model-providers",owner.token,{name:"Research context fixture",protocol:"openai",baseUrl:"https://research-fixture.invalid/v1",model:"fixture",apiKey:"synthetic-only-key"});
  assert.equal(provider.status,201,JSON.stringify(provider.body));
  const created=await request("/api/research/runs",owner.token,{styleName:"水墨",useCase:"短片",providerId:provider.body.provider.id});
  assert.equal(created.status,201);
  const run=created.body.run;
  const store=require("../studio-memory-store.js").createStudioMemoryStore(db);
  const candidate=store.create(owner.user.id,{requestKey:"research-style-conflict",mode:"workflow",slot:"style",content:"水墨研究也始终使用工业极简风格"}).item;
  const oldPreference=store.confirm(owner.user.id,candidate.id,candidate.revision);
  const services=require("../routes/creative-agent.js").providerServices;
  const originalInvoke=services.invokeProvider, priorMode=process.env.STZH_CONTEXT_MODE;
  t.after(()=>{services.invokeProvider=originalInvoke;if(priorMode===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=priorMode;});
  process.env.STZH_CONTEXT_MODE="enforce";
  let outgoing,trace;
  services.invokeProvider=async(_row,messages)=>{outgoing=messages;return "synthetic result";};
  // Exercise the production adapter directly; this does not approve or execute
  // the run, nor call search/RAG/the remote model.
  await app.locals.researchRuntime.model({input:run.input,objective:"水墨研究",sources:[]},{userId:owner.user.id,runId:run.runId,input:run.input,signal:new AbortController().signal,toolState:{status:"awaiting_plan_approval",approvedPlanRevision:null,mediaGenerationApproved:false},onContextTrace:value=>{trace=value;}});
  assert.deepEqual(trace.creativeState.constraints,{style:"水墨",useCase:"短片"});
  assert.ok(!trace.selected.some(item=>item.id===oldPreference.id));
  assert.equal(trace.dropped.current_constraint,1);
  assert.deepEqual(JSON.parse(outgoing.at(-2).content).constraints,trace.creativeState.constraints);
  assert.match(outgoing[0].content,/"mediaGenerationApproved":false/);
  assert.equal(app.locals.researchRuntime.getRun(owner.user.id,run.runId).status,"awaiting_plan_approval");
});
