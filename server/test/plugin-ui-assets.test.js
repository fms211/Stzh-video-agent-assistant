"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const Database=require("better-sqlite3");
const {PluginStore}=require("../plugin-system/store.js");

function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-ui-capabilities-")),db=new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2);CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER,name TEXT);INSERT INTO creative_projects VALUES('p1',1,'Owner');");
  const store=new PluginStore({db,root});
  const manifest={schemaVersion:1,id:"owned.ui",name:"UI",version:"1.0.0",description:"Owned UI",engine:{stzh:"^0.1.0"},entrypoints:{ui:"ui/index.html"},requestedPermissionTier:"safe",contributes:{slots:[{slot:"modelCenter.actions",uiSurfaceId:"widget",order:1}]}};
  const pkg=store.installPackage(1,{manifest,files:{"ui/index.html":"<!doctype html><html><head></head><body>Owned UI</body></html>","ui/style.css":"body{color:blue}"},source:{type:"local"},resolvedRef:"owned",signatureStatus:"unsigned"});
  let active=true,now=1000,calls=0;
  const generations={contributions:()=>active?[{...pkg,generationId:"generation-owned"}]:[],invoke:async(userId,projectId,pluginId,tool,input)=>{calls++;return {userId,projectId,pluginId,tool,input};}};
  const {PluginUiAssets}=require("../plugin-system/ui-assets.js");
  const assets=new PluginUiAssets({store,generations,clock:()=>now,ttlMs:1000});
  t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
  return {assets,pkg,revoke:()=>{active=false;},expire:()=>{now+=1001;},calls:()=>calls};
}

test("UI assets require a declared contribution and only expose files inside the installed UI root",t=>{
  const f=setup(t);
  const cap=f.assets.create(1,"p1",{pluginId:f.pkg.pluginId,slot:"modelCenter.actions",uiSurfaceId:"widget"});
  const asset=f.assets.read(cap.assetToken,"index.html","http://localhost:18080");
  assert.match(asset.content.toString(),/__bridge\.js/);
  assert.match(asset.headers["Content-Security-Policy"],/connect-src 'none'/);
  assert.equal(asset.headers["Referrer-Policy"],"no-referrer");
  assert.throws(()=>f.assets.read(cap.assetToken,"../outside","http://localhost:18080"),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  assert.throws(()=>f.assets.create(2,"p1",{pluginId:f.pkg.pluginId,slot:"modelCenter.actions",uiSurfaceId:"widget"}),{code:"PROJECT_NOT_FOUND"});
  assert.throws(()=>f.assets.create(1,"p1",{pluginId:f.pkg.pluginId,slot:"stats.cards",uiSurfaceId:"widget"}),{code:"BRIDGE_UNAUTHORIZED"});
});

test("frame actions consume their nonce once and cannot substitute another account",async t=>{
  const f=setup(t),cap=f.assets.create(1,"p1",{pluginId:f.pkg.pluginId,slot:"modelCenter.actions",uiSurfaceId:"widget"});
  const message={bridgeVersion:1,frameId:cap.frameId,frameToken:cap.frameToken,nonce:cap.nonce,action:"tool.invoke",payload:{tool:"echo",input:{message:"ok"}}};
  await assert.rejects(f.assets.bridge(2,cap.frameId,message),{code:"BRIDGE_UNAUTHORIZED"});
  const response=await f.assets.bridge(1,cap.frameId,message);
  assert.notEqual(response.nonce,cap.nonce);
  assert.equal(response.result.userId,1);
  await assert.rejects(f.assets.bridge(1,cap.frameId,message),{code:"BRIDGE_UNAUTHORIZED"});
  assert.equal(f.calls(),1);
});

test("expired or disabled generation tickets cannot serve assets or renew",t=>{
  const f=setup(t),cap=f.assets.create(1,"p1",{pluginId:f.pkg.pluginId,slot:"modelCenter.actions",uiSurfaceId:"widget"});
  f.expire();assert.throws(()=>f.assets.read(cap.assetToken,"index.html","http://localhost:18080"),{code:"BRIDGE_UNAUTHORIZED"});
  const fresh=f.assets.create(1,"p1",{pluginId:f.pkg.pluginId,slot:"modelCenter.actions",uiSurfaceId:"widget"});
  f.revoke();assert.throws(()=>f.assets.renew(1,fresh.frameId,fresh.frameToken),{code:"BRIDGE_UNAUTHORIZED"});
});
