"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-plugin-store-"));
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2);
    CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO creative_projects VALUES('project-1',1),('project-2',2);
    CREATE TABLE plugin_manifests(id TEXT PRIMARY KEY,name TEXT); INSERT INTO plugin_manifests VALUES('legacy','Existing plugin');`);
  const { PluginStore } = require("../plugin-system/store.js");
  const store = new PluginStore({db,root,...options});
  t.after(() => { db.close(); fs.rmSync(root,{recursive:true,force:true}); });
  return {store,db,root};
}
function packageInput(version="1.0.0") {
  return {
    manifest:{schemaVersion:1,id:"fixture.echo",name:"回声工具",version,description:"Local owned test plugin",engine:{stzh:"^0.1.0"},entrypoints:{host:"index.cjs"},requestedPermissionTier:"safe",contributes:{tools:[{name:"echo",description:"echo input",inputSchema:{type:"object"},outputSchema:{type:"object"},risk:"read",timeoutMs:1000}]}},
    files:{"index.cjs":"module.exports={tools:{echo:async input=>input}};"},
    source:{type:"local",uploadToken:"owned-test-fixture",fileName:"echo.stzhplugin",contentHash:""},resolvedRef:version,signatureStatus:"unsigned",
  };
}

test("workflow manifests reject dangling tool references and undeclared UI entrypoints",t=>{
  const {store}=fixture(t);
  const base=packageInput();
  const workflow={id:"story",title:"故事",description:"测试工作流",entryTool:"missing",uiSurfaceId:null};
  base.manifest.contributes.workflows=[workflow];
  assert.throws(()=>store.installPackage(1,base),{code:"INVALID_MANIFEST"});
  workflow.entryTool="echo";workflow.uiSurfaceId="story-ui";
  assert.throws(()=>store.installPackage(1,base),{code:"INVALID_MANIFEST"});
  workflow.uiSurfaceId=null;
  assert.equal(store.installPackage(1,base).manifest.contributes.workflows[0].entryTool,"echo");
});

test("plugin files are content-addressed, durable, account-scoped and preserve legacy registry",t=>{
  const {store,db}=fixture(t);
  const pkg=store.installPackage(1,packageInput());
  assert.match(pkg.contentHash,/^[a-f0-9]{64}$/);
  assert.equal(fs.readFileSync(path.join(store.packagePath(1,pkg.contentHash),"index.cjs"),"utf8"),packageInput().files["index.cjs"]);
  assert.equal(store.listPackages(1).length,1);
  assert.equal(store.listPackages(2).length,0);
  assert.equal(db.prepare("SELECT name FROM plugin_manifests WHERE id='legacy'").get().name,"Existing plugin");
  assert.equal(store.installPackage(1,packageInput()).installationId,pkg.installationId);
  assert.throws(()=>store.installPackage(1,{...packageInput(),files:{"index.cjs":"different"}}),{code:"PACKAGE_VERSION_CONFLICT"});
});

test("bindings enforce project ownership, exact package identity and permission tier",t=>{
  const {store}=fixture(t);const pkg=store.installPackage(1,packageInput());
  const binding={pluginId:pkg.pluginId,version:pkg.version,installationId:pkg.installationId,permissionTier:"safe",enabled:true,config:{}};
  assert.throws(()=>store.bind(1,"project-2",binding),{code:"PROJECT_NOT_FOUND"});
  assert.throws(()=>store.bind(2,"project-2",binding),{code:"PLUGIN_VERSION_NOT_FOUND"});
  store.bind(1,"project-1",binding);
  assert.equal(store.listBindings(1,"project-1")[0].installationId,pkg.installationId);
  assert.deepEqual(store.uninstall(1,pkg.pluginId,pkg.version),{status:"blocked",projectIds:["project-1"]});
});

test("uninstall quarantines unreferenced package data and restore does not silently re-enable projects",t=>{
  const {store}=fixture(t);const pkg=store.installPackage(1,packageInput());
  assert.equal(store.uninstall(1,pkg.pluginId,pkg.version).status,"quarantined");
  const [entry]=store.listQuarantined(1);
  assert.equal(store.listPackages(1).length,0);
  assert.equal(store.listQuarantined(2).length,0);
  assert.throws(()=>store.restore(2,entry.quarantineId),{code:"PLUGIN_NOT_FOUND"});
  store.restore(1,entry.quarantineId);
  assert.equal(store.listPackages(1)[0].contentHash,pkg.contentHash);
  assert.deepEqual(store.listBindings(1,"project-1"),[]);
});

test("package paths reject traversal, links, Windows alternate streams and oversized content",t=>{
  const {store}=fixture(t);
  for(const file of ["../outside.cjs","/absolute.cjs","C:/absolute.cjs","index.cjs:stream","a\\..\\outside.cjs"]){
    assert.throws(()=>store.installPackage(1,{...packageInput(),files:{[file]:"bad"}}),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  }
  assert.throws(()=>store.packagePath(1,"../outside"),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  assert.throws(()=>store.installPackage(1,{...packageInput(),files:{"index.cjs":{symlink:"outside"}}}),{code:"PACKAGE_BOUNDARY_VIOLATION"});
  assert.throws(()=>store.installPackage(1,{...packageInput(),files:{"index.cjs":Buffer.alloc(32*1024*1024+1)}}),{code:"PACKAGE_TOO_LARGE"});
});

test("expired quarantine cleanup preserves failures for retry and does not purge early",t=>{
  let locked = true;
  const {store}=fixture(t,{removeFiles:(target,options)=>{if(locked)throw new Error("test locked file");fs.rmSync(target,options);}});
  const pkg=store.installPackage(1,packageInput());
  store.uninstall(1,pkg.pluginId,pkg.version);
  assert.deepEqual(store.reapExpired(Date.now()),[]);
  assert.match(store.reapExpired(Date.now()+31*86400000)[0].error,/locked/);
  assert.match(store.listQuarantined(1)[0].lastError,/locked/);
  locked=false;
  assert.equal(store.reapExpired(Date.now()+31*86400000)[0].purged,true);
  assert.equal(store.listQuarantined(1).length,0);
});

test("an interrupted file commit can be recovered only when its content hash still matches",t=>{
  const {store,db}=fixture(t);
  const pkg=store.installPackage(1,packageInput());
  db.prepare("DELETE FROM plugin_packages WHERE id=?").run(pkg.installationId);
  const recovered=store.installPackage(1,packageInput());
  assert.equal(recovered.contentHash,pkg.contentHash);
  fs.writeFileSync(path.join(store.packagePath(1,pkg.contentHash),"index.cjs"),"tampered");
  assert.throws(()=>store.verifyPackage(1,recovered),{code:"PREVIEW_HASH_MISMATCH"});
});

test("plugin events are monotonic and isolated by owner and project",t=>{
  const {store}=fixture(t);
  store.installPackage(1,packageInput());store.installPackage(1,packageInput("1.1.0"));
  assert.deepEqual(store.events(1,null,0).map(e=>e.seq),[1,2]);
  assert.equal(store.events(1,null,1).length,1);
  assert.equal(store.events(2,null,0).length,0);
});

module.exports = { packageInput };
