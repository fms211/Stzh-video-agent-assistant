"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");

// Run the actual center callbacks with controlled promises, not a reimplementation
// of its request ordering. The harness does not render browser DOM or CSS.
function fixture(){
  const slots=[],effects=[],timers=new Map(),reads=[],lateWrites=[];let cursor=0,timer=0,mounted=true,tree;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const hooks={
    useState(initial){const index=cursor++,slot=slots[index]||={kind:"state",value:typeof initial==="function"?initial():initial};return[slot.value,next=>{slot.value=typeof next==="function"?next(slot.value):next;if(!mounted)lateWrites.push(index);}];},
    useRef(initial){return(slots[cursor++]||={kind:"ref",value:{current:initial}}).value;},
    useCallback(fn,deps){const index=cursor++,old=slots[index];if(old&&same(old.deps,deps))return old.value;slots[index]={kind:"callback",deps,value:fn};return fn;},
    useEffect(fn,deps){const index=cursor++,old=slots[index];if(old&&same(old.deps,deps))return;const slot={kind:"effect",deps};slots[index]=slot;effects.push(()=>{old?.cleanup?.();slot.cleanup=fn();});},
  };
  const jsx=(type,props)=>({type,props}),api=(route,options={})=>new Promise((resolve,reject)=>reads.push({route,...options,resolve,reject}));
  const presets={emptyProvider:{name:"",protocol:"openai",baseUrl:"",model:"",apiKey:"",makeActive:false,vendorId:"custom",websiteUrl:"",thinkingMode:"default",contextWindowTokens:"",maxOutputTokens:"2000",safetyMarginTokens:"1024",outputTokenParameter:"max_tokens"},PROVIDER_PRESETS:[]};
  const compiled=ts.transpileModule(fs.readFileSync(require.resolve("../app/components/ModelRoleCenter.tsx"),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const moduleObject={exports:{}};
  vm.runInNewContext(compiled,{exports:moduleObject.exports,AbortController,DOMException,URLSearchParams,queueMicrotask,Error,
    window:{location:{search:"",pathname:"/"},history:{replaceState(){}},setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}},
    require:name=>name==="react"?hooks:name==="react/jsx-runtime"?{jsx,jsxs:jsx,Fragment:"fragment"}:name.endsWith("creative-agent-api")?{creativeApi:api,captureCreativeApi:()=>api}:name.endsWith("provider-presets")?presets:new Proxy({},{get:(_target,key)=>key==="ModelProviderForm"?"model-form":()=>null}),
  });
  function render(){cursor=0;tree=moduleObject.exports.default({accessMode:"authenticated",onAuthRequired(){},pluginCenterAdapter:null});effects.splice(0).forEach(fn=>fn());return tree;}
  function nodes(node=tree){if(!node||typeof node!=="object")return[];if(Array.isArray(node))return node.flatMap(child=>nodes(child??null));const children=node.props?.children;return[node,...(Array.isArray(children)?children:[children]).flatMap(child=>nodes(child??null))];}
  function flushTimers(){const scheduled=[...timers.values()];timers.clear();for(const fn of scheduled)fn();}
  function refresh(){nodes().find(node=>node.props?.["aria-label"]==="刷新模型与角色中心").props.onClick();}
  function completeRead(start,name){for(const read of reads.slice(start,start+3)){if(read.route==="/api/model-providers")read.resolve({providers:[{id:name,name,model:name,protocol:"openai",isActive:true,verifiedAt:1,hasSecret:false}]});else if(read.route==="/api/agent-roles")read.resolve({roles:[]});else read.resolve({plugins:[]});}}
  function unmount(){mounted=false;for(const slot of slots)if(slot?.kind==="effect")slot.cleanup?.();}
  render();return{render,nodes,flushTimers,refresh,completeRead,reads,lateWrites,unmount,state:()=>slots.filter(slot=>slot?.kind==="state").map(slot=>slot.value)};
}
const settle=async()=>{for(let index=0;index<6;index++)await Promise.resolve();};

test("a delayed earlier refresh cannot replace the latest verified model list",async()=>{
  const f=fixture();f.flushTimers();assert.equal(f.reads.length,3);f.refresh();assert.equal(f.reads.length,6);
  f.completeRead(3,"current-verified");await settle();f.render();
  assert.equal(f.state()[1][0].id,"current-verified");
  f.completeRead(0,"stale-unverified");await settle();f.render();
  assert.equal(f.state()[1][0].id,"current-verified");f.unmount();
});

test("an obsolete refresh error cannot replace a successful newer result",async()=>{
  const f=fixture();f.flushTimers();f.refresh();f.completeRead(3,"latest");await settle();
  f.reads[0].reject(new Error("stale request failure"));await settle();f.render();
  assert.equal(f.state()[11],"");f.unmount();
});

test("leaving before startup makes no request; leaving during refresh discards late results",async()=>{
  const first=fixture();first.unmount();first.flushTimers();assert.equal(first.reads.length,0);
  const f=fixture();f.flushTimers();f.unmount();f.completeRead(0,"late");await settle();assert.deepEqual(f.lateWrites,[]);
});

test("a finished save after unmount neither resets drafts nor starts new reads",async()=>{
  const f=fixture(),form=f.nodes().find(node=>node.type==="model-form");
  form.props.onSubmit({preventDefault(){}});assert.equal(f.reads.length,1);assert.equal(f.reads[0].method,"POST");
  f.unmount();f.reads[0].resolve({provider:{id:"saved"}});await settle();
  assert.equal(f.reads.length,1);assert.deepEqual(f.lateWrites,[]);
});

test("two submits in one render start only one write",async()=>{
  const f=fixture(),form=f.nodes().find(node=>node.type==="model-form");
  form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});
  assert.equal(f.reads.length,1);f.unmount();assert.equal(f.reads[0].signal.aborted,true);
  f.reads[0].resolve({provider:{id:"saved"}});await settle();assert.deepEqual(f.lateWrites,[]);
});

test("an uncertain committed write is followed by a read, never a repeated mutation",async()=>{
  const f=fixture(),form=f.nodes().find(node=>node.type==="model-form");form.props.onSubmit({preventDefault(){}});
  f.reads[0].reject(Object.assign(new Error("回复失败"),{status:500}));await settle();
  assert.equal(f.reads.length,4);assert.equal(f.reads.filter(read=>read.method==="POST").length,1);
  f.completeRead(1,"already-saved");await settle();f.render();
  assert.equal(f.state()[1][0].id,"already-saved");assert.match(f.state()[11],/已重新读取当前列表/);
  assert.equal(f.state()[12],false);f.unmount();
});

test("a known input rejection leaves drafts available and performs no extra request",async()=>{
  const f=fixture(),form=f.nodes().find(node=>node.type==="model-form");form.props.onSubmit({preventDefault(){}});
  f.reads[0].reject(Object.assign(new Error("模型地址无效"),{status:400}));await settle();f.render();
  assert.equal(f.reads.length,1);assert.equal(f.state()[11],"模型地址无效");assert.equal(f.state()[12],false);f.unmount();
});
