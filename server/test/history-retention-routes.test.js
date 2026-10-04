"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-retention-http-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "synthetic-retention-http-secret-more-than-thirty-two-characters";
const app = require("../app.js"), db = require("../db.js");
let server, owner, other;
function request(url, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: url, method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }); } catch (error) { reject(error); } });
    });
    req.on("error", reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
test.before(async () => {
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  owner = (await request("/api/auth/register", null, { username: "retention-owner", password: "synthetic-test-password" })).body;
  other = (await request("/api/auth/register", null, { username: "retention-other", password: "synthetic-test-password" })).body;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await app.locals.researchRuntime?.stop(); await app.locals.pluginService?.stop(); db.close();
  const relative = path.relative(os.tmpdir(), dataDir);
  assert.ok(relative.startsWith("stzh-retention-http-") && !relative.includes(path.sep)); fs.rmSync(dataDir, { recursive: true, force: true });
});
test("retention endpoints require authentication and ignore forged account IDs", async () => {
  assert.equal((await request("/api/history-retention", null)).status, 401);
  assert.equal((await request("/api/history-retention/sweep", null, {})).status, 401);
  assert.equal((await request("/api/history-retention", owner.token, { enabled: true, days: 1, confirm: true, userId: other.user.id })).status, 200);
  assert.equal((await request("/api/history-retention", other.token)).body.policy.enabled, false);
});
test("an unconfirmed activation never enables another account or sweeps its records", async () => {
  assert.equal((await request("/api/history-retention", other.token, { enabled: true, days: 1 })).status, 400);
  assert.equal((await request("/api/history-retention", other.token)).body.policy.enabled, false);
});
test("HTTP sweep protects current history and both creation routes reject expired cache", async () => {
  for (const id of ["expired", "current"]) {
    db.opcCreateSession(id, "test", owner.user.id);
    db.prepare("UPDATE opc_sessions SET updated_at=unixepoch()-86400*40 WHERE id=?").run(id);
  }
  db.opcCreateSession("other-history", "test", other.user.id);
  db.prepare("UPDATE opc_sessions SET updated_at=unixepoch()-86400*40 WHERE id='other-history'").run();
  const result = await request("/api/history-retention/sweep", owner.token, { clientId: "http-client", sessionIds: ["current"], userId: other.user.id });
  assert.equal(result.status, 200); assert.deepEqual(result.body.deletedIds, ["expired"]);
  assert.ok(db.opcGetSession("current", owner.user.id)); assert.ok(db.opcGetSession("other-history", other.user.id));
  for (const url of ["/api/conversations", "/api/opc/sessions"]) {
    const recreation = await request(url, owner.token, { id: "expired", title: "cached" });
    assert.equal(recreation.status, 410); assert.equal(recreation.body.error.code, "HISTORY_EXPIRED");
  }
});
test("disabled policy still returns owned tombstones for offline cache reconciliation", async () => {
  await request("/api/history-retention", owner.token, { enabled: false, days: 1 });
  const result = await request("/api/history-retention/sweep", owner.token, { clientId: "http-client", sessionIds: ["current"] });
  assert.equal(result.body.enabled, false); assert.deepEqual(result.body.deletedIds, []); assert.deepEqual(result.body.expiredIds, ["expired"]);
  const stranger = await request("/api/history-retention/sweep", other.token, { clientId: "other-client", sessionIds: [] });
  assert.deepEqual(stranger.body.expiredIds, []);
});
