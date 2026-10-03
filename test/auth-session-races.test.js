const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the provider's actual async handlers with controlled identity responses.
// UI rendering/focus is covered separately by browser acceptance.
function harness(options = {}) {
  const values = new Map([['stzh_token', 'A'], ['stzh_user', JSON.stringify({ id: 1 })]]);
  const state = [], requests = [], migrated = [], syncCalls = [];
  let stateIndex = 0;
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  class ApiRequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const auth = {
    ApiRequestError,
    getToken: () => storage.getItem('stzh_token'),
    getCachedUser: () => JSON.parse(storage.getItem('stzh_user') || 'null'),
    setToken: value => storage.setItem('stzh_token', value),
    setCachedUser: user => storage.setItem('stzh_user', JSON.stringify(user)),
    removeToken: () => { storage.removeItem('stzh_token'); storage.removeItem('stzh_user'); },
    getMe: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  };
  auth.logout = auth.removeToken;
  auth.commitAuthSession = response => { auth.setToken(response.token); auth.setCachedUser(response.user); };
  const modules = {
    react: {
      createContext: () => ({ Provider: 'provider' }), useContext: () => null,
      useState: initial => { const i = stateIndex++; state[i] = initial; return [initial, value => { state[i] = value; }]; },
      useEffect: () => {}, useCallback: fn => fn, useRef: value => ({ current: value }),
    },
    'react/jsx-runtime': { jsx: (_type, props) => props },
    '@/app/lib/auth': auth,
    '@/app/lib/sync': {
      mergeLocalToServer: async () => { syncCalls.push(auth.getToken()); if (options.mergeGate) await options.mergeGate; if (options.mergeError) throw options.mergeError; return options.mergeResult || { ok: true, failed: 0 }; },
      syncServerToLocal: async () => { syncCalls.push(auth.getToken()); if (options.pullError) throw options.pullError; return { ok: true, failed: 0 }; },
    },
    '@/app/lib/data-owner': {
      dataOwnerFromUser: user => ({ kind: 'account', userId: user.id }),
      migrateLegacyWorkspaceData: (_storage, owner) => { migrated.push(owner); if (options.migrationError) throw options.migrationError; }, copyWorkspaceData: () => {},
    },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../app/components/AuthProvider.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, localStorage: storage, window: { dispatchEvent() {} }, CustomEvent: class {}, DOMException });
  return { provider: exports.default({ children: null }).value, auth, state, requests, migrated, syncCalls, values };
}

test('late refresh failure cannot sign out a newly accepted account', async () => {
  const h = harness();
  const oldRefresh = h.provider.refreshUser();
  const login = h.provider.acceptAuth({ token: 'B', user: { id: 2 } }, 'keep-local');
  h.requests[1].resolve({ user: { id: 2 } });
  await login;
  h.requests[0].reject(new Error('old token expired'));
  await oldRefresh;
  assert.equal(h.auth.getToken(), 'B');
  assert.equal(h.state[0].id, 2);
  assert.deepEqual(h.syncCalls, ['B']);
});

test('late refresh success cannot restore an account after logout', async () => {
  const h = harness();
  const oldRefresh = h.provider.refreshUser();
  h.provider.logout();
  h.requests[0].resolve({ user: { id: 1 } });
  await oldRefresh;
  assert.equal(h.auth.getToken(), null);
  assert.equal(h.state[0], null);
  assert.equal(h.syncCalls.length, 0);
  assert.equal(h.migrated.some(owner => owner.kind === 'account'), false);
});

test('superseded login rejects without rolling back a newer account', async () => {
  const h = harness();
  const oldLogin = h.provider.acceptAuth({ token: 'B', user: { id: 2 } }, 'keep-local');
  const rejected = assert.rejects(oldLogin, error => error.name === 'AbortError');
  const newLogin = h.provider.acceptAuth({ token: 'C', user: { id: 3 } }, 'keep-local');
  h.requests[1].resolve({ user: { id: 3 } });
  await newLogin;
  h.requests[0].resolve({ user: { id: 2 } });
  await rejected;
  assert.equal(h.auth.getToken(), 'C');
  assert.equal(h.state[0].id, 3);
  assert.deepEqual(h.syncCalls, ['C']);
});

// Prepared only. These controlled handler cases have not run during paused testing.
test('temporary identity service failure preserves the account but never labels it verified', async () => {
  const h = harness();const pending=h.provider.refreshUser();
  h.requests[0].reject(new h.auth.ApiRequestError('temporary service outage',503));await pending;
  assert.equal(h.auth.getToken(),'A');assert.equal(h.state[0].id,1);
  assert.equal(h.state[2],'unavailable');assert.match(h.state[3],/暂时无法验证.*保留/);
  assert.equal(h.syncCalls.length,0);assert.equal(h.state[4],false);
});

test('explicit identity rejection signs out without deleting account history', async () => {
  const h=harness();h.values.set('tszh:v2:user:1:sessions','[{"id":"preserved"}]');
  const pending=h.provider.refreshUser();h.requests[0].reject(new h.auth.ApiRequestError('expired',401));await pending;
  assert.equal(h.auth.getToken(),null);assert.equal(h.state[0],null);assert.equal(h.state[2],'signed-out');
  assert.equal(h.values.get('tszh:v2:user:1:sessions'),'[{"id":"preserved"}]');
});

test('failed upload does not pull a server list over unsynchronized local history', async () => {
  const h=harness({mergeResult:{ok:false,failed:2}}),pending=h.provider.refreshUser();
  h.requests[0].resolve({user:{id:1}});await pending;
  assert.equal(h.auth.getToken(),'A');assert.equal(h.state[2],'verified');assert.deepEqual(h.syncCalls,['A']);
  assert.match(h.state[3],/未用云端列表覆盖/);
});

test('accepted login survives later history service failure instead of restoring the previous account', async () => {
  const h=harness({pullError:new Error('offline')}),pending=h.provider.acceptAuth({token:'B',user:{id:2}},'keep-local');
  h.requests[0].resolve({user:{id:2}});const result=await pending;
  assert.equal(result.ok,false);assert.equal(h.auth.getToken(),'B');assert.equal(h.state[0].id,2);
  assert.equal(h.state[2],'verified');assert.match(h.state[3],/账户已验证.*未完成/);
});

test('partial guest import keeps the verified account and skips list overwrite', async () => {
  const h=harness({mergeResult:{ok:false,failed:1}}),pending=h.provider.acceptAuth({token:'B',user:{id:2}},'import');
  h.requests[0].resolve({user:{id:2}});assert.deepEqual(await pending,{ok:false,failed:1});
  assert.equal(h.auth.getToken(),'B');assert.equal(h.state[0].id,2);assert.deepEqual(h.syncCalls,['B']);
});

test('mismatched login identity fails before migration and restores the prior session', async () => {
  const h=harness(),pending=h.provider.acceptAuth({token:'B',user:{id:2}},'keep-local');
  const rejected=assert.rejects(pending,/账户响应与本次登录不一致/);
  h.requests[0].resolve({user:{id:3}});await rejected;
  assert.equal(h.auth.getToken(),'A');assert.equal(h.state[0].id,1);assert.equal(h.migrated.length,0);
});

// Prepared during paused testing: caller lifecycle cannot undo a different account.
test('closed caller cannot begin authentication or change credentials', async () => {
  const h = harness();
  await assert.rejects(h.provider.acceptAuth({ token: 'B', user: { id: 2 } }, 'import', () => false), error => error.name === 'AbortError');
  assert.equal(h.auth.getToken(), 'A'); assert.equal(h.requests.length, 0); assert.equal(h.migrated.length, 0);
});

test('closing before identity verification restores the initiating account without import', async () => {
  const h = harness(); let open = true;
  const pending = h.provider.acceptAuth({ token: 'B', user: { id: 2 } }, 'import', () => open);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  open = false; h.requests[0].resolve({ user: { id: 2 } }); await rejected;
  assert.equal(h.auth.getToken(), 'A'); assert.equal(h.state[0].id, 1);
  assert.equal(h.migrated.length, 0); assert.equal(h.syncCalls.length, 0); assert.equal(h.state[4], false);
});

test('closing after verified import preserves its identity and skips subsequent pull', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ mergeGate: gate }); let open = true;
  const pending = h.provider.acceptAuth({ token: 'B', user: { id: 2 } }, 'import', () => open);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  h.requests[0].resolve({ user: { id: 2 } });
  // Flush the async getMe continuation until the controlled import reaches its gate.
  for (let i = 0; i < 6 && h.syncCalls.length === 0; i++) await Promise.resolve();
  assert.equal(h.state[2], 'verified'); assert.deepEqual(h.syncCalls, ['B']);
  open = false; release(); await rejected;
  assert.equal(h.auth.getToken(), 'B'); assert.equal(h.state[0].id, 2);
  assert.deepEqual(h.syncCalls, ['B']); assert.match(h.state[3], /已发生的导入.*不会自动撤销/);
});

test('canceled identity handoff cannot restore credentials after logout', async () => {
  const h = harness(); let open = true;
  const pending = h.provider.acceptAuth({ token: 'B', user: { id: 2 } }, 'import', () => open);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  open = false; h.provider.logout(); h.requests[0].resolve({ user: { id: 2 } }); await rejected;
  assert.equal(h.auth.getToken(), null); assert.equal(h.state[0], null); assert.equal(h.syncCalls.length, 0);
});
