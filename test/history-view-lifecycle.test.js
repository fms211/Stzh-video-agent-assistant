const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function renderFixture(file, props, dependencies, internalName) {
  const slots = [], effects = [], listeners = new Map(); let cursor = 0, tree;
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const hooks = {
    useId: () => 'ui-test',
    useState(initial) { const slot = slots[cursor++] ||= {value: typeof initial === 'function' ? initial() : initial}; return [slot.value, next => {slot.value = typeof next === 'function' ? next(slot.value) : next;}]; },
    useRef(initial) { return (slots[cursor++] ||= {value:{current:initial}}).value; },
    useMemo(fn,deps) { const index=cursor++,old=slots[index]; if(old && same(old.deps,deps)) return old.value; const value=fn(); slots[index]={value,deps}; return value; },
    useEffect(fn,deps) { const index=cursor++,old=slots[index]; if(old && same(old.deps,deps)) return; const slot={deps}; slots[index]=slot; effects.push(()=>{old?.cleanup?.();slot.cleanup=fn();}); },
  };
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../app/components/'+file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const moduleObject={exports:{}};
  const jsx=(type,props,key)=>({type,props,key});
  vm.runInNewContext(code+(internalName?'\nexports.testView='+internalName+';':''),{
    exports:moduleObject.exports,Error,AbortController,process:{env:{}},setTimeout(){return 1;},clearTimeout(){},
    window:{addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},setInterval(){return 1;},clearInterval(){}},
    require(name) {
      if(name==='react')return {...hooks,...dependencies.react};
      if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
      if(name in dependencies)return dependencies[name];
      if(name==='next/image')return {__esModule:true,default:'image'};
      return new Proxy({},{get:(_target,key)=>key==='__esModule'?true:String(key)});
    }
  });
  function nodes(node) { if(arguments.length===0)node=tree; if(!node || typeof node!=='object')return []; if(Array.isArray(node))return node.flatMap(nodes); return [node,...nodes(node.props?.children)]; }
  function render() { cursor=0; tree=(internalName?moduleObject.exports.testView:moduleObject.exports.default)(props); effects.splice(0).forEach(fn=>fn()); return tree; }
  const fixture={render,nodes,emitWindow(name){listeners.get(name)?.();},text:()=>nodes().flatMap(n=>{const c=n.props?.children;return(Array.isArray(c)?c:[c]).filter(x=>typeof x==='string');}).join(' '),unmount(){slots.forEach(s=>s.cleanup?.());}};
  render();return fixture;
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

const row={runId:'research-fixture',workflowId:'style-research',status:'failed',input:{styleName:'很长中文与English验收风格',useCase:'仅界面验收'},metrics:{completedSteps:1,totalSteps:3,sourceCount:0},updatedAt:'2026-10-03T00:00:00Z'};
function research(){const reads=[],chosen=[];let closed=0;const adapter={listRuns:()=>new Promise((resolve,reject)=>reads.push({resolve,reject}))};const props={adapter,onSelect:r=>chosen.push(r.runId),onClose:()=>closed++};const f=renderFixture('research-workbench/ResearchRunHistoryDialog.tsx',props,{},'ResearchRunHistoryDialog');return {f,reads,props,chosen,closed:()=>closed,refresh:()=>f.nodes().find(n=>n.props?.['aria-label']==='刷新研究历史')};}
test('research refresh failure keeps existing history selectable and announces the error',async()=>{const r=research();r.reads[0].resolve([row]);await settle();r.f.render();r.refresh().props.onClick();r.f.render();r.reads[1].reject(new Error('offline review'));await settle();r.f.render();assert.match(r.f.text(),/offline review/);const entry=r.f.nodes().find(n=>n.props?.className==='research-history-run');assert.ok(entry);entry.props.onClick();assert.deepEqual(r.chosen,[row.runId]);assert.equal(r.closed(),1);r.f.unmount();});
test('research refresh rejects repeated clicks before React commits busy state',async()=>{const r=research();r.reads[0].resolve([row]);await settle();r.f.render();const b=r.refresh();b.props.onClick();b.props.onClick();assert.equal(r.reads.length,2);r.f.render();assert.equal(r.refresh().props.disabled,false);assert.equal(r.refresh().props['aria-disabled'],true);r.reads[1].resolve([row]);await settle();r.f.render();assert.equal(r.refresh().props['aria-disabled'],undefined);r.f.unmount();});
test('research adapter change rejects late private history from the previous account',async()=>{const r=research();const next=[];r.props.adapter={listRuns:()=>new Promise(resolve=>next.push(resolve))};r.f.render();r.reads[0].resolve([{...row,input:{styleName:'obsolete private record'}}]);await settle();r.f.render();assert.doesNotMatch(r.f.text(),/obsolete private/);next[0]([]);await settle();r.f.render();assert.match(r.f.text(),/还没有研究运行/);r.f.unmount();});
test('research opening failure retains the row and offers another attempt',async()=>{const r=research();r.props.onSelect=()=>{throw Error('open failed')};r.reads[0].resolve([row]);await settle();r.f.render();r.f.nodes().find(n=>n.props?.className==='research-history-run').props.onClick();r.f.render();assert.match(r.f.text(),/打开运行失败/);assert.equal(r.closed(),0);assert.equal(r.f.nodes().find(n=>n.props?.className==='research-history-run').props.disabled,false);r.f.unmount();});
function collaboration(){const reads=[];const f=renderFixture('CollaborativeRunHistory.tsx',{disabled:false,revision:0,onSelect(){}},{'@/app/lib/creative-agent-api':{captureCreativeApi:()=>()=>new Promise((resolve,reject)=>reads.push({resolve,reject}))},'@/app/lib/collaborative-history':{collaborativeStatus:()=> '已完成'}});return {f,reads,button:label=>f.nodes().find(n=>n.type==='button'&&n.props.children===label)};}
test('collaboration refresh and pagination stay focusable with single request guards',async()=>{const c=collaboration();c.f.render();assert.equal(c.button('刷新列表').props.disabled,false);assert.equal(c.button('刷新列表').props['aria-disabled'],true);c.button('刷新列表').props.onClick();assert.equal(c.reads.length,1);c.reads[0].resolve({runs:[{id:'r1',task:'历史一'}],nextCursor:'older'});await settle();c.f.render();const b=c.button('刷新列表');b.props.onClick();b.props.onClick();c.f.render();assert.equal(c.reads.length,2);c.reads[1].resolve({runs:[{id:'r1',task:'历史一'}],nextCursor:'older'});await settle();c.f.render();const m=c.button('加载更早记录');m.props.onClick();m.props.onClick();assert.equal(c.reads.length,3);c.f.render();assert.equal(c.button('加载更早记录').props.disabled,false);assert.equal(c.button('加载更早记录').props['aria-disabled'],true);c.reads[2].resolve({runs:[{id:'r1',task:'历史一'},{id:'r2',task:'历史二'}],nextCursor:null});await settle();c.f.render();assert.equal(c.f.nodes().filter(n=>n.type==='li').length,2);c.f.unmount();});
test('collaboration pagination failure preserves loaded rows and its retry entry',async()=>{const c=collaboration();c.reads[0].resolve({runs:[{id:'r1',task:'已保存历史'}],nextCursor:'older'});await settle();c.f.render();c.button('加载更早记录').props.onClick();c.reads[1].reject(new Error('page unavailable'));await settle();c.f.render();assert.match(c.f.text(),/已保存历史/);assert.match(c.f.text(),/page unavailable/);assert.ok(c.button('加载更早记录'));c.f.unmount();});
