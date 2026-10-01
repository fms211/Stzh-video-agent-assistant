"use strict";
const { MemoryError } = require("./studio-memory-store.js");
const { sessionStorage } = require("./studio-session-scope.js");
const id = value => typeof value === "string" && value.trim() && value.length <= 200;
const fail = (message, status = 400) => { throw new MemoryError("WORKFLOW_PLAN_CONFLICT", message, status); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function createWorkflowPlans(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS studio_workflow_plans (
    user_id INTEGER NOT NULL, session_id TEXT NOT NULL REFERENCES opc_sessions(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL, plan TEXT NOT NULL,
    PRIMARY KEY(user_id,session_id,run_id)
  )`);
  function owned(userId, sessionId, runId) {
    if (!id(sessionId) || !id(runId)) fail("工作流运行标识无效");
    if (!sessionStorage(db,userId,"workflow",sessionId)) fail("工作流会话不可用",404);
  }
  function read(userId, sessionId, runId) {
    owned(userId,sessionId,runId);
    const row=db.prepare("SELECT plan FROM studio_workflow_plans WHERE user_id=? AND session_id=? AND run_id=?").get(userId,sessionId,runId);
    return row ? JSON.parse(row.plan) : null;
  }
  function save(userId, sessionId, runId, plan) {
    owned(userId,sessionId,runId);
    const fields=["version","workflowId","input","steps","originalStepCount","definitionHash","execution"];
    if (!plan || typeof plan!=="object" || Array.isArray(plan) || Object.keys(plan).some(key=>!fields.includes(key))
      || plan.version!==1 || !id(plan.workflowId) || !Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length>100
      || !Number.isInteger(plan.originalStepCount) || plan.originalStepCount<1 || plan.originalStepCount>plan.steps.length
      || plan.steps.some(step=>!step || typeof step!=="object" || Array.isArray(step) || Object.keys(step).some(key=>!["id","name"].includes(key)) || !id(step.id) || !id(step.name))
      || !plan.input || typeof plan.input!=="object" || Array.isArray(plan.input) || Object.keys(plan.input).length>32
      || Object.entries(plan.input).some(([key,value])=>!id(key) || typeof value!=="string" || value.length>8000)) fail("工作流计划格式无效");
    if(plan.definitionHash!==undefined&&!/^[a-f0-9]{64}$/.test(plan.definitionHash))fail("工作流定义版本无效");
    if(plan.execution!==undefined){
      const execution=plan.execution;
      if(!execution||typeof execution!=="object"||Array.isArray(execution)
        ||Object.keys(execution).some(key=>!["providerId","providerFingerprint","projectId","currentConstraints","excludedMemoryIds"].includes(key))
        ||!id(execution.providerId)||!/^[a-f0-9]{64}$/.test(execution.providerFingerprint)
        ||(execution.projectId!==undefined&&!id(execution.projectId)))fail("工作流配置快照无效");
      const {normalizeCurrentConstraints,normalizeExcludedMemoryIds}=require("./studio-context-service.js");
      normalizeCurrentConstraints(execution.currentConstraints);
      normalizeExcludedMemoryIds(execution.excludedMemoryIds);
    }
    // Keep input insertion order: some prompt builders serialize the input.
    // Canonicalization is for equality only, not for rewriting saved prompts.
    const serialized=JSON.stringify(plan);
    if(Buffer.byteLength(serialized,"utf8")>65536)fail("工作流计划过大",413);
    return db.transaction(()=>{
      const previous=read(userId,sessionId,runId);
      if(previous){
        if(JSON.stringify(canonical(previous))!==JSON.stringify(canonical(plan)))fail("运行计划已经保存，不能修改步骤或输入",409);
        return {plan:previous,created:false};
      }
      // Planner output may already exist. Execution records may not be retrofitted.
      if(db.prepare("SELECT 1 FROM studio_workflow_results WHERE user_id=? AND session_id=? AND run_id=? AND step_id<>?").get(userId,sessionId,runId,`${runId}:plan`))fail("旧运行已有执行记录，不能补写恢复计划",409);
      db.prepare("INSERT INTO studio_workflow_plans VALUES(?,?,?,?)").run(userId,sessionId,runId,serialized);
      return {plan:JSON.parse(serialized),created:true};
    })();
  }
  return {read,save};
}
module.exports={createWorkflowPlans};
