"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function readEnv(file) { return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {}; }
function hasTable(db, table) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)); }
function secretCanDecrypt(payload, material) {
  try {
    const parsed = JSON.parse(payload);
    if (parsed.v !== 1) return false;
    const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(material).digest(), Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const clear = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]);
    return clear.length > 0;
  } catch { return false; }
}

// Read existing original material only. This helper never imports the application
// or its migrating database module, and never generates/replaces a credential.
function inspectOriginalWebPreview({ root, env = process.env, username = "fms688" }) {
  const projectRoot = path.resolve(root);
  const dataDir = path.join(projectRoot, "server");
  const databaseFile = path.join(dataDir, "stzh.db");
  const configFiles = [path.join(projectRoot, ".env"), path.join(dataDir, ".env.local")];
  const effective = { ...readEnv(configFiles[0]), ...readEnv(configFiles[1]), ...env };
  if (effective.STZH_DATA_DIR && path.resolve(projectRoot, effective.STZH_DATA_DIR) !== dataDir) {
    fail("ORIGINAL_DATA_DIR_MISMATCH", "原账号启动配置指向另一数据目录，请核对；不会自动切库或合并数据");
  }
  if (!fs.existsSync(databaseFile)) fail("ORIGINAL_DATABASE_MISSING", "原账号数据库不存在；不会新建空库冒充原环境");
  let jwtSecret = effective.JWT_SECRET?.trim();
  let jwtSource = "configured";
  if (jwtSecret && jwtSecret.length < 32) fail("ORIGINAL_JWT_INVALID", "原环境JWT配置过短；不会替换已有密钥");
  if (!jwtSecret) {
    const jwtFile = path.join(dataDir, ".jwt-secret");
    if (!fs.existsSync(jwtFile)) fail("ORIGINAL_JWT_MISSING", "原环境JWT材料缺失；请恢复原文件，不会自动生成替代密钥");
    jwtSecret = fs.readFileSync(jwtFile, "utf8").trim();
    if (jwtSecret.length < 64) fail("ORIGINAL_JWT_INVALID", "原环境JWT文件无效；不会覆盖已有文件");
    jwtSource = "existing_file";
  }

  const database = new Database(databaseFile, { readonly: true, fileMustExist: true });
  let report;
  try {
    if (database.pragma("quick_check", { simple: true }) !== "ok") fail("ORIGINAL_DATABASE_INVALID", "原库完整性检查未通过，请先核对备份");
    if (!hasTable(database, "users")) fail("ORIGINAL_ACCOUNT_MISSING", "原库缺少账户表；不会迁移或创建替代账户");
    const account = database.prepare("SELECT id FROM users WHERE username=?").get(username);
    if (!account) fail("ORIGINAL_ACCOUNT_MISSING", "指定原账号不在此库；不会重置密码或创建同名账户");
    const encryptedRows = hasTable(database, "llm_providers") ? database.prepare("SELECT secret FROM llm_providers WHERE secret IS NOT NULL AND secret <> ''").all() : [];
    const key = effective.STZH_LLM_ENCRYPTION_KEY;
    if (encryptedRows.length && (!key || key.length < 32)) fail("ORIGINAL_MODEL_KEY_MISSING", "原库包含模型密钥但原加密配置缺失；请恢复原配置，不会生成替代密钥");
    if (encryptedRows.some(row => !secretCanDecrypt(row.secret, key))) fail("ORIGINAL_MODEL_KEY_MISMATCH", "原加密配置无法读取已有模型密钥；不会覆盖配置或清空模型记录");
    const counts = {};
    for (const [name, table] of [["conversations", "opc_sessions"], ["tasks", "tasks"], ["generations", "generations"], ["providers", "llm_providers"]]) {
      counts[name] = hasTable(database, table) ? database.prepare(`SELECT COUNT(*) count FROM ${table} WHERE user_id=?`).get(account.id).count : 0;
    }
    report = { ready: true, dataDir, databaseFile, accountId: account.id, accountPresent: true,
      databaseIntegrity: "ok", jwtSource, modelSecretsReadable: true, encryptedProviderCount: encryptedRows.length,
      accountCounts: counts, mediaExecutorEnabled: false, contextMode: "shadow", binding: "127.0.0.1:18080",
      originalDatabaseModified: false, originalSecretsReplaced: false };
  } finally { database.close(); }

  Object.assign(effective, {
    STZH_DATA_DIR: dataDir, JWT_SECRET: jwtSecret, STZH_MEDIA_EXECUTOR_ENABLED: "0",
    STZH_ALLOW_PRIVATE_MODEL_URLS: "0", STZH_CONTEXT_MODE: "shadow",
    STZH_CONTEXT_MODE_COZE: "shadow", STZH_CONTEXT_MODE_ASSISTANT: "shadow",
    STZH_CONTEXT_MODE_WORKFLOW: "shadow", STZH_CONTEXT_MODE_COLLABORATION: "shadow",
    COZE_API_TOKEN: "", COZE_BOT_ID: "",
  });
  // effective contains credentials and must never be logged or serialized.
  return { root: projectRoot, dataDir, databaseFile, configFiles, effective, report };
}

async function backupOriginalWebPreview(prepared, { backupParent } = {}) {
  const parent = path.resolve(backupParent || path.join(prepared.root, "output/stage4/original-account-recovery-20261003/private-backup"));
  const permittedRoot = path.resolve(prepared.root, "output");
  const relative = path.relative(permittedRoot, parent);
  if (!relative || path.isAbsolute(relative) || relative.startsWith("..")) fail("ORIGINAL_BACKUP_BOUNDARY", "备份目录必须位于项目私有output目录内");
  fs.mkdirSync(parent, { recursive: true });
  const backupDir = fs.mkdtempSync(path.join(parent, "original-"));
  const original = new Database(prepared.databaseFile, { readonly: true, fileMustExist: true });
  try { await original.backup(path.join(backupDir, "stzh.db")); }
  finally { original.close(); }
  const copy = new Database(path.join(backupDir, "stzh.db"), { readonly: true, fileMustExist: true });
  try { if (copy.pragma("integrity_check", { simple: true }) !== "ok") fail("ORIGINAL_BACKUP_INVALID", "备份完整性检查未通过，不能继续启动"); }
  finally { copy.close(); }
  const files = [...prepared.configFiles, path.join(prepared.root, ".env.local"), path.join(prepared.dataDir, ".jwt-secret"), path.join(prepared.dataDir, ".model-provider-encryption-key")];
  const copied = [];
  for (const file of files) if (fs.existsSync(file)) {
    const target = path.join(backupDir, path.relative(prepared.root, file));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    copied.push(path.relative(prepared.root, file));
  }
  const publicReport = { ...prepared.report, backupIntegrity: "ok", copiedConfigPaths: copied };
  fs.writeFileSync(path.join(backupDir, "backup-summary.json"), JSON.stringify(publicReport, null, 2));
  return { backupDir, backupIntegrity: "ok" };
}

module.exports = { inspectOriginalWebPreview, backupOriginalWebPreview };
