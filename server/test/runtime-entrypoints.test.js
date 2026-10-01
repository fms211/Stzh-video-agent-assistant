"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serverRoot = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(serverRoot, file), "utf8");

test("standalone and cloud server entrypoints create and stop the production task runtime", () => {
  for (const file of ["server.js", "start.js"]) {
    const source = read(file);
    assert.match(source, /startProductionTaskRuntime/);
    assert.match(source, /app\.locals\.taskRuntime/);
    assert.match(source, /\.stop\(\)/);
  }
});

test("Electron attaches the same runtime to its embedded Express server and tears it down", () => {
  const source = fs.readFileSync(path.resolve(serverRoot, "..", "electron", "main.js"), "utf8");
  assert.match(source, /startProductionTaskRuntime/);
  assert.match(source, /expressApp\.locals\.taskRuntime/);
  assert.match(source, /taskRuntime\?\.stop/);
  const dbSource = read("db.js");
  assert.match(dbSource, /native["'],\s*`electron-v\$\{process\.versions\.modules\}`/);
  // Web source acceptance checks the explicit missing-binding failure path.
  // A matching Electron binary is a separate packaging artifact.
  assert.match(dbSource, /if \(!fs\.existsSync\(electronBinding\)\)/);
  assert.match(dbSource, /throw new Error\(`Electron SQLite 原生绑定缺失/);
});
