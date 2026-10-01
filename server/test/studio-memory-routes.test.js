"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-memory-http-"));
process.env.STZH_DATA_DIR = root;
process.env.JWT_SECRET = "studio-memory-local-test-secret-32-characters";
const app = require("../server-express.js");
const db = require("../db.js");
const { createStudioMemoryStore } = require("../studio-memory-store.js");
let server, base, tokenA, tokenB;
const prefix = "/api/studio/memories";
async function request(route = "", method = "GET", body, token = tokenA) {
  const response = await fetch(base + prefix + route, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = response.status === 204 ? null : await response.json();
  return { status: response.status, body: value, cache: response.headers.get("cache-control") };
}
async function create(patch = {}, token = tokenA) {
  return request("", "POST", { requestKey: randomUUID(), mode: "assistant", content: "工业极简，保留负空间", ...patch }, token);
}
async function confirmed(patch = {}) {
  const result = await create(patch); assert.equal(result.status, 201);
  const saved = await request(`/${result.body.item.id}/confirm`, "POST", { expectedRevision: 1 }); assert.equal(saved.status, 200);
  return saved.body.item;
}

test("context status is authenticated, uncached and reports the effective rollout without enabling it", async () => {
  const previous = process.env.STZH_CONTEXT_MODE;
  try {
    assert.equal((await request("/context-status", "GET", undefined, null)).status, 401);
    for (const [setting, expected] of [[undefined,"shadow"],["invalid","shadow"],["off","off"],["shadow","shadow"],["enforce","enforce"]]) {
      if (setting === undefined) delete process.env.STZH_CONTEXT_MODE; else process.env.STZH_CONTEXT_MODE = setting;
      const result = await request("/context-status");
      assert.equal(result.status, 200); assert.equal(result.cache,"no-store");
      assert.deepEqual(result.body,{rollout:expected});
      assert.equal(process.env.STZH_CONTEXT_MODE,setting);
    }
  } finally { if (previous === undefined) delete process.env.STZH_CONTEXT_MODE; else process.env.STZH_CONTEXT_MODE = previous; }
});
test.before(async () => {
  // Test-only fault injection: commit deletion, then lose the successful reply.
  app.delete("/api/test-memory-delete-then-error/:id", (req, res) => {
    createStudioMemoryStore(db).remove(req.user.userId, req.params.id, req.body.expectedRevision);
    res.status(500).json({ error: { code: "SIMULATED_RESPONSE_FAILURE" } });
  });
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  async function register(username) {
    const res = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "local-test-password" }) });
    assert.equal(res.status, 200); return (await res.json()).token;
  }
  tokenA = await register("memory-owner"); tokenB = await register("memory-other");
  db.prepare("INSERT INTO creative_projects(id,user_id,name) VALUES('memory-pa',1,'A'),('memory-pb',2,'B')").run();
  db.opcCreateSession("memory-session", "Assistant", 1);
  db.opcCreateSession("opc_workflow_memory", "Workflow", 1);
  db.opcCreateSession("memory-other-session", "Other", 2);
  db.prepare("INSERT INTO conversations(id,user_id) VALUES('memory-coze',1)").run();
  db.prepare("INSERT INTO agent_runs(id,user_id,project_id,task) VALUES('memory-run',1,'memory-pa','local only')").run();
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve)); db.close();
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(root, { recursive: true, force: true });
});

test("memory API requires authentication and does not accept forged identity or verification", async () => {
  assert.equal((await request("", "GET", undefined, null)).status, 401);
  const staleToken = require("jsonwebtoken").sign({ userId: 999999 }, process.env.JWT_SECRET);
  assert.equal((await request("", "GET", undefined, staleToken)).status, 401);
  for (const patch of [{ ownerUserId: 2 }, { status: "confirmed" }, { verification: { state: "verified" } }, { confidence: 1 }]) assert.equal((await create(patch)).status, 400);
});

test("legacy compression HTTP preserves originals and summary API rechecks source ownership", async () => {
  db.opcCreateSession("summary-http", "Summary", 1);
  for(let i=0;i<4;i++)db.prepare("INSERT INTO opc_messages(id,session_id,role,content,timestamp) VALUES(?,'summary-http','user',?,?)").run(`summary-http-${i}`,`原文${i}，尚未批准`,i);
  const before=db.prepare("SELECT * FROM opc_messages WHERE session_id='summary-http' ORDER BY id").all();
  const response=await fetch(base+"/api/opc/sessions/summary-http/compress",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${tokenA}`},body:JSON.stringify({summary:"未核实的摘要",keepRecent:1})});
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.originalMessagesPreserved,true);assert.equal(result.item.verification,"unverified");
  assert.deepEqual(db.prepare("SELECT * FROM opc_messages WHERE session_id='summary-http' ORDER BY id").all(),before);
  const denied=await fetch(base+`/api/studio/summaries/${result.item.id}/sources`,{headers:{Authorization:`Bearer ${tokenB}`}});
  assert.equal(denied.status,404);
  const source=await fetch(base+`/api/studio/summaries/${result.item.id}/sources`,{headers:{Authorization:`Bearer ${tokenA}`}});
  assert.equal(source.status,200);assert.equal((await source.json()).items.length,3);
});

test("source edits revoke retrieval until explicit version review and reconfirmation", async () => {
  db.prepare("INSERT INTO opc_messages(id,session_id,role,content) VALUES('source-version-message','memory-session','user','工业极简，保留负空间')").run();
  const item = await confirmed({ source: { mode: "assistant", recordId: "source-version-message", sessionId: "memory-session" } });
  assert.match(item.source.fingerprint, /^[a-f0-9]{64}$/);
  const query = () => request("/search", "POST", { mode: "assistant", query: "工业极简", limit: 100 });
  assert.ok((await query()).body.selected.some(entry => entry.item.id === item.id));
  db.prepare("UPDATE opc_messages SET content='工业极简，但不再保留负空间' WHERE id='source-version-message'").run();
  const changed = await request(`/${item.id}`);
  assert.equal(changed.body.item.sourceState, "changed"); assert.equal(changed.body.item.sourceAvailable, false);
  assert.ok(!(await query()).body.selected.some(entry => entry.item.id === item.id));
  assert.equal((await request(`/${item.id}/confirm`, "POST", { expectedRevision: item.revision })).status, 404);
  assert.equal((await request(`/${item.id}/source`, "GET", undefined, tokenB)).status, 404);
  const preview = await request(`/${item.id}/source`);
  assert.match(preview.body.content, /不再保留/);
  // A second edit while the user reads must not be silently approved.
  db.prepare("UPDATE opc_messages SET content='工业极简，采用满版构图' WHERE id='source-version-message'").run();
  assert.equal((await request(`/${item.id}/refresh-source`, "POST", { expectedRevision: item.revision, expectedSourceFingerprint: preview.body.fingerprint })).status, 409);
  const latest = await request(`/${item.id}/source`);
  const reviewed = await request(`/${item.id}/refresh-source`, "POST", { expectedRevision: item.revision, expectedSourceFingerprint: latest.body.fingerprint });
  assert.equal(reviewed.status, 200); assert.equal(reviewed.body.item.status, "candidate");
  assert.equal(reviewed.body.item.verification.state, "unverified");
  assert.ok(!(await query()).body.selected.some(entry => entry.item.id === item.id));
  const edited = await request(`/${item.id}`, "PATCH", { expectedRevision: reviewed.body.item.revision, content: "工业极简，采用满版构图" });
  const final = await request(`/${item.id}/confirm`, "POST", { expectedRevision: edited.body.item.revision });
  assert.equal(final.status, 200); assert.ok((await query()).body.selected.some(entry => entry.item.id === item.id));
  assert.equal((await create({ source: { ...item.source } })).status, 400);
});

test("legacy source without a fingerprint requires review; manual memory remains usable", async () => {
  db.prepare("INSERT INTO opc_messages(id,session_id,role,content) VALUES('legacy-source-message','memory-session','user','工业极简')").run();
  const item = await confirmed({ source: { mode: "assistant", recordId: "legacy-source-message", sessionId: "memory-session" } });
  delete item.source.fingerprint;
  delete item.sourceAvailable; delete item.sourceState;
  db.prepare("UPDATE studio_memories SET item=? WHERE id=?").run(JSON.stringify(item), item.id);
  const result = await request(`/${item.id}`);
  assert.equal(result.body.item.sourceState, "untracked"); assert.equal(result.body.item.sourceAvailable, false);
  const manual = await confirmed();
  assert.equal(manual.sourceState, "manual"); assert.equal(manual.sourceAvailable, true);
});

test("different request keys consolidate only exact source versions without re-enabling or verifying", async () => {
  db.prepare("INSERT INTO opc_messages(id,session_id,role,content) VALUES('dedupe-source','memory-session','user','水墨负空间')").run();
  const base = { mode: "assistant", content: "水墨负空间", source: { mode: "assistant", recordId: "dedupe-source", sessionId: "memory-session" } };
  const bodies = ["dedupe-a", "dedupe-b"].map(requestKey => ({ ...base, requestKey }));
  const results = await Promise.all(bodies.map(body => request("", "POST", body)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  const item = results[0].body.item;
  assert.equal(item.id, results[1].body.item.id); assert.equal(item.status, "candidate");
  const disabled = await request(`/${item.id}`, "PATCH", { expectedRevision: item.revision, enabled: false });
  const repeated = await request("", "POST", { ...base, requestKey: "dedupe-c" });
  assert.equal(repeated.status, 200); assert.equal(repeated.body.item.enabled, false);
  assert.equal(repeated.body.item.verification.state, "unverified");
  const contrary = await request("", "POST", { ...base, requestKey: "dedupe-contrary", content: "水墨不要负空间" });
  assert.equal(contrary.status, 201); assert.notEqual(contrary.body.item.id, item.id);
  await request(`/${item.id}`, "DELETE", { expectedRevision: disabled.body.item.revision });
  for (const body of bodies) assert.equal((await request("", "POST", body)).status, 410);
});
test("create is candidate; explicit confirm allows retrieval without verifying a statement", async () => {
  const result = await create({ content: "记忆测试运行已完成", claimKind: "observation" });
  assert.equal(result.status, 201); const item = result.body.item;
  assert.equal(item.ownerUserId, 1); assert.equal(item.status, "candidate"); assert.equal(result.cache, "no-store");
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "记忆测试运行" })).body.selected.some(x => x.item.id === item.id), false);
  const confirm = await request(`/${item.id}/confirm`, "POST", { expectedRevision: 1 });
  assert.equal(confirm.body.item.revision, 2); assert.equal(confirm.body.item.verification.state, "unverified");
  const found = (await request("/search", "POST", { mode: "assistant", query: "记忆测试运行" })).body.selected.find(x => x.item.id === item.id);
  assert.equal(found.section, "Evidence");
});
test("idempotent create reuses one record and rejects same request key with different content", async () => {
  const input = { requestKey: randomUUID(), mode: "assistant", content: "幂等记忆" };
  const first = await request("", "POST", input), second = await request("", "POST", input);
  assert.equal(first.status, 201); assert.equal(second.status, 200); assert.equal(first.body.item.id, second.body.item.id);
  assert.equal((await request("", "POST", { ...input, content: "different" })).status, 409);
});
test("cross-account get, edit, confirm, delete and search remain isolated", async () => {
  const item = await confirmed();
  for (const [suffix, method, body] of [["", "GET"], ["", "PATCH", { expectedRevision: 2, content: "stolen" }], ["/confirm", "POST", { expectedRevision: 2 }], ["", "DELETE", { expectedRevision: 2 }]]) {
    assert.equal((await request(`/${item.id}${suffix}`, method, body, tokenB)).status, 404);
  }
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "工业极简" }, tokenB)).body.selected.length, 0);
});
test("edit invalidates confirmation; stale edit, confirm and deletion cannot overwrite latest revision", async () => {
  const item = await confirmed();
  const edited = await request(`/${item.id}`, "PATCH", { expectedRevision: 2, content: "改为水墨" });
  assert.equal(edited.body.item.revision, 3); assert.equal(edited.body.item.status, "candidate");
  for (const [suffix, method, body] of [["", "PATCH", { expectedRevision: 2, enabled: false }], ["/confirm", "POST", { expectedRevision: 2 }], ["", "DELETE", { expectedRevision: 2 }]]) assert.equal((await request(`/${item.id}${suffix}`, method, body)).status, 409);
  assert.equal((await request(`/${item.id}`)).body.item.content, "改为水墨");
});
test("disable removes a confirmed memory immediately; reenable and explicit current slot constraints work", async () => {
  const item = await confirmed({ content: "水墨山水", slot: "style" });
  await request(`/${item.id}`, "PATCH", { expectedRevision: 2, enabled: false });
  const query = { mode: "assistant", query: "水墨", limit: 100 };
  assert.equal((await request("/search", "POST", query)).body.selected.some(x => x.item.id === item.id), false);
  assert.equal((await request(`/${item.id}`, "PATCH", { expectedRevision: 3, enabled: true })).status, 200);
  assert.equal((await request("/search", "POST", query)).body.selected.some(x => x.item.id === item.id), true);
  assert.equal((await request("/search", "POST", { ...query, currentConstraints: { style: "工业极简" } })).body.selected.some(x => x.item.id === item.id), false);
});
test("delete removes content, export and retrieval; retrying its original save cannot resurrect it", async () => {
  const input = { requestKey: randomUUID(), mode: "assistant", content: "删除后不能恢复的星云记忆" };
  const result = await request("", "POST", input), item = result.body.item;
  assert.equal((await request(`/${item.id}`, "DELETE", { expectedRevision: 1 })).status, 204);
  assert.equal((await request(`/${item.id}`)).status, 404);
  assert.equal((await request("", "POST", input)).status, 410);
  assert.equal((await request("/export")).body.items.some(x => x.id === item.id), false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM studio_memories WHERE id=?").get(item.id).n, 0);
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "星云" })).body.selected.some(x => x.item.id === item.id), false);
});
test("project, session and run scopes require real ownership and mode; project is derived from run", async () => {
  for (const scope of [{ kind: "project", projectId: "memory-pb" }, { kind: "session", mode: "assistant", sessionId: "memory-other-session" }, { kind: "session", mode: "workflow", sessionId: "memory-session" }]) assert.equal((await create({ scope })).status, 404);
  const project = await confirmed({ scope: { kind: "project", projectId: "memory-pa" }, content: "机械臂项目背景" });
  const run = await request("/search", "POST", { mode: "collaboration", runId: "memory-run", query: "机械臂" });
  assert.equal(run.status, 200); assert.equal(run.body.selected.some(x => x.item.id === project.id), true);
  assert.equal((await request("/search", "POST", { mode: "assistant", projectId: "memory-pb", query: "机械臂" })).status, 404);
  for (const [mode, sessionId] of [["coze", "memory-coze"], ["assistant", "memory-session"], ["workflow", "opc_workflow_memory"]]) assert.equal((await create({ scope: { kind: "session", mode, sessionId } })).status, 201);
});
test("message sources are checked on write and each retrieval; deleted source can still be disabled/deleted", async () => {
  const messageId = db.opcAddMessage("memory-session", "user", "留白");
  const item = await confirmed({ content: "来源撤回测试留白", source: { mode: "assistant", sessionId: "memory-session", recordId: messageId } });
  assert.equal((await create({ source: { mode: "assistant", recordId: "made-up" } })).status, 404);
  db.prepare("DELETE FROM opc_messages WHERE id=?").run(messageId);
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "来源撤回", limit: 100 })).body.selected.some(x => x.item.id === item.id), false);
  assert.equal((await request(`/${item.id}`, "PATCH", { expectedRevision: 2, enabled: false })).status, 200);
  assert.equal((await request(`/${item.id}`, "DELETE", { expectedRevision: 3 })).status, 204);
});
test("working memory expires using the server clock and survives store reconstruction", async () => {
  let instant = "2026-09-28T08:00:00.000Z";
  const first = createStudioMemoryStore(db, { now: () => instant });
  const item = first.create(1, { requestKey: randomUUID(), mode: "assistant", content: "短期星云", kind: "working" }).item;
  first.confirm(1, item.id, 1);
  assert.equal(item.expiresAt, "2026-09-28T09:00:00.000Z");
  const rebuilt = createStudioMemoryStore(db, { now: () => instant });
  assert.equal(rebuilt.search(1, { mode: "assistant", query: "短期星云", limit: 100 }).selected.some(x => x.item.id === item.id), true);
  instant = "2026-09-28T09:00:00.000Z";
  assert.equal(rebuilt.search(1, { mode: "assistant", query: "短期星云", limit: 100 }).selected.some(x => x.item.id === item.id), false);
  assert.equal(rebuilt.get(1, item.id).content, item.content);
});
test("list cursor traverses all own records and export excludes other accounts", async () => {
  const other = await create({ content: "B private" }, tokenB);
  const all = (await request("/export")).body.items;
  const found = []; let after = "";
  do { const page = await request(`?limit=2&after=${encodeURIComponent(after)}`); assert.equal(page.status, 200); found.push(...page.body.items.map(x => x.id)); after = page.body.nextCursor; } while (after);
  assert.deepEqual(found, all.map(x => x.id)); assert.equal(found.includes(other.body.item.id), false);
});
test("invalid scope, time, sensitive text and read-only patch fields are rejected", async () => {
  for (const patch of [{ scope: null }, { expiresAt: "" }, { expiresAt: "not-time" }, { kind: "invented" }, { content: "x".repeat(4001) }, { content: "sk-" + "x".repeat(25) }]) assert.equal((await create(patch)).status, 400);
  const result = await create();
  assert.equal((await request(`/${result.body.item.id}`, "PATCH", { expectedRevision: 1, verification: { state: "verified" } })).status, 400);
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "x", ownerUserId: 2 })).status, 400);
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "x", currentConstraints: [] })).status, 400);
});
test("concurrent create and edits preserve idempotency and revision ownership", async () => {
  const body = { requestKey: randomUUID(), mode: "assistant", content: "并发保存" };
  const responses = await Promise.all([request("", "POST", body), request("", "POST", body)]);
  assert.deepEqual(responses.map(x => x.status).sort(), [200, 201]);
  const memoryId = responses[0].body.item.id; assert.equal(memoryId, responses[1].body.item.id);
  const edited = await Promise.all([request(`/${memoryId}`, "PATCH", { expectedRevision: 1, content: "第一版" }), request(`/${memoryId}`, "PATCH", { expectedRevision: 1, content: "第二版" })]);
  assert.deepEqual(edited.map(x => x.status).sort(), [200, 409]);
});
test("HTTP500 after committed delete is not deletion failure; authoritative reads prove removal", async () => {
  const input = { requestKey: randomUUID(), mode: "assistant", content: "事务删除故障注入" };
  const item = (await request("", "POST", input)).body.item;
  const response = await fetch(`${base}/api/test-memory-delete-then-error/${item.id}`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ expectedRevision: 1 }) });
  assert.equal(response.status, 500);
  assert.equal((await request(`/${item.id}`)).status, 404);
  assert.equal((await request("/search", "POST", { mode: "assistant", query: "事务删除故障" })).body.selected.length, 0);
  assert.equal((await request("", "POST", input)).status, 410);
});
test("request ledger and memory row roll back together on SQLite failure", () => {
  const store = createStudioMemoryStore(db);
  const before = db.prepare("SELECT COUNT(*) n FROM studio_memories").get().n;
  db.exec("CREATE TRIGGER memory_test_abort BEFORE INSERT ON studio_memory_requests BEGIN SELECT RAISE(ABORT,'simulated ledger failure'); END");
  try { assert.throws(() => store.create(1, { requestKey: randomUUID(), mode: "assistant", content: "不能留下半条保存" }), /simulated ledger failure/); }
  finally { db.exec("DROP TRIGGER memory_test_abort"); }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM studio_memories").get().n, before);
});
test("research artifact references must belong to the owned run and remain present", async () => {
  const { ResearchRuntime } = require("../research-runtime.js");
  const runtime = new ResearchRuntime({ db, tools: {}, model: () => { throw new Error("must not execute"); } });
  const run = runtime.createRun(1, { styleName: "测试", useCase: "只读来源" });
  const snapshot = { ...run, artifacts: [{ id: "memory-artifact-owned", content: "留白" }] };
  db.prepare("UPDATE research_runs SET snapshot=? WHERE id=?").run(JSON.stringify(snapshot), run.runId);
  const source = { mode: "workflow", recordId: run.runId, runId: run.runId, artifactIds: ["memory-artifact-owned"] };
  const item = await confirmed({ source, content: "产物来源留白" });
  assert.equal((await create({ source: { ...source, artifactIds: ["foreign-artifact"] } })).status, 404);
  assert.equal((await create({ source }, tokenB)).status, 404);
  db.prepare("UPDATE research_runs SET snapshot=? WHERE id=?").run(JSON.stringify(run), run.runId);
  assert.equal((await request("/search", "POST", { mode: "workflow", query: "产物来源", limit: 100 })).body.selected.some(x => x.item.id === item.id), false);
});
