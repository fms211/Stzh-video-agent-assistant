const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Prepared while tests are paused. Actual pure store, controlled storage/network only.
function compile(relativePath, modules = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  return exports;
}
const registry = compile('app/lib/theme-registry.ts');
const { createWorkspaceThemeStore } = compile('app/lib/workspace-theme-store.ts', { './theme-registry': registry });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(extra = {}) {
  const values = new Map(extra.values || []), calls = []; let owner = true, denyWrites = false;
  const options = {
    scope: extra.scope || 'user:1',
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (denyWrites) throw new Error('storage denied'); values.set(key, value); } },
    current: () => owner,
    readRemote: () => { calls.push(['read']); return extra.read ? extra.read() : Promise.resolve({ theme: 'deep-space' }); },
    writeRemote: theme => { calls.push(['write', theme]); return extra.write ? extra.write(theme) : Promise.resolve({ ok: true }); },
  };
  const store = createWorkspaceThemeStore(options);
  return { store, values, calls, options, changeOwner: () => { owner = false; }, denyWrites: () => { denyWrites = true; } };
}

test('late cloud read cannot overwrite a locally selected theme', async () => {
  const gate = deferred(), h = setup({ read: () => gate.promise }); const read = h.store.load();
  await h.store.choose('solar-forge'); gate.resolve({ theme: 'crystal-cave' }); await read;
  assert.equal(h.store.getSnapshot().theme, 'solar-forge');
  assert.equal(JSON.parse(h.values.get('tszh:v2:user:1:theme')).theme, 'solar-forge');
});

test('uncertain cloud save preserves local theme and blocks replacement by a cloud read', async () => {
  const h = setup({ write: async () => ({ ok: false }) }); await h.store.choose('crystal-cave'); await h.store.load();
  const state = h.store.getSnapshot(); assert.equal(state.theme, 'crystal-cave'); assert.equal(state.retry, 'save');
  assert.equal(JSON.parse(h.values.get('tszh:v2:user:1:theme')).pending, true); assert.deepEqual(h.calls, [['write', 'crystal-cave']]);
});

test('pending local save survives a reload and retries the same value before any remote read', async () => {
  const h = setup({ values: [['tszh:v2:user:1:theme', JSON.stringify({ theme: 'solar-forge', pending: true })]] });
  await h.store.load(); assert.equal(h.calls.length, 0); await h.store.retry();
  assert.deepEqual(h.calls, [['write', 'solar-forge']]); assert.equal(h.store.getSnapshot().retry, null);
  assert.equal(JSON.parse(h.values.get('tszh:v2:user:1:theme')).pending, false);
});

test('storage denial leaves the previous selection and makes no cloud write', async () => {
  const h = setup(); h.denyWrites(); await h.store.choose('solar-forge');
  assert.equal(h.store.getSnapshot().theme, 'deep-space'); assert.equal(h.calls.length, 0); assert.match(h.store.getSnapshot().message, /未切换/);
});

test('legacy shared theme is a guest fallback and is never borrowed by another account', async () => {
  const guest = setup({ scope: 'guest', values: [['theme', 'crystal-cave']] });
  assert.equal(guest.store.getSnapshot().theme, 'crystal-cave'); await guest.store.choose('solar-forge');
  assert.equal(guest.calls.length, 0); assert.equal(guest.values.get('theme'), 'crystal-cave');
  assert.equal(JSON.parse(guest.values.get('tszh:v2:guest:theme')).theme, 'solar-forge');
  const account = setup({ values: [['theme', 'crystal-cave']] }); assert.equal(account.store.getSnapshot().theme, 'deep-space');
});

test('owner change during read cannot populate cache or apply a returned theme', async () => {
  const gate = deferred(), h = setup({ read: () => gate.promise }); const pending = h.store.load();
  h.changeOwner(); gate.resolve({ theme: 'solar-forge' }); await pending;
  assert.equal(h.store.getSnapshot().theme, 'deep-space'); assert.equal(h.values.size, 0);
});

test('invalid remote theme reports an error while retaining the existing valid cache', async () => {
  const h = setup({ values: [['tszh:v2:user:1:theme', JSON.stringify({ theme: 'crystal-cave', pending: false })]], read: async () => ({ theme: 'not-a-theme' }) });
  await h.store.load(); assert.equal(h.store.getSnapshot().theme, 'crystal-cave'); assert.equal(h.store.getSnapshot().retry, 'load');
});

test('original dark default loads as the current default without rewriting the server or another account cache', async () => {
  const otherKey = 'tszh:v2:user:2:theme';
  const otherValue = JSON.stringify({ theme: 'crystal-cave', pending: false });
  const h = setup({ values: [[otherKey, otherValue]], read: async () => ({ theme: 'dark' }) });
  await h.store.load();
  assert.equal(h.store.getSnapshot().theme, registry.DEFAULT_THEME);
  assert.equal(h.store.getSnapshot().phase, 'idle');
  assert.equal(h.store.getSnapshot().retry, null);
  assert.match(h.store.getSnapshot().message, /旧版深色/);
  assert.deepEqual(h.calls, [['read']]);
  assert.equal(h.values.get(otherKey), otherValue);
  assert.equal(JSON.parse(h.values.get('tszh:v2:user:1:theme')).theme, registry.DEFAULT_THEME);
});

test('duplicate saves do not race server writes and cannot change the displayed choice', async () => {
  const gate = deferred(), h = setup({ write: () => gate.promise }); const first = h.store.choose('solar-forge');
  await h.store.choose('crystal-cave'); assert.deepEqual(h.calls, [['write', 'solar-forge']]);
  assert.equal(h.store.getSnapshot().theme, 'solar-forge'); gate.resolve({ ok: true }); await first;
});

test('lifecycle cleanup discards old reads and reactivation permits a fresh read', async () => {
  const gate = deferred(); let reads = 0;
  const h = setup({ read: () => ++reads === 1 ? gate.promise : Promise.resolve({ theme: 'crystal-cave' }) });
  const first = h.store.load(); h.store.dispose(); h.store.activate(); await h.store.load();
  gate.resolve({ theme: 'solar-forge' }); await first; assert.equal(h.store.getSnapshot().theme, 'crystal-cave');
});

test('a server-confirmed save with failed local confirmation is not called fully saved', async () => {
  let h; h = setup({ write: async () => { h.denyWrites(); return { ok: true }; } });
  await h.store.choose('solar-forge'); assert.equal(h.store.getSnapshot().retry, 'save');
  assert.match(h.store.getSnapshot().message, /云端已确认.*未更新/);
});


test('guest read retry recovers from denied storage without issuing a remote request', async () => {
  const values = new Map([['tszh:v2:guest:theme', JSON.stringify({ theme: 'solar-forge', pending: false })]]);
  let denied = true, remoteCalls = 0;
  const store = createWorkspaceThemeStore({ scope: 'guest', current: () => true,
    storage: { getItem: key => { if (denied) throw new Error('denied'); return values.get(key) ?? null; }, setItem() {} },
    readRemote: async () => { remoteCalls++; }, writeRemote: async () => { remoteCalls++; return { ok: true }; },
  });
  assert.equal(store.getSnapshot().retry, 'load'); denied = false; await store.retry();
  assert.equal(store.getSnapshot().theme, 'solar-forge'); assert.equal(store.getSnapshot().retry, null); assert.equal(remoteCalls, 0);
});


test('denied identity storage reports recovery instead of silently ignoring theme clicks', async () => {
  let requests = 0;
  const store = createWorkspaceThemeStore({ scope: 'user:1', current: () => { throw new Error('identity storage denied'); },
    storage: { getItem: () => null, setItem() {} },
    readRemote: async () => { requests++; }, writeRemote: async () => { requests++; return { ok: true }; },
  });
  await store.choose('solar-forge'); assert.equal(store.getSnapshot().theme, 'deep-space');
  assert.match(store.getSnapshot().message, /账户存储暂不可用/); assert.equal(requests, 0);
});
