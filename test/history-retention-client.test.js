"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { pathToFileURL } = require("node:url"), ts = require("typescript");
async function fixture(t) {
  const original = { window: global.window, localStorage: global.localStorage, sessionStorage: global.sessionStorage, fetch: global.fetch };
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete global[key]; else global[key] = value; } });
  const values = new Map(), tab = new Map(), events = [];
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  global.localStorage = storage(values); global.sessionStorage = storage(tab);
  global.window = { location: { protocol: "http:", hostname: "localhost", port: "18083", origin: "http://localhost:18083" }, dispatchEvent: event => events.push(event.type) };
  const account = id => { values.set("stzh_token", `synthetic-${id}`); values.set("stzh_user", JSON.stringify({ id })); };
  account(1);
  let source = fs.readFileSync(path.resolve(__dirname, "../app/lib/history-retention-client.ts"), "utf8");
  for (const name of ["auth", "data-owner"]) source = source.replace(`from "./${name}"`, `from "${pathToFileURL(path.resolve(__dirname, `../app/lib/${name}.ts`)).href}"`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const api = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  return { values, events, api, account };
}
test("server-acknowledged expiry removes only owned chat caches, keeping works and memory", async t => {
  const { values, api, events } = await fixture(t);
  for (const key of ["tszh:v2:user:1:sessions", "tszh:v2:opc:user:1:sessions"]) values.set(key, JSON.stringify([{ id: "old" }, { id: "current" }]));
  values.set("tszh:v2:user:1:active", "current");
  values.set("tszh:v2:user:1:messages:old", "private old"); values.set("tszh:v2:user:2:messages:old", "other account"); values.set("memory-old", "keep");
  global.fetch = async (_url, options) => { assert.deepEqual(JSON.parse(options.body).sessionIds, ["current"]); return Response.json({ expiredIds: ["old"] }); };
  await api.sweepHistory();
  assert.deepEqual(JSON.parse(values.get("tszh:v2:user:1:sessions")), [{ id: "current" }]);
  assert.equal(values.has("tszh:v2:user:1:messages:old"), false); assert.equal(values.get("tszh:v2:user:2:messages:old"), "other account"); assert.equal(values.get("memory-old"), "keep"); assert.ok(events.includes("tszh_history_retention_changed"));
});
test("network failures and invalid expiry responses never delete local records", async t => {
  const { values, api } = await fixture(t); values.set("tszh:v2:user:1:messages:old", "keep");
  for (const response of [Response.json({}, { status: 503 }), Response.json({ expiredIds: "old" }), Response.json({ expiredIds: [null] })]) {
    global.fetch = async () => response; await assert.rejects(api.sweepHistory()); assert.equal(values.get("tszh:v2:user:1:messages:old"), "keep");
  }
});
test("a late account A response cannot remove or authorize account B data", async t => {
  const { values, api, account } = await fixture(t); values.set("tszh:v2:user:1:messages:old", "A"); values.set("tszh:v2:user:2:messages:old", "B");
  global.fetch = async () => { account(2); return Response.json({ expiredIds: ["old"] }); };
  await assert.rejects(api.sweepHistory()); assert.equal(values.get("tszh:v2:user:1:messages:old"), "A"); assert.equal(values.get("tszh:v2:user:2:messages:old"), "B");
});
test("current-session expiry is rejected and unacknowledged settings are never shown as saved", async t => {
  const { values, api } = await fixture(t); values.set("tszh:v2:user:1:active", "current"); values.set("tszh:v2:user:1:messages:current", "keep");
  global.fetch = async () => Response.json({ expiredIds: ["current"] }); await assert.rejects(api.sweepHistory()); assert.equal(values.get("tszh:v2:user:1:messages:current"), "keep");
  global.fetch = async () => Response.json({ policy: { enabled: "yes", days: 30 } }); await assert.rejects(api.saveRetentionPolicy({ enabled: true, days: 30 }, true));
});
