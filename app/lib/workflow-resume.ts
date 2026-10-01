import { getWorkflowById, getWorkflowStepsWithReflection, workflowDefinitionHash, type WorkflowInput } from "./opc-workflows.ts";
import type { SavedWorkflowStep } from "./workflow-result-recovery";

export type SavedWorkflowPlan = {
  version: 1; workflowId: string; input: WorkflowInput;
  steps: Array<{id:string;name:string}>; originalStepCount:number; definitionHash?:string;
  execution?: {providerId:string;providerFingerprint:string;projectId?:string;currentConstraints:Record<string,string>;excludedMemoryIds:string[]};
};

/** Reconstruct exactly the saved plan; never ask a planner to replace it. */
export async function restoreWorkflowPlan(plan:SavedWorkflowPlan,runId:string,results:SavedWorkflowStep[],systemPrompt:string) {
  const workflow=getWorkflowById(plan.workflowId);
  if(!workflow || workflow.runtimeMode || plan.version!==1 || !plan.definitionHash || !plan.execution) throw new Error("此运行缺少可恢复的版本或配置快照，请恢复已有结果或新建运行。");
  const original=plan.steps.slice(0,plan.originalStepCount).map(saved=>{
    const definition=workflow.steps.find(step=>step.id===saved.id);
    if(!definition)throw new Error("工作流步骤已变化，不能沿用旧运行继续。");
    return definition;
  });
  const steps=getWorkflowStepsWithReflection({...workflow,steps:original},plan.input);
  if(JSON.stringify(steps.map(({id,name})=>({id,name})))!==JSON.stringify(plan.steps.map(({id,name})=>({id,name})))
    || await workflowDefinitionHash(steps,plan.input,systemPrompt)!==plan.definitionHash) throw new Error("工作流定义版本已变化，请保留旧结果并新建运行。");
  const completed=new Map<number,SavedWorkflowStep>();
  for(const result of results){
    if(result.stepId===`${runId}:plan`)continue;
    if(!Number.isInteger(result.stepIndex)||!steps[result.stepIndex]||result.workflowId!==plan.workflowId
      ||result.stepId!==`${runId}:${result.stepIndex}:${steps[result.stepIndex].id}`||completed.has(result.stepIndex))throw new Error("步骤记录与保存计划不一致，不能继续。");
    if(result.status!=="completed"||typeof result.result?.text!=="string")throw new Error("已有步骤仍在执行或结果未知，请先核对结果；不会重复调用。");
    completed.set(result.stepIndex,result);
  }
  for(let index=0;index<completed.size;index++)if(!completed.has(index))throw new Error("完成记录不连续，不能跳过缺失步骤。");
  return {workflow,steps,nextIndex:completed.size,
    completedStepIds:steps.slice(0,completed.size).map((step,index)=>`${runId}:${index}:${step.id}`),
    previousOutput:completed.get(completed.size-1)?.result?.text || "",
    originalOutput:completed.get(plan.originalStepCount-1)?.result?.text || "",
  };
}
