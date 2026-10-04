"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-settings-boundary-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "settings-isolation-fixture-secret-more-than-thirty-two-characters";
const nativeFetch = global.fetch;
global.fetch = async () => { throw Error("No upstream network in settings isolation tests"); };
const app = require("../app.js");
const db = require("../db.js");
let server;
let owner;
let stranger;

function request(requestPath, token, body, method = body === undefined ? "GET" : "POST") {
  return new Promise((resolve, reject) => {
    const client = http.request({ hostname: "127.0.0.1", port: server.address().port, path: requestPath, method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    client.on("error", reject);
    client.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  for (const name of ["settings-owner", "settings-stranger"]) {
    const registration = await request("/api/auth/register", null, { username: name, password: "test-only-password" });
    assert.equal(registration.status, 200);
    if (name === "settings-owner") owner = registration.body;
    else stranger = registration.body;
  }
});

test.after(async () => {
  global.fetch = nativeFetch;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dataDir));
  assert.ok(relative && !path.isAbsolute(relative) && !relative.startsWith("..") && path.basename(dataDir).startsWith("stzh-settings-boundary-"));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("all legacy settings endpoints require sign-in", async () => {
  for (const [requestPath, body] of [["/api/app-settings", undefined], ["/api/app-settings", { key: "theme", value: "private" }], ["/api/app-settings/batch", { settings: { theme: "private" } }]]) {
    assert.equal((await request(requestPath, null, body)).status, 401);
  }
});

test("two accounts can use the same setting key without reading or overwriting each other", async (t) => {
  assert.equal((await request("/api/app-settings", owner.token, { key: "theme", value: "owner-theme" })).status, 200);
  const before = await request("/api/app-settings", stranger.token);
  t.diagnostic(JSON.stringify({ otherAccountThemeVisible: before.body.settings.theme === "owner-theme" }));
  assert.equal(before.body.settings.theme, undefined);
  assert.equal((await request("/api/app-settings", stranger.token, { key: "theme", value: "stranger-theme", userId: owner.user.id })).status, 200);
  assert.equal((await request("/api/app-settings", owner.token)).body.settings.theme, "owner-theme");
  assert.equal((await request("/api/app-settings", stranger.token)).body.settings.theme, "stranger-theme");
});

test("batch updates use authenticated ownership and preserve unrelated settings", async () => {
  await request("/api/app-settings", owner.token, { key: "owner-note", value: "keep" });
  const saved = await request("/api/app-settings/batch", stranger.token, { userId: owner.user.id, settings: { "owner-note": "stranger-own-note", "batch-key": "second" } });
  assert.equal(saved.status, 200);
  assert.equal((await request("/api/app-settings", owner.token)).body.settings["owner-note"], "keep");
  const settings = (await request("/api/app-settings", stranger.token)).body.settings;
  assert.equal(settings["owner-note"], "stranger-own-note");
  assert.equal(settings["batch-key"], "second");
});

test("unowned legacy values and internal migration markers are neither exposed nor changed", async (t) => {
  db.settingsSet("legacy-private-fixture", "unowned-value");
  db.settingsSet("conversations_migrated", "1");
  const before = db.settingsGetAll();
  const read = await request("/api/app-settings", owner.token);
  t.diagnostic(JSON.stringify({ legacyValueVisible: Object.hasOwn(read.body.settings, "legacy-private-fixture"), migrationMarkerVisible: Object.hasOwn(read.body.settings, "conversations_migrated") }));
  assert.equal(read.body.settings["legacy-private-fixture"], undefined);
  assert.equal(read.body.settings.conversations_migrated, undefined);
  await request("/api/app-settings", owner.token, { key: "conversations_migrated", value: "0" });
  await request("/api/app-settings/batch", stranger.token, { settings: { "legacy-private-fixture": "account-only-value" } });
  assert.deepEqual(db.settingsGetAll(), before);
});

test("invalid batches are rejected as a whole and empty string values remain valid", async () => {
  const before = (await request("/api/app-settings", owner.token)).body.settings;
  for (const settings of [null, ["array"], { "valid-but-must-not-save": "value", invalid: null }, { "valid-but-must-not-save": "value", invalid: 12 }]) {
    assert.equal((await request("/api/app-settings/batch", owner.token, { settings })).status, 400);
    assert.deepEqual((await request("/api/app-settings", owner.token)).body.settings, before);
  }
  for (const body of [{ key: "", value: "x" }, { key: 12, value: "x" }, { key: "invalid-value", value: {} }]) {
    assert.equal((await request("/api/app-settings", owner.token, body)).status, 400);
  }
  assert.equal((await request("/api/app-settings", owner.token, { key: "empty", value: "" })).status, 200);
  assert.equal((await request("/api/app-settings", owner.token)).body.settings.empty, "");
});

test("Unicode and own prototype-named keys retain the string dictionary contract", async () => {
  const body = JSON.parse('{"settings":{"__proto__":"own-string","主题":"中文 English"}}');
  assert.equal((await request("/api/app-settings/batch", stranger.token, body)).status, 200);
  const settings = (await request("/api/app-settings", stranger.token)).body.settings;
  assert.equal(Object.hasOwn(settings, "__proto__"), true);
  assert.equal(settings.__proto__, "own-string");
  assert.equal(settings["主题"], "中文 English");
});

test("legacy settings writes do not alter the established per-user theme API", async () => {
  assert.equal((await request("/api/settings", owner.token, { theme: "solar-forge" }, "PUT")).status, 200);
  await request("/api/app-settings", owner.token, { key: "theme", value: "crystal-cave" });
  assert.equal((await request("/api/settings", owner.token)).body.theme, "solar-forge");
});
