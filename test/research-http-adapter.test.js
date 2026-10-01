const test=require("node:test"),assert=require("node:assert/strict");

test("research launch forwards temporary exclusions without an approval action",async()=>{
  const {createHttpResearchRuntimeAdapter}=await import("../app/lib/research-runtime/http-adapter.ts");
  const calls=[];
  const adapter=createHttpResearchRuntimeAdapter({request:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return {run:{runId:"new-plan",status:"awaiting_plan_approval"}};
  }});
  const result=await adapter.createRun({styleName:"水墨",useCase:"广告",providerId:null,projectId:"project-a",excludedMemoryIds:["memory-a"]});
  assert.equal(calls.length,1);assert.equal(calls[0].url,"/api/research/runs");
  assert.deepEqual(calls[0].body.excludedMemoryIds,["memory-a"]);
  assert.equal(result.status,"awaiting_plan_approval");
  adapter.dispose();
});

test("HTTP research adapter forwards revisions and closes polling on dispose",async()=>{
  const {createHttpResearchRuntimeAdapter}=await import("../app/lib/research-runtime/http-adapter.ts");
  const calls=[];
  let release;
  const adapter=createHttpResearchRuntimeAdapter({request:async(url,options)=>{
    calls.push({url,body:options?.body&&JSON.parse(options.body)});
    if(url.includes("/events"))return new Promise(resolve=>{release=resolve;});
    if(url.endsWith("/plan"))return {plan:{revision:2}};
    return {run:{runId:"research/one"}};
  }});
  await adapter.updatePlan("research/one",1,[{type:"set_budget",value:"deep"}]);
  assert.equal(calls[0].url,"/api/research/runs/research%2Fone/plan");
  assert.equal(calls[0].body.expectedRevision,1);
  const events=[];
  adapter.subscribe("research/one",7,{onEvent:e=>events.push(e),onError:()=>{}});
  assert.match(calls[1].url,/afterSeq=7/);
  adapter.dispose();
  release({events:[{seq:8}]});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(events,[]);
  await assert.rejects(adapter.getRun("research/one"),/关闭/);
});
