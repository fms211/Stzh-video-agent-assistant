const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Prepared only; no browser, real credentials, service, or database is used.
// Run actual component handlers with controlled hooks and delayed responses.
function harness(options = {}) {
  let identity = { token: 'A', user: { id: 1 } }, tree;
  const states = [], refs = [], effects = [], pendingEffects = [], events = new Map();
  const requests = [], accepted = [], callbacks = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const props = {
    authView: 'login', onAuthViewChange: value => callbacks.push(['view', value]),
    onAuthenticated: () => callbacks.push(['authenticated']), onGuest: () => callbacks.push(['guest']),
    onCancel: () => callbacks.push(['cancel']),
  };
  const auth = {
    getToken: () => identity.token, getCachedUser: () => identity.user,
    authenticateLogin: (...args) => new Promise((resolve, reject) => requests.push({ kind: 'login', args, resolve, reject })),
    authenticateRegister: (...args) => new Promise((resolve, reject) => requests.push({ kind: 'register', args, resolve, reject })),
  };
  const components = Object.fromEntries(['Button', 'Form', 'Input', 'Label', 'Tab', 'TabList', 'TabPanel', 'Tabs', 'TextField'].map(name => [name, name]));
  const modules = {
    react: {
      useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
      useRef: initial => { const i = refIndex++; return refs[i] || (refs[i] = { current: initial }); },
      useLayoutEffect: (setup, deps) => {
        const i = effectIndex++, previous = effects[i];
        if (!previous || deps.some((value, index) => value !== previous.deps[index])) pendingEffects.push(() => {
          previous?.cleanup?.(); effects[i] = { deps, cleanup: setup() };
        });
      },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-aria-components': components,
    'lucide-react': Object.fromEntries(['ArrowRight', 'Cloud', 'Download', 'LogOut', 'UserRound'].map(name => [name, name])),
    '@/app/lib/auth': auth,
    '@/app/lib/data-owner': { hasWorkspaceData: () => !!options.guestData },
    './AuthSessionNotice': { default: 'AuthSessionNotice' },
    './AuthProvider': { useAuth: () => ({ user: null, loading: false, verification: 'signed-out',
      logout: () => { identity = { token: null, user: null }; callbacks.push(['logout']); },
      acceptAuth: async (response, decision, current) => {
        accepted.push({ response, decision, current });
        identity = { token: response.token, user: response.user };
        return { ok: true, failed: 0 };
      },
    }) },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../app/components/EntryGateway.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Error, require: name => { assert.ok(modules[name], name); return modules[name]; }, localStorage: {}, window: {
    addEventListener: (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener: (name, fn) => events.get(name)?.delete(fn),
  } });
  function render(next = {}) {
    Object.assign(props, next); stateIndex = 0; refIndex = 0; effectIndex = 0;
    tree = exports.default(props); while (pendingEffects.length) pendingEffects.shift()(); return tree;
  }
  function nodes(value = tree) {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap(child => nodes(child ?? null));
    return [value, ...nodes(value.props?.children ?? null)];
  }
  const find = (type, predicate = () => true) => { const node = nodes().find(node => node.type === type && predicate(node.props)); assert.ok(node, type); return node.props; };
  const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' ? value : '';
  render(); render();
  return {
    render, find, requests, accepted, callbacks, states,
    fill: () => { const fields = nodes().filter(node => node.type === 'TextField'); fields[0].props.onChange('fixture-user'); fields[1].props.onChange('fixture-password'); render(); },
    submit: () => find('Form').onSubmit({ preventDefault() {} }),
    press: label => find('Button', props => text(props.children).includes(label)).onPress(),
    identity: value => { identity = value; for (const fn of events.get('tszh_data_owner_changed') || []) fn(); },
    unmount: () => { for (const effect of effects) effect?.cleanup?.(); },
  };
}
const response = { token: 'B', user: { id: 2, username: 'fixture-user' } };

test('closed login panel ignores a late credential response', async () => {
  const h = harness(); h.fill(); const pending = h.submit(); h.unmount();
  h.requests[0].resolve(response); await pending;
  assert.equal(h.accepted.length, 0); assert.equal(h.callbacks.length, 0);
});

test('switching login/register invalidates the prior request and clears the password', async () => {
  const h = harness(); h.fill(); const pending = h.submit();
  h.find('Tabs').onSelectionChange('register'); h.render({ authView: 'register' });
  h.requests[0].resolve(response); await pending;
  assert.equal(h.accepted.length, 0); assert.equal(h.states[2], ''); assert.equal(h.states[3], false);
  assert.deepEqual(h.callbacks, [['view', 'register']]);
});

test('another account change prevents the old response from accepting or displaying import', async () => {
  const h = harness({ guestData: true }); h.fill(); const pending = h.submit();
  h.identity({ token: 'C', user: { id: 3 } }); h.requests[0].resolve(response); await pending;
  assert.equal(h.accepted.length, 0); assert.equal(h.states[5], null); assert.equal(h.states[3], false);
});

test('duplicate submits are blocked synchronously before a React rerender', async () => {
  const h = harness(); h.fill(); const first = h.submit(); await h.submit();
  assert.equal(h.requests.length, 1); h.requests[0].resolve(response); await first;
  assert.equal(h.accepted.length, 1); assert.deepEqual(h.callbacks, [['authenticated']]);
});

test('guest content waits for an explicit import decision and allows cancel', async () => {
  const h = harness({ guestData: true }); h.fill(); const pending = h.submit();
  h.requests[0].resolve(response); await pending; h.render();
  assert.equal(h.accepted.length, 0); h.press('取消并关闭'); h.render();
  assert.equal(h.states[5], null); assert.deepEqual(h.callbacks, [['cancel']]);
});

test('entering guest mode clears the current session before the guest callback', () => {
  const h = harness(); h.press('暂不登录');
  assert.deepEqual(h.callbacks, [['logout'], ['guest']]);
});


test('a retained import button callback cannot accept a canceled handoff', async () => {
  const h = harness({ guestData: true }); h.fill(); const pending = h.submit();
  h.requests[0].resolve(response); await pending; h.render();
  const staleImport = h.find('Button', props => props.className === 'entry-primary-action').onPress;
  h.press('返回修改账户'); h.render(); await staleImport();
  assert.equal(h.accepted.length, 0); assert.equal(h.states[5], null);
});
