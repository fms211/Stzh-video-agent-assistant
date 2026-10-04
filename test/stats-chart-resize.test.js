"use strict";
// Actual chart effect under controlled content-box layout. This is a DOM/effect
// simulation, not a claim of browser visual acceptance.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
function fixture(){
  const slots=[],effects=[];let cursor=0,width=900,activeObserver;const draws=[];
  const stats={total:1,videoCount:0,imageCount:1,hourly:Array(24).fill(0),dayKeys:["2026-09-30"],weekKeys:["2026-09-27"],monthKeys:["2026-09"],dayLabels:["9/30"],weekLabels:["9/27"],monthLabels:["2026/9"],daily:{"2026-09-30":1},weekly:{"2026-09-27":1},monthly:{"2026-09":1}};
  const ctx=new Proxy({measureText:text=>({width:String(text).length*7}),fillRect:(_x,_y,w,h)=>{if(h===350)draws.push(w);},createLinearGradient:()=>({addColorStop(){}})},{get:(object,key)=>key in object?object[key]:()=>{},set:(object,key,value)=>{object[key]=value;return true;}});
  const canvas={style:{width:"100%",height:"350px"},width:300,height:150,getContext:()=>ctx,getBoundingClientRect:()=>({width:Math.max(width,parseFloat(canvas.style.width)||0)})};
  const parent={get clientWidth(){return Math.max(width,canvas.style.width.endsWith("px")?parseFloat(canvas.style.width):0)+16;}};canvas.parentElement=parent;
  const hooks={
    useState(initial){const index=cursor++;slots[index]??={value:typeof initial==="function"?initial():initial};return[slots[index].value,value=>{slots[index].value=typeof value==="function"?value(slots[index].value):value;}];},
    useRef(initial){const index=cursor++;slots[index]??={current:initial};return slots[index];},
    useEffect(callback,deps){const index=cursor++,previous=slots[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i]))){effects.push(()=>{previous?.cleanup?.();slots[index]={deps,cleanup:callback()};});}},
  };
  const jsx=(type,props)=>({type,props});const moduleObject={exports:{}};
  const source=fs.readFileSync(process.env.STZH_STATS_COMPONENT_SOURCE||require.resolve("../app/components/StatsDashboard.tsx"),"utf8");
  const requireStub=name=>name==="react"?hooks:name==="react/jsx-runtime"?{jsx,jsxs:jsx,Fragment:"fragment"}:name.endsWith("/auth")?{getToken:()=>null}:name.endsWith("/data-owner")?{currentDataOwner:()=>({kind:"guest"}),ownerScope:()=>"guest"}:name.endsWith("/tracker")?{getGenerationStats:()=>stats}:name.endsWith("/generation-statistics")?{summarizeGenerations:()=>stats}:{};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+"\nexports.ChartView=StatsDashboardView;",{module:moduleObject,exports:moduleObject.exports,require:requireStub,Promise,localStorage:{},
    window:{devicePixelRatio:2,addEventListener(){},removeEventListener(){}},document:{documentElement:{}},getComputedStyle:()=>({getPropertyValue:()=>""}),
    MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{constructor(callback){this.callback=callback;activeObserver=this;}observe(){}disconnect(){this.disconnected=true;}}});
  function attach(node){if(!node||typeof node!=="object")return;if(node.type==="canvas")node.props.ref.current=canvas;const children=node.props?.children;if(Array.isArray(children))children.forEach(attach);else attach(children);}
  function render(){cursor=0;attach(moduleObject.exports.ChartView({authenticated:false,owner:"guest"}));effects.splice(0).forEach(effect=>effect());}
  return{render,async ready(){render();for(let i=0;i<8;i++)await Promise.resolve();render();},resize(value){width=value;activeObserver.callback([{target:parent,contentRect:{width:Math.max(value,canvas.style.width.endsWith("px")?parseFloat(canvas.style.width):0)}}]);},canvas,draws,source,unmount(){for(const slot of slots)slot?.cleanup?.();return activeObserver.disconnected;}};
}
test("repeated content-box notifications do not grow the chart through container padding",async()=>{
  const f=fixture();await f.ready();for(let i=0;i<30;i++)f.resize(900);
  assert.ok(f.draws.length>=30);assert.ok(f.draws.every(width=>width===900));assert.equal(f.canvas.width,1800);
  assert.equal(f.canvas.style.width,"100%");assert.equal(f.canvas.height,700);
  assert.match(f.source,/stats-content\s*\{[^}]*min-width:\s*0/s);
  assert.match(f.source,/contain:\s*inline-size/);assert.equal(f.unmount(),true);
});
test("chart follows a smaller and then larger viewport without accumulating pixel width",async()=>{
  const f=fixture();await f.ready();for(const width of [640,640,320,320,920,920]){f.resize(width);assert.equal(f.canvas.width,width*2);assert.equal(f.draws.at(-1),width);}
  assert.equal(f.canvas.style.width,"100%");assert.equal(f.canvas.style.height,"350px");
  f.resize(0);assert.equal(f.canvas.width,1840);assert.equal(f.unmount(),true);
});
