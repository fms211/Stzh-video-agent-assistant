"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const Database=require("better-sqlite3");
const {PluginStore}=require("../plugin-system/store.js");

function setup(t,tier="safe",extra={}) {
  const db=new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2);CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER,name TEXT);INSERT INTO creative_projects VALUES('p1',1,'Owner'),('p2',2,'Other');");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-plugin-permissions-"));
  const store=new PluginStore({db,root});
  const {PermissionBroker}=require("../plugin-system/permission-broker.js");
  const broker=new PermissionBroker({store,userId:1,projectId:"p1",binding:{pluginId:"owned.tool",permissionTier:tier},manifest:{runtimeNetwork:{publicInternet:false,allowedDomains:["example.org"]}},...extra});
  t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
  return {broker,store};
}

test("safe capabilities read only the bound project and reject owner substitution",async t=>{
  const {broker}=setup(t);
  assert.deepEqual(await broker.call("project.read",{userId:2,projectId:"p2"}),{id:"p1",name:"Owner"});
  await assert.rejects(broker.call("artifact.write",{name:"a.txt",content:"x"}),{code:"BRIDGE_UNAUTHORIZED"});
  await assert.rejects(broker.call("secrets.read",{}),{code:"BRIDGE_UNAUTHORIZED"});
});

test("standard artifacts are stored and read within the account/project/plugin boundary",async t=>{
  const {broker,store}=setup(t,"standard");
  const artifact=await broker.call("artifact.write",{name:"report.md",content:"真实产物",mimeType:"text/markdown"});
  assert.equal((await broker.call("artifact.read",{id:artifact.id})).content,"真实产物");
  const {PermissionBroker}=require("../plugin-system/permission-broker.js");
  const other=new PermissionBroker({store,userId:2,projectId:"p2",binding:{pluginId:"owned.tool",permissionTier:"standard"},manifest:{}});
  await assert.rejects(other.call("artifact.read",{id:artifact.id}),{code:"ARTIFACT_NOT_FOUND"});
  await assert.rejects(broker.call("artifact.write",{name:"../escape",content:"x"}),{code:"PACKAGE_BOUNDARY_VIOLATION"});
});

test("model calls and task creation receive server-bound identity, never caller identity",async t=>{
  const calls=[];
  const {broker}=setup(t,"full",{model:async(args,context)=>{calls.push(context);return "answer";},createTask:async(args,context)=>{calls.push(context);return {id:"task-owned"};}});
  assert.equal(await broker.call("model.chat",{userId:2,messages:[{role:"user",content:"hello"}]}),"answer");
  await broker.call("task.create",{userId:2,projectId:"p2",prompt:"owned"});
  assert.ok(calls.every(context=>context.userId===1&&context.projectId==="p1"));
});

test("network access honors declarations and rejects local addresses before transport",async t=>{
  let calls=0;
  const {broker}=setup(t,"standard",{requestNetwork:async()=>{calls++;return {status:200,body:"ok"};}});
  await assert.rejects(broker.call("network.fetch",{url:"http://127.0.0.1/secret"}),{code:"BRIDGE_UNAUTHORIZED"});
  await assert.rejects(broker.call("network.fetch",{url:"https://other.example/"}),{code:"BRIDGE_UNAUTHORIZED"});
  assert.equal((await broker.call("network.fetch",{url:"https://example.org/"})).status,200);
  assert.equal(calls,1);
});

test("revoked generation capabilities cannot continue accessing project data",async t=>{
  let active=true;
  const {broker}=setup(t,"standard",{isActive:()=>active});
  await broker.call("project.read",{});active=false;
  await assert.rejects(broker.call("project.read",{}),{code:"BRIDGE_UNAUTHORIZED"});
});
