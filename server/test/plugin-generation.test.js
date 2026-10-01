"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const Database=require("better-sqlite3");
const {PluginStore}=require("../plugin-system/store.js");
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-plugin-generations-")),db=new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2);CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER,name TEXT);INSERT INTO creative_projects VALUES('p1',1,'Owner'),('p2',2,'Other');");
  const store=new PluginStore({db,root});
  const {GenerationManager}=require("../plugin-system/generation-manager.js");
  const manager=new GenerationManager({store});
  t.after(async()=>{await manager.stop();db.close();fs.rmSync(root,{recursive:true,force:true});});
  function install(version,broken=false,script){
    const manifest={schemaVersion:1,id:"owned.echo",name:"Echo",version,description:"fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs"},requestedPermissionTier:"safe",contributes:{tools:[{name:"echo",description:"echo",risk:"read",inputSchema:{type:"object",properties:{text:{type:"string"}},required:["text"],additionalProperties:false},outputSchema:{type:"object",properties:{version:{type:"string"},text:{type:"string"}},required:["version","text"]},timeoutMs:1000}]}};
    const pkg=store.installPackage(1,{manifest,files:{"index.cjs":script||(broken?"throw new Error('owned startup failure');":`module.exports={tools:{echo:async input=>({version:'${version}',text:input.text})}};`)},source:{type:"local"},resolvedRef:version,signatureStatus:"unsigned",confirmations:{acceptsWeakSandboxRisk:true,acceptsUnsignedRisk:true,acceptedPermissionTier:"safe"}});
    store.bind(1,"p1",{pluginId:pkg.pluginId,version,installationId:pkg.installationId,enabled:true,permissionTier:"safe",config:{}});
    return pkg;
  }
  return {store,manager,install};
}
test("healthy generation serves validated tools and failed replacement keeps the prior generation authoritative",async t=>{
  const {manager,install}=setup(t);install("1.0.0");
  const first=await manager.restart(1,"p1");assert.equal(first.status,"healthy");
  assert.deepEqual(await manager.invoke(1,"p1","owned.echo","echo",{text:"one"}),{version:"1.0.0",text:"one"});
  await assert.rejects(manager.invoke(1,"p1","owned.echo","echo",{text:5}),{code:"PLUGIN_INPUT_INVALID"});
  install("2.0.0",true);const failed=await manager.restart(1,"p1");
  assert.equal(failed.status,"failed");assert.equal(failed.lastKnownGoodId,first.id);
  assert.deepEqual(failed.suspectedPluginIds,["owned.echo"]);
  assert.equal((await manager.invoke(1,"p1","owned.echo","echo",{text:"still"})).version,"1.0.0");
  assert.throws(()=>manager.current(2,"p1"),{code:"PROJECT_NOT_FOUND"});
});

test("shutdown interrupts an in-progress activation and does not publish a late healthy generation",async t=>{
  const {manager,install}=setup(t);install("1.0.0",false,"module.exports={activate:async()=>new Promise(()=>{})};");
  const pending=manager.restart(1,"p1");
  await new Promise(resolve=>setTimeout(resolve,30));
  await manager.stop();
  assert.equal((await pending).status,"failed");
  assert.deepEqual(manager.contributions(1,"p1"),[]);
  await assert.rejects(manager.restart(1,"p1"),{code:"PLUGIN_HOST_EXITED"});
});

test("runtime plugin crash marks the generation failed and withdraws its contributions",async t=>{
  const {manager,install}=setup(t);install("1.0.0",false,"module.exports={tools:{echo:async()=>process.exit(7)}};");
  await manager.restart(1,"p1");
  await assert.rejects(manager.invoke(1,"p1","owned.echo","echo",{text:"crash"}),{code:"PLUGIN_HOST_EXITED"});
  assert.equal(manager.current(1,"p1").status,"failed");
  assert.deepEqual(manager.contributions(1,"p1"),[]);
});

test("a new server instance keeps the persisted last-known-good snapshot",async t=>{
  const {manager,install,store}=setup(t);install("1.0.0");
  const first=await manager.restart(1,"p1");await manager.stop();
  const {GenerationManager}=require("../plugin-system/generation-manager.js");
  const fresh=new GenerationManager({store});
  try{assert.equal(fresh.current(1,"p1").status,"stopped");const next=await fresh.restart(1,"p1");assert.equal(next.lastKnownGoodId,first.id);}
  finally{await fresh.stop();}
});
test("safe mode removes contributions and rollback restores the exact healthy snapshot",async t=>{
  const {manager,install,store}=setup(t);install("1.0.0");const first=await manager.restart(1,"p1");
  install("1.1.0");await manager.restart(1,"p1");
  assert.equal((await manager.invoke(1,"p1","owned.echo","echo",{text:"new"})).version,"1.1.0");
  const safe=await manager.enterSafeMode(1,"p1");assert.match(safe.id,/^gen-safe-/);assert.deepEqual(safe.bindings,[]);
  await assert.rejects(manager.invoke(1,"p1","owned.echo","echo",{text:"no"}),{code:"PLUGIN_NOT_ACTIVE"});
  const restored=await manager.rollback(1,"p1",first.id);assert.equal(restored.status,"healthy");
  assert.equal((await manager.invoke(1,"p1","owned.echo","echo",{text:"old"})).version,"1.0.0");
  assert.equal(store.listBindings(1,"p1")[0].version,"1.0.0");
});
