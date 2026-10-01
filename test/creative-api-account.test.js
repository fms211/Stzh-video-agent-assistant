const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{pathToFileURL}=require("node:url"),ts=require("typescript");
async function apiModule(){
  const auth=pathToFileURL(path.resolve(__dirname,"../app/lib/auth.ts")).href;
  const source=fs.readFileSync(path.resolve(__dirname,"../app/lib/creative-agent-api.ts"),"utf8").replace('from "./auth"',`from "${auth}"`);
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}
test("creative request sessions stop chained calls and late results after an account switch",async t=>{
  const originals={fetch:global.fetch,window:global.window,localStorage:global.localStorage};
  t.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete global[key];else global[key]=value;}});
  let token="account-a",calls=0;
  global.window={location:{protocol:"http:",hostname:"localhost",port:"18080",origin:"http://localhost:18080"}};
  global.localStorage={getItem:()=>token};
  const {captureCreativeApi}=await apiModule();
  global.fetch=async(_url,options)=>{calls++;assert.equal(options.headers.Authorization,"Bearer account-a");return Response.json({ok:true});};
  const api=captureCreativeApi();
  await api("/first");token="account-b";
  await assert.rejects(api("/must-not-start"),error=>error.name==="AbortError");assert.equal(calls,1);
  token="account-a";
  const pendingApi=captureCreativeApi();
  global.fetch=async()=>{token="account-b";return Response.json({private:"account-a"});};
  await assert.rejects(pendingApi("/late"),error=>error.name==="AbortError");
});
