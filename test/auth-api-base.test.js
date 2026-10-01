"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

async function loadAuth() {
  const url = pathToFileURL(path.join(root, "app", "lib", "auth.ts"));
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

test("Web dev 3000 自动连接同主机 8080 Express", async () => {
  const { resolveApiBase } = await loadAuth();
  assert.equal(resolveApiBase(undefined, { protocol: "http:", hostname: "localhost", port: "3000", origin: "http://localhost:3000" }), "http://localhost:8080");
  assert.equal(resolveApiBase(undefined, { protocol: "http:", hostname: "192.168.1.20", port: "3000", origin: "http://192.168.1.20:3000" }), "http://192.168.1.20:8080");
});

test("显式后端地址优先；生产静态同源保持 origin", async () => {
  const { resolveApiBase } = await loadAuth();
  assert.equal(resolveApiBase("https://api.example.com", { protocol: "http:", hostname: "localhost", port: "3000", origin: "http://localhost:3000" }), "https://api.example.com");
  assert.equal(resolveApiBase(undefined, { protocol: "https:", hostname: "app.example.com", port: "", origin: "https://app.example.com" }), "https://app.example.com");
  const frameBase = resolveApiBase("  ", { protocol: "http:", hostname: "127.0.0.1", port: "18080", origin: "http://127.0.0.1:18080" });
  assert.equal(new URL("/plugin-ui/test/index.html", frameBase).href, "http://127.0.0.1:18080/plugin-ui/test/index.html");
});

test("API errors retain structured status and code for revision-conflict recovery", async t => {
  const { authFetch, ApiRequestError } = await loadAuth();
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(JSON.stringify({ error: { code: "PLAN_REVISION_CONFLICT", message: "计划已更新" } }), { status: 409 });
  await assert.rejects(authFetch("/api/research/runs/one/plan"), error => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, "PLAN_REVISION_CONFLICT");
    assert.equal(error.status, 409);
    assert.equal(error.message, "计划已更新");
    return true;
  });
});

test("API errors without a structured body preserve a readable fallback", async t => {
  const { authFetch } = await loadAuth();
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => new Response(JSON.stringify({}), { status: 503 });
  await assert.rejects(authFetch("/api/research/runs/one"), { message: "请求失败 (503)", status: 503, code: undefined });
});

test("desktop device IDs remain stable per account and never reuse another account's legacy ID", async t => {
  const originals = { window: global.window, localStorage: global.localStorage };
  t.after(() => { for (const [key, value] of Object.entries(originals)) value === undefined ? delete global[key] : global[key] = value; });
  const values = new Map([["stzh_token", "a"], ["stzh_user", JSON.stringify({ id: 1 })], ["tszh_desktop_device_id", "desktop_legacy_other"]]);
  global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  global.window = { location: { protocol: "http:", hostname: "localhost", port: "18080", origin: "http://localhost:18080" }, localStorage: global.localStorage };
  const { getDesktopDeviceId } = await loadAuth();
  const a = getDesktopDeviceId(); assert.notEqual(a, "desktop_legacy_other"); assert.equal(getDesktopDeviceId(), a);
  values.set("stzh_token", "b"); values.set("stzh_user", JSON.stringify({ id: 2 }));
  const b = getDesktopDeviceId(); assert.notEqual(a, b);
  values.set("stzh_token", "a"); values.set("stzh_user", JSON.stringify({ id: 1 })); assert.equal(getDesktopDeviceId(), a);
});

test("an old heartbeat cannot send the prior device with a newly signed-in account token", async t => {
  const originals = { window: global.window, localStorage: global.localStorage, fetch: global.fetch };
  t.after(() => { for (const [key, value] of Object.entries(originals)) value === undefined ? delete global[key] : global[key] = value; });
  const values = new Map([["stzh_token", "a"], ["stzh_user", JSON.stringify({ id: 1 })]]);
  global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  let beat, finish; const calls = [];
  global.window = { location: { origin: "http://localhost:18080" }, localStorage: global.localStorage, setInterval: fn => { beat = fn; return 1; }, clearInterval() {} };
  global.fetch = async (url, options) => { calls.push({ url, token: options.headers.Authorization }); return new Promise(resolve => { finish = resolve; }); };
  const { startDesktopHeartbeat } = await loadAuth(); const stop = startDesktopHeartbeat();
  values.set("stzh_token", "b"); values.set("stzh_user", JSON.stringify({ id: 2 }));
  finish(Response.json({ device: { id: "old-device" } })); await new Promise(resolve => setImmediate(resolve)); await beat();
  assert.equal(calls.length, 1); assert.equal(calls[0].token, "Bearer a"); stop();
});
