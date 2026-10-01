"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createLocalModelPreviewFetch}=require("../lib/local-model-preview.js");
const endpoint="https://api.xiaomimimo.com/v1";
const resolveHost=async()=>[{address:"172.29.0.66",family:4}];
let previousGateway,previousPrivate;
test.beforeEach(()=>{
  previousGateway=process.env.STZH_TRUSTED_MODEL_GATEWAYS;previousPrivate=process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
  process.env.STZH_TRUSTED_MODEL_GATEWAYS=JSON.stringify({"api.xiaomimimo.com":["172.29.0.66"]});
  process.env.STZH_ALLOW_PRIVATE_MODEL_URLS="0";
});
test.afterEach(()=>{
  if(previousGateway===undefined)delete process.env.STZH_TRUSTED_MODEL_GATEWAYS;else process.env.STZH_TRUSTED_MODEL_GATEWAYS=previousGateway;
  if(previousPrivate===undefined)delete process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;else process.env.STZH_ALLOW_PRIVATE_MODEL_URLS=previousPrivate;
});
const textPayload=()=>({model:"mimo-v2.6-flash",thinking:{type:"disabled"},max_completion_tokens:128,messages:[{role:"user",content:"Synthetic text"}]});

test("preview reads the official model list through a pinned gateway without generating text",async()=>{
  let calls=0;
  const network=createLocalModelPreviewFetch(async(url,options)=>{
    calls++;assert.equal(url,endpoint+"/models");assert.equal(options.redirect,"error");assert.ok(options.dispatcher);
    assert.equal(options.headers.Authorization,"Bearer synthetic");return Response.json({data:[{id:"real-format-fixture"}]});
  },{resolveHost});
  assert.equal((await(await network.fetch(endpoint+"/models",{headers:{Authorization:"Bearer synthetic"}})).json()).data[0].id,"real-format-fixture");
  assert.equal(calls,1);assert.deepEqual(network.counts,{blockedOutbound:0,modelListRequests:1,textRequests:0,mediaGenerationCalls:0});
});

test("foreign hosts, private URLs, changed ports, credentials, query strings and media routes never reach transport",async()=>{
  let calls=0;
  const network=createLocalModelPreviewFetch(async()=>{calls++;return Response.json({});},{resolveHost});
  for(const url of ["https://api.coze.cn/v1/chat","http://127.0.0.1/v1/models","https://172.29.0.66/v1/models","http://api.xiaomimimo.com/v1/models","https://api.xiaomimimo.com:8443/v1/models","https://name:secret@api.xiaomimimo.com/v1/models",endpoint+"/models?key=synthetic",endpoint+"/models#fragment",endpoint+"/images/generations",endpoint+"/videos/generations"]){
    await assert.rejects(()=>network.fetch(url),{code:"PREVIEW_PROVIDER_BLOCKED"});
  }
  await assert.rejects(()=>network.fetch(endpoint+"/models",{method:"POST"}),{code:"PREVIEW_PROVIDER_BLOCKED"});
  assert.equal(calls,0);assert.equal(network.counts.blockedOutbound,11);assert.equal(network.counts.mediaGenerationCalls,0);
});

test("bounded MiMo text calls keep their payload and cannot follow redirects",async()=>{
  const body=JSON.stringify(textPayload());let calls=0;
  const network=createLocalModelPreviewFetch(async(url,options)=>{
    calls++;assert.equal(url,endpoint+"/chat/completions");assert.equal(options.method,"POST");assert.equal(options.redirect,"error");
    assert.equal(options.body,body);assert.ok(options.dispatcher);return Response.json({choices:[{message:{content:"Fixture response"}}]});
  },{resolveHost});
  const response=await network.fetch(endpoint+"/chat/completions",{method:"POST",body,redirect:"follow"});
  assert.equal((await response.json()).choices[0].message.content,"Fixture response");assert.equal(calls,1);
  assert.equal(network.counts.textRequests,1);assert.equal(network.counts.mediaGenerationCalls,0);
});

test("tool calls, media message parts, other models, excess output and implicit thinking are blocked before spending",async()=>{
  let calls=0;
  const network=createLocalModelPreviewFetch(async()=>{calls++;return Response.json({});},{resolveHost});
  for(const override of [
    {tools:[]},{tool_choice:"auto"},{functions:[]},{function_call:"auto"},{stream:true},
    {messages:[{role:"user",content:[{type:"image_url",image_url:{url:"https://example.org/image"}}]}]},
    {messages:[{role:"tool",content:"fixture"}]},{model:"unapproved-model"},
    {thinking:{type:"enabled"}},{thinking:undefined},{max_completion_tokens:4097},{max_completion_tokens:undefined},
    {messages:[{role:"user",content:"x".repeat(131073)}]},
  ])await assert.rejects(()=>network.fetch(endpoint+"/chat/completions",{method:"POST",body:JSON.stringify({...textPayload(),...override})}),{code:"PREVIEW_PROVIDER_BLOCKED"});
  assert.equal(calls,0);assert.equal(network.counts.mediaGenerationCalls,0);assert.equal(network.counts.textRequests,0);
});

test("a changed DNS gateway and pre-cancelled text call do not transmit credentials",async()=>{
  let calls=0;
  const network=createLocalModelPreviewFetch(async()=>{calls++;return Response.json({});},{resolveHost:async()=>[{address:"10.0.0.1",family:4}]});
  await assert.rejects(()=>network.fetch(endpoint+"/models"),{code:"INVALID_MODEL_ENDPOINT"});
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>network.fetch(endpoint+"/chat/completions",{method:"POST",body:JSON.stringify(textPayload()),signal:controller.signal}),error=>error.name==="AbortError");
  assert.equal(calls,0);
});

test("preview provider credentials decrypt after a restart with the same owned data directory",()=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
  const {loadPreviewEncryptionKey}=require("../lib/local-model-preview.js");
  const {encryptSecret,decryptSecret}=require("../lib/secret-crypto.js");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-preview-key-")),previous=process.env.STZH_LLM_ENCRYPTION_KEY;
  try{
    process.env.STZH_LLM_ENCRYPTION_KEY=loadPreviewEncryptionKey(dir);const saved=encryptSecret("synthetic-provider-credential");
    delete process.env.STZH_LLM_ENCRYPTION_KEY;
    process.env.STZH_LLM_ENCRYPTION_KEY=loadPreviewEncryptionKey(dir);
    assert.equal(decryptSecret(saved),"synthetic-provider-credential");assert.ok(!saved.includes("synthetic-provider-credential"));
  }finally{
    if(previous===undefined)delete process.env.STZH_LLM_ENCRYPTION_KEY;else process.env.STZH_LLM_ENCRYPTION_KEY=previous;
    assert.ok(dir.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});
  }
});

test("invalid persisted encryption material fails without replacing the file",()=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
  const {loadPreviewEncryptionKey}=require("../lib/local-model-preview.js");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-preview-key-")),file=path.join(dir,".model-provider-encryption-key");
  try{
    fs.writeFileSync(file,"invalid-existing-material");assert.throws(()=>loadPreviewEncryptionKey(dir),/不能自动覆盖/);
    assert.equal(fs.readFileSync(file,"utf8"),"invalid-existing-material");
  }finally{assert.ok(dir.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
