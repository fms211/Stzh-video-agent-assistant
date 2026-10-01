"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const httpFetch = global.fetch;

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
const jsonRequest = (route, token, method, body) => request(route, { method, headers: authHeaders(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-creative-agent-"));
process.env.STZH_DATA_DIR = testDataDir;
process.env.JWT_SECRET = "creative-agent-test-secret-with-at-least-32-characters";
process.env.STZH_LLM_ENCRYPTION_KEY = "creative-agent-test-encryption-key-with-at-least-32-characters";

const app = require("../server-express.js");
const db = require("../db.js");

let server;
let baseUrl;
let tokenA;
let tokenB;

async function request(route, options = {}) {
  const response = await httpFetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function register(username) {
  const { response, body } = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password: "test-password", displayName: username }),
  });
  assert.equal(response.status, 200);
  return body.token;
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  tokenA = await register("creative-owner");
  tokenB = await register("creative-intruder");
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("model capacity persists through partial edits and rejects oversize input before provider access", async () => {
  const payload = { name: "Capacity fixture", protocol: "openai", baseUrl: "https://capacity.invalid/v1", model: "fixture", apiKey: "synthetic-capacity-key", contextWindowTokens: 2048, maxOutputTokens: 512, safetyMarginTokens: 256, outputTokenParameter: "max_completion_tokens" };
  const created = await jsonRequest("/api/model-providers", tokenA, "POST", payload);
  assert.equal(created.response.status, 201);
  const id = created.body.provider.id;
  const updated = await jsonRequest(`/api/model-providers/${id}`, tokenA, "PUT", { makeActive: true });
  assert.equal(updated.body.provider.contextWindowTokens, 2048);
  assert.equal(updated.body.provider.maxOutputTokens, 512);
  const invalid = await jsonRequest(`/api/model-providers/${id}`, tokenA, "PUT", { maxOutputTokens: 2048 });
  assert.equal(invalid.response.status, 400);
  const originalFetch = global.fetch; let calls = 0, wire;
  global.fetch = async (_url, options) => { calls++; wire = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: "fixture reply" } }] }), { status: 200 }); };
  try {
    const oversized = await jsonRequest("/api/model/chat", tokenA, "POST", { providerId: id, messages: [{ role: "user", content: "完整输入".repeat(500) }] });
    assert.equal(oversized.response.status, 413); assert.equal(calls, 0);
    const accepted = await jsonRequest("/api/model/chat", tokenA, "POST", { providerId: id, messages: [{ role: "user", content: "hello" }] });
    assert.equal(accepted.response.status, 200); assert.equal(calls, 1);
    assert.equal(wire.max_completion_tokens, 512); assert.equal(wire.max_tokens, undefined);
  } finally { global.fetch = originalFetch; await jsonRequest(`/api/model-providers/${id}`, tokenA, "DELETE"); }
});

test("model center encrypts a submitted key and never returns it", async () => {
  const key = "sk-private-model-key";
  const created = await request("/api/model-providers", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "Test model",
      protocol: "openai",
      baseUrl: "https://model.invalid/v1",
      model: "test-model",
      apiKey: key,
      makeActive: true,
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.provider.hasSecret, true);
  assert.equal(Object.hasOwn(created.body.provider, "apiKey"), false);

  const listed = await request("/api/model-providers", { headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.providers.length, 1);
  assert.equal(JSON.stringify(listed.body).includes(key), false);

  const raw = db.prepare("SELECT config, secret FROM llm_providers WHERE id = ?").get(created.body.provider.id);
  assert.equal(raw.config.includes(key), false);
  assert.notEqual(raw.secret, key);

  const foreign = await request("/api/model-providers", { headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(foreign.response.status, 200);
  assert.equal(foreign.body.providers.length, 0);
});

test("model provider rejects private network targets unless the operator explicitly opts in", async () => {
  const previous = process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
  delete process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
  try {
    const response = await request("/api/model-providers", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: "Unsafe local target",
        protocol: "openai",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "local-model",
        apiKey: "local-secret",
      }),
    });
    assert.equal(response.response.status, 400);
    assert.match(response.body.error.message, /STZH_ALLOW_PRIVATE_MODEL_URLS/);
  } finally {
    if (previous === undefined) delete process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
    else process.env.STZH_ALLOW_PRIVATE_MODEL_URLS = previous;
  }
});

test("legacy LLM compatibility endpoints also redact any historical apiKey", async () => {
  const key = "sk-legacy-key-must-not-leak";
  let result = await request("/api/llm/providers", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      id: "legacy-provider",
      isActive: false,
      config: { name: "legacy", protocol: "openai", baseUrl: "https://legacy.invalid", model: "legacy", apiKey: key },
    }),
  });
  assert.equal(result.response.status, 200);
  result = await request("/api/llm/providers", { headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(result.response.status, 200);
  assert.equal(JSON.stringify(result.body).includes(key), false);
  assert.equal(result.body.providers.find((provider) => provider.id === "legacy-provider").config.apiKey, undefined);
});

test("roles and agent runs are private to the authenticated account", async () => {
  const role = await request("/api/agent-roles", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "批判审校",
      prompt: "审查产物的约束、遗漏与风险。",
      capabilities: ["review"],
    }),
  });
  assert.equal(role.response.status, 201);

  const project = await request("/api/creative-projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: "春季创作" }),
  });
  assert.equal(project.response.status, 201);

  const run = await request("/api/agent-runs", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ projectId: project.body.project.id, task: "为短片制定创意方向", budget: "standard" }),
  });
  assert.equal(run.response.status, 201);
  assert.equal(run.body.run.status, "draft");

  const deniedRole = await request(`/api/agent-roles/${role.body.role.id}`, { headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(deniedRole.response.status, 404);
  const deniedRun = await request(`/api/agent-runs/${run.body.run.id}`, { headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(deniedRun.response.status, 404);
});

test("a confirmed edited instruction creates exactly one reliable task instead of a false Coze delivery", async () => {
  const project = await request("/api/creative-projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: "确认流程" }),
  });
  const run = await request("/api/agent-runs", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ projectId: project.body.project.id, task: "生成一段最终指令", budget: "economy" }),
  });
  const finalized = await request(`/api/agent-runs/${run.body.run.id}/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ finalInstruction: "请按胶片质感生成 15 秒城市开场。", rationale: "与短片主题一致" }),
  });
  assert.equal(finalized.response.status, 200);
  assert.equal(finalized.body.run.status, "awaiting_confirmation");
  assert.equal(finalized.body.run.cozeDeliveredAt, null);

  const confirmed = await request(`/api/agent-runs/${run.body.run.id}/confirm-coze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ finalInstruction: "请按最终人工修改的镜头节奏生成 15 秒城市开场。" }),
  });
  assert.equal(confirmed.response.status, 201);
  assert.equal(confirmed.body.run.status, "queued");
  assert.equal(confirmed.body.run.finalInstruction, "请按最终人工修改的镜头节奏生成 15 秒城市开场。");
  assert.equal(confirmed.body.run.cozeDeliveredAt, null);
  assert.ok(confirmed.body.run.taskId);
  assert.equal(confirmed.body.task.id, confirmed.body.run.taskId);
  assert.equal(confirmed.body.task.status, "queued");
  assert.equal(confirmed.body.task.input.prompt, confirmed.body.run.finalInstruction);

  const repeated = await request(`/api/agent-runs/${run.body.run.id}/confirm-coze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ finalInstruction: "请按最终人工修改的镜头节奏生成 15 秒城市开场。" }),
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.task.id, confirmed.body.task.id);
  assert.equal(
    db.prepare("SELECT COUNT(*) count FROM tasks WHERE user_id = ? AND idempotency_key = ?")
      .get(1, `agent-run:${run.body.run.id}`).count,
    1,
  );
});

test("lost confirmation response is resolved by reading the committed task and retrying without duplicate delivery", async () => {
  const project = (await jsonRequest("/api/creative-projects", tokenA, "POST", { name: "Lost response fixture" })).body.project;
  const run = (await jsonRequest("/api/agent-runs", tokenA, "POST", { projectId: project.id, task: "Synthetic approval", budget: "economy" })).body.run;
  const finalInstruction = "Synthetic instruction; runtime disabled in this test";
  assert.equal((await jsonRequest(`/api/agent-runs/${run.id}/finalize`, tokenA, "POST", { finalInstruction })).response.status, 200);
  const route = `/api/agent-runs/${run.id}/confirm-coze`;
  const originalFetch = global.fetch;
  const priorRuntime = app.locals.taskRuntime;
  let lost = false, committedTaskId = null, calls = 0;
  global.fetch = async () => { calls++; throw new Error("External calls forbidden in fault fixture"); };
  app.locals.taskRuntime = { wake() {} };
  const dropReply = (req, res) => {
    if (req.method !== "POST" || req.url !== route || lost) return;
    res.end = function () {
      const row = db.prepare("SELECT status,task_id FROM agent_runs WHERE id=?").get(run.id);
      if (row?.status === "queued") committedTaskId = row.task_id;
      lost = true;
      // Destroy the socket after Express has built the reply, before any body
      // is sent. The SQLite transaction has already committed at this point.
      res.destroy();
      return res;
    };
  };
  server.prependListener("request", dropReply);
  try {
    await assert.rejects(jsonRequest(route, tokenA, "POST", { finalInstruction, expectedFinalInstruction: finalInstruction }));
    assert.equal(lost, true); assert.ok(committedTaskId);
    const observed = await jsonRequest(`/api/agent-runs/${run.id}`, tokenA, "GET");
    assert.equal(observed.body.run.status, "queued");
    assert.equal(observed.body.run.taskId, committedTaskId);
    assert.equal(observed.body.run.cozeDeliveredAt, null);
    const repeated = await jsonRequest(route, tokenA, "POST", { finalInstruction, expectedFinalInstruction: finalInstruction });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.body.created, false);
    assert.equal(repeated.body.task.id, committedTaskId);
    assert.equal(repeated.body.task.status, "queued");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE idempotency_key=?").get(`agent-run:${run.id}`).n, 1);
    assert.equal(observed.body.events.filter(event => event.type === "task.queued").length, 1);
    assert.equal((await jsonRequest(route, tokenB, "POST", { finalInstruction })).response.status, 404);
    assert.equal(calls, 0);
  } finally {
    server.removeListener("request", dropReply);
    global.fetch = originalFetch;
    app.locals.taskRuntime = priorRuntime;
  }
});

test("concurrent start requests claim one run exactly once before spending model calls", async () => {
  const provider = await request("/api/model-providers", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "Concurrent mock",
      protocol: "openai",
      baseUrl: "https://model.invalid/v1",
      model: "mock-model",
      apiKey: "sk-concurrent-mock",
      makeActive: true,
    }),
  });
  assert.equal(provider.response.status, 201);
  const project = await request("/api/creative-projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: "并发启动" }),
  });
  const run = await request("/api/agent-runs", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ projectId: project.body.project.id, task: "并发只执行一次", budget: "economy" }),
  });

  const originalFetch = global.fetch;
  let releaseFirst;
  let firstStartedResolve;
  let upstreamCalls = 0;
  const firstStarted = new Promise((resolve) => { firstStartedResolve = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  global.fetch = async () => {
    upstreamCalls += 1;
    if (upstreamCalls === 1) {
      firstStartedResolve();
      await firstGate;
    }
    return Response.json({ choices: [{ message: { content: "mock specialist output" } }] });
  };
  try {
    const first = request(`/api/agent-runs/${run.body.run.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({}),
    });
    await firstStarted;
    const duplicate = await request(`/api/agent-runs/${run.body.run.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({}),
    });
    assert.equal(duplicate.response.status, 409);
    releaseFirst();
    const completed = await first;
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.run.status, "awaiting_confirmation");
    assert.ok(upstreamCalls > 0);
  } finally {
    releaseFirst?.();
    global.fetch = originalFetch;
  }
});


test("provider edits preserve omitted secrets, invalidate changed connections, and support explicit default removal", async () => {
  const headers={Authorization:`Bearer ${tokenA}`};
  const created=await request("/api/model-providers",{method:"POST",headers,body:JSON.stringify({name:"Editable",protocol:"openai",baseUrl:"https://editable.invalid/v1",model:"old",apiKey:"synthetic-edit-secret",makeActive:true})});
  const id=created.body.provider.id;
  const rawBefore=db.prepare("SELECT * FROM llm_providers WHERE id=?").get(id);
  db.prepare("UPDATE llm_providers SET verified_at=123 WHERE id=?").run(id);
  const renamed=await request(`/api/model-providers/${id}`,{method:"PUT",headers,body:JSON.stringify({name:"Renamed",apiKey:"",makeActive:false})});
  assert.equal(renamed.response.status,200);assert.equal(renamed.body.provider.verifiedAt,123);assert.equal(renamed.body.provider.isActive,false);
  assert.equal(db.prepare("SELECT secret FROM llm_providers WHERE id=?").get(id).secret,rawBefore.secret);
  const changed=await request(`/api/model-providers/${id}`,{method:"PUT",headers,body:JSON.stringify({model:"new",makeActive:true})});
  assert.equal(changed.body.provider.verifiedAt,null);assert.equal(changed.body.provider.isActive,true);
  const ownerId=rawBefore.user_id;
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM llm_providers WHERE user_id=? AND is_active=1").get(ownerId).count,1);
  db.prepare("UPDATE llm_providers SET verified_at=123 WHERE id=?").run(id);
  const replaced=await request(`/api/model-providers/${id}`,{method:"PUT",headers,body:JSON.stringify({apiKey:"synthetic-replacement"})});
  assert.equal(replaced.body.provider.verifiedAt,null);assert.notEqual(db.prepare("SELECT secret FROM llm_providers WHERE id=?").get(id).secret,rawBefore.secret);
  assert.ok(!JSON.stringify(replaced.body).includes("synthetic-replacement"));
  assert.equal((await request(`/api/model-providers/${id}`,{method:"PUT",headers:{Authorization:`Bearer ${tokenB}`},body:JSON.stringify({name:"foreign"})})).response.status,404);
});

test("role edits can clear a bound default, normalize capabilities and toggle availability", async () => {
  const headers={Authorization:`Bearer ${tokenA}`};
  const providers=(await request("/api/model-providers",{headers})).body.providers;
  const created=await request("/api/agent-roles",{method:"POST",headers,body:JSON.stringify({name:"Editable role",prompt:"Original",capabilities:["write"],defaultProviderId:providers[0].id})});
  const id=created.body.role.id;
  const edited=await request(`/api/agent-roles/${id}`,{method:"PUT",headers,body:JSON.stringify({name:"Revised",prompt:"Revised instructions",defaultProviderId:null,capabilities:[" write ","write","","review"],enabled:false})});
  assert.equal(edited.response.status,200);assert.equal(edited.body.role.defaultProviderId,null);assert.equal(edited.body.role.enabled,false);
  assert.deepEqual(edited.body.role.capabilities,["write","review"]);assert.equal(edited.body.role.prompt,"Revised instructions");
  const enabled=await request(`/api/agent-roles/${id}`,{method:"PUT",headers,body:JSON.stringify({enabled:true})});
  assert.equal(enabled.body.role.enabled,true);assert.equal(enabled.body.role.prompt,"Revised instructions");
  const rejected=await request(`/api/agent-roles/${id}`,{method:"PUT",headers,body:JSON.stringify({capabilities:"wrong"})});
  assert.equal(rejected.response.status,400);
  assert.equal((await request(`/api/agent-roles/${id}`,{headers})).body.role.enabled,true);
});

test("role provider bindings reject another account's provider for both creation and updates", async () => {
  const providers=(await request("/api/model-providers",{headers:{Authorization:`Bearer ${tokenA}`}})).body.providers;
  const headers={Authorization:`Bearer ${tokenB}`};
  const invalid={name:"Foreign binding",prompt:"Prompt",defaultProviderId:providers[0].id};
  assert.equal((await request("/api/agent-roles",{method:"POST",headers,body:JSON.stringify(invalid)})).response.status,400);
  const created=await request("/api/agent-roles",{method:"POST",headers,body:JSON.stringify({...invalid,defaultProviderId:null,enabled:false})});
  assert.equal(created.response.status,201);assert.equal(created.body.role.enabled,false);
  const denied=await request(`/api/agent-roles/${created.body.role.id}`,{method:"PUT",headers,body:JSON.stringify({defaultProviderId:providers[0].id})});
  assert.equal(denied.response.status,400);
  assert.equal((await request(`/api/agent-roles/${created.body.role.id}`,{headers})).body.role.defaultProviderId,null);
});

test("both provider deletion APIs clear only the owner's role bindings and preserve historical snapshots", async () => {
  for (const legacy of [false, true]) {
    const id = `shared-delete-${legacy}`;
    for (const token of [tokenA, tokenB]) {
      const saved = await jsonRequest("/api/llm/providers", token, "POST", { id, config: { name: "Shared id", protocol: "openai", baseUrl: "https://fixture.invalid/v1", model: "fixture", apiKey: "synthetic-secret" }, isActive: false });
      assert.equal(saved.response.status, 200);
    }
    const roleA = (await jsonRequest("/api/agent-roles", tokenA, "POST", { name: "Owner binding", prompt: "fixture", defaultProviderId: id })).body.role;
    const roleB = (await jsonRequest("/api/agent-roles", tokenB, "POST", { name: "Other binding", prompt: "fixture", defaultProviderId: id })).body.role;
    const project = (await jsonRequest("/api/creative-projects", tokenA, "POST", { name: "Deletion snapshot" })).body.project;
    await jsonRequest(`/api/creative-projects/${project.id}/team`, tokenA, "PUT", { team: [{ roleId: roleA.id }] });
    const run = (await jsonRequest("/api/agent-runs", tokenA, "POST", { projectId: project.id, task: "Snapshot only" })).body.run;
    const deleted = await jsonRequest(`/api/${legacy ? "llm/providers" : "model-providers"}/${id}`, tokenA, "DELETE");
    assert.equal(deleted.response.status, legacy ? 200 : 204);
    assert.equal((await jsonRequest(`/api/agent-roles/${roleA.id}`, tokenA, "GET")).body.role.defaultProviderId, null);
    assert.equal((await jsonRequest(`/api/agent-roles/${roleB.id}`, tokenB, "GET")).body.role.defaultProviderId, id);
    assert.equal((await jsonRequest(`/api/agent-runs/${run.id}`, tokenA, "GET")).body.run.teamSnapshot[0].defaultProviderId, id);
    assert.equal((await jsonRequest(`/api/agent-roles/${roleA.id}`, tokenA, "PUT", { name: "Editable after deletion" })).response.status, 200);
    assert.ok((await jsonRequest("/api/model-providers", tokenB, "GET")).body.providers.some(value => value.id === id));
    // The historical draft must not silently switch to another provider or spend calls.
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error("must not invoke"); };
    try {
      const blocked = await jsonRequest(`/api/agent-runs/${run.id}/start`, tokenA, "POST", {});
      assert.equal(blocked.response.status, 409);
      assert.equal(calls, 0);
      assert.equal((await jsonRequest(`/api/agent-runs/${run.id}`, tokenA, "GET")).body.run.status, "draft");
    } finally { global.fetch = originalFetch; }
  }
});

test("malformed team replacement preserves the saved team and validates all entries transactionally", async () => {
  const project = (await jsonRequest("/api/creative-projects", tokenA, "POST", { name: "Team validation" })).body.project;
  const role = (await jsonRequest("/api/agent-roles", tokenA, "POST", { name: "Valid role", prompt: "Original" })).body.role;
  const path = `/api/creative-projects/${project.id}/team`;
  const valid = { team: [{ roleId: role.id, overrides: { prompt: "Project override" } }] };
  assert.equal((await jsonRequest(path, tokenA, "PUT", valid)).response.status, 200);
  for (const body of [{}, {team:null}, {team:[null]}, {team:[{roleId:role.id},{roleId:role.id}]}, {team:[{roleId:role.id,overrides:{prompt:42}}]}, {team:[{roleId:role.id,overrides:{model:"ignored"}}]}, {team:[{roleId:role.id},{roleId:"missing"}]}]) {
    assert.equal((await jsonRequest(path, tokenA, "PUT", body)).response.status, 400);
    const saved = (await jsonRequest(path, tokenA, "GET")).body.team;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, role.id);
    assert.equal(saved[0].overrides.prompt, "Project override");
  }
  assert.equal((await jsonRequest(path, tokenA, "PUT", {team:[]})).response.status, 200);
  assert.deepEqual((await jsonRequest(path, tokenA, "GET")).body.team, []);
});

test("disabled roles are excluded from new runs while deletion removes membership but preserves existing snapshots", async () => {
  const project = (await jsonRequest("/api/creative-projects", tokenA, "POST", {name:"Role lifecycle"})).body.project;
  const roles = [];
  for (const name of ["First", "Second"]) roles.push((await jsonRequest("/api/agent-roles", tokenA, "POST", {name,prompt:name})).body.role);
  const teamPath = `/api/creative-projects/${project.id}/team`;
  await jsonRequest(teamPath, tokenA, "PUT", {team:roles.map(role=>({roleId:role.id}))});
  const runBody = {projectId:project.id,task:"Create snapshot without model calls"};
  const original = (await jsonRequest("/api/agent-runs", tokenA, "POST", runBody)).body.run;
  await jsonRequest(`/api/agent-roles/${roles[0].id}`,tokenA,"PUT",{enabled:false});
  const next = await jsonRequest("/api/agent-runs",tokenA,"POST",runBody);
  assert.equal(next.response.status,201);
  assert.deepEqual(next.body.run.teamSnapshot.map(role=>role.name),["Second"]);
  assert.equal((await jsonRequest(teamPath,tokenA,"PUT",{team:[{roleId:roles[0].id}]})).response.status,400);
  await jsonRequest(`/api/agent-roles/${roles[1].id}`,tokenA,"PUT",{enabled:false});
  assert.equal((await jsonRequest("/api/agent-runs",tokenA,"POST",runBody)).response.status,400);
  assert.equal((await jsonRequest(`/api/agent-roles/${roles[0].id}`,tokenB,"DELETE")).response.status,404);
  assert.equal((await jsonRequest(`/api/agent-roles/${roles[0].id}`,tokenA,"DELETE")).response.status,204);
  assert.deepEqual((await jsonRequest(teamPath,tokenA,"GET")).body.team.map(role=>role.id),[roles[1].id]);
  assert.deepEqual((await jsonRequest(`/api/agent-runs/${original.id}`,tokenA,"GET")).body.run.teamSnapshot.map(role=>role.name),["First","Second"]);
});

test("late connection verification cannot validate edited or deleted credentials, including legacy updates", {timeout:10000}, async () => {
  for (const mutation of ["rename","model","legacy","delete"]) {
    const config = {name:"Verification race",protocol:"openai",baseUrl:"https://verification.invalid/v1",model:"old",apiKey:"synthetic-key"};
    const provider = (await jsonRequest("/api/model-providers",tokenA,"POST",config)).body.provider;
    const originalFetch = global.fetch;
    let begin, release;
    const began = new Promise(resolve=>{begin=resolve;});
    const gate = new Promise(resolve=>{release=resolve;});
    global.fetch = async () => { begin(); await gate; return Response.json({choices:[{message:{content:"Synthetic verification"}}]}); };
    try {
      const pending = jsonRequest(`/api/model-providers/${provider.id}/test`,tokenA,"POST",{});
      await began;
      let changed;
      if (mutation === "delete") changed = await jsonRequest(`/api/model-providers/${provider.id}`,tokenA,"DELETE");
      else if (mutation === "legacy") changed = await jsonRequest("/api/llm/providers",tokenA,"POST",{id:provider.id,config:{...config,model:"changed"},isActive:false});
      else changed = await jsonRequest(`/api/model-providers/${provider.id}`,tokenA,"PUT",mutation === "rename" ? {name:"Renamed"} : {model:"changed"});
      assert.ok([200,204].includes(changed.response.status));
      release();
      const result = await pending;
      assert.equal(result.response.status,mutation === "rename" ? 200 : 409);
      const stored=db.prepare("SELECT verified_at FROM llm_providers WHERE id=? AND user_id=1").get(provider.id);
      if (mutation === "rename") assert.ok(stored.verified_at);
      else if (mutation === "delete") assert.equal(stored,undefined);
      else assert.equal(stored.verified_at,null);
    } finally { release(); global.fetch=originalFetch; }
  }
});

test("collaborative history paginates past 100 rows stably without crossing accounts", async () => {
  const project=(await jsonRequest("/api/creative-projects",tokenA,"POST",{name:"Paged history"})).body.project;
  const insert=db.prepare("INSERT INTO agent_runs (id,user_id,project_id,task,budget,created_at,updated_at) VALUES (?,1,?,?,'standard',9000000000,9000000000)");
  db.transaction(()=>{for(let i=0;i<105;i++)insert.run(`history-page-${String(i).padStart(3,"0")}`,project.id,`history fixture ${i}`);})();
  const first=(await jsonRequest("/api/agent-runs?limit=20",tokenA,"GET")).body;
  assert.equal(first.runs.length,20);assert.ok(first.nextCursor);
  db.prepare("UPDATE agent_runs SET updated_at=9100000000 WHERE id='history-page-000'").run();
  const ids=first.runs.map(run=>run.id);
  let cursor=first.nextCursor;
  while(cursor){const page=(await jsonRequest(`/api/agent-runs?limit=20&cursor=${encodeURIComponent(cursor)}`,tokenA,"GET")).body;ids.push(...page.runs.map(run=>run.id));cursor=page.nextCursor;}
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.filter(id=>id.startsWith("history-page-")).length,105);
  assert.equal(ids[0],"history-page-104");assert.equal(ids[104],"history-page-000");
  const foreign=(await jsonRequest(`/api/agent-runs?limit=20&cursor=${encodeURIComponent(first.nextCursor)}`,tokenB,"GET")).body;
  assert.ok(foreign.runs.every(run=>!run.id.startsWith("history-page-")));
  const matched=(await jsonRequest(`/api/agent-runs?limit=20&q=${encodeURIComponent("history fixture 104")}`,tokenA,"GET")).body;
  assert.deepEqual(matched.runs.map(run=>run.id),["history-page-104"]);
  assert.equal(matched.nextCursor,null);
  const projectSearch=(await jsonRequest(`/api/agent-runs?limit=20&q=${encodeURIComponent(project.name)}`,tokenA,"GET")).body;
  assert.equal(projectSearch.runs.length,20);assert.ok(projectSearch.nextCursor);
  const projectSearchNext=(await jsonRequest(`/api/agent-runs?limit=20&q=${encodeURIComponent(project.name)}&cursor=${encodeURIComponent(projectSearch.nextCursor)}`,tokenA,"GET")).body;
  assert.ok(projectSearchNext.runs.every(run=>!projectSearch.runs.some(previous=>previous.id===run.id)));
  const otherAccountSearch=(await jsonRequest(`/api/agent-runs?q=${encodeURIComponent("history fixture 104")}`,tokenB,"GET")).body;
  assert.equal(otherAccountSearch.runs.length,0);
  db.prepare("UPDATE agent_runs SET task='100%_needle' WHERE id='history-page-104'").run();
  const literalSearch=(await jsonRequest(`/api/agent-runs?q=${encodeURIComponent("100%_")}`,tokenA,"GET")).body;
  assert.deepEqual(literalSearch.runs.map(run=>run.id),["history-page-104"]);
  for(const query of ["limit=0","limit=101","limit=no","cursor=broken"]){assert.equal((await jsonRequest(`/api/agent-runs?${query}`,tokenA,"GET")).response.status,400);}
  for(const query of [`q=${"x".repeat(101)}`,"q=x&q=y"]){assert.equal((await jsonRequest(`/api/agent-runs?${query}`,tokenA,"GET")).response.status,400);}
});

test("collaborative details retain insertion order for events sharing a timestamp",async()=>{
  const project=(await jsonRequest("/api/creative-projects",tokenA,"POST",{name:"Event order"})).body.project;
  const run=(await jsonRequest("/api/agent-runs",tokenA,"POST",{projectId:project.id,task:"Event fixture"})).body.run;
  const insert=db.prepare("INSERT INTO agent_run_events(id,run_id,user_id,type,payload,created_at) VALUES (?,?,1,'fixture','{}',123)");
  insert.run("z-history-event",run.id);insert.run("a-history-event",run.id);
  const detail=(await jsonRequest(`/api/agent-runs/${run.id}`,tokenA,"GET")).body;
  assert.deepEqual(detail.events.filter(event=>event.type==="fixture").map(event=>event.id),["z-history-event","a-history-event"]);
  assert.equal((await jsonRequest(`/api/agent-runs/${run.id}`,tokenB,"GET")).response.status,404);
});

test("stale final-instruction saves and confirmations preserve the newer edit and never create a task",async()=>{
  const project=(await jsonRequest("/api/creative-projects",tokenA,"POST",{name:"Draft conflict"})).body.project;
  const run=(await jsonRequest("/api/agent-runs",tokenA,"POST",{projectId:project.id,task:"No model call"})).body.run;
  const path=`/api/agent-runs/${run.id}`;
  assert.equal((await jsonRequest(`${path}/finalize`,tokenA,"POST",{finalInstruction:"first",expectedFinalInstruction:null})).response.status,200);
  assert.equal((await jsonRequest(`${path}/finalize`,tokenA,"POST",{finalInstruction:"newer",expectedFinalInstruction:"first"})).response.status,200);
  assert.equal((await jsonRequest(`${path}/finalize`,tokenA,"POST",{finalInstruction:"stale",expectedFinalInstruction:"first"})).response.status,409);
  assert.equal((await jsonRequest(`${path}/confirm-coze`,tokenA,"POST",{finalInstruction:"stale",expectedFinalInstruction:"first"})).response.status,409);
  assert.equal((await jsonRequest(`${path}/finalize`,tokenA,"POST",{finalInstruction:"wrong",expectedFinalInstruction:{}})).response.status,400);
  const latest=(await jsonRequest(path,tokenA,"GET")).body.run;
  assert.equal(latest.finalInstruction,"newer");assert.equal(latest.status,"awaiting_confirmation");assert.equal(latest.taskId,null);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM tasks WHERE user_id=1 AND idempotency_key=?").get(`agent-run:${run.id}`).count,0);
});

test("workflow HTTP validates predecessors, injects saved results and replays without another model call", async(t)=>{
  const created=await jsonRequest("/api/model-providers",tokenA,"POST",{name:"Workflow fixture",protocol:"openai",baseUrl:"https://workflow-fixture.invalid/v1",model:"fixture",apiKey:"synthetic-workflow-key"});
  assert.equal(created.response.status,201);
  const providerId=created.body.provider.id;
  const sessionId="opc_workflow_verified_fixture";
  assert.equal((await jsonRequest("/api/opc/sessions",tokenA,"POST",{id:sessionId,title:"fixture"})).response.status,200);
  const priorFetch=global.fetch, priorMode=process.env.STZH_CONTEXT_MODE;
  t.after(()=>{global.fetch=priorFetch;if(priorMode===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=priorMode;});
  process.env.STZH_CONTEXT_MODE="enforce";
  const calls=[];
  global.fetch=async(url,options)=>{
    assert.equal(url,"https://workflow-fixture.invalid/v1/chat/completions");
    calls.push(JSON.parse(options.body));
    return Response.json({choices:[{message:{content:"水墨仍未批准；fixture reply"}}]});
  };
  const referenceNotes = ["知识库暂不可用，本步骤没有知识库参考。"];
  const payload=index=>({providerId,messages:[{role:"user",content:"本步骤输入"}],referenceNotes,studioContext:{mode:"workflow",scope:{sessionId},workflow:{runId:"verified-run",workflowId:"fixture",stepId:`step-${index}`,stepIndex:index,previousStepIds:index?["step-0"]:[]}}});
  for (const notes of [[{ invalid: true }], ["x".repeat(241)], Array(13).fill("note")]) {
    assert.equal((await jsonRequest("/api/model/chat",tokenA,"POST",{...payload(0),referenceNotes:notes})).response.status,400);
  }
  assert.equal((await jsonRequest("/api/model/chat",tokenA,"POST",payload(1))).response.status,409);
  assert.equal(calls.length,0);
  const first=await jsonRequest("/api/model/chat",tokenA,"POST",payload(0));
  assert.equal(first.response.status,200);
  const replay=await jsonRequest("/api/model/chat",tokenA,"POST",payload(0));
  assert.deepEqual(replay.body,first.body);
  assert.equal(calls.length,1);
  const second=await jsonRequest("/api/model/chat",tokenA,"POST",payload(1));
  assert.equal(second.response.status,200);
  assert.equal(second.body.contextTrace.workflow.authority,"server_result_records");
  assert.equal(second.body.contextTrace.workflow.predecessors[0].stepId,"step-0");
  const transmitted=calls[1].messages.at(-1).content;
  assert.match(transmitted,/server_workflow_results/);
  assert.match(transmitted,/水墨仍未批准/);
  assert.ok(transmitted.includes(referenceNotes[0]));
  assert.ok(transmitted.endsWith("本步骤输入"));
  const changed=payload(0);changed.messages[0].content="different";
  assert.equal((await jsonRequest("/api/model/chat",tokenA,"POST",changed)).response.status,409);
  assert.equal((await jsonRequest("/api/model/chat",tokenA,"POST",{...payload(0),referenceNotes:[]})).response.status,409);
  assert.equal(calls.length,2);
  const runPath=`/api/opc/sessions/${sessionId}/workflow-runs/verified-run`;
  const saved=await jsonRequest(runPath,tokenA,"GET");
  assert.equal(saved.response.status,200);
  assert.equal(saved.response.headers.get("cache-control"),"no-store");
  assert.deepEqual(saved.body.steps.map(step=>step.status),["completed","completed"]);
  assert.equal(saved.body.steps[0].result.text,first.body.text);
  assert.deepEqual(saved.body.steps[0].result.referenceNotes, referenceNotes);
  assert.equal((await jsonRequest(runPath,tokenB,"GET")).response.status,404);
  assert.equal(calls.length,2);
});

test("collaboration freezes creative parameters for every role and ignores start-time replacements",async()=>{
  const priorMode=process.env.STZH_CONTEXT_MODE, priorFetch=global.fetch;
  process.env.STZH_CONTEXT_MODE="enforce";
  try {
    const project=(await jsonRequest("/api/creative-projects",tokenA,"POST",{name:"Parameter snapshot"})).body.project;
    const provider=(await jsonRequest("/api/model-providers",tokenA,"POST",{name:"Snapshot mock",protocol:"openai",baseUrl:"https://snapshot.invalid/v1",model:"mock",apiKey:"synthetic-parameter-secret"})).body.provider;
    const currentConstraints={style:"水墨",aspect:"9:16",composition:"主体居中"};
    const created=await jsonRequest("/api/agent-runs",tokenA,"POST",{projectId:project.id,task:"讨论方案，尚未批准生成",budget:"economy",currentConstraints});
    assert.equal(created.response.status,201);
    const id=created.body.run.id;
    assert.deepEqual((await jsonRequest(`/api/agent-runs/${id}`,tokenA,"GET")).body.run.currentConstraints,currentConstraints);
    assert.equal((await jsonRequest(`/api/agent-runs/${id}`,tokenB,"GET")).response.status,404);
    assert.equal((await jsonRequest("/api/agent-runs",tokenA,"POST",{projectId:project.id,task:"bad",currentConstraints:{aspect:123}})).response.status,400);
    const requests=[];
    global.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:"合成讨论结果，仍待人工确认"}}]});};
    const started=await jsonRequest(`/api/agent-runs/${id}/start`,tokenA,"POST",{providerId:provider.id,currentConstraints:{style:"不应替换保存快照"}});
    assert.equal(started.response.status,200);
    assert.equal(started.body.run.status,"awaiting_confirmation");
    assert.ok(requests.length>0);
    for(const request of requests){
      const state=request.messages.find(message=>message.content.includes('"section":"Current Creative State"'));
      assert.equal(state.role,"user");
      assert.deepEqual(JSON.parse(state.content).constraints,currentConstraints);
      assert.ok(request.messages[0].content.includes('"deliveryApproved":false'));
    }
    const detail=(await jsonRequest(`/api/agent-runs/${id}`,tokenA,"GET")).body;
    assert.ok(detail.events.filter(event=>event.type==="context.prepared").every(event=>event.payload.creativeState.constraints.aspect==="9:16"));
    assert.equal(detail.run.taskId,null);
  }finally{
    global.fetch=priorFetch;
    if(priorMode===undefined)delete process.env.STZH_CONTEXT_MODE;else process.env.STZH_CONTEXT_MODE=priorMode;
  }
});

test("workflow plan HTTP saves before execution, reads without results and rejects cross-account changes",async()=>{
 const sessionId=`opc_workflow_plan_${Date.now()}`;
 assert.equal((await jsonRequest('/api/opc/sessions',tokenA,'POST',{id:sessionId,title:'Plan fixture'})).response.status,200);
 const base=`/api/opc/sessions/${sessionId}/workflow-runs/planned-run`;
 const plan={version:1,workflowId:'fixture',input:{topic:'水墨'},steps:[{id:'first',name:'第一步'}],originalStepCount:1};
 assert.equal((await jsonRequest(base+'/plan',tokenA,'POST',plan)).response.status,201);
 assert.equal((await jsonRequest(base+'/plan',tokenA,'POST',plan)).response.status,200);
 const saved=await jsonRequest(base,tokenA,'GET');
 assert.equal(saved.response.status,200);assert.equal(saved.response.headers.get('cache-control'),'no-store');
 assert.deepEqual(saved.body.plan,plan);assert.deepEqual(saved.body.steps,[]);
 assert.equal((await jsonRequest(base+'/plan',tokenA,'POST',{...plan,input:{topic:'changed'}})).response.status,409);
 assert.equal((await jsonRequest(base,tokenB,'GET')).response.status,404);
 assert.equal((await jsonRequest(base+'/plan',tokenB,'POST',plan)).response.status,404);
});

test("workflow execution snapshot rejects changed parameters and provider configuration before another call",async()=>{
 const sessionId=`opc_workflow_config_${Date.now()}`,runId='frozen';
 await jsonRequest('/api/opc/sessions',tokenA,'POST',{id:sessionId,title:'Frozen configuration'});
 const provider=(await jsonRequest('/api/model-providers',tokenA,'POST',{name:'Frozen mock',protocol:'openai',baseUrl:'https://frozen.invalid/v1',model:'original',apiKey:'synthetic-frozen-key'})).body.provider;
 const base=`/api/opc/sessions/${sessionId}/workflow-runs/${runId}`;
 const execution={providerId:provider.id,currentConstraints:{aspect:'9:16'},excludedMemoryIds:[]};
 const plan={version:1,workflowId:'fixture',input:{topic:'水墨'},steps:[{id:'first',name:'第一步'},{id:'next',name:'第二步'}],originalStepCount:2,definitionHash:'a'.repeat(64),execution};
 const saved=await jsonRequest(base+'/plan',tokenA,'POST',plan);assert.equal(saved.response.status,201);
 assert.match(saved.body.plan.execution.providerFingerprint,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(saved.body).includes('synthetic-frozen-key'));
 const studioContext={mode:'workflow',scope:{sessionId},currentConstraints:{aspect:'9:16'},excludedMemoryIds:[],workflow:{runId,workflowId:'fixture',stepId:'frozen:0:first',stepIndex:0,previousStepIds:[]}};
 const body={providerId:provider.id,messages:[{role:'user',content:'first'}],studioContext};
 const prior=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:'synthetic completed output'}}]});};
 try{
  const changed=await jsonRequest('/api/model/chat',tokenA,'POST',{...body,studioContext:{...studioContext,currentConstraints:{aspect:'16:9'}}});
  assert.equal(changed.response.status,409);assert.equal(changed.body.error.code,'WORKFLOW_CONFIG_CHANGED');assert.equal(calls,0);
  assert.equal((await jsonRequest('/api/model/chat',tokenA,'POST',body)).response.status,200);assert.equal(calls,1);
  assert.equal((await jsonRequest(base,tokenA,'GET')).body.configurationState,'current');
  assert.equal((await jsonRequest(`/api/model-providers/${provider.id}`,tokenA,'PUT',{model:'changed'})).response.status,200);
  assert.equal((await jsonRequest(base,tokenA,'GET')).body.configurationState,'changed');
  const next=await jsonRequest('/api/model/chat',tokenA,'POST',{...body,studioContext:{...studioContext,workflow:{...studioContext.workflow,stepId:'frozen:1:next',stepIndex:1,previousStepIds:['frozen:0:first']}}});
  assert.equal(next.response.status,409);assert.equal(next.body.error.code,'WORKFLOW_CONFIG_CHANGED');assert.equal(calls,1);
 }finally{global.fetch=prior;}
});
