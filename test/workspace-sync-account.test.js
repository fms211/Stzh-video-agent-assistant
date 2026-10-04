const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');

async function setup(t) {
  const original = { window: global.window, localStorage: global.localStorage, fetch: global.fetch };
  t.after(() => { for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete global[key]; else global[key] = value;
  } });
  const values = new Map();
  global.window = { location: { protocol: 'http:', hostname: 'localhost', port: '18080', origin: 'http://localhost:18080' } };
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const account = id => { values.set('stzh_token', `token-${id}`); values.set('stzh_user', JSON.stringify({ id })); };
  account(1);
  let source = fs.readFileSync(path.resolve(__dirname, '../app/lib/sync.ts'), 'utf8');
  for (const file of ['auth', 'data-owner']) source = source.replace(`from "./${file}"`, `from "${pathToFileURL(path.resolve(__dirname, `../app/lib/${file}.ts`)).href}"`);
  source = source.replace('from "./history-retirement.ts"', `from "${pathToFileURL(path.resolve(__dirname, '../app/lib/history-retirement.ts')).href}"`);
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const api = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  return { api, values, account };
}

test('late account A sync cannot populate B history or start B settings requests', async t => {
  const { api, values, account } = await setup(t);
  let release;
  const calls = [];
  global.fetch = (url, options) => {
    calls.push({ url, token: options.headers.Authorization });
    return new Promise(resolve => { release = resolve; });
  };
  const pending = api.syncServerToLocal();
  account(2);
  release(Response.json({ conversations: [{ id: 'private-A', title: 'A', updated_at: '2026-09-28' }] }));
  // Fail before waiting if an incorrect second request was started.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  await pending;
  assert.equal(values.has('tszh:v2:user:2:sessions'), false);
  assert.equal(values.has('tszh:v2:user:1:sessions'), false);
});

test('settings and message readers discard late response bodies after account switch', async t => {
  const { api, account } = await setup(t);
  for (const [read, body, empty] of [
    [() => api.fetchServerSettings(), { theme: 'private-A' }, null],
    [() => api.fetchServerMessages('private-A'), { messages: [{ id: 'secret', content: 'private' }] }, []],
  ]) {
    account(1);
    global.fetch = async () => ({ ok: true, json: async () => { account(2); return body; } });
    assert.deepEqual(await read(), empty);
  }
});

test('unowned legacy theme is never uploaded by account history merge', async t => {
  const { api, values } = await setup(t);
  values.set('tszh_theme', JSON.stringify('another-account-theme'));
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({}); };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: true, failed: 0 });
  assert.equal(calls.length, 0);
});

test('Coze message uploads and reads retain the request trace without replaying it as text', async t => {
  const { api } = await setup(t);
  const contextTrace={rollout:'shadow',applied:false,selected:[{id:'fixture',revision:1}]};
  let uploaded;
  global.fetch=async(_url, options)=>{
    if(options.method==='POST') { uploaded=JSON.parse(options.body); return Response.json({}); }
    return Response.json({messages:[{id:'reply',role:'agent',content:'正文',contextTrace}]});
  };
  await api.saveMessages('coze-trace',[{id:'reply',role:'agent',text:'正文',contextTrace}]);
  assert.deepEqual(uploaded.messages[0].contextTrace,contextTrace);
  const restored=await api.fetchServerMessages('coze-trace');
  assert.deepEqual(restored[0].contextTrace,contextTrace);
  assert.equal(restored[0].text,'正文');
});

test('current account sync saves its history without altering other account or global theme', async t => {
  const { api, values } = await setup(t);
  values.set('tszh:v2:user:2:sessions', '[{"id":"B"}]');
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer token-1');
    return Response.json(url.endsWith('/conversations?mode=coze') ? { conversations: [{ id: 'A', title: 'A', updated_at: '2026-09-28' }] } : { theme: 'deep-space' });
  };
  await api.syncServerToLocal();
  assert.equal(JSON.parse(values.get('tszh:v2:user:1:sessions'))[0].id, 'A');
  assert.equal(values.get('tszh:v2:user:2:sessions'), '[{"id":"B"}]');
  assert.equal(values.has('tszh_theme'), false);
});

// Prepared source only; not executed in this round.
test('server history failures report incomplete sync and preserve the original local index', async t => {
  const {api,values}=await setup(t),key='tszh:v2:user:1:sessions';
  values.set(key,'[{"id":"unsynchronized"}]');
  for (const response of [new Response('',{status:503}),Response.json({conversations:null}),Response.json({conversations:[null]})]) {
    global.fetch=async()=>response;
    assert.deepEqual(await api.syncServerToLocal(),{ok:false,failed:1});
    assert.equal(values.get(key),'[{"id":"unsynchronized"}]');
  }
  global.fetch=async()=>Response.json({conversations:[]});
  assert.deepEqual(await api.syncServerToLocal(),{ok:true,failed:0});
  assert.equal(values.get(key),'[{"id":"unsynchronized"}]');
});


// Prepared only; no settings endpoint is called while testing remains paused.
test('strict settings reads reject failed and malformed pages instead of confirming an empty theme', async t => {
  const { api } = await setup(t);
  global.fetch = async () => Response.json({ error: 'unavailable' }, { status: 503 });
  await assert.rejects(api.fetchServerSettings({ strict: true }), /503/);
  global.fetch = async () => Response.json([]);
  await assert.rejects(api.fetchServerSettings({ strict: true }), /响应格式/);
});

test('settings writes report HTTP, schema, and successful acknowledgements honestly', async t => {
  const { api } = await setup(t);
  for (const [status, body, expected] of [[500, { ok: true }, false], [200, { ok: false }, false], [200, { ok: true }, true]]) {
    global.fetch = async () => Response.json(body, { status });
    assert.equal((await api.saveServerSettings({ theme: 'solar-forge' })).ok, expected);
  }
});

test('settings response body delayed past an account switch cannot acknowledge a save', async t => {
  const { api, account } = await setup(t); let release;
  global.fetch = async () => ({ ok: true, json: () => new Promise(resolve => { release = resolve; }) });
  const pending = api.saveServerSettings({ theme: 'solar-forge' }); await Promise.resolve();
  account(2); release({ ok: true }); const result = await pending;
  assert.equal(result.ok, false); assert.equal(result.stale, true);
});

test('reading a server index only updates the local index, without reposting all sessions', async t => {
  const { api, values } = await setup(t);
  let calls = 0;
  global.fetch = async () => { calls++; return Response.json({}); };
  await api.saveSessions([{ id: 'history', title: '旧标题', timestamp: 1000 }], { localOnly: true });
  assert.equal(calls, 0);
  assert.equal(JSON.parse(values.get('tszh:v2:user:1:sessions'))[0].timestamp, 1000);
});

test('a local activity index update does not repost unrelated or unchanged conversation titles', async t => {
  const { api, values } = await setup(t);
  values.set('tszh:v2:user:1:sessions', JSON.stringify([
    { id: 'history', title: '旧标题', timestamp: 1000 },
    { id: 'other', title: '其他会话', timestamp: 2000 },
  ]));
  const writes = [];
  global.fetch = async (_url, options) => { writes.push(JSON.parse(options.body)); return Response.json({}); };
  await api.saveSessions([
    { id: 'history', title: '旧标题', timestamp: 9000 },
    { id: 'other', title: '其他会话', timestamp: 2000 },
  ]);
  assert.deepEqual(writes, []);
  await api.saveSessions([
    { id: 'history', title: '已编辑标题', timestamp: 9000 },
    { id: 'other', title: '其他会话', timestamp: 2000 },
    { id: 'new', title: '新会话', timestamp: 9000 },
  ]);
  assert.deepEqual(writes.map(x => x.id), ['history', 'new']);
});

function putMergeHistory(values, messages) {
  values.set('tszh:v2:user:1:sessions', JSON.stringify([{ id: 'history', title: '旧标题', timestamp: 1000 }]));
  values.set('tszh:v2:user:1:messages:history', JSON.stringify(messages));
}

test('login with already synchronized history performs no writes or timestamp-changing uploads', async t => {
  const { api, values } = await setup(t);
  putMergeHistory(values, [{ id: 'u', role: 'user', text: '旧问题' }, { id: 'a', role: 'agent', text: '旧回答' }]);
  const writes = [];
  global.fetch = async (url, options) => {
    if (options.method === 'POST') { writes.push(url); return Response.json({ ok: true }); }
    return Response.json(url.endsWith('?mode=coze')
      ? { conversations: [{ id: 'history', title: '旧标题', updated_at: '2026-10-01' }] }
      : { messages: [{ id: 'u', role: 'user', content: '旧问题', is_error: 0, error_text: '' }, { id: 'a', role: 'agent', content: '旧回答', is_error: 0, error_text: '' }] });
  };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: true, failed: 0 });
  assert.deepEqual(writes, []);
});

test('login sync sends only changed messages and retains traces, rather than replaying every reply', async t => {
  const { api, values } = await setup(t);
  const contextTrace = { rollout: 'shadow', applied: false };
  putMergeHistory(values, [{ id: 'u', role: 'user', text: '旧问题' }, { id: 'a', role: 'agent', text: '新回答', contextTrace }]);
  const writes = [];
  global.fetch = async (url, options) => {
    if (options.method === 'POST') { writes.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true }); }
    return Response.json(url.endsWith('?mode=coze')
      ? { conversations: [{ id: 'history', title: '旧标题', updated_at: '2026-10-01' }] }
      : { messages: [{ id: 'u', role: 'user', content: '旧问题' }, { id: 'a', role: 'agent', content: '旧回答', contextTrace }] });
  };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: true, failed: 0 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.messages.length, 1);
  assert.equal(writes[0].body.messages[0].id, 'a');
  assert.deepEqual(writes[0].body.messages[0].contextTrace, contextTrace);
});

test('failed message comparison does not treat unreadable remote history as empty and overwrite it', async t => {
  const { api, values } = await setup(t);
  putMergeHistory(values, [{ id: 'u', role: 'user', text: '本机问题' }]);
  const writes = [];
  global.fetch = async (url, options) => {
    if (options.method === 'POST') { writes.push(url); return Response.json({ ok: true }); }
    return url.endsWith('?mode=coze')
      ? Response.json({ conversations: [{ id: 'history', title: '旧标题', updated_at: '2026-10-01' }] })
      : Response.json({ error: 'unavailable' }, { status: 503 });
  };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: false, failed: 1 });
  assert.deepEqual(writes, []);
  assert.equal(JSON.parse(values.get('tszh:v2:user:1:messages:history'))[0].text, '本机问题');
});

test('new local sessions still import, with their messages, after identity verification', async t => {
  const { api, values } = await setup(t);
  putMergeHistory(values, [{ id: 'u', role: 'user', text: '未同步问题' }]);
  const writes = [];
  global.fetch = async (url, options) => {
    if (options.method === 'POST') { writes.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true }); }
    return Response.json({ conversations: [] });
  };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: true, failed: 0 });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.id, 'history');
  assert.equal(writes[1].body.messages[0].text, '未同步问题');
});

test('an account switch during history comparison prevents subsequent uploads', async t => {
  const { api, values, account } = await setup(t);
  putMergeHistory(values, [{ id: 'u', role: 'user', text: 'A私有问题' }]);
  const writes = [];
  global.fetch = async (url, options) => {
    if (options.method === 'POST') { writes.push(url); return Response.json({ ok: true }); }
    if (url.endsWith('?mode=coze')) return Response.json({ conversations: [{ id: 'history', title: '旧标题', updated_at: '2026-10-01' }] });
    account(2);
    return Response.json({ messages: [] });
  };
  assert.equal((await api.mergeLocalToServer()).ok, false);
  assert.deepEqual(writes, []);
  assert.equal(values.has('tszh:v2:user:2:messages:history'), false);
});

test('explicit retirement during login clears only that account session and prevents message reposting', async t => {
  const { api, values } = await setup(t);
  putMergeHistory(values, [{ id: 'u', role: 'user', text: '已清理的旧缓存' }]);
  values.set('tszh:v2:user:1:active', 'history');
  values.set('tszh:v2:user:2:messages:history', '另一账号副本');
  const writes = [];
  global.fetch = async (url, options) => {
    if (options.method !== 'POST') return Response.json({ conversations: [] });
    writes.push(url);
    return Response.json({ error: { code: 'HISTORY_EXPIRED' } }, { status: 410 });
  };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: true, failed: 0 });
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(values.get('tszh:v2:user:1:sessions')), []);
  assert.equal(values.has('tszh:v2:user:1:messages:history'), false);
  assert.equal(values.has('tszh:v2:user:1:active'), false);
  assert.equal(values.get('tszh:v2:user:2:messages:history'), '另一账号副本');
});

test('an unrecognized 410 or a network error never authorizes local history deletion', async t => {
  const { api, values } = await setup(t);
  for (const body of [{}, { error: { code: 'OTHER_GONE' } }]) {
    putMergeHistory(values, [{ id: 'u', role: 'user', text: '保留本机数据' }]);
    global.fetch = async (_url, options) => options.method === 'POST' ? Response.json(body, { status: 410 }) : Response.json({ conversations: [] });
    assert.deepEqual(await api.mergeLocalToServer(), { ok: false, failed: 1 });
    assert.equal(JSON.parse(values.get('tszh:v2:user:1:messages:history'))[0].text, '保留本机数据');
  }
  global.fetch = async (_url, options) => {
    if (options.method === 'POST') throw new TypeError('network unavailable');
    return Response.json({ conversations: [] });
  };
  assert.deepEqual(await api.mergeLocalToServer(), { ok: false, failed: 1 });
  assert.equal(JSON.parse(values.get('tszh:v2:user:1:messages:history'))[0].text, '保留本机数据');
});

test('late retirement from account A cannot remove either account cache after switching to B', async t => {
  const { api, values, account } = await setup(t);
  putMergeHistory(values, [{ id: 'u', role: 'user', text: 'A缓存' }]);
  values.set('tszh:v2:user:2:messages:history', 'B缓存');
  global.fetch = async (_url, options) => options.method !== 'POST' ? Response.json({ conversations: [] }) : {
    ok: false, status: 410, json: async () => { account(2); return { error: { code: 'HISTORY_EXPIRED' } }; },
  };
  assert.equal((await api.mergeLocalToServer()).ok, false);
  assert.equal(JSON.parse(values.get('tszh:v2:user:1:messages:history'))[0].text, 'A缓存');
  assert.equal(values.get('tszh:v2:user:2:messages:history'), 'B缓存');
});
