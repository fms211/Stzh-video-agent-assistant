"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
// Run actual focus-isolation/fieldset effects; the real menu is also checked in-browser.
function fixture({fieldset=false,legend=false}={}) {
 const slots=[],effects=[],observers=[],changes=[];let cursor=0,tree;
 class Fieldset {constructor(){this.disabled=false;this.children=[];this.parentElement=null;}}
 const parent=fieldset?new Fieldset():{inert:false,parentElement:null};
 const host={parentElement:parent,closest:()=>null};
 if(legend)parent.children=[{tagName:"LEGEND",contains:node=>node===host}];
 const hooks={useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>slots[i].value=value];},useEffect(setup,deps){const i=cursor++,old=slots[i];if(old&&deps.every((d,j)=>Object.is(d,old.deps[j])))return;const next={deps};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=setup();});}};
 const jsx=(type,props)=>{if(type==="Select")props.ref.current=host;return{type,props};};
 const exports={};const source=fs.readFileSync(require.resolve("../app/components/CreativeSelect.tsx"),"utf8");
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,HTMLFieldSetElement:Fieldset,
 MutationObserver:class{constructor(fn){this.fn=fn;this.targets=[];observers.push(this);}observe(target,config){this.targets.push({target,config});}disconnect(){this.disconnected=true;}},
 require:name=>name==="react"?hooks:name==="react/jsx-runtime"?{jsx,jsxs:jsx}:new Proxy({},{get:(_t,k)=>k})});
 function render(disabled=false){cursor=0;tree=exports.CreativeSelect({"aria-label":"fixture",value:"one",placeholder:"select",groups:[],disabled,onChange:v=>changes.push(v)});effects.splice(0).forEach(fn=>fn());return tree.props.children.props;}
 return{render,parent,observers,changes,open(){render().onOpenChange(true);return render();},sync(){for(const o of observers)o.fn();},unmount(){for(const slot of slots)slot?.cleanup?.();}};
}
test("a menu's own inert focus isolation never disables or closes its trigger",()=>{
 const f=fixture();assert.equal(f.open().isOpen,true);f.parent.inert=true;f.sync();
 const select=f.render();assert.equal(select.isDisabled,false);assert.equal(select.isOpen,true);
 assert.equal(f.observers[0].targets.length,0);select.onSelectionChange("two");assert.deepEqual(f.changes,["two"]);f.unmount();
});
test("a disabled fieldset closes the menu and refuses a new selection",()=>{
 const f=fixture({fieldset:true});f.open();f.parent.disabled=true;f.sync();
 const select=f.render();assert.equal(select.isDisabled,true);assert.equal(select.isOpen,false);select.onSelectionChange("two");assert.deepEqual(f.changes,[]);
 assert.deepEqual(Array.from(f.observers[0].targets[0].config.attributeFilter),["disabled"]);f.unmount();assert.equal(f.observers[0].disconnected,true);
});
test("the first legend retains the native fieldset exception",()=>{
 const f=fixture({fieldset:true,legend:true});f.parent.disabled=true;const select=f.open();assert.equal(select.isDisabled,false);assert.equal(select.isOpen,true);f.unmount();
});
test("an explicit disabled prop closes an already open menu",()=>{
 const f=fixture();f.open();const select=f.render(true);assert.equal(select.isOpen,false);assert.equal(select.isDisabled,true);f.unmount();
});
