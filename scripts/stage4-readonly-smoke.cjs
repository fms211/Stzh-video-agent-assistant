"use strict";
// Read-only API smoke against the isolated preview. Never calls generation APIs.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const base=new URL(process.env.STZH_SMOKE_BASE||"http://127.0.0.1:18080");
const checks=[];
function assertNoDevelopmentApiUrl(source,label){
  assert.doesNotMatch(source,/https?:\/\/(?:localhost|127\.0\.0\.1):8080(?:\b|\/)/i,`Development API URL leaked into ${label}`);
}
function assertSameOriginPreviewBundle(){
  if(base.port==="8080") return;
  const root=path.join(__dirname,"..","out","_next","static");
  assert.ok(fs.existsSync(root),"Production Web bundle is missing");
  let scanned=0;
  const pending=[root];
  while(pending.length){
    const directory=pending.pop();
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const full=path.join(directory,entry.name);
      if(entry.isDirectory()) pending.push(full);
      else if(entry.isFile()&&entry.name.endsWith(".js")){
        scanned++;
        assertNoDevelopmentApiUrl(fs.readFileSync(full,"utf8"),full);
      }
    }
  }
  assert.ok(scanned>0,"Production Web JavaScript is missing");
  checks.push({path:"out/_next/static/*.js",status:200});
}
async function request(path,token,body,expected=200) {
  const response=await fetch(new URL(path,base),{method:body?"POST":"GET",signal:AbortSignal.timeout(10000),headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,expected,`${path} HTTP status`);
  const value=await response.json();checks.push({path,status:response.status});return value;
}
async function main(){
  assert.ok(["127.0.0.1","localhost"].includes(base.hostname)&&base.protocol==="http:","Only the local isolated preview is supported");
  assertSameOriginPreviewBundle();
  const health=await request("/health");assert.equal(health.status,"ok");assert.equal(health.taskRuntime.enabled,false,"Media runtime must stay disabled for this smoke");
  for (const path of ["/", "/login", "/register"]) {
    const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200,`${path} page status`);
    assert.match(response.headers.get("content-type")||"",/text\/html/);
    const html=await response.text();
    assert.match(html,/<html/i);
    assert.match(html,/<script[^>]+src="\/_next\/static\//i,`${path} production scripts`);
    checks.push({path,status:response.status});
  }
  await request("/api/tasks",null,null,401);
  assert.ok(process.env.STZH_SMOKE_USER && process.env.STZH_SMOKE_PASSWORD, "Set STZH_SMOKE_USER and STZH_SMOKE_PASSWORD for an isolated test account");
  const auth=await request("/api/auth/login",null,{username:process.env.STZH_SMOKE_USER,password:process.env.STZH_SMOKE_PASSWORD});
  assert.equal(typeof auth.token,"string");
  assert.ok(Array.isArray((await request("/api/notifications",auth.token)).notifications));
  assert.ok(Array.isArray((await request("/api/devices",auth.token)).devices));
  for(const status of ["","queued,running,paused","queued","completed","failed,cancelled","completed,failed,cancelled"]){
    const data=await request(`/api/tasks?limit=20${status?`&status=${encodeURIComponent(status)}`:""}`,auth.token);
    assert.ok(Array.isArray(data.tasks));assert.equal(typeof data.total,"number");assert.ok(data.nextCursor===null||typeof data.nextCursor==="string");
    assert.ok(data.tasks.every(task=>!status||status.split(",").includes(task.status)));
  }
  assert.ok(Array.isArray((await request("/api/research/runs?limit=5",auth.token)).runs));
  assert.ok(Array.isArray((await request("/api/opc/sessions",auth.token)).sessions));
  for (const offset of [0,1]) {
    const sessions=(await request(`/api/opc/sessions?limit=1&offset=${offset}`,auth.token)).sessions;
    assert.ok(Array.isArray(sessions)&&sessions.length<=1);
    assert.ok(sessions.every(session=>["chat","workflow","coze"].includes(session.mode)));
  }
  assert.ok(Array.isArray((await request("/api/creative-projects",auth.token)).projects));
  assert.ok(Array.isArray(await request("/api/plugins/packages",auth.token)));
  assert.ok(Array.isArray((await request("/api/model-providers",auth.token)).providers));
  assert.ok(Array.isArray((await request("/api/agent-roles",auth.token)).roles));
  assert.ok(Array.isArray((await request("/api/agent-runs",auth.token)).runs));
  const history=await request("/api/agent-runs?limit=1",auth.token);
  assert.ok(Array.isArray(history.runs)&&history.runs.length<=1);
  assert.ok(history.nextCursor===null||typeof history.nextCursor==="string");
  if(history.nextCursor){
    const next=await request(`/api/agent-runs?limit=1&cursor=${encodeURIComponent(history.nextCursor)}`,auth.token);
    assert.ok(Array.isArray(next.runs)&&next.runs.length<=1);
    assert.ok(next.runs.every(run=>!history.runs.some(previous=>previous.id===run.id)));
  }
  const {loadGenerationRecords,summarizeGenerations}=await import("../app/lib/generation-statistics.ts");
  const records=await loadGenerationRecords(cursor=>request(`/api/tasks?status=completed&limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,auth.token));
  const statistics=summarizeGenerations(records);
  assert.equal(statistics.total,statistics.videoCount+statistics.imageCount);
  assert.equal(statistics.total,Object.values(statistics.daily).reduce((sum,value)=>sum+value,0));
  const report={checkedAt:new Date().toISOString(),scope:"local read-only API and HTML entry smoke; not browser interaction; no model, workflow execution, or media generation",checks};
  fs.mkdirSync("output/stage4",{recursive:true});fs.writeFileSync("output/stage4/readonly-smoke.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({passed:checks.length,mediaGenerationCalls:0}));
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={assertNoDevelopmentApiUrl};
