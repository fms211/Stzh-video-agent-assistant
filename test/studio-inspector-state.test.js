const test = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../app/lib/studio-inspector-state.ts");
const record = { id: "wf-1", role: "workflow", content: "", timestamp: 1, workflowName: "计划A", totalSteps: 3, stepIndex: 1 };

test("restored incomplete workflow must not be labelled completed or actively running", async () => {
  const { describeWorkflow } = await load();
  const state = describeWorkflow({ selected: null, latest: record, running: false, choosing: false });
  assert.equal(state.status, "未完成，当前页面未在执行");
  assert.equal(state.isRunning, false);
  assert.equal(state.completedSteps, 1);
  assert.equal(state.runId, record.id);
});

test("selected new workflow does not inherit the old run or completion state", async () => {
  const { describeWorkflow } = await load();
  const state = describeWorkflow({ selected: { name: "新计划", steps: [1, 2] }, latest: { ...record, stepIndex: 3 }, running: false, choosing: true });
  assert.equal(state.status, "待开始");
  assert.equal(state.planTitle, "新计划");
  assert.equal(state.runId, null);
  assert.equal(state.completedSteps, 0);
});

test("workflow failures, execution and completion remain distinguishable", async () => {
  const { describeWorkflow } = await load();
  const inspect = (latest, running = false) => describeWorkflow({ selected: null, latest, running, choosing: false });
  assert.equal(inspect({ ...record, stepIndex: 3 }).status, "已完成");
  assert.equal(inspect({ ...record, stepIndex: 3, isError: true }).status, "执行失败");
  assert.equal(inspect({ ...record, stepName: "核对来源" }, true).status, "执行中 · 核对来源");
});

test("recovered steps update counts without counting duplicates, plans, other runs or declaring full completion", async()=>{
  const {describeWorkflow}=await load();
  const latest={...record,workflowRunId:"run-a",stepIndex:0,isError:true};
  const step={id:"one",role:"workflow-step",workflowRunId:"run-a",workflowStepId:"first",stepIndex:0,content:"saved"};
  const messages=[step,{...step,id:"duplicate"},{...step,id:"two",workflowStepId:"second",stepIndex:1},{...step,workflowStepId:"run-a:plan",stepIndex:2},{...step,workflowRunId:"other",stepIndex:2},{...step,isError:true,stepIndex:2}];
  const result=describeWorkflow({selected:null,latest,running:false,choosing:false,messages});
  assert.equal(result.completedSteps,2);assert.equal(result.status,"执行失败");
  const restored=describeWorkflow({selected:null,latest:{...latest,isError:false},running:false,choosing:false,messages:[...messages,{...step,stepIndex:2}]});
  assert.equal(restored.completedSteps,3);assert.equal(restored.status,"未完成，当前页面未在执行");
});

test("late inspection from another account cannot replace the current account's mode state", async () => {
  const { emptyStudioInspector, updateStudioInspector } = await load();
  const assistant = { providerName: "B", model: "text", sending: false, sessionSummary: "B的会话" };
  const state = updateStudioInspector(emptyStudioInspector("user:2"), "user:2", "assistant", assistant);
  assert.equal(updateStudioInspector(state, "user:1", "collaboration", { runId: "private-A" }), state);
  assert.equal(state.assistant, assistant);
  assert.equal(state.collaboration, null);
});
