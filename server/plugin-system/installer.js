"use strict";

const { createHash, randomUUID, verify } = require("node:crypto");
const { PluginError } = require("./errors.js");
const { validateManifest, normalizeFiles, TIERS } = require("./manifest.js");
const { contentHash } = require("./store.js");

class PluginInstaller {
  constructor({ store, resolver, trustedKeys = {}, prepare, build, probe, clock = Date.now }) {
    this.store = store;
    this.db = store.db;
    this.resolver = resolver;
    this.trustedKeys = trustedKeys;
    this.build = build;
    this.prepare = prepare;
    this.probe = probe;
    this.clock = clock;
    this.activeOperations = new Set();
    this.stopping = false;
    this.db.exec(`CREATE TABLE IF NOT EXISTS plugin_install_previews (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      preview TEXT NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL,
      result TEXT, last_error TEXT
    )`);
    if (!this.db.prepare("PRAGMA table_info(plugin_install_previews)").all().some(column => column.name === "lockfile")) {
      this.db.exec("ALTER TABLE plugin_install_previews ADD COLUMN lockfile TEXT");
    }
  }

  inspect(result) {
    const manifest = validateManifest(result.manifest);
    const files = normalizeFiles(manifest, result.files, { requireEntrypoints: !(result.buildScripts?.length) });
    const hash = contentHash(files);
    let signatureStatus = "unsigned";
    if (result.signature) {
      const key = this.trustedKeys[result.signature.keyId];
      let valid = false;
      try { valid = Boolean(key && verify(null, Buffer.from(hash), key, Buffer.from(result.signature.value, "base64"))); } catch { /* invalid signature */ }
      if (!valid) throw new PluginError("SIGNATURE_INVALID", "插件签名无效或发布者不在受信列表，不能继续安装");
      signatureStatus = "verified";
    }
    return { manifest, files, hash, signatureStatus };
  }

  track(operation) {
    if (this.stopping) return Promise.reject(new PluginError("INSTALL_CANCELLED", "插件安装服务正在停止", 503));
    const pending = operation();
    this.activeOperations.add(pending);
    void pending.finally(() => this.activeOperations.delete(pending)).catch(() => {});
    return pending;
  }

  assertRunning() { if (this.stopping) throw new PluginError("INSTALL_CANCELLED", "插件安装服务正在停止", 503); }
  resolve(userId, source) { return this.track(() => this.resolveOperation(userId, source)); }
  install(userId, previewId, confirmation = {}) { return this.track(() => this.installOperation(userId, previewId, confirmation)); }

  async resolveOperation(userId, source) {
    this.store.accountRoot(userId);
    this.db.prepare("DELETE FROM plugin_install_previews WHERE user_id=? AND expires_at<? AND state!='installing'").run(userId, this.clock());
    if (this.db.prepare("SELECT COUNT(*) n FROM plugin_install_previews WHERE user_id=? AND state IN ('ready','installing')").get(userId).n >= 10) {
      throw new PluginError("PREVIEW_LIMIT", "安装预览过多，请完成当前安装或等待预览过期", 429);
    }
    const resolved = await this.resolver.resolve(userId, source);
    this.assertRunning();
    const { manifest, hash, signatureStatus } = this.inspect(resolved);
    const previewId = `preview_${randomUUID()}`;
    const prepared = this.prepare ? await this.prepare(resolved, { userId, previewId }) : null;
    this.assertRunning();
    const preview = {
      previewId, source, resolvedRef: resolved.resolvedRef, contentHash: hash,
      manifest, signatureStatus, dependencies: prepared?.dependencies || resolved.dependencies || [], buildScripts: resolved.buildScripts || [],
      dependencyLockHash: prepared?.hash || null,
      strongSandboxAvailable: false, expiresAt: new Date(this.clock() + 5 * 60000).toISOString(),
    };
    preview.previewHash = createHash("sha256").update(JSON.stringify({ userId, ...preview })).digest("hex");
    this.db.prepare("INSERT INTO plugin_install_previews(id,user_id,preview,expires_at,state,lockfile) VALUES(?,?,?,?,'ready',?)")
      .run(preview.previewId, userId, JSON.stringify(preview), this.clock() + 5 * 60000, prepared?.lockfile || null);
    return preview;
  }

  async installOperation(userId, previewId, confirmation = {}) {
    const row = this.db.prepare("SELECT * FROM plugin_install_previews WHERE id=? AND user_id=?").get(previewId, userId);
    if (!row || row.expires_at <= this.clock()) throw new PluginError("PREVIEW_EXPIRED", "安装预览已过期，请重新解析来源", 409);
    const preview = JSON.parse(row.preview);
    if (confirmation.previewHash !== preview.previewHash) throw new PluginError("PREVIEW_HASH_MISMATCH", "安装确认与预览不匹配", 409);
    if (!Object.hasOwn(TIERS, confirmation.acceptedPermissionTier) || TIERS[confirmation.acceptedPermissionTier] < TIERS[preview.manifest.requestedPermissionTier]) {
      throw new PluginError("PERMISSION_TIER_TOO_LOW", "需要确认插件请求的权限档");
    }
    if ((preview.signatureStatus !== "verified" && !confirmation.acceptsUnsignedRisk)
      || (!preview.strongSandboxAvailable && !confirmation.acceptsWeakSandboxRisk)
      || (preview.buildScripts.length && !confirmation.acceptsOpenInternetBuildScripts)) {
      throw new PluginError("RISK_CONFIRMATION_REQUIRED", "请逐项确认安装预览中的权限和风险", 409);
    }
    if (row.state === "installed") return JSON.parse(row.result);
    const claim = this.db.prepare("UPDATE plugin_install_previews SET state='installing',last_error=NULL WHERE id=? AND user_id=? AND state IN ('ready','failed')")
      .run(previewId, userId);
    if (!claim.changes) throw new PluginError("GENERATION_CONFLICT", "此安装已在执行，请勿重复提交", 409);
    this.store.emit(userId, "install.started", { previewId, pluginId: preview.manifest.id, version: preview.manifest.version });
    try {
      const resolved = await this.resolver.resolve(userId, preview.source);
      this.assertRunning();
      const checked = this.inspect(resolved);
      if (checked.hash !== preview.contentHash || resolved.resolvedRef !== preview.resolvedRef || checked.signatureStatus !== preview.signatureStatus) {
        throw new PluginError("PREVIEW_HASH_MISMATCH", "来源版本或内容已变化，请重新预览", 409);
      }
      let files = Object.fromEntries(checked.files);
      if (preview.dependencyLockHash && (!row.lockfile || createHash("sha256").update(row.lockfile).digest("hex") !== preview.dependencyLockHash)) {
        throw new PluginError("PREVIEW_HASH_MISMATCH", "依赖锁文件与预览不一致", 409);
      }
      if (preview.dependencies.length || preview.buildScripts.length) {
        if (!this.build) throw new PluginError("BUILD_UNAVAILABLE", "服务器尚未配置插件构建执行器，不能跳过构建安装");
        files = await this.build({ ...resolved, files, lockfile: row.lockfile || null }, { userId, confirmation, previewId });
        this.assertRunning();
      }
      normalizeFiles(checked.manifest, files);
      if (!this.probe) throw new PluginError("HOST_UNAVAILABLE", "服务器尚未配置插件健康检查，不能将包标记为可用");
      await this.probe({ manifest: checked.manifest, files }, { userId, confirmation });
      this.assertRunning();
      const result = this.store.installPackage(userId, {
        ...resolved, manifest: checked.manifest, files, signatureStatus: checked.signatureStatus,
        confirmations: { ...confirmation, sourceContentHash: preview.contentHash, previewId, confirmedAt: new Date(this.clock()).toISOString() },
      });
      this.db.prepare("UPDATE plugin_install_previews SET state='installed',result=? WHERE id=? AND user_id=?")
        .run(JSON.stringify(result), previewId, userId);
      return result;
    } catch (error) {
      this.db.prepare("UPDATE plugin_install_previews SET state='failed',last_error=? WHERE id=? AND user_id=?").run(error.message, previewId, userId);
      this.store.emit(userId, "install.failed", { previewId, code: error.code || "INSTALL_FAILED", message: error.message });
      throw error;
    }
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.activeOperations]);
  }
}

module.exports = { PluginInstaller };
