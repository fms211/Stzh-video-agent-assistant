"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {archiveZip}=require("./helpers/plugin-archives.js");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-plugin-http-"));
process.env.STZH_DATA_DIR=dir;process.env.JWT_SECRET="plugin-http-test-secret-longer-than-thirty-two-characters";
const app=require("../app.js"),db=require("../db.js");
let server,base,owner,stranger,projectId;
async function request(route,token,body,method=body?"POST":"GET"){
  const response=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body instanceof FormData?{}:{"Content-Type":"application/json"})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
test.before(async()=>{
  server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;
  owner=(await request("/api/auth/register",null,{username:"plugin-owner",password:"owned-pass-123"})).body;
  stranger=(await request("/api/auth/register",null,{username:"plugin-other",password:"owned-pass-123"})).body;
  const project=await request("/api/creative-projects",owner.token,{name:"Plugin acceptance"});projectId=project.body.project.id;
});
test.after(async()=>{await app.locals.pluginService?.stop();await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});});

test("plugin workflow HTTP entrypoints enforce schema, account, declaration and pinned generation",async()=>{
  const projectId=(await request("/api/creative-projects",owner.token,{name:"Workflow acceptance"})).body.project.id;
  const service=require("../routes/plugins.js").getService({app});
  const manifest={schemaVersion:1,id:"owned.workflow",name:"工作流验收",version:"1.0.0",description:"fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs",ui:"ui/index.html"},requestedPermissionTier:"safe",contributes:{
    tools:[{name:"echo",description:"fixture",risk:"read",timeoutMs:1000,inputSchema:{type:"object",required:["text"],properties:{text:{type:"string"}}},outputSchema:{type:"object",required:["text"]}}],
    workflows:[{id:"story",title:"测试故事",description:"fixture",entryTool:"echo",uiSurfaceId:"story-ui"},{id:"info",title:"介绍",description:"metadata only",entryTool:null,uiSurfaceId:null}],
  }};
  const pkg=service.store.installPackage(owner.user.id,{manifest,files:{"index.cjs":"module.exports={tools:{echo:async input=>input}};","ui/index.html":"<html><head></head><body>workflow</body></html>"},source:{type:"local"},resolvedRef:"test",signatureStatus:"unsigned",confirmations:{acceptsWeakSandboxRisk:true,acceptsUnsignedRisk:true,acceptedPermissionTier:"safe"}});
  const generation=await service.bind(owner.user.id,projectId,{pluginId:pkg.pluginId,version:pkg.version,installationId:pkg.installationId,enabled:true,permissionTier:"safe",config:{}});
  assert.equal(generation.status,"healthy");
  const prefix=`/api/plugins/projects/${projectId}`,route=`${prefix}/workflows/${pkg.pluginId}/story`;
  const body={input:{text:"workflow result"},expectedGenerationId:generation.id};
  assert.equal((await request(route,stranger.token,body)).status,404);
  assert.equal((await request(route,owner.token,{input:body.input})).status,409);
  assert.equal((await request(route,owner.token,{...body,input:{text:9}})).body.error.code,"PLUGIN_INPUT_INVALID");
  assert.deepEqual((await request(route,owner.token,body)).body.result,body.input);
  assert.equal((await request(`${prefix}/workflows/${pkg.pluginId}/info`,owner.token,body)).body.error.code,"WORKFLOW_NOT_RUNNABLE");
  assert.equal((await request(`${prefix}/workflows/${pkg.pluginId}/unknown`,owner.token,body)).status,404);
  const frameBody={pluginId:pkg.pluginId,slot:"plugin.workflow",uiSurfaceId:"story-ui",expectedGenerationId:generation.id};
  const frame=await request(`${prefix}/frames`,owner.token,frameBody);assert.equal(frame.status,200);
  assert.equal((await fetch(base+frame.body.assetUrl)).status,200);
  assert.equal((await request(`${prefix}/frames`,owner.token,{...frameBody,uiSurfaceId:"missing"})).status,403);
  assert.equal((await request(`${prefix}/frames`,stranger.token,frameBody)).status,404);
  await service.generations.restart(owner.user.id,projectId);
  assert.equal((await request(route,owner.token,body)).status,409);
  assert.equal((await request(`${prefix}/frames`,owner.token,frameBody)).status,409);
  assert.equal((await fetch(base+frame.body.assetUrl)).status,403);
  await service.unbind(owner.user.id,projectId,pkg.pluginId);
});

test("real HTTP upload/install/bind/invoke/recover chain is account-scoped",async()=>{
  assert.equal((await request("/api/plugins/packages")).status,401);
  const manifest={schemaVersion:1,id:"owned.http",name:"HTTP验收插件",version:"1.0.0",description:"Local authored fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs"},requestedPermissionTier:"safe",contributes:{tools:[{name:"echo",description:"echo",risk:"read",timeoutMs:1000,inputSchema:{type:"object",properties:{message:{type:"string"}},required:["message"]},outputSchema:{type:"object",required:["message"]}}]}};
  const bytes=archiveZip([{name:"stzh-plugin.json",content:JSON.stringify(manifest)},{name:"index.cjs",content:"module.exports={tools:{echo:async input=>({message:input.message})}};"}]);
  const form=new FormData();form.append("file",new Blob([bytes]),"owned.stzhplugin");
  const upload=await request("/api/plugins/uploads",owner.token,form);assert.equal(upload.status,201);
  assert.equal((await request("/api/plugins/resolve",stranger.token,{source:upload.body.source})).status,404);
  const p=(await request("/api/plugins/resolve",owner.token,{source:upload.body.source})).body;
  const confirmation={previewHash:p.previewHash,acceptedPermissionTier:"safe",acceptsUnsignedRisk:true,acceptsWeakSandboxRisk:true,acceptsOpenInternetBuildScripts:false};
  assert.equal((await request("/api/plugins/install",owner.token,{previewId:p.previewId,confirmation:{...confirmation,acceptsUnsignedRisk:false}})).status,409);
  const installation=await request("/api/plugins/install",owner.token,{previewId:p.previewId,confirmation});assert.equal(installation.status,200);
  const pkg=installation.body;
  assert.equal((await request("/api/plugins/packages",stranger.token)).body.length,0);
  const binding={pluginId:pkg.pluginId,version:pkg.version,installationId:pkg.installationId,permissionTier:"safe",enabled:true,config:{},userId:stranger.user.id};
  assert.equal((await request(`/api/plugins/projects/${projectId}/bindings/${pkg.pluginId}`,stranger.token,binding,"PUT")).status,404);
  const generation=await request(`/api/plugins/projects/${projectId}/bindings/${pkg.pluginId}`,owner.token,binding,"PUT");assert.equal(generation.body.status,"healthy");
  assert.deepEqual((await request(`/api/plugins/projects/${projectId}/tools/${pkg.pluginId}/echo`,owner.token,{input:{message:"真实HTTP插件调用"}})).body.result,{message:"真实HTTP插件调用"});
  assert.equal((await request(`/api/plugins/packages/${pkg.pluginId}/${pkg.version}`,owner.token,null,"DELETE")).body.status,"blocked");
  const safe=await request(`/api/plugins/projects/${projectId}/generation/safe`,owner.token,{});assert.deepEqual(safe.body.bindings,[]);
  const rolled=await request(`/api/plugins/projects/${projectId}/generation/rollback`,owner.token,{generationId:generation.body.id});assert.equal(rolled.body.status,"healthy");
  assert.equal((await request(`/api/plugins/projects/${projectId}/generation/history`,owner.token)).body.length,3);
  await request(`/api/plugins/projects/${projectId}/bindings/${pkg.pluginId}`,owner.token,null,"DELETE");
  assert.equal((await request(`/api/plugins/packages/${pkg.pluginId}/${pkg.version}`,owner.token,null,"DELETE")).body.status,"quarantined");
  const q=(await request("/api/plugins/quarantine",owner.token)).body[0];
  assert.equal((await request(`/api/plugins/quarantine/${q.quarantineId}/restore`,stranger.token,{})).status,404);
  assert.equal((await request(`/api/plugins/quarantine/${q.quarantineId}/restore`,owner.token,{})).body.pluginId,pkg.pluginId);
});

test("HTTP installation builds a missing entrypoint and exposes only the owner's audit records",async()=>{
  const manifest={schemaVersion:1,id:"owned.http-build",name:"HTTP构建验收",version:"1.0.0",description:"Local build fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"dist/index.cjs"},requestedPermissionTier:"safe",contributes:{}};
  const script="const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.cjs','module.exports={tools:{}};');";
  const bytes=archiveZip([{name:"stzh-plugin.json",content:JSON.stringify(manifest)},{name:"package.json",content:JSON.stringify({name:"owned-http-build",version:"1.0.0",scripts:{build:"node build.cjs"}})},{name:"build.cjs",content:script}]);
  const form=new FormData();form.append("file",new Blob([bytes]),"owned-build.stzhplugin");
  const source=(await request("/api/plugins/uploads",owner.token,form)).body.source;
  const p=(await request("/api/plugins/resolve",owner.token,{source})).body;
  assert.equal(p.buildScripts[0].name,"build");
  const confirmation={previewHash:p.previewHash,acceptedPermissionTier:"safe",acceptsUnsignedRisk:true,acceptsWeakSandboxRisk:true,acceptsOpenInternetBuildScripts:true};
  const installed=await request("/api/plugins/install",owner.token,{previewId:p.previewId,confirmation});
  assert.equal(installed.status,200);
  const records=(await request(`/api/plugins/builds?previewId=${p.previewId}`,owner.token)).body;
  assert.equal(records.length,1);assert.equal(records[0].status,"completed");
  assert.equal(records[0].records[0].command[1],"run-script");
  assert.deepEqual((await request(`/api/plugins/builds?previewId=${p.previewId}`,stranger.token)).body,[]);
});

test("UI tickets serve only declared active assets and enforce account plus nonce on tool calls",async()=>{
  const manifest={schemaVersion:1,id:"owned.http-ui",name:"UI验收",version:"1.0.0",description:"Owned frame fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs",ui:"ui/index.html"},requestedPermissionTier:"safe",contributes:{tools:[{name:"echo",description:"echo",risk:"read",timeoutMs:1000,inputSchema:{type:"object"},outputSchema:{type:"object"}}],slots:[{slot:"modelCenter.actions",uiSurfaceId:"widget",order:1}]}};
  const bytes=archiveZip([{name:"stzh-plugin.json",content:JSON.stringify(manifest)},{name:"index.cjs",content:"module.exports={tools:{echo:async input=>input}};"},{name:"ui/index.html",content:"<html><head></head><body>Owned frame</body></html>"}]);
  const form=new FormData();form.append("file",new Blob([bytes]),"owned-ui.zip");
  const source=(await request("/api/plugins/uploads",owner.token,form)).body.source;
  const p=(await request("/api/plugins/resolve",owner.token,{source})).body;
  const pkg=(await request("/api/plugins/install",owner.token,{previewId:p.previewId,confirmation:{previewHash:p.previewHash,acceptedPermissionTier:"safe",acceptsUnsignedRisk:true,acceptsWeakSandboxRisk:true,acceptsOpenInternetBuildScripts:false}})).body;
  await request(`/api/plugins/projects/${projectId}/bindings/${pkg.pluginId}`,owner.token,{pluginId:pkg.pluginId,version:pkg.version,installationId:pkg.installationId,permissionTier:"safe",enabled:true,config:{}},"PUT");
  const cap=(await request(`/api/plugins/projects/${projectId}/frames`,owner.token,{pluginId:pkg.pluginId,slot:"modelCenter.actions",uiSurfaceId:"widget"})).body;
  const asset=await fetch(base+cap.assetUrl);assert.equal(asset.status,200);assert.match(asset.headers.get("content-security-policy"),/connect-src 'none'/);assert.match(await asset.text(),/__bridge\.js/);
  const message={bridgeVersion:1,frameId:cap.frameId,frameToken:cap.frameToken,nonce:cap.nonce,action:"tool.invoke",payload:{tool:"echo",input:{message:"frame"}}};
  assert.equal((await request(`/api/plugins/frames/${cap.frameId}/bridge`,stranger.token,message)).status,403);
  const reply=await request(`/api/plugins/frames/${cap.frameId}/bridge`,owner.token,message);assert.deepEqual(reply.body.result,{message:"frame"});
  assert.equal((await request(`/api/plugins/frames/${cap.frameId}/bridge`,owner.token,message)).status,403);
  await request(`/api/plugins/projects/${projectId}/generation/safe`,owner.token,{});
  assert.equal((await fetch(base+cap.assetUrl)).status,403);
});
