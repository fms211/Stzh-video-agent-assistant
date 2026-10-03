"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// Isolated route harness: no real database, secret file, HTTP service or account.
// Prepared only; execution is paused until the user authorizes tests.
function routeHarness(options = {}) {
  const routes = new Map(); let dbReads = 0;
  const router = { get: (url, handler) => routes.set(url, handler), post: () => {} };
  class JsonWebTokenError extends Error {}
  const mocks = {
    express: { Router: () => router }, bcryptjs: {},
    jsonwebtoken: { JsonWebTokenError, verify() { if (options.expired) throw new JsonWebTokenError("expired fixture"); if (options.verifierFailure) throw new Error("internal verifier fixture"); return options.claims || { userId: 7 }; } },
    "../db.js": { prepare() { dbReads++; if (options.databaseFailure) throw new Error("simulated private database error"); return { get: () => options.missingUser ? undefined : { id: 7, username: "fixture", display_name: "Fixture" } }; } },
    "../security.js": { loadJwtSecret: () => "isolated-test-fixture-only" },
  };
  const filename = path.resolve(__dirname, "../routes/auth.js");
  const loaded = new Module(filename, module); loaded.filename = filename;
  loaded.require = name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; };
  loaded._compile(fs.readFileSync(filename, "utf8"), filename);
  const result = { status: 200, body: null };
  const response = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
  routes.get("/api/auth/me")({ headers: { authorization: options.noHeader ? undefined : "Bearer fixture" } }, response);
  return { ...result, dbReads };
}

test("temporary database failure is retryable and does not masquerade as an expired token", () => {
  const result = routeHarness({ databaseFailure: true });
  assert.equal(result.status, 503); assert.match(result.body.error.message, /暂时不可用/);
  assert.doesNotMatch(JSON.stringify(result.body), /private database error/);
});

test("expired, missing or malformed identity credentials are rejected before database access", () => {
  for (const options of [{ expired: true }, { noHeader: true }, { claims: { userId: 0 } }, { claims: { userId: "7" } }]) {
    const result = routeHarness(options); assert.equal(result.status, 401); assert.equal(result.dbReads, 0);
  }
});

test("revoked identity is rejected while an existing identity returns its account", () => {
  assert.equal(routeHarness({ missingUser: true }).status, 401);
  const result = routeHarness(); assert.equal(result.status, 200); assert.equal(result.body.user.id, 7);
});

test("unexpected verifier failure is retryable without exposing internals or touching the database", () => {
  const result = routeHarness({ verifierFailure: true }); assert.equal(result.status, 503); assert.equal(result.dbReads, 0);
  assert.doesNotMatch(JSON.stringify(result.body), /internal verifier fixture/);
});
