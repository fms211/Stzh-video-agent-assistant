const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),ts=require('typescript');
async function loadClient(){
  const auth=pathToFileURL(path.resolve(__dirname,'../app/lib/auth.ts')).href;
  const source=fs.readFileSync(path.resolve(__dirname,'../app/lib/notification-client.ts'),'utf8').replace('from "./auth"',`from "${auth}"`);
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const row={id:'one',title:'任务完成',message:'仅A可见',type:'success',read:0};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
test('only task terminal notifications expose a task destination, preserving IDs containing colons',async()=>{
  const {notificationTaskId}=await loadClient();
  assert.equal(notificationTaskId('task:example:child:completed'),'example:child');
  assert.equal(notificationTaskId('task:old:cancelled'),'old');
  assert.equal(notificationTaskId('ordinary-notification'),null);
  assert.equal(notificationTaskId('task:missing-status'),null);
});
function browser(t){
  const originals={window:global.window,localStorage:global.localStorage,fetch:global.fetch};
  t.after(()=>Object.entries(originals).forEach(([k,v])=>v===undefined?delete global[k]:global[k]=v));
  const storage=new Map([['stzh_token','token-a'],['stzh_user',JSON.stringify({id:1})],['tszh_notifications',JSON.stringify([row])]]);
  global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  global.window={location:{protocol:'http:',hostname:'localhost',port:'18080',origin:'http://localhost:18080'},localStorage:global.localStorage};
  return storage;
}
test('notification caches never adopt an ambiguous legacy cache or leak between accounts and guest',async t=>{
  const storage=browser(t),{captureNotificationClient}=await loadClient();
  const a=captureNotificationClient();assert.deepEqual(a.cached(),[]);a.save([row]);
  storage.set('stzh_token','token-b');storage.set('stzh_user',JSON.stringify({id:2}));
  assert.deepEqual(captureNotificationClient().cached(),[]);
  storage.delete('stzh_token');assert.deepEqual(captureNotificationClient().cached(),[]);
  assert.throws(()=>a.save([]),{name:'AbortError'});
});
test('a late notification response after account switch cannot write the next account cache',async t=>{
  const storage=browser(t),{captureNotificationClient}=await loadClient(),gate=deferred();
  global.fetch=async(url,options)=>{assert.equal(url,'http://localhost:18080/api/notifications');assert.equal(options.headers.Authorization,'Bearer token-a');return gate.promise;};
  const a=captureNotificationClient(),pending=a.read();
  storage.set('stzh_token','token-b');storage.set('stzh_user',JSON.stringify({id:2}));
  gate.resolve(Response.json({notifications:[row]}));await assert.rejects(pending,{name:'AbortError'});
  assert.deepEqual(captureNotificationClient().cached(),[]);
});
test('failed read-all and clear preserve cached unread notifications; successful empty server response clears them',async t=>{
  browser(t);const {captureNotificationClient}=await loadClient(),client=captureNotificationClient();client.save([row]);
  global.fetch=async()=>new Response('',{status:503});
  for(const action of ['read','clear']) {await assert.rejects(client.mutate(action,[row]),/503/);assert.deepEqual(client.cached(),[row]);}
  global.fetch=async()=>Response.json({notifications:[]});client.save(await client.read());assert.deepEqual(client.cached(),[]);
});
test('stale refresh cannot undo read-all, concurrent mutations are single flight, failures remain actionable',async t=>{
  browser(t);const {createNotificationFeed}=await loadClient(),old=deferred(),write=deferred(),states=[];let reads=0,writes=0,stored=[row];
  const client={current:()=>true,cached:()=>stored,save:r=>{stored=r},read:async()=>++reads===1?old.promise:[{...row,read:true}],mutate:async()=>{writes++;return write.promise}};
  const feed=createNotificationFeed(client,s=>states.push(s));feed.start();
  const pending=feed.mutate('read');await feed.mutate('clear');assert.equal(writes,1);
  old.resolve([row]);write.resolve([{...row,read:true}]);await pending;
  assert.equal(states.at(-1).rows[0].read,true);assert.equal(stored[0].read,true);
  client.mutate=async()=>{throw new Error('503 请重试')};await feed.mutate('clear');assert.match(states.at(-1).error,/503/);assert.equal(states.at(-1).rows.length,1);
  feed.dispose();const count=states.length;await feed.refresh();assert.equal(states.length,count);
});

// Prepared only: no test or network execution in the paused-test round.
test('first notification read exposes loading and failures retain cached rows',async t=>{
  browser(t);const {createNotificationFeed}=await loadClient(),gate=deferred(),states=[];
  const client={current:()=>true,cached:()=>[row],save:()=>{},read:async()=>gate.promise,mutate:async()=>[]};
  const feed=createNotificationFeed(client,s=>states.push(s));
  const read=feed.refresh();assert.equal(states.at(-1).loading,true);assert.equal(states.at(-1).rows[0].id,row.id);
  gate.resolve([]);await read;assert.equal(states.at(-1).loading,false);assert.deepEqual(states.at(-1).rows,[]);
  client.read=async()=>{throw new Error('offline')};await feed.refresh();
  assert.equal(states.at(-1).loading,false);assert.match(states.at(-1).error,/offline/);
  feed.dispose();
});

test('notification response remains visible when only its local cache write fails',async t=>{
  browser(t);const {createNotificationFeed}=await loadClient(),states=[];
  const client={current:()=>true,cached:()=>[],save:()=>{throw new Error('quota')},read:async()=>[row],mutate:async()=>[]};
  const feed=createNotificationFeed(client,s=>states.push(s));await feed.refresh();
  assert.equal(states.at(-1).rows[0].id,row.id);assert.equal(states.at(-1).loading,false);
  assert.match(states.at(-1).error,/已读取.*缓存未保存/);feed.dispose();
});

test('disposal during an in-flight notification read never emits its result',async t=>{
  browser(t);const {createNotificationFeed}=await loadClient(),gate=deferred(),states=[];let saves=0;
  const client={current:()=>true,cached:()=>[],save:()=>{saves++},read:async()=>gate.promise,mutate:async()=>[]};
  const feed=createNotificationFeed(client,s=>states.push(s));const read=feed.refresh();feed.dispose();
  const count=states.length;gate.resolve([row]);await read;assert.equal(states.length,count);assert.equal(saves,0);
});
