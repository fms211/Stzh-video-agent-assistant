const test = require('node:test');
const assert = require('node:assert/strict');

async function setup(t) {
  const previous = { window: global.window, localStorage: global.localStorage, fetch: global.fetch };
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete global[key]; else global[key] = value;
  } });
  let token = 'synthetic-account-a';
  global.window = { location: { protocol: 'http:', hostname: 'localhost', port: '18080', origin: 'http://localhost:18080' } };
  global.localStorage = { getItem: () => token };
  const rag = await import('../app/lib/rag-client.ts');
  const web = await import('../app/lib/web-search.ts');
  return { rag, web, switchAccount: () => { token = 'synthetic-account-b'; } };
}
const row = { id: 'ref-1', content: '共享知识资料', metadata: { source: 'curated.csv', kb_type: 'style' }, score: 0.8 };

test('both optional retrieval requests carry the current account credentials', async t => {
  const { rag, web } = await setup(t), calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(String(url).endsWith('/search') ? { provider: 'synthetic', results: [] } : { results: [row] });
  };
  const knowledge = await rag.ragRetrieve('检查账户鉴权的知识库', 5, 0.45, true);
  await web.searchWeb('检查账户鉴权的网络搜索');
  assert.deepEqual(knowledge, [row]);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.options.headers.Authorization, 'Bearer synthetic-account-a');
  assert.ok(calls.every(call => String(call.url).startsWith('http://localhost:18080/api/')));
});

test('legitimate empty results remain different from a failed knowledge service', async t => {
  const { rag } = await setup(t);
  global.fetch = async () => Response.json({ results: [] });
  const empty = await rag.ragRetrieveOutcome('知识库检索', 5, 0.45, true);
  assert.equal(empty.status, 'empty'); assert.match(empty.note, /未找到匹配/);
  for (const status of [401, 403, 502, 503]) {
    global.fetch = async () => Response.json({ error: { message: 'synthetic error' } }, { status });
    const result = await rag.ragRetrieveOutcome('知识库检索', 5, 0.45, true);
    assert.equal(result.status, 'unavailable'); assert.match(result.note, /暂不可用/);
    assert.deepEqual(result.results, []);
  }
});

test('malformed knowledge results are disclosed instead of reaching the formatter', async t => {
  const { rag } = await setup(t);
  for (const payload of [{}, { results: null }, { results: [{ ...row, metadata: null }] }, { results: [{ ...row, score: 'bad' }] }]) {
    global.fetch = async () => Response.json(payload);
    assert.equal((await rag.ragRetrieveOutcome('知识库检索', 5, 0.45, true)).status, 'invalid');
  }
  assert.match(rag.formatRagContext([row]), /共享知识库/);
});

test('search errors, unconfirmed provider and malformed references cannot masquerade as successful empty search', async t => {
  const { web } = await setup(t);
  for (const payload of [{ results: [], error: 'unreachable' }, { provider: 'none', results: [] }]) {
    global.fetch = async () => Response.json(payload);
    const result = await web.searchWebOutcome('公开资料');
    assert.equal(result.status, 'unavailable'); assert.ok(result.note);
  }
  global.fetch = async () => Response.json({ provider: 'synthetic', results: [] });
  assert.equal((await web.searchWebOutcome('公开资料')).status, 'empty');
  global.fetch = async () => Response.json({ results: [{ title: 'invalid', url: 'javascript:alert(1)', snippet: 'bad URL' }] });
  assert.equal((await web.searchWebOutcome('公开资料')).status, 'invalid');
});

test('account changes discard late knowledge and search references', async t => {
  const { rag, web, switchAccount } = await setup(t), resolve = [];
  global.fetch = () => new Promise(done => resolve.push(done));
  const pending = [rag.ragRetrieveOutcome('知识库检索', 5, 0.45, true), web.searchWebOutcome('网页资料')];
  switchAccount();
  resolve[0](Response.json({ results: [row] }));
  resolve[1](Response.json({ results: [{ title: 'A private draft', url: 'https://example.org', snippet: 'account A' }] }));
  for (const result of await Promise.all(pending)) {
    assert.equal(result.status, 'discarded'); assert.deepEqual(result.results, []);
  }
});

test('skipped requests and timeouts have explicit reference outcomes', async t => {
  const { rag, web } = await setup(t); let calls = 0;
  global.fetch = async () => { calls++; throw new DOMException('timeout', 'TimeoutError'); };
  assert.equal((await rag.ragRetrieveOutcome('谢谢')).status, 'skipped'); assert.equal(calls, 0);
  assert.equal((await rag.ragRetrieveOutcome('检索测试', 5, 0.45, true)).status, 'unavailable');
  assert.equal((await web.searchWebOutcome('搜索测试')).status, 'unavailable');
});

test('authenticated knowledge health reads the normalized service contract', async t => {
  const { rag } = await setup(t);
  global.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer synthetic-account-a');
    return Response.json({ ok: true, entries: 4 });
  };
  assert.deepEqual(await rag.ragHealthCheck(), { ok: true, entries: 4 });
});

test('structured proxy errors retain invalid-reference and unconfirmed-search explanations', async t => {
  const { rag, web } = await setup(t);
  global.fetch = async () => Response.json({ error: { code: 'RAG_RESPONSE_INVALID', message: 'invalid data' } }, { status: 502 });
  assert.equal((await rag.ragRetrieveOutcome('知识库检索', 5, 0.45, true)).status, 'invalid');
  global.fetch = async () => Response.json({ error: { code: 'SEARCH_UNCONFIRMED', message: 'no provider evidence' } }, { status: 503 });
  assert.match((await web.searchWebOutcome('网页检索')).note, /未提供可核验资料/);
});
