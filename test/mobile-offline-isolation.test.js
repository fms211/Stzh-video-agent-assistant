"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

function loadTypeScriptModule(filePath, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  const realRequire = loaded.require.bind(loaded);
  loaded.require = (request) => Object.hasOwn(mocks, request) ? mocks[request] : realRequire(request);
  loaded._compile(output, filePath);
  return loaded.exports;
}

test("mobile pending tasks and paired device ids stay isolated by server and account", async () => {
  const values = new Map();
  const asyncStorage = {
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
  const api = loadTypeScriptModule(path.resolve("Tszh-App/src/lib/api.ts"), {
    "@react-native-async-storage/async-storage": asyncStorage,
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith("/api/auth/login")) {
      const username = JSON.parse(options.body).username;
      const userId = username === "account-a" ? 101 : 202;
      return Response.json({ token: `token-${userId}`, user: { id: userId, username } });
    }
    if (target.endsWith("/api/tasks")) throw new Error("mock offline");
    throw new Error(`unexpected mock request: ${target}`);
  };
  try {
    await api.setServerUrl("http://server-a.test:8080");
    await api.login("account-a", "password");
    await api.setDeviceId("device-a");
    assert.equal((await api.createTaskOrQueue("server A task")).queued, true);
    assert.equal((await api.getPendingTasks()).length, 1);

    await api.setServerUrl("http://server-b.test:8080");
    assert.equal(await api.getToken(), null, "changing server must invalidate the previous server token");
    await api.login("account-b", "password");
    assert.equal((await api.getPendingTasks()).length, 0);
    assert.equal(await api.getDeviceId(), null);
    await api.setDeviceId("device-b");
    assert.equal((await api.createTaskOrQueue("server B task")).queued, true);

    await api.setServerUrl("http://server-a.test:8080");
    await api.login("account-a", "password");
    const restored = await api.getPendingTasks();
    assert.deepEqual(restored.map((item) => item.prompt), ["server A task"]);
    assert.equal(await api.getDeviceId(), "device-a");
    assert.ok([...values.keys()].some((key) => key.includes("pending_tasks") && key.includes("101")));
    assert.ok([...values.keys()].some((key) => key.includes("pending_tasks") && key.includes("202")));
  } finally {
    global.fetch = originalFetch;
  }
});
