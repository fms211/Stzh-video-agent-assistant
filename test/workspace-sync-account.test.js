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
