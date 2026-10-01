"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { runDshPoc } = require("../dsh-poc.js");

test("DSH POC passes only a synthetic task and strips sensitive runtime variables", async () => {
  let spawned;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  const resultPromise = runDshPoc({
    command: "dsh-headless",
    task: "验证插件边界",
    spawnImpl: (command, args, options) => { spawned = { command, args, options }; queueMicrotask(() => { child.stdout.emit("data", Buffer.from('{"ok":true,"result":"pass"}')); child.emit("close", 0); }); return child; },
  });
  const result = await resultPromise;
  assert.equal(spawned.command, "dsh-headless");
  assert.equal(spawned.options.env.COZE_API_TOKEN, undefined);
  assert.equal(spawned.options.env.STZH_LLM_ENCRYPTION_KEY, undefined);
  assert.equal(JSON.parse(spawned.args.at(-1)).task, "验证插件边界");
  assert.deepEqual(result, { ok: true, result: "pass" });
});
