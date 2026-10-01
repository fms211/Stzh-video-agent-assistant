const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,"../app/hooks/useSessionProject.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(storage){
  let state, lastKey, pending;
  const exports={};
  vm.runInNewContext(code,{exports,localStorage:storage,require:()=>({useState:initial=>{state??=initial;return[state,value=>{state=value;}];},useCallback:fn=>fn,useEffect:(fn,deps)=>{if(lastKey!==deps[0]){lastKey=deps[0];pending=fn;}}})});
  return (owner,session)=>{let value=exports.useSessionProject(owner,session);if(pending){const run=pending;pending=null;run();value=exports.useSessionProject(owner,session);}return value;};
}
function storage(){const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
test("project selections survive remount and remain separate for accounts and sessions",()=>{
  const local=storage(),render=harness(local);
  render(1,"A").select("project-a");
  assert.equal(render(1,"A").projectId,"project-a");
  assert.equal(render(1,"B").projectId,"");
  render(1,"B").select("project-b");
  assert.equal(render(2,"A").projectId,"");
  assert.equal(render(1,"A").projectId,"project-a");
  assert.equal(harness(local)(1,"B").projectId,"project-b");
  render(1,"A").select("");
  assert.equal(harness(local)(1,"A").projectId,"");
});
test("Coze may save selection for its newly created session without altering the old one",()=>{
  const local=storage(),render=harness(local);
  render(1,"old").select("project-a");
  render(1,"old").select("project-b","new");
  assert.equal(render(1,"new").projectId,"project-b");
  assert.equal(harness(local)(1,"old").projectId,"project-a");
});
test("unreadable storage blocks sending until explicit selection; failed saves retain a visible warning",()=>{
  const render=harness({getItem(){throw new Error("read failed");},setItem(){throw new Error("write failed");}});
  assert.equal(render(1,"A").ready,false);
  render(1,"A").select("project-a","new");
  const current=render(1,"new");
  assert.equal(current.ready,true);assert.equal(current.projectId,"project-a");assert.match(current.error,/未能保存/);
  const invalid=harness({getItem:()=>'{"projectId":12}',setItem(){}});
  assert.equal(invalid(1,"A").ready,false);
  invalid(1,"A").select("");assert.equal(invalid(1,"A").ready,true);
});
