"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const Database = require("better-sqlite3");
const { generateKeyPairSync, sign } = require("node:crypto");
const { PluginStore, contentHash } = require("../plugin-system/store.js");
const { normalizeFiles } = require("../plugin-system/manifest.js");

function setup(t, options = {}) {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE creative_projects(id TEXT PRIMARY KEY,user_id INTEGER);");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-plugin-install-"));
  const store = new PluginStore({ db, root });
  const payload = {
    manifest: { schemaVersion: 1, id: "test.echo", name: "回声", description: "Owned fixture", version: "1.0.0", engine: { stzh: "^0.1.0" }, entrypoints: { host: "index.cjs" }, contributes: {}, requestedPermissionTier: "safe" },
    files: { "index.cjs": "module.exports={tools:{}};" },
    source: { type: "npm", spec: "test.echo@latest" }, resolvedRef: "test.echo@1.0.0", dependencies: [], buildScripts: [], signature: null,
  };
  let now = 1000, probes = 0;
  const { PluginInstaller } = require("../plugin-system/installer.js");
  const installer = new PluginInstaller({ store, resolver: { resolve: async () => structuredClone(payload) }, clock: () => now,
    probe: async () => { probes++; }, ...options });
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { installer, store, payload, probes: () => probes, advance: () => { now += 3600000; } };
}
function accept(preview) { return { previewHash: preview.previewHash, acceptedPermissionTier: "safe", acceptsUnsignedRisk: true, acceptsOpenInternetBuildScripts: false, acceptsWeakSandboxRisk: true }; }

test("resolve is inert, install requires matching owner/hash/consent and is idempotent", async t => {
  const { installer, store, probes } = setup(t);
  const preview = await installer.resolve(1, { type: "npm", spec: "test.echo@latest" });
  assert.equal(probes(), 0);
  assert.equal(preview.strongSandboxAvailable, false);
  await assert.rejects(installer.install(2, preview.previewId, accept(preview)), { code: "PREVIEW_EXPIRED" });
  await assert.rejects(installer.install(1, preview.previewId, { ...accept(preview), previewHash: "wrong" }), { code: "PREVIEW_HASH_MISMATCH" });
  await assert.rejects(installer.install(1, preview.previewId, { ...accept(preview), acceptsUnsignedRisk: false }), { code: "RISK_CONFIRMATION_REQUIRED" });
  const pkg = await installer.install(1, preview.previewId, accept(preview));
  assert.equal(probes(), 1);
  assert.equal(store.listPackages(1).length, 1);
  assert.equal((await installer.install(1, preview.previewId, accept(preview))).installationId, pkg.installationId);
  assert.equal(probes(), 1);
});

test("expired previews and changed upstream content require a new preview", async t => {
  const f = setup(t);
  const preview = await f.installer.resolve(1, f.payload.source);
  f.advance();
  await assert.rejects(f.installer.install(1, preview.previewId, accept(preview)), { code: "PREVIEW_EXPIRED" });
  const fresh = await f.installer.resolve(1, f.payload.source);
  f.payload.files["index.cjs"] = "module.exports={changed:true};";
  await assert.rejects(f.installer.install(1, fresh.previewId, accept(fresh)), { code: "PREVIEW_HASH_MISMATCH" });
  assert.equal(f.probes(), 0);
});

test("invalid signatures are rejected rather than downgraded to unsigned", async t => {
  const keys = generateKeyPairSync("ed25519");
  const f = setup(t, { trustedKeys: { publisher: keys.publicKey } });
  const hash = contentHash(normalizeFiles(f.payload.manifest, f.payload.files));
  f.payload.signature = { keyId: "publisher", value: sign(null, Buffer.from(hash), keys.privateKey).toString("base64") };
  assert.equal((await f.installer.resolve(1, f.payload.source)).signatureStatus, "verified");
  f.payload.files["index.cjs"] = "tampered";
  await assert.rejects(f.installer.resolve(1, f.payload.source), { code: "SIGNATURE_INVALID" });
});

test("build scripts do not execute without the separate build confirmation", async t => {
  let builds = 0;
  const f = setup(t, { build: async result => { builds++; return result.files; } });
  f.payload.buildScripts = [{ name: "prepare", command: "node build.cjs" }];
  const p = await f.installer.resolve(1, f.payload.source);
  await assert.rejects(f.installer.install(1, p.previewId, accept(p)), { code: "RISK_CONFIRMATION_REQUIRED" });
  assert.equal(builds, 0);
  await f.installer.install(1, p.previewId, { ...accept(p), acceptsOpenInternetBuildScripts: true });
  assert.equal(builds, 1);
});

test("failed health probe never creates an installed package", async t => {
  const f = setup(t, { probe: async () => { throw new Error("host handshake failed"); } });
  const p = await f.installer.resolve(1, f.payload.source);
  await assert.rejects(f.installer.install(1, p.previewId, accept(p)), /handshake failed/);
  assert.equal(f.store.listPackages(1).length, 0);
  assert.ok(f.store.events(1, null).some(event => event.type === "install.failed"));
});

test("confirmed owned package passes a real child-process health probe before file-store commit", async t => {
  const f = setup(t);
  const { createPluginProbe } = require("../plugin-system/host-manager.js");
  f.installer.probe = createPluginProbe({ store: f.store });
  const p = await f.installer.resolve(1, f.payload.source);
  const installed = await f.installer.install(1, p.previewId, accept(p));
  assert.equal(installed.installStatus, "installed");
  assert.equal(f.store.verifyPackage(1, installed), f.store.packagePath(1, installed.contentHash));
});

test("installer shutdown rejects a late source response before any package commit", async t => {
  const f=setup(t);const p=await f.installer.resolve(1,f.payload.source);
  let release;
  f.installer.resolver={resolve:async()=>new Promise(resolve=>{release=resolve;})};
  const result=f.installer.install(1,p.previewId,accept(p)).then(()=>null,error=>error);
  const stopping=f.installer.stop();release(structuredClone(f.payload));await stopping;
  assert.equal((await result).code,"INSTALL_CANCELLED");
  assert.equal(f.store.listPackages(1).length,0);
});
