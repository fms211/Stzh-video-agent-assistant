"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
// Exercise the actual form callbacks and effects, including a transport that
// ignores abort. These checks do not substitute for rendered browser review.
function fixture(){
  const slots=[],effects=[],reads=[],lateWrites=[];let cursor=0,mounted=true,value,tree;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const hooks={useId:()=>"provider-form-fixture",useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,next=>{slots[i].value=next;if(!mounted)lateWrites.push(i);}];},useRef(initial){const i=cursor++;return(slots[i]??={current:initial});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(old&&same(old.deps,deps))return;const slot={deps};slots[i]=slot;effects.push(()=>{old?.cleanup?.();slot.cleanup=fn();});}};
  const jsx=(type,props)=>({type,props}),runtime={jsx,jsxs:jsx,Fragment:"fragment"};
  const compile=file=>ts.transpileModule(fs.readFileSync(require.resolve(file),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const presets={};vm.runInNewContext(compile("../app/lib/provider-presets.ts"),{exports:presets,URL});value={...presets.emptyProvider,apiKey:"synthetic",vendorId:"mimo",baseUrl:"https://api.xiaomimimo.com/v1"};
  const moduleObject={exports:{}};
  vm.runInNewContext(compile("../app/components/ModelProviderForm.tsx"),{exports:moduleObject.exports,AbortController,DOMException,URL,
    require:name=>name==="react"?hooks:name==="react/jsx-runtime"?runtime:name.endsWith("provider-presets")?presets:name.endsWith("creative-agent-api")?{creativeApi:(_route,options)=>new Promise((resolve,reject)=>reads.push({resolve,reject,...options}))}:new Proxy({},{get:()=>()=>null})});
  function render(){cursor=0;tree=moduleObject.exports.ModelProviderForm({value,editingProviderId:null,hasSavedSecret:false,busy:false,onChange:next=>{value=next;},onSubmit(){},onCancel(){}});effects.splice(0).forEach(fn=>fn());return tree;}
  function nodes(node=tree){if(!node||typeof node!=="object")return[];if(Array.isArray(node))return node.flatMap(child=>nodes(child??null));const children=node.props?.children;return[node,...(Array.isArray(children)?children:[children]).flatMap(child=>nodes(child??null))];}
  function field(suffix){return nodes().find(node=>node.props?.id===`provider-form-fixture-${suffix}`);}
  function fetchModels(){return nodes().find(node=>node.type==="button"&&node.props.type==="button").props.onClick();}
  render();return{render,field,fetchModels,reads,lateWrites,nodes,value:()=>value,unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
test("switching vendor cancels the previous model list and uses the new endpoint",async()=>{
  const f=fixture();f.fetchModels();assert.equal(f.reads.length,1);const old=f.reads[0];
  f.field("vendor").props.onValueChange("deepseek");f.render();assert.equal(old.signal.aborted,true);
  old.resolve({models:[{id:"stale",name:"Stale"}],partial:false});await settle();f.render();
  assert.ok(!f.nodes().some(node=>node.type==="option"&&node.props.value==="stale"));
  f.field("key").props.onChange({target:{value:"synthetic-next-vendor"}});f.render();
  f.fetchModels();const current=f.reads[1];assert.equal(JSON.parse(current.body).baseUrl,"https://api.deepseek.com/v1");
  current.resolve({models:[{id:"current-model",name:"Current model"}],partial:false});await settle();f.render();
  assert.ok(f.nodes().some(node=>node.type==="option"&&node.props.value==="current-model"));
  f.field("model").props.onValueChange("current-model");assert.equal(f.value().model,"current-model");f.unmount();
});
test("unmount discards a model-list response even if the transport ignores abort",async()=>{
  const f=fixture();f.fetchModels();f.unmount();assert.equal(f.reads[0].signal.aborted,true);
  f.reads[0].resolve({models:[{id:"late",name:"Late"}],partial:false});await settle();assert.deepEqual(f.lateWrites,[]);
});
test("list failures retain the manual model option and expose an actionable alert",async()=>{
  const f=fixture();f.fetchModels();f.reads[0].reject(new Error("模型列表不可用，请手动填写"));await settle();f.render();
  assert.ok(f.nodes().some(node=>node.props?.role==="alert"));
  f.field("manual").props.onChange({target:{value:"manual-model"}});f.render();
  assert.equal(f.value().model,"manual-model");assert.equal(f.nodes().find(node=>node.type==="button"&&node.props.type==="submit").props.disabled,false);f.unmount();
});
test("refresh failure preserves the known list, search and selection; connection changes clear that list",async()=>{
  const f=fixture();f.fetchModels();f.reads[0].resolve({models:[{id:"alpha",name:"Alpha"},{id:"beta",name:"Beta"}],partial:false});await settle();f.render();
  f.field("model").props.onValueChange("alpha");f.render();
  f.field("search").props.onChange({target:{value:"Beta"}});f.render();
  f.fetchModels();f.render();
  assert.equal(f.field("search")?.props.value,"Beta","refresh must not remove the usable list while loading");
  f.reads[1].reject(new Error("列表刷新失败"));await settle();f.render();
  assert.ok(f.nodes().some(node=>node.type==="option"&&node.props.value==="beta"));
  assert.equal(f.value().model,"alpha");assert.ok(f.nodes().some(node=>node.props?.role==="alert"));
  f.field("base").props.onChange({target:{value:"https://api.deepseek.com/v1"}});f.render();
  assert.equal(f.field("search"),undefined);assert.ok(!f.nodes().some(node=>node.type==="option"&&node.props.value==="beta"));
  assert.equal(f.value().model,"");f.unmount();
});
