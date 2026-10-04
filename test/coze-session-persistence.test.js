const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// Execute the component's persistence effect with controlled storage and time.
// This never mounts a browser, opens a database, or submits a model request.
function runPersistence({ stored, messages, existing = true, switchOwner = false }) {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/components/CreativeConversationCore.tsx'), 'utf8');
  const start = source.indexOf('  // Persist current session');
  const end = source.indexOf('  // Enforce maxMessages', start);
  assert.ok(start >= 0 && end > start);
  const code = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const writes = [];
  let timer;
  let cleanup;
  const oldSession = { id: 'history', title: '已有标题', timestamp: 1000, messageCount: stored.length };
  const scope = { owner: 'user:5', token: 'fixture' };
  vm.runInNewContext(code, {
    useRef: () => ({ current: null }),
    useEffect: effect => { cleanup = effect(); },
    hydrated: true, dataReady: true, prefs: { autoSave: true },
    messages, sessionId: 'history', dataScope: scope,
    readConversationDataScope: () => switchOwner ? { owner: 'guest', token: null } : scope,
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => {},
    loadMessages: () => stored,
    saveMessages: (_id, value) => writes.push({ type: 'messages', value }),
    sessionsRef: { current: existing ? [oldSession] : [] },
    setSessions: value => writes.push({ type: 'state', value }),
    saveSessions: value => writes.push({ type: 'sessions', value }),
    Date: { now: () => 9000 },
  });
  timer?.();
  cleanup?.();
  return writes;
}

const history = [{ id: 'u', role: 'user', text: '旧问题' }, { id: 'a', role: 'agent', text: '旧回答' }];

test('reading cached history does not rewrite its timestamp or upload unchanged messages', () => {
  assert.deepEqual(runPersistence({ stored: history, messages: JSON.parse(JSON.stringify(history)) }), []);
});

test('a changed reply is saved and ordinary assistant text counts as a message', () => {
  const messages = [history[0], { ...history[1], text: '新的回答' }];
  const writes = runPersistence({ stored: history, messages });
  assert.equal(writes.filter(x => x.type === 'messages').length, 1);
  const updated = writes.find(x => x.type === 'sessions').value[0];
  assert.equal(updated.timestamp, 9000);
  assert.equal(updated.messageCount, 2);
});

test('an absent local index is repaired even when messages already exist in the cache', () => {
  const writes = runPersistence({ stored: history, messages: history, existing: false });
  assert.equal(writes.find(x => x.type === 'sessions').value[0].id, 'history');
});

test('a delayed save cannot write after logout or an account change', () => {
  assert.deepEqual(runPersistence({ stored: [], messages: history, switchOwner: true }), []);
});
