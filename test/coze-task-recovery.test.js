const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const load = file => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,JSON,Error,Set,Map});
  return exports;
};
const api = load('app/lib/coze-task-recovery.ts');
const task = {id:'task1',kind:'video.generate',status:'queued',input:{conversationId:'session1'},conversationMessageId:'reply1'};

test('inspector distinguishes unknown progress from idle and labels retained status as last confirmed',()=>{
  const idle=api.cozeRecoveryStatus({label:'',error:'',loading:false});
  assert.equal(idle,null);
  const loading=api.cozeRecoveryStatus({label:'',error:'',loading:true});
  assert.equal(loading.active,false);assert.match(loading.label,/正在恢复/);
  const disconnected=api.cozeRecoveryStatus({label:'',error:'old server',loading:false});
  assert.equal(disconnected.active,false);assert.match(disconnected.label,/暂未确认/);
  assert.doesNotMatch(disconnected.label,/尚无|开始生成/);
  const retained=api.cozeRecoveryStatus({label:'已排队',error:'offline',loading:false});
  assert.equal(retained.active,true);assert.match(retained.label,/上次确认：已排队/);
  assert.match(retained.label,/重新连接/);
  assert.equal(api.cozeRecoveryStatus({label:'正在运行',error:'',loading:false}).label,'正在运行');
});
test('waiting text never identifies a pending task and a different conversation cannot attach',()=>{
  assert.equal(api.taskReplyId({...task,conversationMessageId:null},'session1'),null);
  assert.equal(api.taskReplyId(task,'session2'),null);
  assert.equal(api.taskReplyId({...task,kind:'ui.review'},'session1'),null);
  assert.equal(api.taskReplyId(task,'session1'),'reply1');
});
test('an old server without reply metadata is reported rather than falsely displaying an idle conversation',async()=>{
  const legacy={...task};delete legacy.conversationMessageId;
  await assert.rejects(api.readConversationTasks('session1',async()=>({tasks:[legacy],nextCursor:null}),()=>true),/重启本机预览/);
});
test('queue, run and pause restore a non-error reply; terminal output removes stale failure',()=>{
  for(const status of ['queued','running','paused']) {
    const reply=api.cozeTaskReply({...task,status});assert.equal(reply.isError,false);assert.equal(api.isActiveCozeTask({...task,status}),true);
  }
  const reply=api.cozeTaskReply({...task,status:'completed',output:{text:'中文 English',videoUrl:'https://example.com/video.mp4',warnings:[{message:'部分能力提示'}],contextTrace:{applied:false}}});
  assert.match(reply.text,/中文 English/);assert.match(reply.text,/部分能力提示/);assert.equal(reply.payload.requestId,'task1');assert.equal(reply.isError,false);assert.equal(reply.contextTrace.applied,false);
  assert.equal(api.cozeTaskReply({...task,status:'failed',error:'真实失败'}).errorText,'真实失败');
});
test('recovery reads later pages, filtering unbound tasks, without submitting any work',async()=>{
  const reads=[];
  const result=await api.readConversationTasks('session1',async cursor=>{reads.push(cursor);return cursor?{tasks:[task],nextCursor:null}:{tasks:[{...task,input:{conversationId:'other'}}],nextCursor:'page2'};},()=>true);
  assert.deepEqual(reads,[undefined,'page2']);assert.equal(result.length,1);
});
test('late account or selection response is discarded and repeated cursors are rejected',async()=>{
  let current=true;
  assert.equal(await api.readConversationTasks('session1',async()=>{current=false;return{tasks:[task],nextCursor:null};},()=>current),null);
  await assert.rejects(api.readConversationTasks('session1',async()=>({tasks:[],nextCursor:'same'}),()=>true),/分页未推进/);
});

function hookFixture() {
  const slots=[], effects=[], timers=new Map(), reads=[];let cursor=0, token='account1',props={session:'session1',owner:1,ready:true,revision:0}, messages=[{id:'reply1',role:'agent',isError:true,errorText:'任务仍在后台执行'}],result;
  const hooks={
    useRef(initial){return(slots[cursor++]||={value:{current:initial}}).value;},
    useState(initial){const slot=slots[cursor++]||={value:initial};return[slot.value,value=>{slot.value=typeof value==='function'?value(slot.value):value;}];},
    useEffect(fn,deps){const index=cursor++,old=slots[index];if(old&&deps.every((value,i)=>Object.is(value,old.deps[i])))return;const next={deps};slots[index]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});},
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/hooks/useCozeTaskRecovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,Error,JSON,Map,Set,setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    require(name){if(name==='react')return hooks;if(name.endsWith('/auth'))return{getToken:()=>token,getTasks:options=>new Promise((resolve,reject)=>reads.push({options,resolve,reject}))};if(name.endsWith('/coze-task-recovery'))return api;throw Error(name);},
  });
  const setMessages=next=>{messages=typeof next==='function'?next(messages):next;};
  function render(){cursor=0;result=exports.useCozeTaskRecovery(props.session,props.owner,props.ready,setMessages,props.revision);effects.splice(0).forEach(fn=>fn());return result;}
  render();return{reads,props,render,get messages(){return messages;},setToken(value){token=value;},tick(){const entry=timers.entries().next().value;timers.delete(entry[0]);entry[1]();},unmount(){slots.forEach(slot=>slot.cleanup?.());},timers};
}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('refresh revives the exact old reply and retains it across a connection failure, then completes',async()=>{
  const f=hookFixture();f.reads[0].resolve({tasks:[task],nextCursor:null});await settle();
  assert.equal(f.render().tasks.reply1.status,'queued');assert.equal(f.messages[0].isError,false);
  f.tick();f.reads[1].reject(Error('offline'));await settle();assert.equal(f.render().tasks.reply1.status,'queued');assert.match(f.render().error,/offline/);
  f.tick();f.reads[2].resolve({tasks:[{...task,status:'completed',output:{text:'完成'}}],nextCursor:null});await settle();assert.equal(Object.keys(f.render().tasks).length,0);assert.equal(f.messages[0].text,'完成');f.unmount();assert.equal(f.timers.size,0);
});
test('account and conversation changes discard late task data and cancel old timers',async()=>{
  for(const change of ['account','session']) {
    const f=hookFixture();if(change==='account'){f.props.owner=2;f.setToken('account2');}else f.props.session='session2';f.render();
    f.reads[0].resolve({tasks:[task],nextCursor:null});await settle();assert.equal(f.messages[0].isError,true);assert.equal(f.timers.size,0);
    f.reads[1].resolve({tasks:[],nextCursor:null});await settle();f.unmount();assert.equal(f.timers.size,0);
  }
});
