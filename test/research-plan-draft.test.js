const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../app/lib/research-runtime/plan-draft.ts');
const plan = (revision = 1) => ({
  revision, objective: '风格研究', budget: 'standard', estimatedCalls: 2,
  steps: [
    { id: 'read', title: '读取资料', kind: 'tool', input: {}, dependsOn: [], enabled: true, optional: false, status: 'pending' },
    { id: 'extra', title: '补充检索', kind: 'tool', input: {}, dependsOn: [], enabled: false, optional: true, status: 'pending' },
    { id: 'write', title: '写报告', kind: 'model', input: {}, dependsOn: ['read'], enabled: true, optional: false, status: 'pending' },
  ],
});

test('malformed input blocks the entire save and preserves other valid edits', async () => {
  const { createPlanDraft, inspectPlanDraft, savePlanDraft } = await load();
  const draft = createPlanDraft(plan());
  draft.value.objective = '修改后的目标';
  draft.inputEdits.read = '{bad json';
  let calls = 0;
  await assert.rejects(savePlanDraft(draft, async () => { calls++; }), /读取资料.*JSON/);
  assert.equal(calls, 0);
  assert.equal(inspectPlanDraft(draft).pendingCount, 2);
  assert.equal(draft.value.objective, '修改后的目标');
  assert.equal(draft.inputEdits.read, '{bad json');
});

test('tool inputs require objects rather than valid JSON scalars, arrays or null', async () => {
  const { createPlanDraft, inspectPlanDraft } = await load();
  for (const input of ['null', '[]', '42', '"query"', 'true']) {
    const draft = createPlanDraft(plan()); draft.inputEdits.read = input;
    assert.equal(inspectPlanDraft(draft).errors.length, 1, input);
    assert.equal(inspectPlanDraft(draft).pendingCount, 1);
  }
});

test('equivalent tool JSON and merely expanding inputs do not create pending changes', async () => {
  const { createPlanDraft, inspectPlanDraft } = await load();
  const draft = createPlanDraft(plan());
  assert.equal(inspectPlanDraft(draft).pendingCount, 0);
  draft.inputEdits.read = '{  }';
  assert.equal(inspectPlanDraft(draft).pendingCount, 0);
});

test('consecutive moves reflect the current preview and reversing changes is a no-op', async () => {
  const { createPlanDraft, movePlanDraftStep, inspectPlanDraft } = await load();
  const initial = plan();
  let draft = createPlanDraft(initial);
  draft = movePlanDraftStep(draft, 'extra', 1);
  assert.deepEqual(draft.value.steps.map(s => s.id), ['read', 'write', 'extra']);
  const changes = inspectPlanDraft(draft);
  assert.equal(changes.errors.length, 0);
  const actual = initial.steps.map(s => s.id);
  for (const op of changes.operations.filter(op => op.type === 'move_step')) {
    const [id] = actual.splice(actual.indexOf(op.stepId), 1); actual.splice(op.toIndex, 0, id);
  }
  assert.deepEqual(actual, draft.value.steps.map(s => s.id));
  draft = movePlanDraftStep(draft, 'extra', -1);
  draft.value.steps.find(s => s.id === 'extra').enabled = true;
  assert.equal(inspectPlanDraft(draft).pendingCount, 1);
  draft.value.steps.find(s => s.id === 'extra').enabled = false;
  assert.equal(inspectPlanDraft(draft).pendingCount, 0);
  assert.equal(initial.steps[1].enabled, false);
});

test('dependency-breaking reorder and empty objective cannot be saved', async () => {
  const { createPlanDraft, movePlanDraftStep, savePlanDraft } = await load();
  let draft = createPlanDraft(plan());
  draft = movePlanDraftStep(movePlanDraftStep(draft, 'write', -1), 'write', -1);
  await assert.rejects(savePlanDraft(draft, async () => assert.fail('must not call API')), /依赖/);
  draft = createPlanDraft(plan()); draft.value.objective = '   ';
  await assert.rejects(savePlanDraft(draft, async () => assert.fail('must not call API')), /不能为空/);
});

test('server rejection propagates unchanged and leaves all draft buffers intact', async () => {
  const { createPlanDraft, savePlanDraft } = await load();
  const draft = createPlanDraft(plan());
  draft.value.budget = 'deep'; draft.inputEdits.read = '{"query":"蓝色"}';
  const before = structuredClone(draft);
  const failure = Object.assign(new Error('计划已更新'), { code: 'PLAN_REVISION_CONFLICT' });
  await assert.rejects(savePlanDraft(draft, async (revision, operations) => {
    assert.equal(revision, 1); assert.equal(operations.length, 2); throw failure;
  }), error => error === failure);
  assert.deepEqual(draft, before);
});

test('only an acknowledged save clears edits and advances the displayed revision', async () => {
  const { createPlanDraft, savePlanDraft, inspectPlanDraft, reconcilePlanDraft } = await load();
  const draft = createPlanDraft(plan()); draft.value.objective = '新目标';
  const acknowledged = { ...plan(2), objective: '新目标' };
  const saved = await savePlanDraft(draft, async () => acknowledged);
  assert.equal(saved.base.revision, 2);
  assert.equal(saved.value.objective, '新目标');
  assert.equal(inspectPlanDraft(saved).pendingCount, 0);
  assert.equal(reconcilePlanDraft(saved, plan(1)), saved, 'late polling snapshot must not revert saved revision');
});

test('new remote revisions refresh clean forms but never overwrite unsaved drafts', async () => {
  const { createPlanDraft, reconcilePlanDraft } = await load();
  const local = createPlanDraft(plan());
  const latest = { ...plan(2), objective: '其他窗口的修改' };
  assert.equal(reconcilePlanDraft(local, latest).value.objective, latest.objective);
  local.value.objective = '尚未保存的本地目标';
  assert.equal(reconcilePlanDraft(local, latest), local);
  assert.equal(local.base.revision, 1, 'pending edits must keep their original optimistic-lock revision');
});
