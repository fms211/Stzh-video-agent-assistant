"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const httpFetch=global.fetch;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"stzh-model-discovery-"));
process.env.STZH_DATA_DIR=dir;process.env.JWT_SECRET="discovery-test-jwt-secret-at-least-32-characters";
process.env.STZH_LLM_ENCRYPTION_KEY="discovery-test-encryption-secret-at-least-32-characters";
process.env.COZE_API_TOKEN="";process.env.COZE_BOT_ID="";
const app=require("../server-express.js"),db=require("../db.js");
let server,base,owner,other,providerId,calls;
async function request(route,token,body){const response=await httpFetch(base+route,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};}
const connection={protocol:"openai",baseUrl:"https://1.1.1.1/v1"};
test.before(async()=>{
  server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;
  owner=(await request("/api/auth/register",null,{username:"discovery-owner",password:"synthetic-password"})).body.token;
  other=(await request("/api/auth/register",null,{username:"discovery-other",password:"synthetic-password"})).body.token;
  const created=await request("/api/model-providers",owner,{...connection,name:"Discovery fixture",model:"saved-model",apiKey:"synthetic-saved-key",vendorId:"custom",websiteUrl:"https://example.org",thinkingMode:"disabled",outputTokenParameter:"max_completion_tokens"});
  assert.equal(created.status,201);providerId=created.body.provider.id;
  assert.equal(created.body.provider.websiteUrl,"https://example.org/");assert.equal(created.body.provider.thinkingMode,"disabled");
});
test.beforeEach(()=>{calls=[];global.fetch=async(url,options)=>{
  calls.push({url,options});assert.equal(options.method,"GET");assert.equal(options.redirect,"error");
  return Response.json({data:[{id:"beta",display_name:"Beta"},{id:"alpha"},{id:"alpha"},{id:"\n"}],has_more:false});
};});
test.afterEach(()=>{global.fetch=httpFetch;});
test.after(async()=>{await app.locals.researchRuntime?.stop();await app.locals.pluginService?.stop();await new Promise(resolve=>server.close(resolve));db.close();assert.ok(dir.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
test("unsaved discovery reads actual transport format without saving a provider or generating text",async()=>{
  const before=db.prepare("SELECT COUNT(*) n FROM llm_providers").get().n;
  const result=await request("/api/model-providers/discover-models",owner,{...connection,apiKey:"synthetic-new-key"});
  assert.equal(result.status,200);assert.deepEqual(result.body.models.map(model=>model.id),["alpha","beta"]);
  assert.equal(result.body.partial,false);assert.equal(calls.length,1);assert.equal(calls[0].url,"https://1.1.1.1/v1/models");
  assert.equal(calls[0].options.headers.Authorization,"Bearer synthetic-new-key");
  assert.ok(!JSON.stringify(result.body).includes("synthetic-new-key"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM llm_providers").get().n,before);
});
test("saved key stays owner scoped and cannot follow an edited endpoint without a new key",async()=>{
  assert.equal((await request("/api/model-providers/discover-models",other,{...connection,providerId})).status,404);
  assert.equal((await request("/api/model-providers/discover-models",owner,{...connection,providerId,baseUrl:"https://1.0.0.1/v1"})).status,400);
  assert.equal(calls.length,0);
  const result=await request("/api/model-providers/discover-models",owner,{...connection,providerId});
  assert.equal(result.status,200);assert.equal(calls[0].options.headers.Authorization,"Bearer synthetic-saved-key");
  assert.equal(db.prepare("SELECT verified_at FROM llm_providers WHERE id=?").get(providerId).verified_at,null);
});
test("authentication, private and mapped hosts, URL credentials and missing keys stop before transport",async()=>{
  assert.equal((await request("/api/model-providers/discover-models",null,{...connection,apiKey:"synthetic"})).status,401);
  for(const baseUrl of ["http://127.0.0.1/v1","http://[::ffff:7f00:1]/v1","http://[::ffff:10.0.0.1]/v1","https://name:password@example.org/v1","https://1.1.1.1/v1?key=synthetic"]){
    assert.equal((await request("/api/model-providers/discover-models",owner,{...connection,baseUrl,apiKey:"synthetic"})).status,400,baseUrl);
  }
  assert.equal((await request("/api/model-providers/discover-models",owner,connection)).status,400);assert.equal(calls.length,0);
});
test("Anthropic discovery uses its protocol headers and pagination limit, with a visible partial flag",async()=>{
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json({data:[{id:"claude-fixture",display_name:"Claude fixture"}],has_more:true});};
  const result=await request("/api/model-providers/discover-models",owner,{protocol:"anthropic",baseUrl:"https://1.1.1.1",apiKey:"synthetic-anthropic"});
  assert.equal(result.status,200);assert.equal(result.body.partial,true);
  assert.equal(calls[0].url,"https://1.1.1.1/v1/models?limit=1000");
  assert.equal(calls[0].options.headers["x-api-key"],"synthetic-anthropic");assert.equal(calls[0].options.headers.Authorization,undefined);
});
test("upstream auth, unsupported, malformed and excessive responses produce actionable errors without echoing secrets",async()=>{
  for(const [response,code] of [[new Response("synthetic-saved-key",{status:401}),"MODEL_LIST_AUTH_FAILED"],[new Response("secret upstream details",{status:404}),"MODEL_LIST_UNSUPPORTED"],[Response.json({models:[]}),"MODEL_LIST_INVALID"],[new Response("x".repeat(2097153)),"MODEL_LIST_TOO_LARGE"]]){
    global.fetch=async()=>response;
    const result=await request("/api/model-providers/discover-models",owner,{...connection,providerId});
    assert.equal(result.status,502);assert.equal(result.body.error.code,code);assert.ok(!JSON.stringify(result.body).includes("synthetic-saved-key"));
  }
});

test("local preview restrictions reach the form without becoming a generic network error",async()=>{
  global.fetch=async()=>{throw Object.assign(new Error("当前验收预览仅开放小米 MiMo 官方模型列表与文字接口"),{code:"PREVIEW_PROVIDER_BLOCKED",status:400});};
  const result=await request("/api/model-providers/discover-models",owner,{...connection,providerId});
  assert.equal(result.status,400);assert.equal(result.body.error.code,"PREVIEW_PROVIDER_BLOCKED");
  assert.match(result.body.error.message,/验收预览.*MiMo/);assert.ok(!JSON.stringify(result.body).includes("synthetic-saved-key"));
});
test("DNS private results fail before credential transport and a validated IP is pinned to the dispatcher",async()=>{
  const {discoverProviderModels}=require("../lib/provider-discovery.js");
  let sent=false;
  global.fetch=async(_url,options)=>{sent=true;assert.ok(options.dispatcher);return Response.json({data:[{id:"fixture"}]});};
  await assert.rejects(()=>discoverProviderModels({protocol:"openai",baseUrl:"https://synthetic.invalid/v1"},"synthetic",{assertBaseUrl:value=>value,isPrivateHost:host=>host.startsWith("10."),resolveHost:async()=>[{address:"10.0.0.1",family:4}]}),{code:"INVALID_MODEL_ENDPOINT"});
  assert.equal(sent,false);
  assert.equal((await discoverProviderModels({protocol:"openai",baseUrl:"https://synthetic.invalid/v1"},"synthetic",{assertBaseUrl:value=>value,isPrivateHost:()=>false,resolveHost:async()=>[{address:"1.1.1.1",family:4}]})).models[0].id,"fixture");
  assert.equal(sent,true);
});

test("a deployment gateway exception binds HTTPS, the exact hostname and every resolved IP",async()=>{
  const {discoverProviderModels}=require("../lib/provider-discovery.js");
  const previous=process.env.STZH_TRUSTED_MODEL_GATEWAYS;
  process.env.STZH_TRUSTED_MODEL_GATEWAYS=JSON.stringify({"gateway-fixture.invalid":["172.29.0.66"]});
  let sent=0,lookups=0;
  global.fetch=async(_url,options)=>{sent++;assert.ok(options.dispatcher);assert.equal(options.redirect,"error");assert.equal(options.headers.Authorization,"Bearer synthetic-gateway-key");return Response.json({data:[{id:"gateway-model"}]});};
  const read=(baseUrl,addresses)=>discoverProviderModels({protocol:"openai",baseUrl},"synthetic-gateway-key",{
    assertBaseUrl:value=>value,isPrivateHost:()=>true,resolveHost:async()=>{lookups++;return addresses.map(address=>({address,family:4}));},
  });
  try {
    assert.equal((await read("https://gateway-fixture.invalid/v1",["172.29.0.66"])).models[0].id,"gateway-model");
    assert.equal(sent,1);assert.equal(lookups,1);
    for(const [url,addresses] of [
      ["https://gateway-fixture.invalid/v1",["172.29.0.67"]],
      ["https://gateway-fixture.invalid/v1",["172.29.0.66","10.0.0.1"]],
      ["http://gateway-fixture.invalid/v1",["172.29.0.66"]],
      ["https://gateway-fixture.invalid:8443/v1",["172.29.0.66"]],
      ["https://other.gateway-fixture.invalid/v1",["172.29.0.66"]],
      ["https://172.29.0.66/v1",["172.29.0.66"]],
    ])await assert.rejects(()=>read(url,addresses),{code:"INVALID_MODEL_ENDPOINT"},url);
    process.env.STZH_TRUSTED_MODEL_GATEWAYS="malformed-json";
    await assert.rejects(()=>read("https://gateway-fixture.invalid/v1",["172.29.0.66"]),{code:"INVALID_MODEL_ENDPOINT"});
    assert.equal(sent,1,"No credential transport for rejected exceptions");
  } finally {if(previous===undefined)delete process.env.STZH_TRUSTED_MODEL_GATEWAYS;else process.env.STZH_TRUSTED_MODEL_GATEWAYS=previous;}
});

test("cancelled discovery stops DNS waiting and does not start credential transport",async()=>{
  const {discoverProviderModels}=require("../lib/provider-discovery.js");
  let sent=0,lookups=0;
  global.fetch=async()=>{sent++;return Response.json({data:[]});};
  const controller=new AbortController();
  const pending=discoverProviderModels({protocol:"openai",baseUrl:"https://slow-dns.invalid/v1"},"synthetic",{
    assertBaseUrl:value=>value,isPrivateHost:()=>false,signal:controller.signal,
    resolveHost:()=>{lookups++;return new Promise(()=>{});},
  });
  controller.abort();
  await assert.rejects(()=>pending,{code:"MODEL_LIST_TIMEOUT"});
  assert.equal(lookups,1);assert.equal(sent,0);
  await assert.rejects(()=>discoverProviderModels({protocol:"openai",baseUrl:"https://slow-dns.invalid/v1"},"synthetic",{
    assertBaseUrl:value=>value,isPrivateHost:()=>false,signal:controller.signal,resolveHost:()=>{lookups++;return[];},
  }),{code:"MODEL_LIST_TIMEOUT"});
  assert.equal(lookups,1);
});

test("selected Anthropic models keep one version prefix and forward an explicit thinking setting",async()=>{
  const created=await request("/api/model-providers",owner,{protocol:"anthropic",baseUrl:"https://1.1.1.1/v1",apiKey:"synthetic-anthropic",model:"claude-fixture",name:"Anthropic fixture",thinkingMode:"disabled"});
  assert.equal(created.status,201);
  global.fetch=async(url,options)=>{calls.push({url,options});return Response.json({content:[{type:"text",text:"synthetic reply"}]});};
  const result=await request("/api/model/chat",owner,{providerId:created.body.provider.id,messages:[{role:"user",content:"Hello"}]});
  assert.equal(result.status,200);assert.equal(result.body.text,"synthetic reply");assert.equal(calls[0].url,"https://1.1.1.1/v1/messages");
  assert.deepEqual(JSON.parse(calls[0].options.body).thinking,{type:"disabled"});
});

test("structured research rejects token-truncated replies while ordinary chat may retain partial text",async()=>{
  const {providerServices}=require("../routes/creative-agent.js");
  const row=providerServices.findProvider(providerId,db.prepare("SELECT user_id FROM llm_providers WHERE id=?").get(providerId).user_id);
  global.fetch=async()=>Response.json({choices:[{finish_reason:"length",message:{content:'{"report":"unfinished'}}]});
  await assert.rejects(()=>providerServices.invokeProvider(row,[{role:"user",content:"Research"}],{requireComplete:true}),{code:"UPSTREAM_OUTPUT_TRUNCATED"});
  assert.equal(await providerServices.invokeProvider(row,[{role:"user",content:"Chat"}]),'{"report":"unfinished');
  const anthropic={...row,config:JSON.stringify({...JSON.parse(row.config),protocol:"anthropic"})};
  global.fetch=async()=>Response.json({stop_reason:"max_tokens",content:[{type:"text",text:"unfinished"}]});
  await assert.rejects(()=>providerServices.invokeProvider(anthropic,[{role:"user",content:"Research"}],{requireComplete:true}),{code:"UPSTREAM_OUTPUT_TRUNCATED"});
});
