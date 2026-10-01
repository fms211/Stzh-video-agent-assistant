"use strict";
const { createHash } = require("node:crypto");
const { MemoryError } = require("./studio-memory-store.js");
const { sessionStorage } = require("./studio-session-scope.js");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function createWorkflowResults(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS studio_workflow_results (
    user_id INTEGER NOT NULL, session_id TEXT NOT NULL REFERENCES opc_sessions(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL, workflow_id TEXT NOT NULL, step_id TEXT NOT NULL, step_index INTEGER NOT NULL,
    request_hash TEXT NOT NULL, status TEXT NOT NULL, response TEXT,
    PRIMARY KEY(user_id, session_id, run_id, step_id)
  )`);
  const plans = require("./studio-workflow-plans.js").createWorkflowPlans(db);
  const rowFor = (userId, ref, stepId = ref.stepId) => db.prepare("SELECT * FROM studio_workflow_results WHERE user_id=? AND session_id=? AND run_id=? AND step_id=?").get(userId, ref.sessionId, ref.runId, stepId);
  const checkOwner = (userId, ref) => {
    if (!sessionStorage(db, userId, "workflow", ref.sessionId)) throw new MemoryError("WORKFLOW_SESSION_UNAVAILABLE", "工作流会话不可用", 404);
  };
  function checkPlan(userId, ref) {
    const plan=plans.read(userId,ref.sessionId,ref.runId);
    if(plan && (plan.workflowId!==ref.workflowId || ref.stepIndex>=plan.steps.length
      || ref.stepId!==`${ref.runId}:${ref.stepIndex}:${plan.steps[ref.stepIndex].id}`
      || JSON.stringify(ref.previousStepIds)!==JSON.stringify(plan.steps.slice(0,ref.stepIndex).map((step,index)=>`${ref.runId}:${index}:${step.id}`)))) {
      throw new MemoryError("WORKFLOW_PLAN_CONFLICT","步骤与已保存运行计划不一致",409);
    }
  }
  function inspect(userId, ref, request) {
    checkOwner(userId, ref);
    checkPlan(userId, ref);
    const requestHash = digest(request);
    const existing = rowFor(userId, ref);
    if (existing) {
      if (existing.request_hash !== requestHash || existing.workflow_id !== ref.workflowId) throw new MemoryError("WORKFLOW_REQUEST_CONFLICT", "该步骤已有不同请求，请从工作流入口新建运行", 409);
      if (existing.status !== "completed") throw new MemoryError("WORKFLOW_RESULT_UNCERTAIN", "该步骤正在执行或结果尚未确认，不能重复发起；请先核对运行结果", 409);
      return { cached: JSON.parse(existing.response), requestHash };
    }
    const predecessors = ref.previousStepIds.map((stepId, index) => {
      const row = rowFor(userId, ref, stepId);
      if (!row || row.status !== "completed" || row.workflow_id !== ref.workflowId || row.step_index !== index) throw new MemoryError("WORKFLOW_PREDECESSOR_UNAVAILABLE", "前序步骤缺少本会话服务端完成记录，不能继续执行", 409);
      const response = JSON.parse(row.response);
      return { stepId, stepIndex: index, text: response.text, ...(response.referenceNotes ? { referenceNotes: response.referenceNotes } : {}), fingerprint: digest(response.text) };
    });
    return { requestHash, predecessors };
  }
  function claim(userId, ref, requestHash) {
    return db.transaction(() => {
    checkOwner(userId, ref);
    checkPlan(userId, ref);
    const result = db.prepare("INSERT OR IGNORE INTO studio_workflow_results(user_id,session_id,run_id,workflow_id,step_id,step_index,request_hash,status) VALUES(?,?,?,?,?,?,?,'running')").run(userId, ref.sessionId, ref.runId, ref.workflowId, ref.stepId, ref.stepIndex, requestHash);
    if (!result.changes) throw new MemoryError("WORKFLOW_RESULT_UNCERTAIN", "该步骤已有请求，不能重复执行", 409);
    })();
  }
  function complete(userId, ref, response) {
    checkOwner(userId, ref);
    const result = db.prepare("UPDATE studio_workflow_results SET status='completed',response=? WHERE user_id=? AND session_id=? AND run_id=? AND step_id=? AND status='running'").run(JSON.stringify(response), userId, ref.sessionId, ref.runId, ref.stepId);
    if (!result.changes) throw new MemoryError("WORKFLOW_RESULT_UNCERTAIN", "步骤结果未能保存，请先核对运行状态", 409);
  }
  function uncertain(userId, ref) {
    db.prepare("UPDATE studio_workflow_results SET status='uncertain' WHERE user_id=? AND session_id=? AND run_id=? AND step_id=? AND status='running'").run(userId, ref.sessionId, ref.runId, ref.stepId);
  }
  function readRun(userId, sessionId, runId) {
    checkOwner(userId, {sessionId});
    return db.prepare("SELECT step_id,step_index,workflow_id,status,response FROM studio_workflow_results WHERE user_id=? AND session_id=? AND run_id=? ORDER BY step_index,step_id").all(userId,sessionId,runId).map(row=>({stepId:row.step_id,stepIndex:row.step_index,workflowId:row.workflow_id,status:row.status,result:row.status==="completed"?JSON.parse(row.response):null}));
  }
  return { inspect, claim, complete, uncertain, readRun, readPlan: plans.read, savePlan: plans.save };
}
module.exports = { createWorkflowResults };
