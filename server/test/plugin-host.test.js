"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

function fixture(t, code) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-owned-plugin-host-"));
  fs.writeFileSync(path.join(root, "index.cjs"), code);
  const { PluginHost } = require("../plugin-system/host-manager.js");
  // Exercise the production startup timeout. The hung-call test below keeps its
  // explicit 100ms deadline, independent of concurrent child-process startup.
  const host = new PluginHost({ root, entrypoint: "index.cjs", generationId: "test-generation", pluginId: "owned.test",
    broker: async (method, input) => { if (method !== "project.read") throw new Error("permission denied"); return { projectId: "owned-project", input }; },
  });
  t.after(async () => { await host.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  return host;
}

test("real isolated child loads an owned plugin, handshakes and invokes tools", async t => {
  const host = fixture(t, "module.exports={tools:{echo:async input=>({message:input.message})}};");
  const ready = await host.start();
  assert.deepEqual(ready.tools, ["echo"]);
  assert.deepEqual(await host.invoke("echo", { message: "真实子进程回声" }), { message: "真实子进程回声" });
  assert.equal((await host.health()).ok, true);
});

test("child has no application secrets and cannot directly read an ungranted file or spawn a process", async t => {
  const old = process.env.STZH_PLUGIN_TEST_SECRET;
  process.env.STZH_PLUGIN_TEST_SECRET = "must-not-leak";
  t.after(() => { if (old === undefined) delete process.env.STZH_PLUGIN_TEST_SECRET; else process.env.STZH_PLUGIN_TEST_SECRET = old; });
  const host = fixture(t, `module.exports={tools:{inspect:async()=>{
    const result={secret:process.env.STZH_PLUGIN_TEST_SECRET||null};
    try{require('fs').readFileSync(process.execPath);result.read=true}catch(e){result.read=e.code}
    try{require('child_process').spawnSync(process.execPath,['-e','']);result.spawn=true}catch(e){result.spawn=e.code}
    return result;
  }}};`);
  await host.start();
  const result = await host.invoke("inspect", {});
  assert.equal(result.secret, null);
  assert.equal(result.read, "ERR_ACCESS_DENIED");
  assert.equal(result.spawn, "ERR_ACCESS_DENIED");
});

test("plugin host capability calls travel through the parent broker", async t => {
  const host = fixture(t, "module.exports={activate:async ctx=>({tools:{project:async input=>ctx.call('project.read',input),bad:async()=>ctx.call('secrets.read',{})}})};");
  await host.start();
  assert.deepEqual(await host.invoke("project", { key: "name" }), { projectId: "owned-project", input: { key: "name" } });
  await assert.rejects(host.invoke("bad", {}), /permission denied/);
});

test("hung and crashed plugins are terminated without taking down the caller", async t => {
  const hung = fixture(t, "module.exports={tools:{hang:async()=>new Promise(()=>{})}};");
  await hung.start();
  await assert.rejects(hung.invoke("hang", {}, 100), { code: "PLUGIN_TIMEOUT" });
  const crashed = fixture(t, "module.exports={tools:{crash:async()=>process.exit(7)}};");
  await crashed.start();
  await assert.rejects(crashed.invoke("crash", {}), { code: "PLUGIN_HOST_EXITED" });
});
