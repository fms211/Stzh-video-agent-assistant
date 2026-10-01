const test = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../app/lib/collaborative-history.ts");
const run = {id:"run-1",projectId:"project-1",task:"原始任务",budget:"standard",status:"awaiting_confirmation",finalInstruction:"原指令",rationale:"依据",risks:"风险",taskId:null,error:null};

test("collaborative history saves edited instructions before changing records and retains the view on failures", async () => {
  const { saveCollaborativeDraft, openCollaborativeHistory } = await load();
  const steps=[];
  await openCollaborativeHistory({flush:()=>saveCollaborativeDraft(run,"新指令",async(value,text)=>{steps.push([value.finalInstruction,text]);return {...value,finalInstruction:text};}),read:async()=>{steps.push("read");return {run,events:[]};},isCurrent:()=>true,commit:()=>steps.push("commit")});
  assert.deepEqual(steps,[["原指令","新指令"],"read","commit"]);
  await assert.rejects(openCollaborativeHistory({flush:async()=>{throw new Error("conflict");},read:()=>assert.fail("must preserve current view"),isCurrent:()=>true,commit:()=>assert.fail("must preserve draft")}),/conflict/);
  await assert.rejects(openCollaborativeHistory({flush:async()=>{},read:async()=>{throw new Error("offline");},isCurrent:()=>true,commit:()=>assert.fail("must preserve view")}),/offline/);
});

test("collaborative history discards late account results and rejects empty or terminal edits", async () => {
  const { saveCollaborativeDraft, openCollaborativeHistory } = await load();
  let current=true;
  assert.equal(await openCollaborativeHistory({flush:async()=>{},read:async()=>{current=false;return {run,events:[]};},isCurrent:()=>current,commit:()=>assert.fail("wrong account")}),false);
  await assert.rejects(saveCollaborativeDraft(run," ",()=>assert.fail("empty edit")),/不能为空/);
  await assert.rejects(saveCollaborativeDraft({...run,status:"completed"},"修改",()=>assert.fail("terminal edit")),/状态已变化/);
  assert.equal(await saveCollaborativeDraft(run,"原指令",()=>assert.fail("unchanged must not write")),run);
});

test("collaborative status distinguishes discussion, generation and all terminal states", async () => {
  const { collaborativeStatus } = await load();
  assert.equal(collaborativeStatus({...run,status:"running"}),"协作讨论中");
  assert.equal(collaborativeStatus({...run,status:"running",taskId:"task"}),"生成任务执行中");
  for (const status of ["draft","queued","paused","completed","failed","cancelled"]) assert.ok(!collaborativeStatus({...run,status}).includes("待确认"));
  assert.equal(collaborativeStatus({...run,status:"future"}),"状态：future");
});

test("collaborative export preserves original instruction, unsaved draft, role snapshot and full error events", async () => {
  const { exportCollaborativeRun } = await load();
  const markdown=exportCollaborativeRun({...run,teamSnapshot:[{name:"研究员",prompt:"原角色提示",capabilities:["research"],defaultProviderId:"provider-a"}],error:"模型错误"},[{id:"event-1",type:"run.failed",created_at:1,payload:{message:"完整错误",output:"详细输出"}}],"未保存改稿");
  for(const text of ["原始任务","原指令","尚未保存的编辑","未保存改稿","原角色提示","provider-a","模型错误","完整错误","详细输出"]) assert.ok(markdown.includes(text));
});
