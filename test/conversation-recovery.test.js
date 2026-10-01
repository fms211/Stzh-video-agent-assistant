const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual recovery hook with deferred network responses. The harness
// controls effect cleanup and state updates; it does not claim browser rendering.
function harness() {
  const requests = [], local = new Map(), revision = { current: 0 };
  let effect, cleanup, messages = [];
  const setter = update => { messages = update(messages); };
  const modules = {
    react: { useRef: () => revision, useCallback: fn => fn, useEffect: fn => { effect = fn; } },
    '../lib/sync': {
      loadMessages: id => local.get(id) || [],
      fetchServerMessages: id => new Promise(resolve => requests.push({ id, resolve })),
    },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../app/hooks/useConversationRecovery.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  return {
    requests, local,
    get messages() { return messages; },
    set messages(value) { messages = value; },
    open(id, accountId, hydrated = true) {
      if (arguments.length < 2) accountId = 1;
      cleanup?.();
      const invalidate = exports.useConversationRecovery(id, accountId, hydrated, setter);
      cleanup = effect();
      return invalidate;
    },
    close() { cleanup?.(); },
  };
}
const reply = id => [{ id, role: 'agent', text: id, contextTrace: { rollout: 'shadow', applied: false } }];
const flush = () => new Promise(resolve => setImmediate(resolve));

test('switching A to B ignores a late A response including its context trace', async () => {
  const h = harness();
  h.open('A');
  h.open('B');
  h.requests[1].resolve(reply('B'));
  await flush();
  h.requests[0].resolve(reply('A'));
  await flush();
  assert.deepEqual(h.messages, reply('B'));
});

test('new conversation, account change and unmount invalidate pending recovery', async () => {
  for (const transition of [h => h.open('new'), h => h.open('A', 2), h => h.close()]) {
    const h = harness();
    h.open('A');
    transition(h);
    h.requests[0].resolve(reply('old'));
    await flush();
    assert.equal(h.messages.length, 0);
  }
});

test('immediate invalidation and newly typed messages prevent replacement by history', async () => {
  for (const explicit of [true, false]) {
    const h = harness();
    const invalidate = h.open('A');
    if (explicit) invalidate();
    h.messages = [{ id: 'new', role: 'user', text: 'new prompt' }];
    h.requests[0].resolve(reply('old'));
    await flush();
    assert.equal(h.messages[0].id, 'new');
  }
});

test('initial empty session recovers its trace; local messages and guests need no fetch', async () => {
  const h = harness();
  h.open('cloud');
  h.requests[0].resolve(reply('cloud'));
  await flush();
  assert.deepEqual(h.messages, reply('cloud'));
  h.local.set('local', reply('local'));
  h.open('local');
  h.open('guest', undefined);
  h.open('unhydrated', 1, false);
  assert.equal(h.requests.length, 1);
});
