const test=require('node:test'),assert=require('node:assert/strict');
test('realtime waits for server readiness, reconnects after loss, and cancels retries on disposal',async()=>{
  const {connectAccountEvents}=await import('../app/lib/account-realtime.ts');
  const sockets=[],timers=new Map(),statuses=[],messages=[];let seq=0;
  const stop=connectAccountEvents({url:'ws://local',current:()=>true,onStatus:s=>statuses.push(s),onMessage:m=>messages.push(m),createSocket:()=>{const s={close(){this.closed=true}};sockets.push(s);return s},schedule:(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id},unschedule:id=>timers.delete(id)});
  assert.equal(statuses.length,0);
  sockets[0].onmessage({data:'{"type":"connection.ready"}'});assert.equal(statuses.at(-1),true);
  sockets[0].onclose({code:1006});assert.equal(statuses.at(-1),false);assert.equal(timers.get(1).delay,1000);
  timers.get(1).fn();timers.delete(1);assert.equal(sockets.length,2);
  sockets[0].onmessage({data:'{"type":"task.updated"}'});assert.equal(messages.length,1);
  sockets[1].onclose({code:1006});stop();assert.equal(timers.size,0);
});
test('realtime rejects stale-account events and does not reconnect authentication failures',async()=>{
  const {connectAccountEvents}=await import('../app/lib/account-realtime.ts');let current=true,retries=0,delivered=0,socket;
  const stop=connectAccountEvents({url:'ws://local',current:()=>current,onMessage:()=>delivered++,createSocket:()=>socket={close(){}},schedule:()=>{retries++;return 1}});
  current=false;socket.onmessage({data:'{"type":"notification.created"}'});assert.equal(delivered,0);
  current=true;socket.onclose({code:4401});assert.equal(retries,0);stop();
});

test('realtime retries failed device preparation before opening a socket', async () => {
  const { connectAccountEvents } = await import('../app/lib/account-realtime.ts');
  const timers = new Map(), sockets = [], statuses = [];
  let attempts = 0, sequence = 0;
  const stop = connectAccountEvents({
    url: async () => {
      if (++attempts === 1) throw new Error('Device registration temporarily unavailable');
      return 'ws://local/owned-device';
    },
    current: () => true,
    onStatus: live => statuses.push(live),
    onMessage: () => {},
    createSocket: url => { assert.equal(typeof url, 'string'); const socket = { close() {} }; sockets.push(socket); return socket; },
    schedule: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
    unschedule: id => timers.delete(id),
  });
  try {
    await new Promise(setImmediate);
    assert.equal(attempts, 1);
    assert.equal(sockets.length, 0);
    assert.deepEqual(statuses, [false]);
    assert.equal(timers.get(1).delay, 1000);
    timers.get(1).fn(); timers.delete(1);
    await new Promise(setImmediate);
    assert.equal(attempts, 2);
    assert.equal(sockets.length, 1);
    sockets[0].onmessage({ data: '{"type":"connection.ready"}' });
    assert.deepEqual(statuses, [false, true]);
  } finally { stop(); }
});

test('pending device preparation cannot open a socket after account change or disposal', async () => {
  const { connectAccountEvents } = await import('../app/lib/account-realtime.ts');
  for (const dispose of [false, true]) {
    let release, current = true, opened = 0, retries = 0;
    const statuses = [];
    const prepared = new Promise(resolve => { release = resolve; });
    const stop = connectAccountEvents({
      url: () => prepared,
      current: () => current,
      onStatus: live => statuses.push(live), onMessage: () => {},
      createSocket: () => { opened++; return { close() {} }; },
      schedule: () => { retries++; return 1; },
    });
    if (dispose) stop(); else current = false;
    release('ws://local/old-account');
    await new Promise(setImmediate);
    assert.equal(opened, 0);
    assert.equal(retries, 0);
    assert.deepEqual(statuses, []);
    stop();
  }
});

test('unauthorized device preparation reports fallback without repeated requests', async () => {
  const { connectAccountEvents } = await import('../app/lib/account-realtime.ts');
  let attempts = 0, retries = 0, opened = 0;
  const statuses = [];
  const stop = connectAccountEvents({
    url: async () => { attempts++; throw Object.assign(new Error('Please sign in'), { status: 401 }); },
    current: () => true,
    retryOnError: error => error.status !== 401,
    onStatus: live => statuses.push(live), onMessage: () => {},
    createSocket: () => { opened++; return { close() {} }; },
    schedule: () => { retries++; return 1; },
  });
  try {
    await new Promise(setImmediate);
    assert.equal(attempts, 1);
    assert.equal(opened, 0);
    assert.equal(retries, 0);
    assert.deepEqual(statuses, [false]);
  } finally { stop(); }
});
