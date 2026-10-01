const test=require("node:test"),assert=require("node:assert/strict");
const load=()=>import("../app/lib/assistant-history.ts");
const message=(id,role,content,extra={})=>({id,role,content,timestamp:1720000000000,...extra});
test("reply retry reuses the failed turn and refuses to rewrite an older branch",async()=>{
  const {prepareAssistantRetry}=await load();
  const messages=[message("old","user","earlier"),message("answer","assistant","answer"),message("question","user","retry prompt"),message("failed","assistant","",{isError:true})];
  const retry=prepareAssistantRetry(messages,"failed");
  assert.equal(retry.assistantId,"failed");assert.equal(retry.messages.at(-1).content,"retry prompt");assert.equal(retry.messages.length,3);
  assert.equal(prepareAssistantRetry([...messages,message("later","user","different branch")],"failed"),null);
  assert.equal(prepareAssistantRetry([message("ok","assistant","success")],"ok"),null);
});
test("session navigation saves before reading and preserves the current view on failure",async()=>{
  const {openAssistantSession}=await load();const order=[];
  await openAssistantSession({flush:async()=>order.push("save"),read:async()=>{order.push("read");return "loaded";},isCurrent:()=>true,commit:value=>order.push(value)});
  assert.deepEqual(order,["save","read","loaded"]);
  await assert.rejects(openAssistantSession({flush:async()=>{throw new Error("offline");},read:async()=>assert.fail("must not read"),isCurrent:()=>true,commit:()=>assert.fail("must not switch")}),/offline/);
  await assert.rejects(openAssistantSession({flush:async()=>{},read:async()=>{throw new Error("missing");},isCurrent:()=>true,commit:()=>assert.fail("must not switch")}),/missing/);
});
test("session navigation discards late responses after account or selection changes",async()=>{
  const {openAssistantSession}=await load();let current=true;
  assert.equal(await openAssistantSession({flush:async()=>{},read:async()=>{current=false;return "private";},isCurrent:()=>current,commit:()=>assert.fail("stale result")}),false);
});
test("Markdown export retains ordinary turns, workflow inputs, failed steps and final reports",async()=>{
  const {exportAssistantConversation,assistantSessionMode}=await load();
  const messages=[message("u","user","创意"),message("w","workflow","",{workflowName:"研究",workflowInput:{topic:"主题"}}),message("s","workflow-step","失败原因",{stepName:"查找",isError:true}),message("r","action-cards","完整报告")];
  const output=exportAssistantConversation(messages);
  for(const text of ["创意","研究","topic: 主题","执行失败","失败原因","完整报告"]) assert.ok(output.includes(text));
  assert.equal(assistantSessionMode("legacy",messages),"workflow");assert.equal(assistantSessionMode("opc_workflow_new"),"workflow");assert.equal(assistantSessionMode("opc_new"),"chat");
});

test("saved reference gaps remain present in conversation, report and continuation exports", async () => {
  const { exportAssistantConversation, assistantContentWithReferences } = await load();
  const notes = ["知识库暂不可用，本步骤没有知识库参考。", "网络搜索未找到匹配资料，本步骤没有网络参考。"];
  const step = message("step", "workflow-step", "合成创作结果", { referenceNotes: notes });
  const output = exportAssistantConversation([step]);
  for (const note of notes) assert.ok(output.includes(note));
  const report = assistantContentWithReferences(step.content, notes);
  assert.match(report, /资料状态/); assert.ok(report.endsWith(step.content));
  assert.equal(assistantContentWithReferences("原文", []), "原文");
});
