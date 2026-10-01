"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const output = path.resolve(__dirname, "../../output/stage4");
fs.mkdirSync(output, { recursive: true });
process.env.STZH_DATA_DIR = fs.mkdtempSync(path.join(output, "retrieval-test-"));
process.env.JWT_SECRET = "retrieval-route-synthetic-secret-more-than-32-characters";
process.env.STZH_RAG_URL = "http://127.0.0.1:15999";
const app = require("../app.js"), db = require("../db.js");
let server, base, token, calls = 0;
async function request(route, body, auth = token) {
  const response = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
}
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await request("/api/auth/register", { username: "retrieval-owner", password: "synthetic-password-123" }, null)).body.token;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
const row = { id: "shared-1", content: "公开共享知识", metadata: { source: "shared.csv", kb_type: "style" }, score: 0.8 };

test("all reference endpoints require authentication before any upstream request", async () => {
  calls = 0;
  app.locals.referenceFetch = async () => { calls++; return Response.json({ results: [] }); };
  app.locals.referenceSearch = async () => { calls++; return { provider: "fixture", results: [] }; };
  for (const [route, body] of [["/api/rag/retrieve", { query: "测试" }], ["/api/search", { query: "测试" }], ["/api/rag/health", undefined]]) {
    assert.equal((await request(route, body, null)).status, 401);
  }
  assert.equal(calls, 0);
});

test("RAG uses configured backend address, preserves zero threshold and declares shared scope", async () => {
  app.locals.referenceFetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:15999/rag/retrieve");
    assert.deepEqual(JSON.parse(options.body), { query: "共享知识", top_k: 1, score_threshold: 0 });
    assert.equal(options.headers.Authorization, undefined, "account token must not be forwarded to Python");
    return Response.json({ results: [row, { ...row, id: "shared-2" }] });
  };
  const response = await request("/api/rag/retrieve", { query: " 共享知识 ", top_k: 1, score_threshold: 0 });
  assert.equal(response.status, 200); assert.equal(response.cache, "no-store");
  assert.deepEqual(response.body, { results: [row], query: "共享知识", total: 1, scope: "shared" });
});

test("invalid reference inputs fail without spending upstream calls", async () => {
  app.locals.referenceFetch = async () => assert.fail("invalid request reached Python");
  app.locals.referenceSearch = async () => assert.fail("invalid request reached search engines");
  for (const body of [{}, { query: 2 }, { query: " " }, { query: "测试", top_k: 0 }, { query: "测试", score_threshold: 1.1 }]) {
    assert.equal((await request("/api/rag/retrieve", body)).status, 400);
  }
  assert.equal((await request("/api/search", { query: {} })).status, 400);
});

test("empty knowledge success, upstream failure, invalid payload and unavailable transport stay distinct", async () => {
  app.locals.referenceFetch = async () => Response.json({ results: [] });
  assert.equal((await request("/api/rag/retrieve", { query: "无匹配" })).status, 200);
  app.locals.referenceFetch = async () => Response.json({ error: "sensitive upstream diagnostic" }, { status: 500 });
  const upstream = await request("/api/rag/retrieve", { query: "测试" });
  assert.equal(upstream.status, 502); assert.equal(upstream.body.error.code, "RAG_UPSTREAM_ERROR");
  assert.doesNotMatch(JSON.stringify(upstream.body), /sensitive/);
  for (const payload of [{}, { results: [null] }, { results: [{ ...row, metadata: null }] }]) {
    app.locals.referenceFetch = async () => Response.json(payload);
    assert.equal((await request("/api/rag/retrieve", { query: "测试" })).body.error.code, "RAG_RESPONSE_INVALID");
  }
  app.locals.referenceFetch = async () => { throw new Error("synthetic refused connection"); };
  const offline = await request("/api/rag/retrieve", { query: "测试" });
  assert.equal(offline.status, 503); assert.equal(offline.body.error.code, "RAG_UNAVAILABLE");
});

test("knowledge health normalizes Python status and refuses malformed or unready values", async () => {
  app.locals.referenceFetch = async url => { assert.equal(url, "http://127.0.0.1:15999/rag/health"); return Response.json({ status: "ok", entries: 3 }); };
  assert.deepEqual((await request("/api/rag/health")).body, { ok: true, entries: 3, scope: "shared" });
  app.locals.referenceFetch = async () => Response.json({ status: "loading", entries: 0 });
  assert.equal((await request("/api/rag/health")).status, 503);
  app.locals.referenceFetch = async () => Response.json({ status: "ok", entries: "unknown" });
  assert.equal((await request("/api/rag/health")).status, 502);
});

test("search discloses unconfirmed providers and failures while preserving legitimate empty and available results", async () => {
  app.locals.referenceSearch = async () => ({ provider: "none", results: [] });
  const unconfirmed = await request("/api/search", { query: "公开资料" });
  assert.equal(unconfirmed.status, 503); assert.equal(unconfirmed.body.error.code, "SEARCH_UNCONFIRMED");
  app.locals.referenceSearch = async () => { throw new Error("synthetic unavailable"); };
  assert.equal((await request("/api/search", { query: "公开资料" })).body.error.code, "SEARCH_UNAVAILABLE");
  app.locals.referenceSearch = async () => ({ results: null });
  assert.equal((await request("/api/search", { query: "公开资料" })).status, 502);
  app.locals.referenceSearch = async () => ({ provider: "fixture", results: [] });
  assert.equal((await request("/api/search", { query: "公开资料" })).status, 200);
  const results = [{ title: "合成来源", url: "https://example.org/ref", snippet: "HTTP fixture" }];
  app.locals.referenceSearch = async () => ({ provider: "fixture", results });
  assert.deepEqual((await request("/api/search", { query: "公开资料" })).body.results, results);
});
