"use strict";

const {randomUUID,createHash}=require("node:crypto");
const Ajv=require("ajv");
const {PluginError}=require("./errors.js");
const {PluginHost}=require("./host-manager.js");
const {PermissionBroker}=require("./permission-broker.js");

class GenerationManager {
  constructor({store,capabilities={}}) {
    this.store=store;this.db=store.db;this.capabilities=capabilities;
    this.running=new Map();this.building=new Set();this.failures=new Map();
    this.starting=new Map();this.idleWaiters=new Set();this.stopping=false;
  }
  key(userId,projectId){return JSON.stringify([userId,projectId]);}
  _public(snapshot){const {lockBindings,...publicSnapshot}=snapshot;return publicSnapshot;}
  current(userId,projectId){
    this.store.assertProject(userId,projectId);
    const row=this.db.prepare("SELECT snapshot FROM plugin_generations WHERE user_id=? AND project_id=? ORDER BY rowid DESC LIMIT 1").get(userId,projectId);
    if(!row)return null;
    const snapshot=JSON.parse(row.snapshot);
    if(snapshot.status==="healthy"&&!this.running.has(this.key(userId,projectId)))snapshot.status="stopped";
    return this._public(snapshot);
  }
  history(userId,projectId){
    this.store.assertProject(userId,projectId);
    return this.db.prepare("SELECT snapshot FROM plugin_generations WHERE user_id=? AND project_id=? ORDER BY rowid DESC LIMIT 30").all(userId,projectId).map(row=>this._public(JSON.parse(row.snapshot)));
  }
  _save(userId,snapshot,current=false){
    this.db.prepare("INSERT INTO plugin_generations(id,user_id,project_id,status,snapshot,is_current,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,snapshot=excluded.snapshot,is_current=excluded.is_current")
      .run(snapshot.id,userId,snapshot.projectId,snapshot.status,JSON.stringify(snapshot),current?1:0,new Date().toISOString());
  }
  restart(userId,projectId){return this._replace(userId,projectId,this.store.listBindings(userId,projectId).filter(b=>b.enabled));}
  enterSafeMode(userId,projectId){this.store.assertProject(userId,projectId);return this._replace(userId,projectId,[],true);}
  async rollback(userId,projectId,id){
    this.store.assertProject(userId,projectId);
    const row=this.db.prepare("SELECT snapshot FROM plugin_generations WHERE id=? AND user_id=? AND project_id=? AND status='healthy'").get(id,userId,projectId);
    if(!row)throw new PluginError("GENERATION_CONFLICT","所选健康快照不存在",404);
    const target=JSON.parse(row.snapshot),bindings=target.lockBindings||[];
    for(const binding of bindings)this.store.getPackage(userId,binding.pluginId,binding.version);
    const result=await this._replace(userId,projectId,bindings,false);
    if(result.status==="healthy"){
      this.db.transaction(()=>{
        for(const binding of this.store.listBindings(userId,projectId))this.store.unbind(userId,projectId,binding.pluginId);
        for(const binding of bindings)this.store.bind(userId,projectId,{...binding,enabled:true});
        this.store.emit(userId,"generation.rolled-back",{targetGenerationId:id},projectId,result.id);
      })();
    }
    return result;
  }
  async _replace(userId,projectId,bindings,safe=false){
    this.store.assertProject(userId,projectId);
    if(this.stopping)throw new PluginError("PLUGIN_HOST_EXITED","插件服务正在停止",503);
    const key=this.key(userId,projectId);
    if(this.building.has(key))throw new PluginError("GENERATION_CONFLICT","项目插件正在重建",409);
    const recent=(this.failures.get(key)||[]).filter(time=>Date.now()-time<60000);
    if(recent.length>=3&&!safe)throw new PluginError("GENERATION_CONFLICT","插件连续启动失败，请先进入安全模式或稍后重试",429);
    this.building.add(key);
    const old=this.running.get(key);
    const persisted=this.db.prepare("SELECT snapshot FROM plugin_generations WHERE user_id=? AND project_id=? AND is_current=1").get(userId,projectId);
    const previous=old?.snapshot||(persisted?JSON.parse(persisted.snapshot):null);
    const last=previous?.status==="healthy"&&!previous.id.startsWith("gen-safe-")?previous.id:previous?.lastKnownGoodId;
    const snapshot={id:`${safe?"gen-safe-":"gen-"}${randomUUID()}`,projectId,
      packageSetHash:createHash("sha256").update(JSON.stringify(bindings)).digest("hex"),
      bindings:bindings.map(b=>({pluginId:b.pluginId,version:b.version,permissionTier:b.permissionTier})),
      lockBindings:bindings,status:"starting",suspectedPluginIds:[],lastKnownGoodId:last||null};
    const generation={snapshot,hosts:new Map(),packages:new Map(),active:true,controller:new AbortController()};
    this.starting.set(key,generation);
    this._save(userId,snapshot);
    this.store.emit(userId,"generation.starting",{bindings:snapshot.bindings},projectId,snapshot.id);
    let startingPlugin=null;
    try {
      for(const binding of [...bindings].sort((a,b)=>a.pluginId.localeCompare(b.pluginId))){
        if(this.stopping)throw new PluginError("PLUGIN_HOST_EXITED","插件服务正在停止",503);
        startingPlugin=binding.pluginId;
        const pkg=this.store.getPackage(userId,binding.pluginId,binding.version);
        const record=this.db.prepare("SELECT confirmations FROM plugin_packages WHERE id=? AND user_id=?").get(pkg.installationId,userId);
        const consent=JSON.parse(record.confirmations);
        if(!consent.acceptsWeakSandboxRisk||(pkg.signatureStatus!=="verified"&&!consent.acceptsUnsignedRisk))throw new PluginError("RISK_CONFIRMATION_REQUIRED","插件首次启动缺少安装风险确认",409);
        const root=this.store.verifyPackage(userId,pkg);
        generation.packages.set(pkg.pluginId,pkg);
        if(!pkg.manifest.entrypoints.host)continue;
        const broker=new PermissionBroker({store:this.store,userId,projectId,binding,manifest:pkg.manifest,...this.capabilities,signal:generation.controller.signal,isActive:()=>generation.active});
        const host=new PluginHost({root,entrypoint:pkg.manifest.entrypoints.host,generationId:snapshot.id,pluginId:pkg.pluginId,config:binding.config,broker:(method,input)=>broker.call(method,input)});
        generation.hosts.set(pkg.pluginId,host);
        const registration=await host.start();
        host.child.once("exit",()=>{
          if(generation.active&&this.running.get(key)===generation)void this._failedHost(userId,generation,pkg.pluginId,new PluginError("PLUGIN_HOST_EXITED","插件宿主意外退出"));
        });
        if((pkg.manifest.contributes.tools||[]).some(tool=>!registration.tools.includes(tool.name)))throw new PluginError("INVALID_MANIFEST","插件工具注册与清单不匹配");
        if(!(await host.health()).ok)throw new PluginError("PLUGIN_UNHEALTHY","插件健康检查失败");
      }
      if(this.stopping)throw new PluginError("PLUGIN_HOST_EXITED","插件服务正在停止",503);
      snapshot.status="healthy";
      this.db.transaction(()=>{
        this.db.prepare("UPDATE plugin_generations SET is_current=0 WHERE user_id=? AND project_id=?").run(userId,projectId);
        this._save(userId,snapshot,true);
        this.store.emit(userId,safe?"safe-mode.entered":"generation.healthy",{bindings:snapshot.bindings},projectId,snapshot.id);
      })();
      this.running.set(key,generation);
      this.failures.delete(key);
      if(old){old.active=false;old.controller.abort();for(const host of [...old.hosts.values()].reverse())await host.stop();}
    }catch(error){
      generation.active=false;
      generation.controller.abort();
      for(const host of [...generation.hosts.values()].reverse())await host.stop();
      snapshot.status="failed";snapshot.suspectedPluginIds=startingPlugin?[startingPlugin]:[];
      snapshot.error={code:error.code||"PLUGIN_EXECUTION_FAILED",message:error.message};
      this._save(userId,snapshot);
      this.store.emit(userId,"generation.failed",snapshot.error,projectId,snapshot.id);
      this.failures.set(key,[...recent,Date.now()]);
    }finally{
      this.building.delete(key);this.starting.delete(key);
      if(!this.building.size){for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear();}
    }
    return this._public(snapshot);
  }
  contributions(userId,projectId){
    this.store.assertProject(userId,projectId);
    const generation=this.running.get(this.key(userId,projectId));
    if(!generation?.active)return [];
    return [...generation.packages.values()].map(pkg=>({pluginId:pkg.pluginId,version:pkg.version,contentHash:pkg.contentHash,manifest:pkg.manifest,generationId:generation.snapshot.id,permissionTier:generation.snapshot.bindings.find(binding=>binding.pluginId===pkg.pluginId)?.permissionTier}));
  }
  async invokeWorkflow(userId,projectId,pluginId,workflowId,input,expectedGenerationId){
    const contribution=this.contributions(userId,projectId).find(item=>item.pluginId===pluginId);
    if(typeof expectedGenerationId!=="string"||!expectedGenerationId||contribution?.generationId!==expectedGenerationId)throw new PluginError("GENERATION_CONFLICT","工作流版本已变化，请刷新后重新确认",409);
    const workflow=contribution.manifest.contributes.workflows?.find(item=>item.id===workflowId);
    if(!workflow?.entryTool)throw new PluginError("WORKFLOW_NOT_RUNNABLE","工作流没有可调用的工具入口",404);
    return this.invoke(userId,projectId,pluginId,workflow.entryTool,input,{expectedGenerationId});
  }
  async invoke(userId,projectId,pluginId,toolName,input,{expectedGenerationId}={}){
    this.store.assertProject(userId,projectId);
    const generation=this.running.get(this.key(userId,projectId));
    if(expectedGenerationId&&generation?.snapshot.id!==expectedGenerationId)throw new PluginError("GENERATION_CONFLICT","项目插件运行版本已变化，请重新生成研究计划并确认",409);
    const pkg=generation?.active?generation.packages.get(pluginId):null;
    const host=generation?.hosts.get(pluginId);
    const tool=pkg?.manifest.contributes.tools?.find(tool=>tool.name===toolName);
    if(!host||!tool)throw new PluginError("PLUGIN_NOT_ACTIVE","此项目未启用该插件工具",404);
    const ajv=new Ajv({strict:false,validateFormats:false});
    if(!ajv.validate(tool.inputSchema,input))throw new PluginError("PLUGIN_INPUT_INVALID","插件工具输入不符合声明格式");
    let result;
    try {result=await host.invoke(toolName,input,tool.timeoutMs);}
    catch(error){
      if(["PLUGIN_HOST_EXITED","PLUGIN_TIMEOUT","PLUGIN_OUTPUT_LIMIT","PLUGIN_PROTOCOL_ERROR"].includes(error.code))await this._failedHost(userId,generation,pluginId,error);
      throw error;
    }
    if(!generation.active||this.running.get(this.key(userId,projectId))!==generation)throw new PluginError("GENERATION_CONFLICT","插件运行版本已变化，旧结果未采纳",409);
    if(!ajv.validate(tool.outputSchema,result))throw new PluginError("PLUGIN_OUTPUT_INVALID","插件工具输出不符合声明格式",502);
    return result;
  }
  async _failedHost(userId,generation,pluginId,error){
    if(!generation.active)return;
    generation.active=false;
    generation.controller.abort();
    generation.snapshot.status="failed";
    generation.snapshot.suspectedPluginIds=[pluginId];
    generation.snapshot.error={code:error.code||"PLUGIN_HOST_EXITED",message:error.message};
    this._save(userId,generation.snapshot,true);
    this.store.emit(userId,"generation.failed",generation.snapshot.error,generation.snapshot.projectId,generation.snapshot.id);
    for(const host of [...generation.hosts.values()].reverse())await host.stop();
  }
  async stop(){
    this.stopping=true;
    for(const generation of new Set([...this.running.values(),...this.starting.values()])){
      generation.active=false;
      generation.controller.abort();
      for(const host of [...generation.hosts.values()].reverse())await host.stop();
    }
    if(this.building.size)await new Promise(resolve=>this.idleWaiters.add(resolve));
    this.running.clear();
  }
}

module.exports={GenerationManager};
