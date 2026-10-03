"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-static-boundary-"));
const publicRoot = path.join(fixtureRoot, "public");
const privateRoot = path.join(fixtureRoot, "outside");
const privateMarker = "PRIVATE_FIXTURE_MUST_NOT_BE_SERVED";
const publicMarker = "PUBLIC_STATIC_ASSET";
const spaMarker = "PUBLIC_SPA_ENTRY";
fs.mkdirSync(publicRoot);
fs.mkdirSync(privateRoot);
fs.writeFileSync(path.join(privateRoot, "marker.txt"), privateMarker);
fs.writeFileSync(path.join(publicRoot, "asset.txt"), publicMarker);
fs.writeFileSync(path.join(publicRoot, "中文 空格.txt"), publicMarker);
fs.writeFileSync(path.join(publicRoot, "index.html"), spaMarker);
fs.mkdirSync(path.join(publicRoot, "inner"));
fs.writeFileSync(path.join(publicRoot, "inner", "asset.txt"), publicMarker);
fs.symlinkSync(privateRoot, path.join(publicRoot, "outside-link"), process.platform === "win32" ? "junction" : "dir");
fs.symlinkSync(path.join(publicRoot, "inner"), path.join(publicRoot, "inside-link"), process.platform === "win32" ? "junction" : "dir");

process.env.STZH_DATA_DIR = path.join(fixtureRoot, "data");
fs.mkdirSync(process.env.STZH_DATA_DIR);
process.env.STZH_OUT_DIR = publicRoot;
process.env.JWT_SECRET = "static-boundary-fixture-secret-more-than-thirty-two-characters";
const nativeFetch = global.fetch;
global.fetch = async () => { throw Error("No upstream network in static boundary tests"); };
const app = require("../app.js");
const db = require("../db.js");
let server;

function request(requestPath, method = "GET") {
  // Preserve raw dot/backslash segments; fetch would normalize away the attack.
  return new Promise((resolve, reject) => {
    const client = http.request({ hostname: "127.0.0.1", port: server.address().port, path: requestPath, method }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    client.on("error", reject);
    client.end();
  });
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
});

test.after(async () => {
  global.fetch = nativeFetch;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  // Delete only this freshly generated temporary fixture, after containment check.
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(fixtureRoot));
  assert.ok(relative && !path.isAbsolute(relative) && !relative.startsWith("..") && path.basename(fixtureRoot).startsWith("stzh-static-boundary-"));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

for (const requestPath of [
  "/../outside/marker.txt",
  "/nested/../../outside/marker.txt",
  "/%2e%2e%2foutside%2fmarker.txt",
  "/..\\outside\\marker.txt",
  "/outside-link/marker.txt",
]) {
  test(`static request stays within the real output directory: ${requestPath}`, async (t) => {
    const response = await request(requestPath);
    t.diagnostic(JSON.stringify({ status: response.status, outsideMarkerServed: response.body.includes(privateMarker), spaFallback: response.body.includes(spaMarker) }));
    assert.ok(!response.body.includes(privateMarker), "outside file leaked");
    assert.ok([400, 403, 404].includes(response.status), `unsafe path returned HTTP ${response.status}`);
  });
}

test("public assets, encoded filenames and HEAD remain available without sign-in", async () => {
  for (const requestPath of ["/asset.txt?version=1", "/inside-link/asset.txt", "/" + encodeURIComponent("中文 空格.txt")]) {
    const response = await request(requestPath);
    assert.equal(response.status, 200);
    assert.equal(response.body, publicMarker);
  }
  const head = await request("/asset.txt", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
});

test("malformed URL encoding and null bytes are rejected without filesystem diagnostics", async () => {
  for (const requestPath of ["/%ZZ", "/%00"]) {
    const response = await request(requestPath);
    assert.equal(response.status, 400);
    assert.ok(!response.body.includes(fixtureRoot));
  }
});

test("SPA fallback works while API authentication and write methods retain their boundaries", async () => {
  const page = await request("/creative/workspace");
  assert.equal(page.status, 200);
  assert.equal(page.body, spaMarker);
  const api = await request("/api/conversations");
  assert.equal(api.status, 401);
  const write = await request("/asset.txt", "POST");
  assert.equal(write.status, 404);
  assert.ok(!write.body.includes(publicMarker));
});
