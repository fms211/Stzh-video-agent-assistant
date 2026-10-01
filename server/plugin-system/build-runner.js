"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID, createHash } = require("node:crypto");
const semver = require("semver");
const { PluginError } = require("./errors.js");
const { normalizeFiles, packageRelativePath, MAX_PACKAGE_BYTES } = require("./manifest.js");

const SCRIPT_ORDER = ["preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare", "prebuild", "build", "postbuild"];

function packageMetadata(files) {
  let value;
  try { value = JSON.parse(files["package.json"]?.toString() || "{}"); }
  catch { throw new PluginError("INVALID_MANIFEST", "package.json 格式无效"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PluginError("INVALID_MANIFEST", "package.json 必须是对象");
  if (value.workspaces || value.overrides || value.resolutions) throw new PluginError("DEPENDENCY_SOURCE_DENIED", "插件包请提供独立 npm 项目，不使用 workspace 或依赖重写");
  for (const dependencies of [value.dependencies, value.devDependencies, value.optionalDependencies, value.peerDependencies]) {
    for (const [name, version] of Object.entries(dependencies || {})) {
      if (!/^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || typeof version !== "string"
        || (!semver.validRange(version) && !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(version))) {
        throw new PluginError("DEPENDENCY_SOURCE_DENIED", "依赖仅支持公共 npm 名称与版本范围，不允许本地路径或任意下载地址");
      }
    }
  }
  return value;
}

function validateLock(lock) {
  if (!lock || ![2, 3].includes(lock.lockfileVersion) || !lock.packages) throw new PluginError("DEPENDENCY_LOCK_INVALID", "需要 npm v2/v3 依赖锁文件");
  if (Object.keys(lock.packages).length > 1000 || Buffer.byteLength(JSON.stringify(lock)) > 4 * 1024 * 1024) throw new PluginError("PACKAGE_TOO_LARGE", "依赖锁文件超过限制");
  for (const [name, item] of Object.entries(lock.packages)) {
    if (!name) continue;
    packageRelativePath(name);
    if (item.link) throw new PluginError("DEPENDENCY_SOURCE_DENIED", "不允许链接型依赖");
    let url;
    try { url = new URL(item.resolved); } catch { throw new PluginError("DEPENDENCY_SOURCE_DENIED", "依赖未锁定公共 registry 来源"); }
    if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org" || url.port || url.username || url.password
      || !/^sha(256|512)-[A-Za-z0-9+/=]+$/.test(item.integrity || "")) throw new PluginError("DEPENDENCY_SOURCE_DENIED", "锁文件包含未授权来源或缺少完整性摘要");
  }
  return lock;
}

class PluginBuildRunner {
  constructor({ store, execute, timeoutMs = 120000, npmCli } = {}) {
    this.store = store;
    this.db = store.db;
    this.timeoutMs = timeoutMs;
    this.npmCli = npmCli || process.env.STZH_PLUGIN_NPM_CLI || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    this.execute = execute || (command => this.runProcess(command));
    this.active = new Set();
    this.operations = new Set();
    this.stopped = false;
    this.db.exec(`CREATE TABLE IF NOT EXISTS plugin_build_runs (
      id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,preview_id TEXT,phase TEXT NOT NULL,status TEXT NOT NULL,
      records TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,finished_at TEXT,error TEXT
    )`);
  }

  withStage(payload, context, phase, operation) {
    const pending = this._withStage(payload, context, phase, operation);
    this.operations.add(pending);
    void pending.finally(() => this.operations.delete(pending)).catch(() => {});
    return pending;
  }

  async _withStage(payload, context, phase, operation) {
    if (this.stopped) throw new PluginError("BUILD_CANCELLED", "构建服务已停止");
    const metadata = packageMetadata(payload.files);
    const files = normalizeFiles(payload.manifest, payload.files, { requireEntrypoints: false });
    const root = this.store.checkedPath(path.join(this.store.accountRoot(context.userId), "staging", `build_${randomUUID()}`));
    const cwd = path.join(root, "package"), internal = path.join(root, "internal");
    fs.mkdirSync(cwd, { recursive: true }); fs.mkdirSync(internal, { recursive: true });
    const records = [], id = `build_${randomUUID()}`;
    this.db.prepare("INSERT INTO plugin_build_runs(id,user_id,preview_id,phase,status,created_at) VALUES(?,?,?,?,'running',?)")
      .run(id, context.userId, context.previewId || null, phase, new Date().toISOString());
    try {
      for (const [name, bytes] of files) {
        if (name === ".npmrc" || name === "npm-shrinkwrap.json") continue;
        const file = this.store.checkedPath(path.join(cwd, name));
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: "wx" });
      }
      const userConfig = path.join(internal, "user.npmrc"), globalConfig = path.join(internal, "global.npmrc"), home = path.join(internal, "home");
      fs.writeFileSync(userConfig, ""); fs.writeFileSync(globalConfig, ""); fs.mkdirSync(home);
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      const env = {
        PATH: [path.dirname(process.execPath), ...(process.platform === "win32" ? [path.join(systemRoot, "System32")] : ["/usr/bin", "/bin"])].join(path.delimiter),
        HOME: home, USERPROFILE: home, TEMP: internal, TMP: internal, CI: "true",
        NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
        NPM_CONFIG_CACHE: path.join(internal, "cache"), NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
        NPM_CONFIG_UPDATE_NOTIFIER: "false", NPM_CONFIG_AUDIT: "false", NPM_CONFIG_FUND: "false", NPM_CONFIG_FETCH_RETRIES: "0", NPM_CONFIG_FETCH_TIMEOUT: "30000",
      };
      if (process.platform === "win32") {
        env.SystemRoot = systemRoot; env.ComSpec = path.join(systemRoot, "System32", "cmd.exe");
        env.PATHEXT = ".COM;.EXE;.BAT;.CMD";
      }
      const run = async args => {
        if (this.stopped) throw new PluginError("BUILD_CANCELLED", "构建服务已停止");
        const started = Date.now();
        const record = { command: ["npm", ...args], elapsedMs: 0, exitCode: null, output: "" };
        records.push(record);
        try {
          const result = await this.execute({ cwd, args, env, timeoutMs: this.timeoutMs });
          record.exitCode = result.exitCode;
          record.output = `${result.stdout || ""}\n${result.stderr || ""}`.replaceAll(root, "[staging]").slice(-4000);
          if (result.exitCode !== 0) throw new PluginError("BUILD_FAILED", `npm ${args[0]} 执行失败：${record.output.slice(-1000)}`);
        } catch (error) { record.output = String(error.message).replaceAll(root, "[staging]").slice(-4000); throw error; }
        finally { record.elapsedMs = Date.now() - started; this.db.prepare("UPDATE plugin_build_runs SET records=? WHERE id=?").run(JSON.stringify(records), id); }
      };
      const result = await operation({ cwd, metadata, run });
      this.db.prepare("UPDATE plugin_build_runs SET status='completed',finished_at=? WHERE id=?").run(new Date().toISOString(), id);
      return result;
    } catch (error) {
      this.db.prepare("UPDATE plugin_build_runs SET status='failed',error=?,finished_at=? WHERE id=?").run(String(error.message).replaceAll(root, "[staging]"), new Date().toISOString(), id);
      throw error;
    } finally { fs.rmSync(this.store.checkedPath(root), { recursive: true, force: true }); }
  }

  async prepare(payload, context) {
    const metadata = packageMetadata(payload.files);
    const dependencies = { ...metadata.dependencies, ...metadata.devDependencies, ...metadata.optionalDependencies, ...metadata.peerDependencies };
    if (!Object.keys(dependencies).length) return { lockfile: null, hash: null, dependencies: [] };
    return this.withStage(payload, context, "resolve", async ({ cwd, run }) => {
      if (fs.existsSync(path.join(cwd, "package-lock.json"))) validateLock(JSON.parse(fs.readFileSync(path.join(cwd, "package-lock.json"), "utf8")));
      await run(["install", "--package-lock-only", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"]);
      const lockfile = fs.readFileSync(path.join(cwd, "package-lock.json"), "utf8");
      const lock = validateLock(JSON.parse(lockfile));
      const resolved = Object.keys(dependencies).map(name => {
        const version = lock.packages[`node_modules/${name}`]?.version;
        if (!version) throw new PluginError("DEPENDENCY_LOCK_INVALID", `依赖 ${name} 未解析出精确版本`);
        return { name, version };
      });
      return { lockfile, hash: createHash("sha256").update(lockfile).digest("hex"), dependencies: resolved };
    });
  }

  async build(payload, context) {
    if (!context.confirmation?.acceptsWeakSandboxRisk || (payload.buildScripts?.length && !context.confirmation.acceptsOpenInternetBuildScripts)) {
      throw new PluginError("RISK_CONFIRMATION_REQUIRED", "构建前必须确认预览中的脚本和隔离限制", 409);
    }
    return this.withStage(payload, context, "build", async ({ cwd, metadata, run }) => {
      if (payload.dependencies?.length) {
        if (!payload.lockfile) throw new PluginError("DEPENDENCY_LOCK_INVALID", "缺少安装预览固定的依赖锁文件");
        validateLock(JSON.parse(payload.lockfile));
        fs.writeFileSync(path.join(cwd, "package-lock.json"), payload.lockfile);
        await run(["ci", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"]);
      }
      for (const name of SCRIPT_ORDER) {
        if (!metadata.scripts?.[name]) continue;
        const approved = payload.buildScripts?.find(script => script.name === name);
        if (!approved || approved.command !== metadata.scripts[name]) throw new PluginError("PREVIEW_HASH_MISMATCH", "构建脚本与预览不一致");
        // Run only the named, previewed script; do not implicitly run pre/post hooks.
        await run(["run-script", name, "--ignore-scripts"]);
      }
      if (payload.dependencies?.length && Object.keys(metadata.devDependencies || {}).length) {
        await run(["prune", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]);
      }
      const files = Object.create(null);
      let bytes = 0, count = 0;
      const walk = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const full = this.store.checkedPath(path.join(directory, entry.name)), relative = path.relative(cwd, full).split(path.sep).join("/");
          if (relative === "node_modules/.bin" || relative === ".npmrc") continue;
          if (entry.isDirectory()) { walk(full); continue; }
          if (!entry.isFile()) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "构建产物包含链接或特殊文件");
          const size = fs.statSync(full).size;
          bytes += size; count++;
          if (bytes > MAX_PACKAGE_BYTES || count > 1000) throw new PluginError("PACKAGE_TOO_LARGE", "构建产物超过插件包限制");
          files[relative] = fs.readFileSync(full);
        }
      };
      walk(cwd);
      normalizeFiles(payload.manifest, files);
      return files;
    });
  }

  runProcess({ cwd, args, env, timeoutMs }) {
    if (this.stopped) return Promise.reject(new PluginError("BUILD_CANCELLED", "构建服务已停止"));
    if (!fs.existsSync(this.npmCli)) return Promise.reject(new PluginError("BUILD_UNAVAILABLE", "找不到 npm CLI，请配置 STZH_PLUGIN_NPM_CLI"));
    return new Promise((resolve, reject) => {
      const windows = process.platform === "win32";
      const command = windows ? path.join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : process.execPath;
      const commandArgs = windows
        ? ["-NoProfile", "-NonInteractive", "-File", path.join(__dirname, "windows-build-job.ps1"), "-PayloadB64", Buffer.from(JSON.stringify({ node: process.execPath, args: [this.npmCli, ...args] })).toString("base64")]
        : [this.npmCli, ...args];
      const child = spawn(command, commandArgs, { cwd, env, windowsHide: true, detached: !windows, stdio: ["ignore", "pipe", "pipe"] });
      const entry = { child, cwd, stop: null, done: null };
      let complete;
      entry.done = new Promise(done => { complete = done; });
      this.active.add(entry);
      let stdout = "", stderr = "", size = 0, cause = null;
      entry.stop = error => {
        if (cause) return;
        cause = error;
        if (child.pid && child.exitCode === null) {
          if (process.platform === "win32") {
            // Terminating the wrapper closes its job handle and kills the entire tree atomically.
            child.kill();
          } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill(); } }
        }
      };
      const capture = (chunk, stream) => {
        size += chunk.length;
        if (size > 128 * 1024) { entry.stop(new PluginError("BUILD_OUTPUT_LIMIT", "构建日志超过128KB")); return; }
        if (stream === "stdout") stdout += chunk.toString(); else stderr += chunk.toString();
      };
      child.stdout.on("data", chunk => capture(chunk, "stdout")); child.stderr.on("data", chunk => capture(chunk, "stderr"));
      const timer = setTimeout(() => entry.stop(new PluginError("BUILD_TIMEOUT", "插件构建超时")), timeoutMs);
      child.on("error", error => { cause ||= error; });
      child.on("close", code => {
        clearTimeout(timer); this.active.delete(entry); complete();
        if (cause) reject(cause); else resolve({ exitCode: code, stdout, stderr });
      });
    });
  }

  async stop() {
    this.stopped = true;
    const active = [...this.active];
    for (const entry of active) entry.stop(new PluginError("BUILD_CANCELLED", "插件构建已取消"));
    await Promise.all(active.map(entry => entry.done));
    await Promise.allSettled([...this.operations]);
  }
}

module.exports = { PluginBuildRunner, packageMetadata, validateLock, SCRIPT_ORDER };
