const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Real client modules; synthetic storage and delayed responses, no network or DB.
function fixture() {
  const values = new Map(), cache = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  const account = id => { values.set('stzh_token', `synthetic-${id}`); values.set('stzh_user', JSON.stringify({ id })); };
  account(1);
  values.set('tszh:v2:opc:user:1:active', 'current');
  values.set('tszh:v2:user:1:active', 'current');
  const environment = { localStorage: storage, sessionStorage: storage, Event, crypto, Response, DOMException, process,
    window: { location: { protocol: 'http:', hostname: 'localhost', port: '18089', origin: 'http://localhost:18089' }, dispatchEvent() {} },
    fetch: async url => {
      if (url.includes('/history-retention/sweep')) return Response.json({ expiredIds: ['old'] });
      return response(url);
    } };
  let response = () => { throw Error('Unexpected synthetic request'); };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, { ...environment, module, exports: module.exports, require: name => {
      if (!name.startsWith('.')) return require(name);
      return load(path.resolve(path.dirname(file), name.endsWith('.ts') ? name : `${name}.ts`));
    } }, { filename: file });
    return module.exports;
  }
  const library = name => load(path.resolve(__dirname, `../app/lib/${name}.ts`));
  return { values, account, library, reload: () => cache.clear(), setResponse: fn => { response = fn; } };
}

for (const mode of ['assistant', 'coze']) test(`${mode}: acknowledged expiry discards a delayed message response and preserves deletion`, async () => {
  const f = fixture(), persistence = f.library(mode === 'assistant' ? 'opc-agent-persist' : 'sync'), retention = f.library('history-retention-client');
  let release, start;
  const started = new Promise(r => { start = r; }), delayed = new Promise(r => { release = r; });
  f.setResponse(() => ({ ok: true, json: async () => { start(); await delayed; return { messages: [{ id: 'm', role: 'assistant', content: 'SYNTHETIC_OLD', timestamp: 100 }] }; } }));
  const pending = mode === 'assistant' ? persistence.loadMessages('old', true) : persistence.fetchServerMessages('old', { strict: true });
  const checked = assert.rejects(pending, /清理/);
  await started; await retention.sweepHistory(); release(); await checked;
  assert.equal(f.values.has('tszh:v2:opc:user:1:msg_old'), false);
  assert.equal(f.values.has('tszh:v2:user:1:messages:old'), false);
});

test('a delayed session list cannot repopulate expired rows; live history remains', async () => {
  const f = fixture(), persistence = f.library('opc-agent-persist'), retention = f.library('history-retention-client');
  let release, start;
  const started = new Promise(r => { start = r; }), delayed = new Promise(r => { release = r; });
  f.setResponse(() => ({ ok: true, json: async () => { start(); await delayed; return { sessions: [{ id: 'old', title: 'expired', updated_at: 1, message_count: 1 }, { id: 'current', title: 'keep', updated_at: 2, message_count: 1 }] }; } }));
  const pending = persistence.getSessions(true); await started; await retention.sweepHistory(); release();
  assert.deepEqual(Array.from(await pending, s => s.id), ['current']);
  assert.deepEqual(Array.from(persistence.getLocalSessions(), s => s.id), ['current']);
});

test('expiry stops queued/local writes and survives module reload without affecting another account', async () => {
  const f = fixture(), persistence = f.library('opc-agent-persist'), sync = f.library('sync');
  await f.library('history-retention-client').sweepHistory();
  await assert.rejects(persistence.saveMessages('old', [{ id: 'm', role: 'user', content: 'old', timestamp: 1 }]), /清理/);
  await sync.saveMessages('old', [{ id: 'm', role: 'user', text: 'old' }]);
  assert.equal(f.values.has('tszh:v2:user:1:messages:old'), false);
  f.account(2); f.setResponse(() => Response.json({ messages: [{ id: 'new', role: 'user', content: 'owner2', timestamp: 1 }] }));
  assert.equal((await persistence.loadMessages('old', true))[0].content, 'owner2');
  assert.equal(f.values.has('tszh:v2:opc:user:2:msg_old'), true);
  f.account(1); f.reload(); assert.equal((await f.library('opc-agent-persist').loadMessages('old')).length, 0);
});

test('an upload acknowledgement arriving after expiry cannot recreate its local sync marker', async () => {
  const f = fixture(), persistence = f.library('opc-agent-persist');
  let start, release;
  const started = new Promise(r => { start = r; }), delayed = new Promise(r => { release = r; });
  f.setResponse(url => {
    if (url.endsWith('/sessions')) return Response.json({ ok: true });
    return { ok: true, json: async () => { start(); await delayed; return { count: 1 }; } };
  });
  const pending = persistence.saveMessages('old', [{ id: 'm', role: 'user', content: 'synthetic', timestamp: 1 }]);
  const checked = assert.rejects(pending, /清理/);
  await started; await f.library('history-retention-client').sweepHistory(); release(); await checked;
  assert.equal(f.values.has('tszh:v2:opc:user:1:msg_old'), false);
  assert.equal(f.values.has('tszh:v2:opc:user:1:msg_old:synced'), false);
});
