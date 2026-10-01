const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the provider's actual async handlers with controlled identity responses.
// UI rendering/focus is covered separately by browser acceptance.
function harness() {
  const values = new Map([['stzh_token', 'A'], ['stzh_user', JSON.stringify({ id: 1 })]]);
  const state = [], requests = [], migrated = [], syncCalls = [];
  let stateIndex = 0;
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const auth = {
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
      mergeLocalToServer: async () => { syncCalls.push(auth.getToken()); return { ok: true, failed: 0 }; },
      syncServerToLocal: async () => { syncCalls.push(auth.getToken()); },
    },
    '@/app/lib/data-owner': {
      dataOwnerFromUser: user => ({ kind: 'account', userId: user.id }),
      migrateLegacyWorkspaceData: (_storage, owner) => migrated.push(owner), copyWorkspaceData: () => {},
    },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../app/components/AuthProvider.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, localStorage: storage, window: { dispatchEvent() {} }, CustomEvent: class {}, DOMException });
  return { provider: exports.default({ children: null }).value, auth, state, requests, migrated, syncCalls };
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
