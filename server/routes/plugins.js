"use strict";
const {Router}=require("express"),multer=require("multer"),path=require("node:path");
const db=require("../db.js");
const {PluginService}=require("../plugin-system/service.js");
const {providerServices}=require("./creative-agent.js");
const {PluginError}=require("../plugin-system/errors.js");
const router=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{files:1,fileSize:16*1024*1024}}).single("file");
function service(req){
  if(req.app.locals.pluginService)return req.app.locals.pluginService;
  const root=path.join(process.env.STZH_DATA_DIR||path.join(__dirname,"..","data"),"plugins");
  req.app.locals.pluginService=new PluginService({db,root,capabilities:{
    model:async({messages},{userId,signal})=>{
      const row=providerServices.activeProvider(userId);
      if(!row)throw new PluginError("MODEL_NOT_CONFIGURED","请先配置并激活模型");
      return providerServices.invokeProvider(row,messages,{signal});
    },
    createTask:async(input,{userId})=>{
      const result=db.taskCreate({userId,kind:"video.generate",title:input.title,input:{prompt:input.prompt,attachmentIds:[]},origin:"server"});
      req.app.locals.taskRuntime?.wake();return {id:result.task.id,status:result.task.status};
    },
  }});
  return req.app.locals.pluginService;
}
const handle=fn=>async(req,res)=>{try{res.json(await fn(service(req),req));}catch(error){res.status(error.status||400).json({error:{code:error.code||"PLUGIN_ERROR",message:error.message||"插件操作失败"}});}};
const uid=req=>req.user.userId;
router.post("/api/plugins/uploads",(req,res)=>upload(req,res,error=>{
  if(error)return res.status(400).json({error:{code:"UPLOAD_FAILED",message:error.message}});
  try{return res.status(201).json({source:service(req).saveUpload(uid(req),req.file)});}catch(cause){return res.status(cause.status||400).json({error:{code:cause.code||"UPLOAD_FAILED",message:cause.message}});}
}));
router.post("/api/plugins/catalog/search",handle((s,req)=>s.searchCatalog(req.body)));
router.post("/api/plugins/resolve",handle((s,req)=>s.installer.resolve(uid(req),req.body?.source)));
router.post("/api/plugins/install",handle((s,req)=>s.installer.install(uid(req),req.body?.previewId,req.body?.confirmation)));
router.get("/api/plugins/packages",handle((s,req)=>s.store.listPackages(uid(req))));
router.get("/api/plugins/builds",handle((s,req)=>s.listBuilds(uid(req),req.query.previewId)));
router.delete("/api/plugins/packages/:pluginId/:version",handle((s,req)=>s.store.uninstall(uid(req),req.params.pluginId,req.params.version)));
router.get("/api/plugins/quarantine",handle((s,req)=>s.store.listQuarantined(uid(req))));
router.post("/api/plugins/quarantine/:id/restore",handle((s,req)=>s.store.restore(uid(req),req.params.id)));
router.delete("/api/plugins/quarantine/:id",handle((s,req)=>({purged:s.store.purge(uid(req),req.params.id)})));
router.get("/api/plugins/events",handle((s,req)=>({events:s.store.events(uid(req),req.query.projectId||null,Number(req.query.afterSeq)||0)})));
router.get("/api/plugins/projects/:projectId/bindings",handle((s,req)=>s.store.listBindings(uid(req),req.params.projectId)));
router.put("/api/plugins/projects/:projectId/bindings/:pluginId",handle((s,req)=>s.bind(uid(req),req.params.projectId,{...req.body,pluginId:req.params.pluginId})));
router.delete("/api/plugins/projects/:projectId/bindings/:pluginId",handle((s,req)=>s.unbind(uid(req),req.params.projectId,req.params.pluginId)));
router.post("/api/plugins/projects/:projectId/bindings/:pluginId/disable",handle((s,req)=>s.disable(uid(req),req.params.projectId,req.params.pluginId)));
router.post("/api/plugins/projects/:projectId/bindings/:pluginId/version",handle((s,req)=>s.changeVersion(uid(req),req.params.projectId,req.params.pluginId,req.body?.version,req.body?.acceptedPermissionTier)));
router.get("/api/plugins/projects/:projectId/generation",handle((s,req)=>s.generations.current(uid(req),req.params.projectId)));
router.get("/api/plugins/projects/:projectId/generation/history",handle((s,req)=>s.generations.history(uid(req),req.params.projectId)));
router.post("/api/plugins/projects/:projectId/generation/restart",handle((s,req)=>s.generations.restart(uid(req),req.params.projectId)));
router.post("/api/plugins/projects/:projectId/generation/safe",handle((s,req)=>s.generations.enterSafeMode(uid(req),req.params.projectId)));
router.post("/api/plugins/projects/:projectId/generation/rollback",handle((s,req)=>s.generations.rollback(uid(req),req.params.projectId,req.body?.generationId)));
router.get("/api/plugins/projects/:projectId/contributions",handle((s,req)=>s.generations.contributions(uid(req),req.params.projectId)));
router.post("/api/plugins/projects/:projectId/tools/:pluginId/:tool",handle(async(s,req)=>({result:await s.generations.invoke(uid(req),req.params.projectId,req.params.pluginId,req.params.tool,req.body?.input)})));
router.post("/api/plugins/projects/:projectId/workflows/:pluginId/:workflowId",handle(async(s,req)=>({result:await s.generations.invokeWorkflow(uid(req),req.params.projectId,req.params.pluginId,req.params.workflowId,req.body?.input,req.body?.expectedGenerationId)})));
router.post("/api/plugins/projects/:projectId/frames",handle((s,req)=>s.ui.create(uid(req),req.params.projectId,req.body||{})));
router.post("/api/plugins/frames/:id/bridge",handle((s,req)=>s.ui.bridge(uid(req),req.params.id,req.body)));
router.post("/api/plugins/frames/:id/renew",handle((s,req)=>s.ui.renew(uid(req),req.params.id,req.body?.frameToken)));
router.delete("/api/plugins/frames/:id",handle((s,req)=>{s.ui.revokeOwned(uid(req),req.params.id,req.body?.frameToken);return {ok:true};}));
// This non-API asset route uses only short-lived, generation-bound asset tickets.
router.post("/plugin-ui/:token/revoke",(req,res)=>{
  try{req.app.locals.pluginService?.ui.revokeTicket(req.params.token,req.body?.frameToken);res.status(204).end();}
  catch(error){res.status(error.status||400).json({error:{message:error.message}});}
});
router.get("/plugin-ui/:token/*asset",(req,res)=>{
  try{
    const s=req.app.locals.pluginService;if(!s)return res.status(404).end();
    const relative=Array.isArray(req.params.asset)?req.params.asset.join("/"):req.params.asset;
    const asset=s.ui.read(req.params.token,relative,process.env.STZH_PUBLIC_API_URL||`${req.protocol}://${req.get("host")}`);
    res.set(asset.headers).type(asset.mimeType).send(asset.content);
  }catch(error){res.status(error.status||400).type("text/plain").send(error.message||"Plugin asset unavailable");}
});
router.getService=service;
module.exports=router;
