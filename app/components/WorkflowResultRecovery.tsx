"use client";
import { useEffect, useRef, useState } from "react";
import { creativeApi } from "../lib/creative-agent-api";
import type { SavedWorkflowStep } from "../lib/workflow-result-recovery";
import type { SavedWorkflowPlan } from "../lib/workflow-resume";

export function WorkflowResultRecovery({sessionId,runId,disabled,onRecovered,onContinue}:{sessionId:string;runId:string;disabled:boolean;onRecovered:(steps:SavedWorkflowStep[])=>void;onContinue:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [remaining,setRemaining]=useState<number|null>(null);
  const requestVersion=useRef(0);
  useEffect(()=>{requestVersion.current++;setStatus("");setBusy(false);setRemaining(null);return()=>{requestVersion.current++;};},[sessionId,runId]);
  async function recover() {
    const version=++requestVersion.current;
    setBusy(true);setStatus("");setRemaining(null);
    try {
      const result=await creativeApi<{sessionId:string;runId:string;steps:SavedWorkflowStep[];plan?:SavedWorkflowPlan|null;configurationState?:string}>(`/api/opc/sessions/${encodeURIComponent(sessionId)}/workflow-runs/${encodeURIComponent(runId)}`);
      if(version!==requestVersion.current)return;
      if(result.sessionId!==sessionId||result.runId!==runId||!Array.isArray(result.steps))throw new Error("运行记录不匹配，请重新读取");
      onRecovered(result.steps);
      const complete=result.steps.filter(step=>step.status==="completed").length;
      const uncertain=result.steps.length-complete;
      const executionSteps=result.steps.filter(step=>step.stepId!==`${runId}:plan`);
      if(result.plan?.execution&&result.plan.definitionHash&&executionSteps.every(step=>step.status==="completed")&&(result.configurationState==="current"||executionSteps.length===result.plan.steps.length))setRemaining(Math.max(0,result.plan.steps.length-executionSteps.length));
      setStatus(`已读取 ${complete} 条完成回复${uncertain?`；${uncertain} 条仍在执行或结果未知，未重新调用`:""}。已匹配的步骤恢复到会话；本操作不会继续执行工作流。${result.configurationState==="changed"?" 原模型配置或项目已变化，不能继续未完成步骤。":""}`);
    } catch(error) {if(version===requestVersion.current)setStatus(error instanceof Error?error.message:"读取运行结果失败");}
    finally {if(version===requestVersion.current)setBusy(false);}
  }
  async function continueRun(){
    const version=++requestVersion.current;
    setBusy(true);setStatus("正在核对原运行并继续…");
    try{
      await onContinue();
      if(version===requestVersion.current){setRemaining(null);setStatus("本次继续操作已结束，请核对步骤结果与运行状态。");}
    }catch(error){if(version===requestVersion.current)setStatus(error instanceof Error?error.message:"继续失败");}
    finally{if(version===requestVersion.current)setBusy(false);}
  }
  return <div className="studio-session-tools">
    <button type="button" disabled={disabled||busy} onClick={()=>void recover()}>{busy?"正在核对结果…":"核对并恢复已完成步骤"}</button>
    {remaining!==null&&<><p>沿用原运行的输入、模型、项目和创作参数；已完成步骤不重新调用。{remaining>0?`剩余 ${remaining} 步会调用模型及相关检索服务。`:"步骤已完成，可恢复会话中的完成状态。"}</p><button type="button" disabled={disabled||busy} onClick={()=>void continueRun()}>{remaining>0?"继续未完成步骤（会调用模型）":"恢复完成状态（不调用模型）"}</button></>}
    {status&&<p role="status">{status}</p>}
  </div>;
}
