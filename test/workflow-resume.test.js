const test=require("node:test"),assert=require("node:assert/strict");
async function fixture(){
 const api=await import("../app/lib/opc-workflows.ts"),{restoreWorkflowPlan}=await import("../app/lib/workflow-resume.ts");
 const workflow=Object.values(api.getWorkflowsByCategory()).flat().find(w=>w.dynamic&&w.reflect&&!w.runtimeMode);
 const original=[workflow.steps[1],workflow.steps[0],workflow.steps[1]],input={topic:"测试主题"};
 const steps=api.getWorkflowStepsWithReflection({...workflow,steps:original},input);
 const plan={version:1,workflowId:workflow.id,input,steps:steps.map(({id,name})=>({id,name})),originalStepCount:original.length,
 definitionHash:await api.workflowDefinitionHash(steps,input,"system-v1"),execution:{providerId:"mock",providerFingerprint:"a".repeat(64),currentConstraints:{},excludedMemoryIds:[]}};
 const result=index=>({stepId:`run:${index}:${steps[index].id}`,stepIndex:index,workflowId:workflow.id,status:"completed",result:{text:`output-${index}`}});
 return {plan,result,restoreWorkflowPlan};
}
test("resume reconstructs dynamic ordering and repeated steps without replanning and restores reflection input",async()=>{
 const {plan,result,restoreWorkflowPlan}=await fixture();
 const restored=await restoreWorkflowPlan(plan,"run",[result(0),result(1),result(2)],"system-v1");
 assert.equal(restored.nextIndex,3);assert.equal(restored.originalOutput,"output-2");assert.equal(restored.previousOutput,"output-2");
 assert.deepEqual(restored.steps.map(({id,name})=>({id,name})),plan.steps);
 assert.equal(restored.completedStepIds.length,3);
});
test("resume refuses unknown results, gaps, changed definitions and legacy plans",async()=>{
 const {plan,result,restoreWorkflowPlan}=await fixture();
 for(const results of [[{...result(0),status:"uncertain",result:null}],[result(1)],[result(0),result(0)],[{...result(0),stepId:"other"}]]){
  await assert.rejects(restoreWorkflowPlan(plan,"run",results,"system-v1"));
 }
 await assert.rejects(restoreWorkflowPlan(plan,"run",[],"system-v2"),/版本已变化/);
 await assert.rejects(restoreWorkflowPlan({...plan,execution:undefined},"run",[],"system-v1"),/缺少/);
 assert.equal((await restoreWorkflowPlan(plan,"run",[],"system-v1")).nextIndex,0);
});
