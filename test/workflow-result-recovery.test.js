const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript"),vm=require("node:vm");
const source=fs.readFileSync(path.resolve(__dirname,"../app/lib/workflow-result-recovery.ts"),"utf8");
const exported={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported,crypto:require("node:crypto").webcrypto});
const {recoverWorkflowMessages}=exported;
test("recovery replaces only saved completed step replies and preserves run failure and other runs",()=>{
  const messages=[
    {id:"run",role:"workflow",workflowRunId:"a",content:"",isError:true},
    {id:"one",role:"workflow-step",workflowRunId:"a",workflowStepId:"one",content:"network failed",isError:true},
    {id:"two",role:"workflow-step",workflowRunId:"a",workflowStepId:"two",content:"unknown",isError:true},
    {id:"other",role:"workflow-step",workflowRunId:"b",workflowStepId:"one",content:"other"},
  ];
  const before=JSON.stringify(messages);
  const result=recoverWorkflowMessages(messages,"a",[
    {stepId:"one",status:"completed",result:{text:"original result",contextTrace:{applied:false}}},
    {stepId:"two",status:"uncertain",result:null},
    {stepId:"missing",status:"completed",result:{text:"not in local transcript"}},
  ]);
  assert.equal(result[1].content,"original result");assert.equal(result[1].isError,false);
  assert.equal(result[1].contextTrace.applied,false);
  for(const index of [0,2,3])assert.equal(result[index],messages[index]);
  assert.equal(result.length,messages.length);
  assert.equal(JSON.stringify(messages),before);
});
test("running and malformed completed outputs cannot replace a local reply",()=>{
  const message={id:"one",role:"workflow-step",workflowRunId:"a",workflowStepId:"one",content:"local"};
  for(const step of [{status:"running",result:{text:"not final"}},{status:"completed",result:null},{status:"completed",result:{text:12}}]) {
    assert.equal(recoverWorkflowMessages([message],"a",[{stepId:"one",...step}])[0],message);
  }
});

test("missing completed replies are restored once under the matching run without inventing completion",()=>{
  const messages=[{id:"run",role:"workflow",workflowId:"wf",workflowRunId:"a",content:"",isError:true,totalSteps:2,timestamp:1},{id:"later",role:"user",content:"later"}];
  const step={stepId:"a:0:first",stepIndex:0,workflowId:"wf",status:"completed",result:{text:"尚未批准",contextTrace:{applied:false}}};
  const results=[step,{...step,stepId:"foreign",workflowId:"other"},{...step,stepId:"uncertain",status:"uncertain"},step];
  const restored=recoverWorkflowMessages(messages,"a",results);
  assert.equal(restored.length,3);
  assert.equal(restored[0],messages[0]);
  assert.equal(restored[1].content,"尚未批准");
  assert.equal(restored[1].workflowStepId,step.stepId);
  assert.equal(restored[1].contextTrace.applied,false);
  assert.equal(restored[2],messages[1]);
  const again=recoverWorkflowMessages(restored,"a",results);
  assert.equal(again.length,3);assert.equal(again[1].id,restored[1].id);
  assert.equal(recoverWorkflowMessages(messages,"unknown",results).length,2);
});

test('workflow completion reuses the persisted message ID on repeated restoration',async()=>{
 const {workflowCompletionMessageId}=await import('../app/lib/workflow-result-recovery.ts');
 const id=workflowCompletionMessageId('run',[]);
 assert.equal(id,'wf_cards_run');
 const stored={id,role:'action-cards',workflowRunId:'run',content:'final',timestamp:1};
 assert.equal(workflowCompletionMessageId('run',[stored]),id);
 assert.equal(workflowCompletionMessageId('run',[{...stored,id:'legacy-card'}]),'legacy-card');
 assert.equal(workflowCompletionMessageId('another',[stored]),'wf_cards_another');
});

test('recovery restores durable reference notes and labels missing legacy retrieval records', () => {
  const messages = [{ id: 'run', role: 'workflow', workflowId: 'wf', workflowRunId: 'a', content: '' },
    { id: 'one', role: 'workflow-step', workflowRunId: 'a', workflowStepId: 'one', content: 'failed', referenceNotes: ['outdated'] }];
  const notes = ['知识库暂不可用，本步骤没有知识库参考。'];
  const saved = { stepId: 'one', stepIndex: 0, workflowId: 'wf', status: 'completed', result: { text: 'original', referenceNotes: notes } };
  assert.deepEqual(recoverWorkflowMessages(messages, 'a', [saved])[1].referenceNotes, notes);
  const missing = recoverWorkflowMessages([messages[0]], 'a', [saved]);
  assert.deepEqual(missing[1].referenceNotes, notes);
  const legacy = recoverWorkflowMessages([messages[0]], 'a', [{ ...saved, result: { text: 'legacy' } }]);
  assert.match(legacy[1].referenceNotes[0], /检索记录缺失/);
  const available = recoverWorkflowMessages(messages, 'a', [{ ...saved, result: { text: 'available', referenceNotes: [] } }]);
  assert.deepEqual(available[1].referenceNotes, []);
});
