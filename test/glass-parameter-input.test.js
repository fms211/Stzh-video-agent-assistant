const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real field callbacks. Dialog appearance is checked in the browser.
function fieldHarness(value = 21, field = { label: '圆角', key: 'borderRadius', min: 0, max: 100, step: 1, hint: '' }) {
  let draft;
  const changes = [];
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const source = fs.readFileSync(path.resolve(__dirname, '../app/components/GlassSurfaceSettingsPanel.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code + '\nmodule.exports.ParameterField = ParameterField;', {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return { useId: () => 'field', useEffect: () => {}, useState(initial) { if (draft === undefined) draft = initial; return [draft, next => { draft = next; }]; } };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name.endsWith('glass-surface-settings')) return {};
      throw new Error('Unexpected dependency ' + name);
    },
  });
  function findNumber(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'input' && node.props.type === 'number') return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) { const found = findNumber(child); if (found) return found; }
    return null;
  }
  const input = () => findNumber(module.exports.ParameterField({ field, value, onChange: next => changes.push(next) })).props;
  return { changes, input, type(text) { input().onChange({ currentTarget: { value: text } }); }, setValue(next) { value = next; }, get draft() { return draft; } };
}
function key(value) {
  return { key: value, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}
test('leaving an unchanged numeric field does not dirty the settings', () => {
  const h = fieldHarness(); h.input().onBlur(); assert.deepEqual(h.changes, []);
  h.type('21.0'); h.input().onBlur(); assert.deepEqual(h.changes, []); assert.equal(h.draft, '21');
});
test('Enter previews a valid draft and clamps it to the control limits', () => {
  const h = fieldHarness(); h.type('150'); const event = key('Enter'); h.input().onKeyDown(event);
  assert.deepEqual(h.changes, [100]); assert.equal(h.draft, '100'); assert.ok(event.prevented && event.stopped);
});
test('Escape retains an unfinished edit before native modal cancellation', () => {
  const h = fieldHarness(); h.type('22'); const event = key('Escape'); h.input().onKeyDown(event);
  assert.deepEqual(h.changes, [22]); assert.ok(event.prevented && event.stopped);
  h.setValue(22); const next = key('Escape'); h.input().onKeyDown(next);
  assert.equal(next.prevented, false); assert.deepEqual(h.changes, [22]);
});
test('Escape on an unchanged field remains available to close the modal', () => {
  const h = fieldHarness(); const event = key('Escape'); h.input().onKeyDown(event);
  assert.equal(event.prevented, false); assert.equal(event.stopped, false); assert.deepEqual(h.changes, []);
});
test('blank and invalid drafts restore the applied value without publishing NaN', () => {
  for (const text of ['', ' ', 'invalid']) { const h = fieldHarness(); h.type(text); h.input().onBlur(); assert.deepEqual(h.changes, []); assert.equal(h.draft, '21'); }
});
test('decimal controls round at their defined step without floating point noise', () => {
  const h = fieldHarness(0.34, { label: '底色', key: 'backgroundOpacity', min: 0, max: 1, step: 0.01, hint: '' });
  h.type('0.356'); h.input().onBlur(); assert.deepEqual(h.changes, [0.36]); assert.equal(h.draft, '0.36');
});
