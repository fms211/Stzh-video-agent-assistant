"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const { inspectOriginalWebPreview, backupOriginalWebPreview } = require("../lib/original-web-preview");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-original-entry-"));
  const dataDir = path.join(root, "server");
  fs.mkdirSync(dataDir);
  const db = new Database(path.join(dataDir, "stzh.db"));
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT); CREATE TABLE opc_sessions(id TEXT,user_id INTEGER); CREATE TABLE llm_providers(id TEXT,user_id INTEGER,secret TEXT); INSERT INTO users VALUES(3,'fms688','synthetic-password-hash'); INSERT INTO opc_sessions VALUES('original-history',3);");
  const jwt = "synthetic-original-jwt-".repeat(4);
  const key = "synthetic-original-model-key-".repeat(3);
  fs.writeFileSync(path.join(dataDir, ".jwt-secret"), jwt);
  fs.writeFileSync(path.join(dataDir, ".env.local"), `STZH_LLM_ENCRYPTION_KEY=${key}\n`);
  t.after(() => {
    db.close();
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(relative.startsWith("stzh-original-entry-") && !path.isAbsolute(relative) && !relative.includes(path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, dataDir, db, jwt, key, inspect: env => inspectOriginalWebPreview({ root, env: env || {} }) };
}

function encrypted(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(key).digest(), iv);
  const data = Buffer.concat([cipher.update(value), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}

test("read-only inspection preserves original identity, history and existing JWT", t => {
  const f = fixture(t);
  const before = f.db.prepare("SELECT * FROM users").all();
  const result = f.inspect();
  assert.deepEqual(f.db.prepare("SELECT * FROM users").all(), before);
  assert.equal(result.report.accountId, 3);
  assert.equal(result.report.accountCounts.conversations, 1);
  assert.equal(result.effective.JWT_SECRET, f.jwt);
  assert.equal(result.report.originalDatabaseModified, false);
  assert.equal(fs.readFileSync(path.join(f.dataDir, ".jwt-secret"), "utf8"), f.jwt);
  assert.doesNotMatch(JSON.stringify(result.report), /synthetic-|password_hash/);
});

test("acceptance startup explicitly disables media and keeps four modes in shadow", t => {
  const f = fixture(t);
  const result = f.inspect({ STZH_MEDIA_EXECUTOR_ENABLED: "1", STZH_CONTEXT_MODE: "enforce", COZE_API_TOKEN: "synthetic-token" });
  assert.equal(result.effective.STZH_MEDIA_EXECUTOR_ENABLED, "0");
  assert.equal(result.effective.COZE_API_TOKEN, "");
  for (const name of ["COZE", "ASSISTANT", "WORKFLOW", "COLLABORATION"]) assert.equal(result.effective[`STZH_CONTEXT_MODE_${name}`], "shadow");
});

test("wrong directory or unknown identity cannot silently create a replacement account", t => {
  const f = fixture(t);
  assert.throws(() => f.inspect({ STZH_DATA_DIR: path.join(f.root, "another") }), { code: "ORIGINAL_DATA_DIR_MISMATCH" });
  assert.throws(() => inspectOriginalWebPreview({ root: f.root, env: {}, username: "missing" }), { code: "ORIGINAL_ACCOUNT_MISSING" });
  assert.equal(f.db.prepare("SELECT count(*) n FROM users").get().n, 1);
  assert.equal(fs.existsSync(path.join(f.root, "another")), false);
});

test("missing or invalid JWT fails without generating or replacing secrets", t => {
  const f = fixture(t);
  const file = path.join(f.dataDir, ".jwt-secret");
  fs.unlinkSync(file);
  assert.throws(() => f.inspect(), { code: "ORIGINAL_JWT_MISSING" });
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, "short");
  assert.throws(() => f.inspect(), { code: "ORIGINAL_JWT_INVALID" });
  assert.equal(fs.readFileSync(file, "utf8"), "short");
  const configured = f.inspect({ JWT_SECRET: f.jwt });
  assert.equal(configured.report.jwtSource, "configured");
});

test("encrypted model credentials must match original key and are never exposed", t => {
  const f = fixture(t);
  const secret = encrypted("synthetic-private-provider-key", f.key);
  f.db.prepare("INSERT INTO llm_providers VALUES(?,?,?)").run("provider", 3, secret);
  assert.equal(f.inspect().report.encryptedProviderCount, 1);
  assert.throws(() => f.inspect({ STZH_LLM_ENCRYPTION_KEY: "" }), { code: "ORIGINAL_MODEL_KEY_MISSING" });
  assert.throws(() => f.inspect({ STZH_LLM_ENCRYPTION_KEY: "wrong-original-material-".repeat(3) }), { code: "ORIGINAL_MODEL_KEY_MISMATCH" });
  assert.equal(f.db.prepare("SELECT secret FROM llm_providers").get().secret, secret);
  assert.doesNotMatch(JSON.stringify(f.inspect().report), /synthetic-private-provider-key|synthetic-original-model-key/);
});

test("consistent backup includes committed WAL history and paired original configuration", async t => {
  const f = fixture(t);
  f.db.prepare("INSERT INTO opc_sessions VALUES(?,?)").run("wal-history", 3);
  const prepared = f.inspect();
  const result = await backupOriginalWebPreview(prepared);
  const copy = new Database(path.join(result.backupDir, "stzh.db"), { readonly: true });
  try { assert.equal(copy.prepare("SELECT count(*) n FROM opc_sessions").get().n, 2); }
  finally { copy.close(); }
  assert.equal(fs.readFileSync(path.join(result.backupDir, "server/.jwt-secret"), "utf8"), f.jwt);
  assert.equal(result.backupIntegrity, "ok");
  assert.doesNotMatch(fs.readFileSync(path.join(result.backupDir, "backup-summary.json"), "utf8"), /synthetic-original/);
  await assert.rejects(backupOriginalWebPreview(prepared, { backupParent: path.join(f.root, "outside") }), { code: "ORIGINAL_BACKUP_BOUNDARY" });
  assert.equal(fs.existsSync(path.join(f.root, "outside")), false);
});
