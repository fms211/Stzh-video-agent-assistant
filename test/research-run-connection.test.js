const test = require('node:test');
const assert = require('node:assert/strict');

const tick = () => new Promise(resolve => setImmediate(resolve));
const snapshot = (lastSeq, status = 'running') => ({
  runId: 'one', lastSeq, status, plan: null, sources: [], artifacts: [],
  metrics: { completedSteps: 0, totalSteps: 0, sourceCount: 0, modelCalls: 0, toolCalls: 0 },
  error: null,
});
const event = (seq, status = 'running') => ({
  version: 1, runId: 'one', seq, type: 'run.started', occurredAt: '2026-09-27T00:00:00Z',
  payload: { snapshot: snapshot(seq, status) },
});

async function fixture(getRun) {
  const { createResearchRunConnection } = await import('../app/lib/research-runtime/run-connection.ts');
  const subscriptions = [];
  const adapter = {
    getRun,
    subscribe(id, cursor, handlers) {
      const sub = { id, cursor, ...handlers, closed: false, close() { this.closed = true; } };
      subscriptions.push(sub);
      return sub;
    },
  };
  return { connection: createResearchRunConnection(adapter, 'one'), subscriptions };
}

test('restores historical trajectory without rolling back the current snapshot or duplicating events', async t => {
  const { connection, subscriptions } = await fixture(async () => snapshot(3, 'completed'));
  t.after(() => connection.close());
  connection.connect(); await tick();
  assert.equal(subscriptions[0].cursor, 0);
  for (const seq of [1, 2, 2, 3]) subscriptions[0].onEvent(event(seq));
  assert.equal(connection.getSnapshot().snapshot.status, 'completed');
  assert.deepEqual(connection.getSnapshot().events.map(e => e.seq), [1, 2, 3]);
});

test('a gap replaces the subscription at the fresh cursor and accepts the following event', async t => {
  let calls = 0;
  const { connection, subscriptions } = await fixture(async () => snapshot(++calls === 1 ? 2 : 5));
  t.after(() => connection.close());
  connection.connect(); await tick();
  subscriptions[0].onEvent(event(1));
  subscriptions[0].onEvent(event(2));
  subscriptions[0].onEvent(event(4));
  assert.equal(subscriptions[0].closed, true);
  await tick();
  assert.equal(subscriptions[1].cursor, 5);
  subscriptions[0].onEvent(event(9, 'cancelled')); // late callback from replaced stream
  subscriptions[1].onEvent(event(6, 'completed'));
  assert.equal(calls, 2);
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 6);
  assert.equal(connection.getSnapshot().snapshot.status, 'completed');
  assert.deepEqual(connection.getSnapshot().events.map(e => e.seq), [1, 2, 6]);
});

test('failed initial loading can retry and does not leave the page permanently loading', async t => {
  let calls = 0;
  const { connection, subscriptions } = await fixture(async () => {
    if (++calls === 1) throw new Error('offline');
    return snapshot(0);
  });
  t.after(() => connection.close());
  connection.connect(); await tick();
  assert.equal(connection.getSnapshot().syncing, false);
  assert.equal(connection.getSnapshot().error, 'offline');
  assert.equal(subscriptions.length, 0);
  await connection.refresh();
  assert.equal(connection.getSnapshot().error, '');
  assert.equal(subscriptions.length, 1);
});

test('failed resync preserves the last valid state and retries from the new sequence', async t => {
  let calls = 0;
  const { connection, subscriptions } = await fixture(async () => {
    if (++calls === 2) throw new Error('network lost');
    return snapshot(calls === 1 ? 1 : 4);
  });
  t.after(() => connection.close());
  connection.connect(); await tick();
  subscriptions[0].onEvent(event(1));
  subscriptions[0].onEvent(event(3));
  await tick();
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 1);
  assert.equal(connection.getSnapshot().error, 'network lost');
  await connection.refresh();
  assert.equal(subscriptions[1].cursor, 4);
  subscriptions[1].onEvent(event(5, 'completed'));
  assert.equal(connection.getSnapshot().snapshot.status, 'completed');
});

test('closing or replacing a pending read prevents stale results from reopening a subscription', async () => {
  const reads = [];
  const { connection, subscriptions } = await fixture(() => new Promise(resolve => reads.push(resolve)));
  connection.connect();
  const retry = connection.refresh();
  reads[1](snapshot(2)); await retry;
  reads[0](snapshot(1)); await tick();
  assert.equal(subscriptions.length, 1);
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 2);
  const pending = connection.refresh();
  connection.close();
  reads[2](snapshot(7)); await pending;
  subscriptions[0].onEvent(event(8, 'cancelled'));
  assert.equal(subscriptions.length, 1);
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 2);
});

test('foreign run events and inconsistent embedded snapshots cannot replace this run', async t => {
  const { connection, subscriptions } = await fixture(async () => snapshot(0));
  t.after(() => connection.close());
  connection.connect(); await tick();
  subscriptions[0].onEvent({ ...event(1), runId: 'other' });
  const invalid = event(1); invalid.payload.snapshot.runId = 'other';
  subscriptions[0].onEvent(invalid);
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 0);
  assert.match(connection.getSnapshot().error, /不一致/);
  subscriptions[0].onEvent(event(1));
  assert.equal(connection.getSnapshot().error, '');
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 1);
});

test('events without embedded snapshots use the shared projector including metrics', async t => {
  const { connection, subscriptions } = await fixture(async () => snapshot(0));
  t.after(() => connection.close());
  connection.connect(); await tick();
  subscriptions[0].onEvent({ ...event(1), type: 'metrics.updated', payload: { metrics: { modelCalls: 4 } } });
  assert.equal(connection.getSnapshot().snapshot.metrics.modelCalls, 4);
  subscriptions[0].onError(new Error('temporary'));
  subscriptions[0].onEvent({ ...event(2), type: 'run.completed', payload: {} });
  assert.equal(connection.getSnapshot().snapshot.status, 'completed');
  assert.equal(connection.getSnapshot().error, '');
});

test('a synchronous replay gap closes the returned stale handle and reconnects cleanly', async t => {
  const { createResearchRunConnection } = await import('../app/lib/research-runtime/run-connection.ts');
  let reads = 0;
  const subscriptions = [];
  const adapter = {
    getRun: async () => snapshot(++reads === 1 ? 1 : 3),
    subscribe(id, cursor, handlers) {
      const sub = { cursor, ...handlers, closed: false, close() { this.closed = true; } };
      subscriptions.push(sub);
      if (subscriptions.length === 1) handlers.onEvent(event(3));
      return sub;
    },
  };
  const connection = createResearchRunConnection(adapter, 'one');
  t.after(() => connection.close());
  connection.connect(); await tick();
  assert.equal(subscriptions.length, 2);
  assert.equal(subscriptions[0].closed, true);
  assert.equal(subscriptions[1].cursor, 3);
  subscriptions[1].onEvent(event(4, 'completed'));
  assert.equal(connection.getSnapshot().snapshot.status, 'completed');
});

test('effect cleanup and reconnect invalidate the first pending load', async t => {
  let finishFirst;
  let calls = 0;
  const { connection, subscriptions } = await fixture(() => ++calls === 1
    ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve(snapshot(2)));
  t.after(() => connection.close());
  connection.connect(); connection.close(); connection.connect(); await tick();
  finishFirst(snapshot(1)); await tick();
  assert.equal(connection.isActive(), true);
  assert.equal(subscriptions.length, 1);
  assert.equal(connection.getSnapshot().snapshot.lastSeq, 2);
});

test('manual reconnect backfills events written during an outage without rolling back the snapshot', async t => {
  let calls = 0;
  const { connection, subscriptions } = await fixture(async () => snapshot(++calls === 1 ? 1 : 3, 'completed'));
  t.after(() => connection.close());
  connection.connect(); await tick();
  subscriptions[0].onEvent(event(1));
  subscriptions[0].onError(new Error('offline'));
  await connection.refresh();
  assert.equal(subscriptions[1].cursor, 1);
  subscriptions[1].onEvent(event(2));
  assert.equal(connection.getSnapshot().snapshot.status, 'completed');
  subscriptions[1].onEvent(event(3, 'completed'));
  assert.deepEqual(connection.getSnapshot().events.map(e => e.seq), [1, 2, 3]);
});
