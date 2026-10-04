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
    exports:moduleObject.exports,Error,AbortController,URL,process:{env:{}},
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
function gallery() {
  const reads=[];
  const f=renderFixture('GalleryPanel.tsx',{owner:'user:test',authenticated:true},{
    '@/app/lib/sync':{loadSessions:()=>[],loadMessages:()=>[]},
    '@/app/lib/workspace-media':{mergeMedia:(...groups)=>groups.flat(),loadTaskMedia:()=>new Promise((resolve,reject)=>reads.push({resolve,reject}))}
  },'GalleryPanelView');
  return {f,reads,refresh:()=>f.nodes().find(n=>n.props?.['aria-label']==='刷新')};
}
test('gallery refresh keeps its focusable button and rejects clicks during loading',async()=>{
  const g=gallery(); const busy=g.refresh(); assert.equal(busy.props['aria-disabled'],true); assert.equal(busy.props.disabled,undefined);
  busy.props.onClick();g.f.render();assert.equal(g.reads.length,1);
  g.reads[0].resolve([]);await settle();g.f.render();assert.equal(g.refresh().props['aria-disabled'],false);
  g.refresh().props.onClick();g.f.render();g.f.render();assert.equal(g.reads.length,2);assert.equal(g.refresh().props['aria-disabled'],true);g.f.unmount();
});
test('an obsolete gallery error cannot overwrite a newer refresh',async()=>{
  const g=gallery();g.reads[0].resolve([]);await settle();g.f.render();
  g.f.emitWindow('focus');g.f.render();
  // A window focus refresh uses the same effect cancellation guard.
  g.f.emitWindow('focus');g.f.render();
  assert.equal(g.reads.length,3);
  g.reads[2].resolve([{id:'latest',type:'image',url:'https://example.com/image.png',sessionTitle:'最新记录',timestamp:1}]);await settle();g.f.render();
  g.reads[1].reject(new Error('obsolete failure'));await settle();g.f.render();
  assert.doesNotMatch(g.f.text(),/obsolete failure/);assert.match(g.f.text(),/最新记录/);g.f.unmount();
});
test('a failed thumbnail shows a clear fallback without another button or image',()=>{
  const item={id:'fixture',type:'image',url:'https://example.com/missing.png',sessionTitle:'保留作品'};
  const f=renderFixture('GalleryImage.tsx',{item},{'@/app/lib/needsUnoptimized':{needsUnoptimized:()=>true}});
  f.nodes().find(n=>n.type==='image').props.onError();f.render();
  assert.match(f.text(),/图片暂时无法显示/);assert.match(f.text(),/作品记录仍保留/);
  assert.equal(f.nodes().filter(n=>n.type==='image'||n.type==='button').length,0);assert.equal(item.id,'fixture');
});
test('failed preview offers retry and retries the image instead of losing its record',()=>{
  const f=renderFixture('GalleryPreview.tsx',{item:{url:'https://example.com/missing.png',sessionTitle:'已有作品'},onClose(){}},{'@/app/lib/needsUnoptimized':{needsUnoptimized:()=>true}});
  f.nodes().find(n=>n.type==='image').props.onError();f.render();assert.match(f.text(),/原作品记录仍保留/);
  f.nodes().find(n=>n.type==='button' && n.props.children==='重新加载图片').props.onClick();f.render();
  assert.equal(f.nodes().filter(n=>n.type==='image').length,1);assert.equal(f.nodes().find(n=>n.type==='image').key,1);
});
test('download stays focusable while pending and cancellation discards a late result',async()=>{
  let resolveFile,reads=0,saves=0;
  const f=renderFixture('GalleryMediaActions.tsx',{item:{url:'https://example.com/image.png',sessionTitle:'本地作品'}},{
    '@/app/lib/media-download':{prepareMediaDownload:()=>{reads++;return new Promise(resolve=>{resolveFile=resolve;});},saveMediaDownload(){saves++;}}
  });
  const download=()=>f.nodes().find(n=>n.props?.['aria-label']==='下载 本地作品');
  download().props.onClick();f.render();assert.equal(download().props['aria-disabled'],true);assert.equal(download().props.disabled,undefined);
  download().props.onClick();assert.equal(reads,1);
  f.nodes().find(n=>n.type==='button' && n.props.children==='取消').props.onClick();f.render();
  resolveFile({name:'fixture.png'});await settle();f.render();assert.equal(saves,0);assert.match(f.text(),/已取消下载/);assert.equal(download().props['aria-disabled'],false);f.unmount();
});

test('result cards reuse cancellable downloads and accessible preview instead of unguarded fetch/lightbox',()=>{
  const url='http://127.0.0.1:18083/icons/icon-192.png';
  const f=renderFixture('ResultCard.tsx',{payload:{requestId:'fixture',imageUrls:[url]},originalPrompt:'本地合成结果'},{
    react:{useCallback:fn=>fn},
    '@/app/lib/workspace-media':{normalizeMediaUrl:value=>typeof value==='string' && /^https?:/.test(value)?value:null},
    '@/app/lib/needsUnoptimized':{needsUnoptimized:()=>true},
    './GalleryMediaActions':{__esModule:true,default:'shared-actions'},
    './GalleryPreview':{__esModule:true,default:'shared-preview'},
  });
  const download=f.nodes().find(n=>n.type==='shared-actions');assert.equal(download.props.item.url,url);assert.equal(download.key,`fixture:${url}`);
  f.nodes().find(n=>n.props?.['aria-label']==='预览图片 1').props.onClick();f.render();
  const preview=f.nodes().find(n=>n.type==='shared-preview');assert.equal(preview.props.item.url,url);
  preview.props.onClose();f.render();assert.equal(f.nodes().filter(n=>n.type==='shared-preview').length,0);
});
test('result card rejects credential URLs and empty image lists do not hide a plain legacy reply',()=>{
  const f=renderFixture('ResultCard.tsx',{payload:{requestId:'fixture',imageUrls:['https://name:private@example.com/pic.png'],raw:{text:'旧文字回复仍保留'}}},{
    react:{useCallback:fn=>fn},
    '@/app/lib/workspace-media':{normalizeMediaUrl:value=>value},
  });
  assert.match(f.text(),/旧文字回复仍保留/);assert.equal(f.nodes().filter(n=>n.type==='image').length,0);
  assert.equal(f.nodes().filter(n=>n.props?.item?.url).length,0);
});


function fixture({filter='all',error='',tasks=[],loading=false}={}) {
  const snapshot={filter,error,tasks,loading,total:tasks.length,nextCursor:null};let refreshes=0;
  const list={getSnapshot:()=>snapshot,subscribe(){return()=>{};},refresh(){refreshes++;},setFilter(){},close(){}};
  const f=renderFixture('TaskCenter.tsx',{accessMode:'authenticated'},{
    react:{useMemo:fn=>fn(),useRef:value=>({current:value}),useState:initial=>[initial,()=>{}],useEffect(){},useSyncExternalStore:(_sub,get)=>get()},
    '@/app/lib/auth':{getToken:()=> 'fake-ui-test-token'},
    '@/app/lib/task-list':{createTaskList:()=>list}
  },'TaskCenterView');
  return {f,refreshes:()=>refreshes};
}
test('an empty filtered task list does not imply the whole account has no tasks',()=>{
  const {f}=fixture({filter:'completed'});assert.match(f.text(),/当前筛选下没有任务/);assert.match(f.text(),/切换到全部/);assert.doesNotMatch(f.text(),/等待第一条/);
});
test('a failed task read is not presented as a fresh empty account',()=>{
  const {f}=fixture({error:'read unavailable'});assert.match(f.text(),/暂时无法读取任务/);assert.doesNotMatch(f.text(),/等待第一条/);
});
test('task refresh retains focusability while busy and guards its action',()=>{
  const busy=fixture({loading:true});const button=busy.f.nodes().find(n=>n.props?.className==='task-center__refresh');
  assert.equal(button.props['aria-disabled'],true);assert.equal(button.props.disabled,undefined);button.props.onClick();assert.equal(busy.refreshes(),0);
  const ready=fixture();ready.f.nodes().find(n=>n.props?.className==='task-center__refresh').props.onClick();assert.equal(ready.refreshes(),1);
});
test('server-origin task cards and detail do not claim desktop origin',()=>{
  const task={id:'ui-fixture',origin:'server',status:'failed',title:'模拟任务',stage:'模拟失败',error:'失败说明',updatedAt:'2026-10-03T00:00:00Z',progress:42,input:{},kind:'ui.acceptance'};
  const {f}=fixture({tasks:[task]});assert.match(f.text(),/服务端任务/);assert.doesNotMatch(f.text(),/桌面创作中心/);
});
