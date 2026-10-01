"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { PluginError } = require("./errors.js");
const { validateManifest, normalizeFiles, packageRelativePath, TIERS } = require("./manifest.js");

function contentHash(files) {
  const hash = createHash("sha256");
  for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    hash.update(JSON.stringify([name, bytes.length]));
    hash.update(bytes);
  }
  return hash.digest("hex");
}

class PluginStore {
  constructor({ db, root, removeFiles = fs.rmSync }) {
    this.db = db;
    this.root = path.resolve(root);
    this.removeFiles = removeFiles;
    fs.mkdirSync(this.root, { recursive: true });
    this.root = fs.realpathSync(this.root);
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_packages (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plugin_id TEXT NOT NULL,
        version TEXT NOT NULL, source TEXT NOT NULL, resolved_ref TEXT NOT NULL, content_hash TEXT NOT NULL,
        signature_status TEXT NOT NULL, manifest TEXT NOT NULL, install_status TEXT NOT NULL,
        confirmations TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
        UNIQUE(user_id,plugin_id,version)
      );
      CREATE TABLE IF NOT EXISTS project_plugin_bindings (
        project_id TEXT NOT NULL REFERENCES creative_projects(id), user_id INTEGER NOT NULL REFERENCES users(id),
        plugin_id TEXT NOT NULL, installation_id TEXT NOT NULL REFERENCES plugin_packages(id),
        version TEXT NOT NULL, permission_tier TEXT NOT NULL, config TEXT NOT NULL, enabled INTEGER NOT NULL,
        updated_at TEXT NOT NULL, PRIMARY KEY(project_id,plugin_id)
      );
      CREATE TABLE IF NOT EXISTS plugin_generations (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES creative_projects(id),
        status TEXT NOT NULL, snapshot TEXT NOT NULL, is_current INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS plugin_generation_current ON plugin_generations(user_id,project_id) WHERE is_current=1;
      CREATE TABLE IF NOT EXISTS plugin_events (
        user_id INTEGER NOT NULL REFERENCES users(id), seq INTEGER NOT NULL, project_id TEXT,
        event TEXT NOT NULL, PRIMARY KEY(user_id,seq)
      );
      CREATE INDEX IF NOT EXISTS plugin_events_project ON plugin_events(user_id,project_id,seq);
      CREATE TABLE IF NOT EXISTS plugin_data_quarantine (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), installation_id TEXT NOT NULL REFERENCES plugin_packages(id),
        snapshot TEXT NOT NULL, expires_at TEXT NOT NULL, purged_at TEXT,
        claim_token TEXT, claimed_at INTEGER, last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS plugin_quarantine_expiry ON plugin_data_quarantine(expires_at);
    `);
  }

  accountRoot(userId) {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !this.db.prepare("SELECT id FROM users WHERE id=?").get(userId)) {
      throw new PluginError("AUTH_REQUIRED", "插件操作需要有效账户", 401);
    }
    const root = this.checkedPath(path.join(this.root, "accounts", String(userId)));
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  checkedPath(target) {
    const resolved = path.resolve(target);
    const relative = path.relative(this.root, resolved);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件路径超出文件仓库边界");
    }
    let cursor = this.root;
    for (const part of relative.split(path.sep)) {
      cursor = path.join(cursor, part);
      if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
        throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件仓库不允许符号链接或目录联接");
      }
    }
    return resolved;
  }

  packagePath(userId, hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件内容哈希无效");
    return this.checkedPath(path.join(this.accountRoot(userId), "store", "sha256", hash));
  }

  assertProject(userId, projectId) {
    if (typeof projectId !== "string" || !this.db.prepare("SELECT id FROM creative_projects WHERE id=? AND user_id=?").get(projectId, userId)) {
      throw new PluginError("PROJECT_NOT_FOUND", "项目不存在或不属于当前账户", 404);
    }
  }

  emit(userId, type, payload = {}, projectId = null, generationId = null) {
    return this.db.transaction(() => {
      const seq = this.db.prepare("SELECT COALESCE(MAX(seq),0)+1 seq FROM plugin_events WHERE user_id=?").get(userId).seq;
      const event = { version: 1, userId, projectId, generationId, seq, type, occurredAt: new Date().toISOString(), payload };
      this.db.prepare("INSERT INTO plugin_events(user_id,seq,project_id,event) VALUES(?,?,?,?)").run(userId, seq, projectId, JSON.stringify(event));
      return event;
    })();
  }

  events(userId, projectId, afterSeq = 0) {
    if (projectId) this.assertProject(userId, projectId);
    const after = Number(afterSeq);
    if (!Number.isSafeInteger(after) || after < 0) throw new PluginError("INVALID_CURSOR", "事件游标无效");
    return this.db.prepare("SELECT event FROM plugin_events WHERE user_id=? AND seq>? AND (? IS NULL OR project_id=?) ORDER BY seq LIMIT 200")
      .all(userId, after, projectId || null, projectId || null).map(row => JSON.parse(row.event));
  }

  references(userId, pluginId, version) {
    const projects = new Set(this.db.prepare("SELECT project_id FROM project_plugin_bindings WHERE user_id=? AND plugin_id=? AND version=?").all(userId, pluginId, version).map(row => row.project_id));
    for (const row of this.db.prepare("SELECT project_id,snapshot FROM plugin_generations WHERE user_id=? AND is_current=1").all(userId)) {
      if (JSON.parse(row.snapshot).bindings.some(binding => binding.pluginId === pluginId && binding.version === version)) projects.add(row.project_id);
    }
    return [...projects].sort();
  }

  serializePackage(row) {
    return {
      installationId: row.id, pluginId: row.plugin_id, version: row.version, source: JSON.parse(row.source),
      resolvedRef: row.resolved_ref, contentHash: row.content_hash, signatureStatus: row.signature_status,
      manifest: JSON.parse(row.manifest), installStatus: row.install_status, installedAt: row.created_at,
      referencedProjectIds: this.references(row.user_id, row.plugin_id, row.version),
    };
  }

  getPackage(userId, pluginId, version) {
    const row = this.db.prepare("SELECT * FROM plugin_packages WHERE user_id=? AND plugin_id=? AND version=? AND install_status='installed'").get(userId, pluginId, version);
    if (!row) throw new PluginError("PLUGIN_VERSION_NOT_FOUND", "当前账户没有安装此插件版本", 404);
    return this.serializePackage(row);
  }

  listPackages(userId) {
    return this.db.prepare("SELECT * FROM plugin_packages WHERE user_id=? AND install_status='installed' ORDER BY created_at DESC,id").all(userId).map(row => this.serializePackage(row));
  }

  installPackage(userId, input) {
    const root = this.accountRoot(userId);
    const manifest = validateManifest(input.manifest);
    const files = normalizeFiles(manifest, input.files);
    const hash = contentHash(files);
    if (input.contentHash && input.contentHash !== hash) throw new PluginError("PREVIEW_HASH_MISMATCH", "插件内容与安装预览不一致");
    const existing = this.db.prepare("SELECT * FROM plugin_packages WHERE user_id=? AND plugin_id=? AND version=?").get(userId, manifest.id, manifest.version);
    if (existing) {
      if (existing.content_hash !== hash) throw new PluginError("PACKAGE_VERSION_CONFLICT", "相同版本已有不同内容，必须升级版本号", 409);
      if (existing.install_status !== "installed") throw new PluginError("PLUGIN_QUARANTINED", "此版本位于隔离区，请先恢复或永久清理", 409);
      this.verifyPackage(userId, this.serializePackage(existing));
      return this.serializePackage(existing);
    }
    const stage = this.checkedPath(path.join(root, "staging", randomUUID()));
    const destination = this.packagePath(userId, hash);
    let moved = false;
    let committed = false;
    fs.mkdirSync(stage, { recursive: true });
    try {
      for (const [name, bytes] of files) {
        const target = this.checkedPath(path.join(stage, name));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: "wx" });
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (fs.existsSync(destination)) {
        // Recover a crash after atomic rename but before the database commit.
        this.verifyPackage(userId, { contentHash: hash });
      } else {
        fs.renameSync(stage, destination);
        moved = true;
      }
      const id = `install_${randomUUID()}`;
      this.db.transaction(() => {
        this.db.prepare(`INSERT INTO plugin_packages(id,user_id,plugin_id,version,source,resolved_ref,content_hash,signature_status,manifest,install_status,confirmations,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,'installed',?,?)`).run(id, userId, manifest.id, manifest.version, JSON.stringify(input.source), String(input.resolvedRef), hash,
          input.signatureStatus || "unsigned", JSON.stringify(manifest), JSON.stringify(input.confirmations || {}), new Date().toISOString());
        this.emit(userId, "install.completed", { pluginId: manifest.id, version: manifest.version, contentHash: hash });
      })();
      committed = true;
      return this.getPackage(userId, manifest.id, manifest.version);
    } catch (error) {
      if (moved && !committed) this.removeFiles(this.checkedPath(destination), { recursive: true, force: true });
      throw error;
    } finally {
      if (fs.existsSync(stage)) this.removeFiles(this.checkedPath(stage), { recursive: true, force: true });
    }
  }

  verifyPackage(userId, pkg) {
    const root = this.packagePath(userId, pkg.contentHash);
    const files = new Map();
    const walk = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = this.checkedPath(path.join(directory, entry.name));
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) files.set(path.relative(root, file).split(path.sep).join("/"), fs.readFileSync(file));
        else throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件仓库包含特殊文件");
      }
    };
    walk(root);
    if (contentHash(files) !== pkg.contentHash) throw new PluginError("PREVIEW_HASH_MISMATCH", "已安装插件完整性校验失败", 409);
    return root;
  }

  listBindings(userId, projectId) {
    this.assertProject(userId, projectId);
    return this.db.prepare("SELECT * FROM project_plugin_bindings WHERE user_id=? AND project_id=? ORDER BY plugin_id").all(userId, projectId).map(row => ({
      projectId, pluginId: row.plugin_id, version: row.version, installationId: row.installation_id,
      permissionTier: row.permission_tier, enabled: Boolean(row.enabled), config: JSON.parse(row.config),
    }));
  }

  bind(userId, projectId, input) {
    this.assertProject(userId, projectId);
    const pkg = this.getPackage(userId, input.pluginId, input.version);
    if (input.installationId !== pkg.installationId) throw new PluginError("PLUGIN_VERSION_NOT_FOUND", "插件安装标识不匹配", 404);
    if (!Object.hasOwn(TIERS, input.permissionTier) || TIERS[input.permissionTier] < TIERS[pkg.manifest.requestedPermissionTier]) {
      throw new PluginError("PERMISSION_TIER_TOO_LOW", "项目授权低于插件请求的权限");
    }
    if (!input.config || typeof input.config !== "object" || Array.isArray(input.config) || JSON.stringify(input.config).length > 32000) throw new PluginError("INVALID_CONFIG", "插件配置必须是32KB以内的对象");
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO project_plugin_bindings(project_id,user_id,plugin_id,installation_id,version,permission_tier,config,enabled,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,plugin_id) DO UPDATE SET installation_id=excluded.installation_id,version=excluded.version,
        permission_tier=excluded.permission_tier,config=excluded.config,enabled=excluded.enabled,updated_at=excluded.updated_at`)
        .run(projectId, userId, pkg.pluginId, pkg.installationId, pkg.version, input.permissionTier, JSON.stringify(input.config), input.enabled ? 1 : 0, new Date().toISOString());
      this.emit(userId, "binding.updated", { pluginId: pkg.pluginId, version: pkg.version, enabled: Boolean(input.enabled) }, projectId);
    })();
  }

  unbind(userId, projectId, pluginId) {
    this.assertProject(userId, projectId);
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM project_plugin_bindings WHERE user_id=? AND project_id=? AND plugin_id=?").run(userId, projectId, pluginId);
      this.emit(userId, "binding.updated", { pluginId, removed: true }, projectId);
    })();
  }

  uninstall(userId, pluginId, version) {
    const pkg = this.getPackage(userId, pluginId, version);
    const projectIds = this.references(userId, pluginId, version);
    if (projectIds.length) return { status: "blocked", projectIds };
    const quarantineId = `quarantine_${randomUUID()}`;
    const entry = { quarantineId, pluginId, version, manifestName: pkg.manifest.name, deletedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), hadProjects: [] };
    this.db.transaction(() => {
      this.db.prepare("UPDATE plugin_packages SET install_status='quarantined' WHERE id=? AND user_id=?").run(pkg.installationId, userId);
      this.db.prepare("INSERT INTO plugin_data_quarantine(id,user_id,installation_id,snapshot,expires_at) VALUES(?,?,?,?,?)").run(quarantineId, userId, pkg.installationId, JSON.stringify(entry), entry.expiresAt);
      this.emit(userId, "data.quarantined", { pluginId, version, quarantineId });
    })();
    return { status: "quarantined", projectIds: [] };
  }

  listQuarantined(userId) {
    return this.db.prepare("SELECT snapshot,last_error FROM plugin_data_quarantine WHERE user_id=? AND purged_at IS NULL ORDER BY expires_at").all(userId)
      .map(row => ({ ...JSON.parse(row.snapshot), ...(row.last_error ? { lastError: row.last_error } : {}) }));
  }

  restore(userId, id) {
    const entry = this.db.prepare("SELECT * FROM plugin_data_quarantine WHERE id=? AND user_id=? AND purged_at IS NULL").get(id, userId);
    if (!entry) throw new PluginError("PLUGIN_NOT_FOUND", "隔离记录不存在", 404);
    if (entry.claim_token) throw new PluginError("GENERATION_CONFLICT", "隔离数据正在清理，请稍后再试", 409);
    const row = this.db.prepare("SELECT * FROM plugin_packages WHERE id=? AND user_id=?").get(entry.installation_id, userId);
    this.verifyPackage(userId, this.serializePackage(row));
    this.db.transaction(() => {
      const live = this.db.prepare("SELECT claim_token FROM plugin_data_quarantine WHERE id=? AND user_id=? AND purged_at IS NULL").get(id, userId);
      if (!live || live.claim_token) throw new PluginError("GENERATION_CONFLICT", "隔离状态已变化，请刷新后重试", 409);
      this.db.prepare("UPDATE plugin_packages SET install_status='installed' WHERE id=?").run(row.id);
      this.db.prepare("DELETE FROM plugin_data_quarantine WHERE id=? AND user_id=?").run(id, userId);
      this.emit(userId, "data.restored", { quarantineId: id, pluginId: row.plugin_id, version: row.version });
    })();
    return { pluginId: row.plugin_id, version: row.version };
  }

  purge(userId, id, { expiredOnly = false, now = Date.now() } = {}) {
    const entry = this.db.prepare("SELECT * FROM plugin_data_quarantine WHERE id=? AND user_id=? AND purged_at IS NULL").get(id, userId);
    if (!entry) throw new PluginError("PLUGIN_NOT_FOUND", "隔离记录不存在", 404);
    if (expiredOnly && Date.parse(entry.expires_at) > now) return false;
    const token = randomUUID();
    const claim = this.db.prepare("UPDATE plugin_data_quarantine SET claim_token=?,claimed_at=?,last_error=NULL WHERE id=? AND user_id=? AND purged_at IS NULL AND (claim_token IS NULL OR claimed_at<?)")
      .run(token, now, id, userId, now - 300000);
    if (!claim.changes) throw new PluginError("GENERATION_CONFLICT", "隔离数据正在清理", 409);
    try {
      const pkg = this.db.prepare("SELECT * FROM plugin_packages WHERE id=? AND user_id=?").get(entry.installation_id, userId);
      if (this.references(userId, pkg.plugin_id, pkg.version).length) throw new PluginError("VERSION_IN_USE", "插件版本仍在使用", 409);
      this.removeFiles(this.packagePath(userId, pkg.content_hash), { recursive: true, force: true });
      this.db.transaction(() => {
        this.db.prepare("DELETE FROM plugin_data_quarantine WHERE id=? AND claim_token=?").run(id, token);
        this.db.prepare("DELETE FROM plugin_packages WHERE id=? AND user_id=?").run(pkg.id, userId);
        this.emit(userId, "data.purged", { quarantineId: id, pluginId: pkg.plugin_id, version: pkg.version });
      })();
      return true;
    } catch (error) {
      this.db.prepare("UPDATE plugin_data_quarantine SET claim_token=NULL,claimed_at=NULL,last_error=? WHERE id=? AND claim_token=?").run(error.message, id, token);
      throw error;
    }
  }

  reapExpired(now = Date.now()) {
    const results = [];
    for (const row of this.db.prepare("SELECT id,user_id FROM plugin_data_quarantine WHERE expires_at<=? AND purged_at IS NULL LIMIT 100").all(new Date(now).toISOString())) {
      try { results.push({ id: row.id, purged: this.purge(row.user_id, row.id, { expiredOnly: true, now }) }); }
      catch (error) { results.push({ id: row.id, error: error.message }); }
    }
    return results;
  }
}

module.exports = { PluginStore, contentHash };
