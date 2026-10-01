const test=require("node:test"),assert=require("node:assert/strict");
const load=()=>import("../app/lib/composer-drafts.ts");

test("mode edits and parameter insertion preserve other modes and remain available after revisiting an account",async()=>{
  const {createComposerDrafts,switchComposerDraftOwner,updateComposerDrafts}=await load();
  let state=createComposerDrafts("user:1");
  state=updateComposerDrafts(state,"user:1",drafts=>({...drafts,coze:"Coze draft",collaboration:"讨论雨后城市"}));
  state=updateComposerDrafts(state,"user:1",drafts=>({...drafts,collaboration:`${drafts.collaboration} 16:9 推镜`}));
  assert.equal(state.byOwner["user:1"].coze,"Coze draft");
  state=switchComposerDraftOwner(state,"user:2");
  assert.deepEqual(Object.values(state.byOwner["user:2"]),["","","",""]);
  state=switchComposerDraftOwner(state,"user:1");
  assert.equal(state.byOwner["user:1"].collaboration,"讨论雨后城市 16:9 推镜");
});

test("late callbacks can update their original draft without changing the active account",async()=>{
  const {createComposerDrafts,switchComposerDraftOwner,updateComposerDrafts}=await load();
  let state=switchComposerDraftOwner(createComposerDrafts("user:1"),"user:2");
  state=updateComposerDrafts(state,"user:2",drafts=>({...drafts,assistant:"B content"}));
  state=updateComposerDrafts(state,"user:1",drafts=>({...drafts,assistant:"late A content"}));
  assert.equal(state.owner,"user:2");assert.equal(state.byOwner["user:2"].assistant,"B content");
});

test("guest login copies the unsubmitted draft without overwriting an existing account or leaking account input on logout",async()=>{
  const {createComposerDrafts,switchComposerDraftOwner,updateComposerDrafts}=await load();
  let state=updateComposerDrafts(createComposerDrafts("guest"),"guest",drafts=>({...drafts,collaboration:"guest input"}));
  state=switchComposerDraftOwner(state,"user:1");assert.equal(state.byOwner["user:1"].collaboration,"guest input");
  state=updateComposerDrafts(state,"user:1",drafts=>({...drafts,collaboration:"private account input"}));
  state=switchComposerDraftOwner(state,"guest");assert.equal(state.byOwner.guest.collaboration,"guest input");
  state=switchComposerDraftOwner(state,"user:1");assert.equal(state.byOwner["user:1"].collaboration,"private account input");
  state=switchComposerDraftOwner(state,"user:2");assert.equal(state.byOwner["user:2"].collaboration,"");
});

test("per-account session drafts survive reload, ignore malformed or foreign records, and clear when submitted",async()=>{
  const {emptyComposerDrafts,readComposerDrafts,writeComposerDrafts}=await load();
  const items=new Map();
  const storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
  const drafts={...emptyComposerDrafts(),assistant:"未发送的单助手草稿",collaboration:"未发送的协作草稿"};
  writeComposerDrafts(storage,"user:A",drafts);
  assert.deepEqual(readComposerDrafts(storage,"user:A"),drafts);
  assert.equal(readComposerDrafts(storage,"user:B"),null);
  const key=[...items.keys()][0];
  items.set(key,JSON.stringify({version:1,owner:"user:B",drafts}));
  assert.equal(readComposerDrafts(storage,"user:A"),null);
  items.set(key,JSON.stringify({version:1,owner:"user:A",drafts:{...drafts,workflow:42}}));
  assert.equal(readComposerDrafts(storage,"user:A"),null);
  writeComposerDrafts(storage,"user:A",emptyComposerDrafts());
  assert.equal(items.size,0);
});

test("workflow form parameters restore only for their owner and clearing the form removes the draft",async()=>{
  const {readWorkflowFormDraft,writeWorkflowFormDraft}=await load();
  const items=new Map();
  const storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
  const form={workflowId:"video-chain",input:{topic:"雨后城市",goal:"产品宣传"}};
  writeWorkflowFormDraft(storage,"user:A",form);
  assert.deepEqual(readWorkflowFormDraft(storage,"user:A"),form);
  assert.equal(readWorkflowFormDraft(storage,"user:B"),null);
  const key=[...items.keys()][0];
  items.set(key,JSON.stringify({version:1,owner:"user:B",...form}));
  assert.equal(readWorkflowFormDraft(storage,"user:A"),null);
  items.set(key,JSON.stringify({version:1,owner:"user:A",workflowId:form.workflowId,input:{topic:42}}));
  assert.equal(readWorkflowFormDraft(storage,"user:A"),null);
  writeWorkflowFormDraft(storage,"user:A",null);
  assert.equal(items.size,0);
});
