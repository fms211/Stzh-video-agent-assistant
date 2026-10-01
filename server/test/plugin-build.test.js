"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const Database=require("better-sqlite3");
const {PluginStore}=require("../plugin-system/store.js");

function setup(t,options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-owned-plugin-build-")),db=new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1);CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER);");
  const store=new PluginStore({db,root});
  const {PluginBuildRunner}=require("../plugin-system/build-runner.js");
  const builder=new PluginBuildRunner({store,...options});
  t.after(async()=>{await builder.stop();db.close();fs.rmSync(root,{recursive:true,force:true});});
  const manifest={schemaVersion:1,id:"owned.build",name:"Owned build",version:"1.0.0",description:"Local owned build fixture",engine:{stzh:"^0.1.0"},entrypoints:{host:"dist/index.cjs"},requestedPermissionTier:"safe",contributes:{}};
  const packageJson={name:"owned-build-fixture",version:"1.0.0",scripts:{build:"node build.cjs"}};
  const payload={manifest,files:{"package.json":JSON.stringify(packageJson),"build.cjs":"const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.cjs',JSON.stringify({secret:process.env.STZH_BUILDER_TEST_SECRET||null,home:process.env.HOME}));"},dependencies:[],buildScripts:[{name:"build",command:"node build.cjs"}]};
  return {builder,store,db,root,payload,packageJson};
}
const context={userId:1,previewId:"owned-preview",confirmation:{acceptsWeakSandboxRisk:true,acceptsOpenInternetBuildScripts:true}};

test("owned build executes only after confirmation, produces the missing entry and does not inherit secrets",{timeout:15000},async t=>{
  const f=setup(t);const previous=process.env.STZH_BUILDER_TEST_SECRET;process.env.STZH_BUILDER_TEST_SECRET="owned-parent-secret";
  t.after(()=>{if(previous===undefined)delete process.env.STZH_BUILDER_TEST_SECRET;else process.env.STZH_BUILDER_TEST_SECRET=previous;});
  await f.builder.prepare(f.payload,{userId:1});
  await assert.rejects(f.builder.build(f.payload,{...context,confirmation:{}}),{code:"RISK_CONFIRMATION_REQUIRED"});
  const files=await f.builder.build(f.payload,context).catch(error=>{t.diagnostic(JSON.stringify(f.db.prepare("SELECT records,error FROM plugin_build_runs").all()));throw error;});
  const result=JSON.parse(files["dist/index.cjs"].toString());
  assert.equal(result.secret,null);
  assert.ok(result.home.startsWith(f.root));
  assert.equal(f.db.prepare("SELECT status FROM plugin_build_runs WHERE phase='build'").get().status,"completed");
});

test("dependency preparation locks exact versions without executing package scripts",async t=>{
  const calls=[];
  const f=setup(t,{execute:async(command)=>{
    calls.push(command.args);
    if(command.args.includes("--package-lock-only"))fs.writeFileSync(path.join(command.cwd,"package-lock.json"),JSON.stringify({name:"owned-build-fixture",version:"1.0.0",lockfileVersion:3,packages:{"":{name:"owned-build-fixture",version:"1.0.0",dependencies:{tiny:"^1.0.0"}},"node_modules/tiny":{version:"1.2.0",resolved:"https://registry.npmjs.org/tiny/-/tiny-1.2.0.tgz",integrity:"sha512-YWJj"}}}));
    return {exitCode:0,stdout:"",stderr:""};
  }});
  f.payload.files["package.json"]=JSON.stringify({...f.packageJson,dependencies:{tiny:"^1.0.0"}});
  f.payload.dependencies=[{name:"tiny",version:"^1.0.0"}];
  const prepared=await f.builder.prepare(f.payload,{userId:1});
  assert.match(prepared.hash,/^[a-f0-9]{64}$/);
  assert.deepEqual(prepared.dependencies,[{name:"tiny",version:"1.2.0"}]);
  assert.ok(calls[0].includes("--ignore-scripts"));
  assert.equal(calls.length,1);
});

test("local and private dependency sources are rejected before npm runs",async t=>{
  let calls=0;const f=setup(t,{execute:async()=>{calls++;return {exitCode:0};}});
  f.payload.files["package.json"]=JSON.stringify({...f.packageJson,dependencies:{secret:"file:../../private"}});
  f.payload.dependencies=[{name:"secret",version:"file:../../private"}];
  await assert.rejects(f.builder.prepare(f.payload,{userId:1}),{code:"DEPENDENCY_SOURCE_DENIED"});
  assert.equal(calls,0);
});

test("a hung owned build is stopped and audited instead of committing an incomplete plugin",{timeout:10000},async t=>{
  const f=setup(t,{timeoutMs:500});
  f.payload.files["build.cjs"]="setInterval(()=>{},1000);";
  await assert.rejects(f.builder.build(f.payload,context),{code:"BUILD_TIMEOUT"});
  assert.equal(f.db.prepare("SELECT status FROM plugin_build_runs WHERE phase='build'").get().status,"failed");
  assert.equal(f.store.listPackages(1).length,0);
});

test("service stop waits for build audit and staging cleanup before returning",{timeout:10000},async t=>{
  const f=setup(t);f.payload.files["build.cjs"]="setInterval(()=>{},1000);";
  const outcome=f.builder.build(f.payload,context).then(()=>null,error=>error);
  await new Promise(resolve=>setTimeout(resolve,50));
  await f.builder.stop();
  assert.equal((await outcome).code,"BUILD_CANCELLED");
  assert.equal(f.db.prepare("SELECT status FROM plugin_build_runs WHERE phase='build'").get().status,"failed");
  const staging=path.join(f.store.accountRoot(1),"staging");
  assert.deepEqual(fs.readdirSync(staging),[]);
});

test("stopping a live build terminates its script process as well as npm",{timeout:25000},async t=>{
  const f=setup(t,{timeoutMs:20000});
  f.payload.files["build.cjs"]="require('fs').writeFileSync('child.pid',String(process.pid));setInterval(()=>{},1000);";
  const outcome=f.builder.build(f.payload,context).then(()=>null,error=>error);
  let scriptPid;
  const deadline=Date.now()+15000;
  while(Date.now()<deadline&&!scriptPid){
    for(const entry of f.builder.active){
      const file=path.join(entry.cwd,"child.pid");
      if(fs.existsSync(file))scriptPid=Number(fs.readFileSync(file,"utf8"));
    }
    if(!scriptPid)await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(scriptPid,"fixture must actually start before stop is tested");
  assert.doesNotThrow(()=>process.kill(scriptPid,0));
  await f.builder.stop();
  assert.equal((await outcome).code,"BUILD_CANCELLED");
  assert.throws(()=>process.kill(scriptPid,0),{code:"ESRCH"});
  assert.equal(f.db.prepare("SELECT status FROM plugin_build_runs WHERE phase='build'").get().status,"failed");
});
