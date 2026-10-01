"use strict";
const fs=require("node:fs"),path=require("node:path");
const {randomUUID,createHash}=require("node:crypto");
const {PluginStore}=require("./store.js");
const {SourceResolver}=require("./source-resolver.js");
const {PluginInstaller}=require("./installer.js");
const {GenerationManager}=require("./generation-manager.js");
const {createPluginProbe}=require("./host-manager.js");
const {PluginError}=require("./errors.js");
const {PluginBuildRunner}=require("./build-runner.js");
const {PluginUiAssets}=require("./ui-assets.js");

class PluginService {
  constructor({db,root,catalog=[],trustedKeys={},build,capabilities={}}) {
    this.store=new PluginStore({db,root});this.db=db;this.catalog=catalog;
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_uploads (
      id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),filename TEXT NOT NULL,content_hash TEXT NOT NULL,expires_at INTEGER NOT NULL
    )`);
    this.resolver=new SourceResolver({catalog,loadUpload:(userId,token)=>this.loadUpload(userId,token)});
    this.builder=new PluginBuildRunner({store:this.store});
    this.installer=new PluginInstaller({store:this.store,resolver:this.resolver,trustedKeys,prepare:(payload,context)=>this.builder.prepare(payload,context),build:build||((payload,context)=>this.builder.build(payload,context)),probe:createPluginProbe({store:this.store})});
    this.generations=new GenerationManager({store:this.store,capabilities});
    this.ui=new PluginUiAssets({store:this.store,generations:this.generations});
    this.cleanupTimer=setInterval(()=>{this.store.reapExpired();this.cleanupUploads();},15*60000);
    this.cleanupTimer.unref?.();
  }
  uploadPath(userId,id){
    if(!/^upload_[a-f0-9-]{36}$/.test(id))throw new PluginError("SOURCE_RESOLUTION_FAILED","上传标识无效");
    return this.store.checkedPath(path.join(this.store.accountRoot(userId),"uploads",`${id}.zip`));
  }
  saveUpload(userId,file){
    this.cleanupUploads();
    if(!file||!Buffer.isBuffer(file.buffer)||file.buffer.length>16*1024*1024||! /\.(zip|stzhplugin)$/i.test(file.originalname||""))throw new PluginError("SOURCE_RESOLUTION_FAILED","请选择16MB以内的 .zip 或 .stzhplugin 包");
    if(this.db.prepare("SELECT COUNT(*) n FROM plugin_uploads WHERE user_id=?").get(userId).n>=5)throw new PluginError("UPLOAD_LIMIT","待安装插件包过多，请稍后重试",429);
    const id=`upload_${randomUUID()}`,filePath=this.uploadPath(userId,id),hash=createHash("sha256").update(file.buffer).digest("hex");
    fs.mkdirSync(path.dirname(filePath),{recursive:true});fs.writeFileSync(filePath,file.buffer,{flag:"wx"});
    try{this.db.prepare("INSERT INTO plugin_uploads(id,user_id,filename,content_hash,expires_at) VALUES(?,?,?,?,?)").run(id,userId,path.basename(file.originalname).slice(0,120),hash,Date.now()+30*60000);}
    catch(error){fs.unlinkSync(filePath);throw error;}
    return {type:"local",uploadToken:id,fileName:path.basename(file.originalname),contentHash:hash};
  }
  loadUpload(userId,id){
    const row=this.db.prepare("SELECT * FROM plugin_uploads WHERE id=? AND user_id=? AND expires_at>?").get(id,userId,Date.now());
    if(!row)throw new PluginError("SOURCE_RESOLUTION_FAILED","上传包不存在或已过期",404);
    return fs.readFileSync(this.uploadPath(userId,id));
  }
  cleanupUploads(){
    for(const row of this.db.prepare("SELECT id,user_id FROM plugin_uploads WHERE expires_at<? LIMIT 50").all(Date.now())){
      try{fs.rmSync(this.uploadPath(row.user_id,row.id),{force:true});this.db.prepare("DELETE FROM plugin_uploads WHERE id=?").run(row.id);}catch{/* Retry on the next cleanup; never discard a file reference before deletion. */}
    }
  }
  searchCatalog(query={}){
    const text=String(query.text||"").toLowerCase();
    const items=this.catalog.filter(item=>item.manifest&&`${item.manifest.name} ${item.manifest.description}`.toLowerCase().includes(text))
      .filter(item=>!query.permissionTier||item.manifest.requestedPermissionTier===query.permissionTier)
      .filter(item=>!query.signature||query.signature==="all"||(query.signature==="verified"?Boolean(item.signature):!item.signature))
      .map(item=>({manifest:item.manifest,source:{type:"catalog",catalogId:item.catalogId,version:item.version},publisher:item.publisher||"未标注发布者",signatureStatus:item.signature?"verified":"unsigned"}));
    const offset=Math.max(0,Number(query.cursor)||0),limit=Math.max(1,Math.min(100,Number(query.limit)||30));
    return {items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?String(offset+limit):null};
  }
  listBuilds(userId,previewId){
    return this.db.prepare("SELECT id,preview_id previewId,phase,status,records,created_at createdAt,finished_at finishedAt,error FROM plugin_build_runs WHERE user_id=? AND (? IS NULL OR preview_id=?) ORDER BY rowid DESC LIMIT 30")
      .all(userId,previewId||null,previewId||null).map(row=>({...row,records:JSON.parse(row.records)}));
  }
  async bind(userId,projectId,input){this.store.bind(userId,projectId,input);return this.generations.restart(userId,projectId);}
  async disable(userId,projectId,pluginId){
    const binding=this.store.listBindings(userId,projectId).find(x=>x.pluginId===pluginId);
    if(!binding)throw new PluginError("PLUGIN_NOT_FOUND","项目未绑定该插件",404);
    return this.bind(userId,projectId,{...binding,enabled:false});
  }
  async unbind(userId,projectId,pluginId){this.store.unbind(userId,projectId,pluginId);return this.generations.restart(userId,projectId);}
  async changeVersion(userId,projectId,pluginId,version,acceptedPermissionTier){
    const binding=this.store.listBindings(userId,projectId).find(x=>x.pluginId===pluginId),pkg=this.store.getPackage(userId,pluginId,version);
    if(!binding)throw new PluginError("PLUGIN_NOT_FOUND","项目未绑定该插件",404);
    return this.bind(userId,projectId,{...binding,version,installationId:pkg.installationId,permissionTier:acceptedPermissionTier||binding.permissionTier});
  }
  async stop(){
    clearInterval(this.cleanupTimer);
    const installations=this.installer.stop(),generations=this.generations.stop();
    await this.builder.stop();
    await Promise.all([installations,generations]);
  }
}
module.exports={PluginService};
