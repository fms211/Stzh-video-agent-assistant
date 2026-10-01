const test=require("node:test"),assert=require("node:assert/strict");

test("plugin HTTP adapter uploads multipart bytes and preserves real project paths",async()=>{
  const {createHttpPluginCenterAdapter}=await import("../app/lib/plugin-center/http-adapter.ts");
  const calls=[];
  const adapter=createHttpPluginCenterAdapter({request:async(url,options)=>{calls.push({url,options});return url.endsWith("/uploads")?{source:{type:"local",uploadToken:"actual-upload"}}:[];}});
  const source=await adapter.uploadLocalPackage(new File(["owned"],"owned.stzhplugin"));
  assert.equal(source.uploadToken,"actual-upload");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get("file").name,"owned.stzhplugin");
  await adapter.listProjectBindings("owned/project");
  assert.equal(calls[1].url,"/api/plugins/projects/owned%2Fproject/bindings");
  adapter.dispose();
});

test("disposed plugin subscriptions discard delayed results after an account change",async()=>{
  const {createHttpPluginCenterAdapter}=await import("../app/lib/plugin-center/http-adapter.ts");
  let release;const events=[];
  const adapter=createHttpPluginCenterAdapter({request:async()=>new Promise(resolve=>{release=resolve;})});
  adapter.subscribe("real-project",0,{onEvent:event=>events.push(event),onError:()=>{}});
  adapter.dispose();release({events:[{seq:1,type:"generation.healthy"}]});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(events,[]);
  await assert.rejects(adapter.listAccountPackages(),/关闭/);
});
