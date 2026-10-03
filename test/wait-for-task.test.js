const test = require("node:test");
const assert = require("node:assert/strict");

test("polling timeout and network loss are observation failures, distinct from terminal task failure", async () => {
  const {waitForTask,TaskTerminalError}=await import("../app/lib/wait-for-task.ts");
  let clock=0;
  await assert.rejects(waitForTask(async()=>({status:'queued'}),{now:()=>clock,timeoutMs:1,delay:async()=>{clock=2;}}),error=>!(error instanceof TaskTerminalError)&&/后台执行/.test(error.message));
  await assert.rejects(waitForTask(async()=>({status:'failed',error:'真正失败'})),error=>error instanceof TaskTerminalError);
});

test("terminal task failure stops immediately instead of retrying for eleven minutes", async () => {
  const { waitForTask } = await import("../app/lib/wait-for-task.ts");
  let calls = 0;
  await assert.rejects(waitForTask(async () => { calls++; return { status:"failed",error:"模型已停止服务" }; }), /模型已停止服务/);
  assert.equal(calls,1);
});

test("transient network errors can recover without treating a paused task as failed", async () => {
  const { waitForTask } = await import("../app/lib/wait-for-task.ts");
  const events=[new Error("network"),{status:"paused"},{status:"running"},{status:"completed",output:{text:"ok"}}];
  const states=[];
  const task=await waitForTask(async()=>{const e=events.shift();if(e instanceof Error)throw e;return e;},{delay:async()=>{},onUpdate:t=>states.push(t.status)});
  assert.deepEqual(states,["paused","running"]);
  assert.equal(task.output.text,"ok");
});

test("three consecutive fetch errors end observation with the real error", async () => {
  const { waitForTask } = await import("../app/lib/wait-for-task.ts");
  let calls=0;
  await assert.rejects(waitForTask(async()=>{calls++;throw new Error("offline");},{delay:async()=>{}}),/offline/);
  assert.equal(calls,3);
});
