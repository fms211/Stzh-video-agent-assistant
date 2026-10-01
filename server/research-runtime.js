"use strict";

const { randomUUID, createHash } = require("node:crypto");
const {normalizeExcludedMemoryIds}=require("./studio-context-service.js");
const {researchArtifactContent}=require("./research-artifact-evidence.js");
const clone = (value) => JSON.parse(JSON.stringify(value));
const inputIdentity = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const nowIso = () => new Date().toISOString();
const TERMINAL = new Set(["completed", "cancelled"]);
const BUDGETS = { economy: 3, standard: 6, deep: 12 };

class ResearchError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

function text(value, label, max = 5000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ResearchError("INVALID_PLAN_OPERATION", `${label}不能为空且不能超过${max}字`);
  return value.trim();
}

function buildPlan(input) {
  const query = `${input.styleName} 视觉风格 色彩 构图 ${input.useCase}`;
  const step = (id, title, kind, tool, optional, enabled, dependsOn, args) => ({id,title,description:title,kind,tool,optional,enabled,dependsOn,input:args,status:"pending"});
  return {revision:1,objective:`研究${input.styleName}并应用于${input.useCase}`,budget:"standard",estimatedCalls:3,steps:[
    step("context","读取创作上下文","tool","get_opc_context",false,true,[],{}),
    step("web","检索公开风格资料","tool","web_search",false,true,["context"],{query}),
    step("rag","检索项目知识库","tool","rag_search",true,false,["context"],{query}),
    step("synthesis","生成研究报告与提示词包","model",null,false,true,["web","rag"],{}),
  ]};
}

class ResearchRuntime {
  constructor({db, tools, model, planTools=()=>[], pluginTool}) {
    this.db = db;
    this.tools = tools;
    this.model = model;
    this.planTools=planTools;
    this.pluginTool=pluginTool;
    this.active = new Map();
    this.stopped = false;
    db.exec(`CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot TEXT NOT NULL, outputs TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_research_runs_owner ON research_runs(user_id,updated_at);
    CREATE TABLE IF NOT EXISTS research_run_events (
      run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(run_id,seq)
    );`);
    // A process restart must not silently spend again on an interrupted model call.
    for (const row of db.prepare("SELECT * FROM research_runs WHERE json_extract(snapshot, '$.status') = 'running'").all()) {
      const record = this._record(row);
      if (record.snapshot.status === "running") {
        record.snapshot.status = "paused";
        record.snapshot.activeStepId = null;
        record.snapshot.plan.steps.forEach(step => { if (step.status === "running") step.status = "pending"; });
        this._emit(record,"run.paused",{reason:"服务已重启，请确认后继续"});
      }
    }
  }

  _record(row) { return {userId:row.user_id,snapshot:JSON.parse(row.snapshot),outputs:JSON.parse(row.outputs)}; }
  _get(userId,id) {
    const row = this.db.prepare("SELECT * FROM research_runs WHERE id=? AND user_id=?").get(id,userId);
    if (!row) throw new ResearchError("RUN_NOT_FOUND","研究运行不存在",404);
    return this._record(row);
  }
  _emit(record,type,payload={}) {
    const s = record.snapshot;
    s.lastSeq++;
    s.updatedAt = nowIso();
    s.metrics.sourceCount = s.sources.length;
    s.metrics.completedSteps = s.plan?.steps.filter(x=>x.enabled && x.status==="completed").length || 0;
    s.metrics.totalSteps = s.plan?.steps.filter(x=>x.enabled).length || 0;
    const event={version:1,runId:s.runId,seq:s.lastSeq,type,occurredAt:s.updatedAt,payload:{...payload,snapshot:clone(s)}};
    this.db.transaction(()=>{
      this.db.prepare("UPDATE research_runs SET snapshot=?,outputs=?,updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(s),JSON.stringify(record.outputs),s.updatedAt,s.runId,record.userId);
      this.db.prepare("INSERT INTO research_run_events(run_id,seq,event) VALUES(?,?,?)").run(s.runId,s.lastSeq,JSON.stringify(event));
    })();
  }

  createRun(userId,input={}) {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new ResearchError("AUTH_REQUIRED","请先登录",401);
    const normalized={styleName:text(input.styleName,"风格",200),useCase:text(input.useCase || "通用短视频创作","应用场景",2000),providerId:input.providerId||null,projectId:input.projectId||null,excludedMemoryIds:normalizeExcludedMemoryIds(input.excludedMemoryIds)};
    const runId=`research_${randomUUID()}`,time=nowIso();
    const snapshot={runId,workflowId:"style-research",input:normalized,status:"awaiting_plan_approval",plan:buildPlan(normalized),activeStepId:null,sources:[],artifacts:[],error:null,lastSeq:0,createdAt:time,updatedAt:time,
      metrics:{elapsedMs:0,completedSteps:0,totalSteps:3,sourceCount:0,modelCalls:0,toolCalls:0,inputTokens:0,outputTokens:0,ttftMs:null,estimatedCostCny:null}};
    const pluginSteps=clone(this.planTools(userId,normalized));
    snapshot.plan.steps.splice(snapshot.plan.steps.length-1,0,...pluginSteps);
    snapshot.plan.steps.at(-1).dependsOn.push(...pluginSteps.map(step=>step.id));
    const record={userId,snapshot,outputs:{}};
    this.db.transaction(()=>{
      this.db.prepare("INSERT INTO research_runs(id,user_id,snapshot,outputs,updated_at) VALUES(?,?,?,?,?)").run(runId,userId,JSON.stringify(snapshot),"{}",time);
      this._emit(record,"run.created",{input:normalized});
      this._emit(record,"plan.generated",{plan:snapshot.plan});
    })();
    return clone(snapshot);
  }
  getRun(userId,id) { return this._get(userId,id).snapshot; }
  listRuns(userId,limit=30) {
    return this.db.prepare("SELECT snapshot FROM research_runs WHERE user_id=? ORDER BY updated_at DESC LIMIT ?").all(userId,Math.min(100,Math.max(1,Number(limit)||30))).map(row=>JSON.parse(row.snapshot));
  }
  events(userId,id,afterSeq=0) {
    this._get(userId,id);
    return this.db.prepare("SELECT event FROM research_run_events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 200").all(id,Math.max(0,Number(afterSeq)||0)).map(row=>JSON.parse(row.event));
  }

  updatePlan(userId,id,revision,operations) {
    const record=this._get(userId,id),s=record.snapshot;
    if (s.plan.revision!==revision) throw new ResearchError("PLAN_REVISION_CONFLICT","计划已更新，请刷新后再操作",409);
    if (s.status!=="awaiting_plan_approval") throw new ResearchError("INVALID_STATE_TRANSITION","仅待确认计划允许编辑",409);
    if (!Array.isArray(operations)||operations.length>30) throw new ResearchError("INVALID_PLAN_OPERATION","计划操作列表无效");
    const plan=clone(s.plan);
    for (const op of operations) {
      if (!op || typeof op !== "object") throw new ResearchError("INVALID_PLAN_OPERATION","计划操作格式无效");
      if (op.type==="set_objective") plan.objective=text(op.value,"目标");
      else if (op.type==="set_budget" && BUDGETS[op.value]) plan.budget=op.value;
      else {
        const index=plan.steps.findIndex(step=>step.id===op.stepId),step=plan.steps[index];
        if (!step) throw new ResearchError("INVALID_PLAN_OPERATION","未知计划步骤");
        if (op.type==="move_step" && Number.isInteger(op.toIndex) && op.toIndex>=0 && op.toIndex<plan.steps.length) {
          plan.steps.splice(index,1);plan.steps.splice(op.toIndex,0,step);
        } else if (op.type==="set_optional_enabled" && step.optional && typeof op.enabled==="boolean") step.enabled=op.enabled;
        else if (op.type==="set_step_input" && op.input && typeof op.input==="object" && !Array.isArray(op.input) && JSON.stringify(op.input).length<10000) step.input=clone(op.input);
        else throw new ResearchError("INVALID_PLAN_OPERATION","不允许的计划修改");
      }
    }
    const seen=new Set();
    for (const step of plan.steps) {
      if (step.enabled && step.dependsOn.some(dep=>plan.steps.find(x=>x.id===dep)?.enabled && !seen.has(dep))) throw new ResearchError("INVALID_PLAN_OPERATION","步骤顺序违反依赖关系");
      seen.add(step.id);
    }
    plan.revision++;
    plan.estimatedCalls=plan.steps.filter(x=>x.enabled).length;
    s.plan=plan;
    this._emit(record,"plan.updated",{plan});
    return clone(plan);
  }

  async act(userId,id,action={}) {
    const record=this._get(userId,id),s=record.snapshot;
    const fail=()=>{throw new ResearchError("INVALID_STATE_TRANSITION",`当前状态 ${s.status} 不支持此操作`,409);};
    if (this.stopped) throw new ResearchError("INVALID_STATE_TRANSITION","服务正在停止",503);
    if (action.type==="pause" || action.type==="cancel") {
      if (TERMINAL.has(s.status) || (action.type==="pause" && s.status!=="running")) fail();
      this.active.get(id)?.controller.abort(new DOMException("运行已暂停或取消","AbortError"));
      s.plan.steps.forEach(step=>{if(step.status==="running")step.status="pending";});
      s.activeStepId=null;
      s.status=action.type==="pause"?"paused":"cancelled";
      this._emit(record,action.type==="pause"?"run.paused":"run.cancelled");
      return;
    }
    const others=[...this.active.values()].filter(entry=>entry.id!==id);
    if (others.length>=2 || others.some(entry=>entry.userId===userId)) throw new ResearchError("RUN_BUSY","已有研究任务正在执行，请稍后再试",409);
    if (action.type==="approve_plan") {
      if (s.status!=="awaiting_plan_approval") fail();
      if (action.expectedRevision!==s.plan.revision) throw new ResearchError("PLAN_REVISION_CONFLICT","计划修订已变化",409);
      s.approvedPlanRevision=s.plan.revision;
      this._emit(record,"plan.approved",{revision:s.plan.revision});
    } else if (action.type==="resume") {
      if (s.status!=="paused") fail();
    } else if (action.type==="retry_step" || action.type==="skip_step") {
      if (!["recovering","failed"].includes(s.status)) fail();
      if (action.expectedRevision!==undefined && action.expectedRevision!==s.plan.revision) throw new ResearchError("PLAN_REVISION_CONFLICT","计划修订已变化，请刷新后重试",409);
      const step=s.plan.steps.find(x=>x.id===action.stepId);
      if (!step || step.status!=="failed" || (action.type==="skip_step"&&!step.optional)) throw new ResearchError("INVALID_PLAN_OPERATION","仅失败步骤可以重试，必需步骤不能跳过");
      if (action.input!==undefined) {
        if (action.type==="skip_step" || !action.input || typeof action.input!=="object"||Array.isArray(action.input)||JSON.stringify(action.input).length>10000) throw new ResearchError("INVALID_PLAN_OPERATION","步骤参数无效");
        if (inputIdentity(action.input)!==inputIdentity(step.input)) {
          if (action.expectedRevision!==s.plan.revision) throw new ResearchError("PLAN_REVISION_CONFLICT","修改参数需要提交当前计划修订",409);
          step.input=clone(action.input);step.status="pending";
          s.plan.revision++;s.status="awaiting_plan_approval";s.error=null;s.activeStepId=null;
          this._emit(record,"plan.updated",{plan:s.plan,reason:"retry_input_changed",stepId:step.id});
          return;
        }
      }
      step.status=action.type==="skip_step"?"skipped":"pending";
      if(action.type==="skip_step")this._emit(record,"step.skipped",{stepId:step.id});
    } else fail();
    s.status="running";s.error=null;
    this._emit(record,action.type==="resume"?"run.resumed":"run.started");
    this._start(userId,id);
  }

  _start(userId,id) {
    if(this.active.has(id)||this.stopped)return;
    const entry={id,userId,controller:new AbortController(),promise:null};
    this.active.set(id,entry);
    entry.promise=this._execute(entry).finally(()=>{
      this.active.delete(id);
      if(!this.stopped && this.getRun(userId,id).status==="running")this._start(userId,id);
    });
  }

  async _execute(entry) {
    const {userId,id,controller}=entry;
    while(!controller.signal.aborted&&!this.stopped) {
      let record=this._get(userId,id),s=record.snapshot;
      if(s.status!=="running")return;
      const step=s.plan.steps.find(x=>x.enabled&&!["completed","skipped"].includes(x.status));
      if(!step){s.status="completed";s.activeStepId=null;this._emit(record,"run.completed");
        const candidate=require("./studio-memory-candidates.js").createStudioCandidateService(this.db).research(userId,id);
        if(candidate)this._emit(record,"memory.candidate",candidate);
        return;}
      step.status="running";s.activeStepId=step.id;
      this._emit(record,"step.started",{stepId:step.id});
      try {
        const context={userId,runId:id,input:s.input,signal:controller.signal,
          toolState:{status:s.status,planRevision:s.plan.revision,approvedPlanRevision:s.approvedPlanRevision??null,activeStepId:step.id,completedStepIds:s.plan.steps.filter(item=>item.status==="completed").map(item=>item.id),mediaGenerationApproved:false},
          onContextTrace:trace=>{if(!controller.signal.aborted)this._emit(record,"context.prepared",{stepId:step.id,trace});},
        };
        let result;
        if(step.kind==="model") {
          if(s.metrics.modelCalls>=BUDGETS[s.plan.budget])throw new ResearchError("BUDGET_EXCEEDED","已达到本次研究模型调用预算");
          s.metrics.modelCalls++;
          this._emit(record,"metrics.updated",{metrics:s.metrics});
          const pluginResults=s.plan.steps.filter(item=>item.plugin&&item.enabled&&item.status==="completed").map(item=>({stepId:item.id,plugin:item.plugin.pluginId,version:item.plugin.version,trust:"untrusted",result:record.outputs[item.id]}));
          result=await this.model({...step.input,objective:s.plan.objective,input:s.input,sources:s.sources,context:record.outputs.context,pluginResults},context);
        } else {
          const tool=step.plugin&&this.pluginTool?(input,ctx)=>this.pluginTool(step,input,ctx):this.tools[step.tool];
          if(!tool)throw new ResearchError("TOOL_NOT_REGISTERED",`工具 ${step.tool} 尚未接入`);
          s.metrics.toolCalls++;
          this._emit(record,"tool.started",{stepId:step.id,tool:step.tool});
          result=await tool(step.input,context);
        }
        if(controller.signal.aborted||this.stopped)return;
        record=this._get(userId,id);s=record.snapshot;
        if(s.status!=="running")return;
        record.outputs[step.id]=result;
        if(step.kind==="model") this._artifacts(record,result);
        else {
          for(const source of Array.isArray(result?.sources)?result.sources:[]) {
            if(!source||typeof source!=="object"||Array.isArray(source))continue;
            const url=typeof source.url==="string"&&/^https?:\/\//i.test(source.url)?source.url:null;
            if(step.tool==="web_search"&&!url)continue;
            let domain=null;
            try {domain=url?new URL(url).hostname:null;} catch {continue;}
            const sourceId=`source_${createHash("sha256").update(`${id}:${step.id}:${url||source.title}`).digest("hex").slice(0,16)}`;
            if(s.sources.some(x=>x.id===sourceId))continue;
            const item={id:sourceId,sourceType:step.plugin?"plugin":step.tool==="rag_search"?"rag":"web",title:String(source.title||"检索资料"),url,domain,publishedAt:null,retrievedAt:nowIso(),excerpt:String(source.excerpt||source.snippet||"").slice(0,10000),toolCallId:`${id}:${step.id}`,citedBy:[],trust:step.tool==="rag_search"?"project_knowledge":"untrusted",...(step.plugin?{pluginId:step.plugin.pluginId,pluginVersion:step.plugin.version}:{})};
            s.sources.push(item);this._emit(record,"source.added",{source:item});
          }
          this._emit(record,"tool.completed",{stepId:step.id,tool:step.tool});
        }
        s.plan.steps.find(x=>x.id===step.id).status="completed";
        s.activeStepId=null;
        s.metrics.elapsedMs=Date.now()-Date.parse(s.createdAt);
        this._emit(record,"step.completed",{stepId:step.id});
      } catch(error) {
        if(controller.signal.aborted||this.stopped)return;
        record=this._get(userId,id);s=record.snapshot;
        s.plan.steps.find(x=>x.id===step.id).status="failed";s.activeStepId=null;
        this._emit(record,"step.failed",{stepId:step.id});
        s.status="recovering";s.error={code:error.code||"UPSTREAM_ERROR",message:error.message||"上游执行失败",stepId:step.id};
        this._emit(record,"run.failed",s.error);
        return;
      }
    }
  }

  _artifacts(record,raw) {
    let result=raw;
    if(typeof raw==="string") {
      try {result=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,""));} catch {throw new ResearchError("UPSTREAM_OUTPUT_INVALID","模型未返回有效的结构化研究产物");}
    }
    const nonemptyObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length>0;
    // Validate the entire response before emitting any artifact or citation event.
    if(!nonemptyObject(result)||typeof result.report!=="string"||!result.report.trim()||!nonemptyObject(result.styleFeaturePack)||!nonemptyObject(result.applicationPromptPack))throw new ResearchError("UPSTREAM_OUTPUT_INVALID","模型产物需要非空报告，以及非空对象格式的风格特征包和应用提示词包");
    const s=record.snapshot;
    const knownSources=new Set(s.sources.map(source=>source.id));
    if(!Array.isArray(result.sourceIds)||result.sourceIds.some(id=>typeof id!=="string"||!knownSources.has(id)))throw new ResearchError("UPSTREAM_OUTPUT_INVALID","模型引用包含无效或不属于本次研究的来源，请重试生成");
    const sourceIds=[...new Set(result.sourceIds)];
    if (s.sources.length && !sourceIds.length) throw new ResearchError("UPSTREAM_OUTPUT_INVALID","报告未提供可核对的来源引用，请重试生成");
    // Prepare all exports before committing any artifact. Reserved provenance
    // labels are server-owned; model claims never upgrade factual verification.
    const outputs=[
      ["research-report","风格研究报告","text/markdown",result.report,"md"],
      ["style-feature-pack","风格特征包","application/json",result.styleFeaturePack,"json"],
      ["application-prompt-pack","应用提示词包","application/json",result.applicationPromptPack,"json"],
    ].map(([type,title,mimeType,value,ext])=>({type,title,mimeType,ext,...researchArtifactContent(s,sourceIds,value,mimeType)}));
    const before={snapshot:clone(record.snapshot),outputs:clone(record.outputs)};
    try {
      // _emit uses nested savepoints. The enclosing transaction makes all
      // artifact snapshots, citation links and events commit or roll back together.
      this.db.transaction(()=>{
        for(const {type,title,mimeType,content,evidence,ext} of outputs) {
          const artifact={id:`${s.runId}-${type}`,type,title,mimeType,fileName:`${type}.${ext}`,content,evidence,createdAt:nowIso(),sourceIds};
          s.artifacts=s.artifacts.filter(x=>x.id!==artifact.id).concat(artifact);
          this._emit(record,"artifact.created",{artifact});
        }
        for (const source of s.sources) {
          if (!sourceIds.includes(source.id)) continue;
          source.citedBy = s.artifacts.filter(artifact=>artifact.sourceIds.includes(source.id)).map(artifact=>artifact.id);
          this._emit(record,"source.added",{source});
        }
      })();
    } catch(error) {
      record.snapshot=before.snapshot;record.outputs=before.outputs;
      throw error;
    }
  }

  async stop() {
    this.stopped=true;
    const pending=[];
    for(const entry of this.active.values()) {
      entry.controller.abort(new DOMException("服务停止","AbortError"));
      const record=this._get(entry.userId,entry.id);
      if(record.snapshot.status==="running") {
        record.snapshot.status="paused";record.snapshot.activeStepId=null;
        record.snapshot.plan.steps.forEach(step=>{if(step.status==="running")step.status="pending";});
        this._emit(record,"run.paused",{reason:"服务停止"});
      }
      pending.push(entry.promise);
    }
    await Promise.allSettled(pending);
  }
}

module.exports={ResearchRuntime,ResearchError};
