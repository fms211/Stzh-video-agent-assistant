const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the component's actual callbacks/effects with controlled Hook slots,
// timers and promises. This verifies lifecycle races, not DOM/layout behavior.
function harness(overrides = {}) {
  const hooks = [], pendingEffects = [], timers = new Map(), modelReads = [], restores = [], bootstrap = [], writesAfterUnmount = [];
  const listeners = new Map();
  let cursor = 0, timerId = 0, mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useId() { const index = cursor++; return (hooks[index] ||= { kind: "id", value: `workflow-field-fixture-${index}` }).value; },
    useState(initial) {
      const index = cursor++;
      const slot = hooks[index] ||= { kind: "state", value: typeof initial === "function" ? initial() : initial };
      return [slot.value, next => {
        slot.value = typeof next === "function" ? next(slot.value) : next;
        if (!mounted) writesAfterUnmount.push({ index, value: slot.value });
      }];
    },
    useRef(value) { return (hooks[cursor++] ||= { kind: "ref", value: { current: value } }).value; },
    useCallback(fn, deps) {
      const index = cursor++, previous = hooks[index];
      if (previous && same(previous.deps, deps)) return previous.value;
      hooks[index] = { kind: "callback", deps, value: fn };
      return fn;
    },
    useMemo(fn, deps) {
      const index = cursor++, previous = hooks[index];
      if (previous && same(previous.deps, deps)) return previous.value;
      const value = fn(); hooks[index] = { kind: "memo", deps, value }; return value;
    },
    useEffect(fn, deps) {
      const index = cursor++, previous = hooks[index];
      if (previous && same(previous.deps, deps)) return;
      const slot = { kind: "effect", deps, cleanup: null };
      hooks[index] = slot;
      pendingEffects.push(() => { previous?.cleanup?.(); slot.cleanup = fn(); });
    },
  };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const noop = () => {};
  const modules = {
    react,
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" },
    "./AuthProvider": { useAuth: () => ({ user: { id: 1 } }) },
    "@/app/hooks/useSessionProject": { useSessionProject: () => ({ projectId: "", ready: true, select: noop }) },
    "./RequestMemoryExclusions": { useRequestMemoryExclusions: () => ({ ids: [], consumed: noop }) },
    "@/app/lib/data-owner": { currentDataOwner: () => ({ kind: "account", userId: 1 }), ownerScope: () => "user:1" },
    "@/app/lib/opc-workflows": { getWorkflowsByCategory: () => ({}), getWorkflowById: () => null },
    "@/app/lib/opc-agent-persist": {
      migrateLegacyOpcData: () => bootstrap.push("migrate"), getActiveSessionId: () => null,
      createSessionId: () => { bootstrap.push("create"); return "opc_chat_lifecycle_fixture"; },
      setActiveSessionId: () => bootstrap.push("activate"),
      loadMessages: () => new Promise(resolve => restores.push({ resolve })),
    },
    "@/app/lib/creative-agent-api": { creativeApi: (route, options = {}) => {
      assert.equal(route, "/api/model-providers");
      return new Promise((resolve, reject) => modelReads.push({ resolve, reject, signal: options.signal }));
    } },
  };
  const fallback = new Proxy({}, { get: () => noop });
  const source = fs.readFileSync(path.resolve(__dirname, "../app/components/ModelAssistantPanel.tsx"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => modules[name] || fallback,
    localStorage: storage, sessionStorage: storage, AbortController, DOMException, queueMicrotask,
    window: {
      setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
      addEventListener: (type, fn) => { listeners.set(type, fn); }, removeEventListener: type => listeners.delete(type),
    },
  });
  let props = { seed: "", opcContext: { stylePrefix: "", duration: 5, aspect: "9:16", cameraMove: "", selectedParams: [] },
    remoteEnabled: true, onAuthRequired: noop, onSeedConsumed: noop, ...overrides };
  function render(patch = {}) { props = { ...props, ...patch }; cursor = 0; return exports.default(props); }
  function commit() { while (pendingEffects.length) pendingEffects.shift()(); }
  function flushTimers() { const scheduled = [...timers.values()]; timers.clear(); scheduled.forEach(fn => fn()); }
  function unmount() { mounted = false; hooks.filter(slot => slot.kind === "effect").forEach(slot => slot.cleanup?.()); }
  render(); commit();
  return { render, commit, flushTimers, unmount, bootstrap, modelReads, restores, writesAfterUnmount,
    state: () => hooks.filter(slot => slot.kind === "state").map(slot => slot.value) };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("unmount before startup timers creates no session or provider request", () => {
  const h = harness();
  h.unmount(); h.flushTimers();
  assert.equal(h.bootstrap.length, 0);
  assert.equal(h.modelReads.length, 0);
  assert.equal(h.restores.length, 0);
});

test("late session restoration cannot write state after unmount", async () => {
  const h = harness(); h.flushTimers();
  assert.equal(h.restores.length, 1);
  h.unmount();
  h.restores[0].resolve([{ id: "late-message", role: "assistant", content: "旧面板回复" }]);
  await settle();
  assert.equal(h.writesAfterUnmount.length, 0);
});

test("disabled remote mode discards an earlier provider response even when transport ignores cancellation", async () => {
  const h = harness(); h.flushTimers();
  assert.equal(h.modelReads.length, 1);
  const old = h.modelReads[0];
  h.render({ remoteEnabled: false }); h.commit(); h.flushTimers();
  old.resolve({ providers: [{ id: "stale-provider", name: "迟到配置", isActive: true }] });
  await settle();
  assert.ok(!JSON.stringify(h.state()).includes("stale-provider"));
  assert.equal(old.signal?.aborted, true);
  h.unmount();
});

test("a queued seed uses the latest controlled draft callback", () => {
  const oldCalls = [], newCalls = [];
  const h = harness({ seed: "参数种子", onDraftChange: value => oldCalls.push(value) });
  h.render({ onDraftChange: value => newCalls.push(value) }); h.commit(); h.flushTimers();
  assert.deepEqual(oldCalls, []);
  assert.deepEqual(newCalls, ["参数种子"]);
  h.unmount();
});
