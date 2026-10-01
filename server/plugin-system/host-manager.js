"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { PluginError } = require("./errors.js");
const { packageRelativePath, normalizeFiles } = require("./manifest.js");
const MAX_MESSAGE = 256 * 1024;

class PluginHost {
  constructor({ root, entrypoint, generationId, pluginId, config = {}, broker, timeoutMs = 5000 }) {
    this.root = fs.realpathSync(root);
    this.entrypoint = packageRelativePath(entrypoint);
    this.generationId = generationId;
    this.pluginId = pluginId;
    this.config = config;
    this.broker = broker;
    this.timeoutMs = timeoutMs;
    this.token = randomBytes(32).toString("hex");
    this.child = null;
    this.ready = false;
    this.pending = new Map();
    this.logBytes = 0;
    this.brokerActive = 0;
  }

  async start() {
    if (this.child) throw new PluginError("GENERATION_CONFLICT", "插件宿主已经启动", 409);
    if (!process.allowedNodeEnvironmentFlags.has("--permission") || !process.allowedNodeEnvironmentFlags.has("--allow-net")) {
      throw new PluginError("HOST_RUNTIME_UNSUPPORTED", "插件宿主需要支持网络权限控制的 Node.js 运行时；核心 Web 功能不受影响");
    }
    const entry = path.join(__dirname, "..", "plugin-host", "entry.js");
    const env = { PATH: path.dirname(process.execPath), TEMP: this.root, TMP: this.root };
    if (process.platform === "win32") env.SystemRoot = process.env.SystemRoot || "C:\\Windows";
    this.child = spawn(process.execPath, [
      "--permission", `--allow-fs-read=${this.root}`, `--allow-fs-read=${path.dirname(entry)}`,
      "--max-old-space-size=128", entry,
    ], { cwd: this.root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_MESSAGE) { this._terminate(new PluginError("PLUGIN_OUTPUT_LIMIT", "插件输出超过256KB")); return; }
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); }
        catch { this._terminate(new PluginError("PLUGIN_PROTOCOL_ERROR", "插件输出了无效的协议消息")); return; }
        this._message(message);
      }
    });
    this.child.stderr.on("data", chunk => {
      this.logBytes += chunk.length;
      if (this.logBytes > 64 * 1024) this._terminate(new PluginError("PLUGIN_OUTPUT_LIMIT", "插件日志输出超过限制"));
    });
    this.child.stdin.on("error", () => {});
    this.child.on("error", error => this._fail(new PluginError("PLUGIN_HOST_EXITED", `无法启动插件宿主：${error.code || "spawn failed"}`)));
    this.child.on("exit", code => {
      this.ready = false;
      this._fail(new PluginError("PLUGIN_HOST_EXITED", `插件宿主已退出（${code}）`));
    });
    try {
      const result = await this._request("hello", { entrypoint: this.entrypoint, pluginId: this.pluginId, config: this.config });
      this.ready = true;
      return result;
    } catch (error) { this._terminate(error); throw error; }
  }

  _message(message) {
    if (!message || message.protocolVersion !== 1 || message.generationId !== this.generationId || message.token !== this.token) {
      this._terminate(new PluginError("PLUGIN_PROTOCOL_ERROR", "插件协议版本或能力令牌不匹配"));
      return;
    }
    if (message.type === "event") {
      if (!this.broker || this.brokerActive >= 16 || typeof message.method !== "string") {
        this._send({ type: "result", requestId: message.requestId, error: "Capability request denied" });
        return;
      }
      this.brokerActive++;
      Promise.resolve().then(() => this.broker(message.method, message.input))
        .then(value => this._send({ type: "result", requestId: message.requestId, value }))
        .catch(error => this._send({ type: "result", requestId: message.requestId, error: String(error.message).slice(0, 2000) }))
        .finally(() => { this.brokerActive--; });
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending || !["register", "result"].includes(message.type)) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.error) pending.reject(new PluginError("PLUGIN_EXECUTION_FAILED", String(message.error)));
    else pending.resolve(message.value);
  }

  _send(message) {
    if (!this.child || this.child.exitCode !== null || this.child.killed) return;
    const json = JSON.stringify({ protocolVersion: 1, generationId: this.generationId, token: this.token, ...message });
    if (Buffer.byteLength(json) > MAX_MESSAGE) throw new PluginError("PLUGIN_OUTPUT_LIMIT", "插件请求超过256KB");
    this.child.stdin.write(`${json}\n`);
  }

  _request(type, payload = {}, timeoutMs = this.timeoutMs) {
    if (!this.child || this.child.exitCode !== null || this.child.killed) return Promise.reject(new PluginError("PLUGIN_HOST_EXITED", "插件宿主未运行"));
    if (this.pending.size >= 16) return Promise.reject(new PluginError("PLUGIN_BUSY", "插件同时执行的请求过多", 429));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this._terminate(new PluginError("PLUGIN_TIMEOUT", "插件执行超时，宿主已停止")), Math.min(120000, Math.max(100, timeoutMs)));
      this.pending.set(requestId, { resolve, reject, timer });
      try { this._send({ type, requestId, ...payload }); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }

  invoke(tool, input, timeoutMs) {
    if (!this.ready) return Promise.reject(new PluginError("PLUGIN_HOST_EXITED", "插件尚未完成健康初始化"));
    return this._request("invoke", { tool, input }, timeoutMs);
  }
  health() { return this._request("health"); }
  _fail(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  _terminate(error) { this.ready = false; this._fail(error); this.child?.kill(); }

  async stop() {
    if (!this.child || this.child.exitCode !== null) return;
    if (this.ready && !this.child.killed) await this._request("shutdown", {}, 500).catch(() => {});
    const child = this.child;
    this._terminate(new PluginError("PLUGIN_HOST_EXITED", "插件宿主已停止"));
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(resolve, 1000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }
}

function createPluginProbe({ store }) {
  return async ({ manifest, files }, { userId, confirmation }) => {
    const normalized = normalizeFiles(manifest, files);
    if (!manifest.entrypoints.host) return;
    if (!confirmation.acceptsWeakSandboxRisk) throw new PluginError("RISK_CONFIRMATION_REQUIRED", "首次执行前需要确认当前隔离能力", 409);
    const root = store.checkedPath(path.join(store.accountRoot(userId), "staging", `probe_${randomUUID()}`));
    fs.mkdirSync(root, { recursive: true });
    let host;
    try {
      for (const [name, content] of normalized) {
        const target = store.checkedPath(path.join(root, name));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, { flag: "wx" });
      }
      host = new PluginHost({ root, entrypoint: manifest.entrypoints.host, generationId: `probe_${randomUUID()}`, pluginId: manifest.id,
        broker: async () => { throw new PluginError("BRIDGE_UNAUTHORIZED", "安装健康检查期间不能访问项目或外部服务"); },
      });
      const registration = await host.start();
      if ((manifest.contributes.tools || []).some(tool => !registration.tools.includes(tool.name))) {
        throw new PluginError("INVALID_MANIFEST", "插件宿主未注册清单中声明的工具");
      }
      if (!(await host.health()).ok) throw new PluginError("PLUGIN_UNHEALTHY", "插件未通过健康检查");
    } finally {
      await host?.stop();
      fs.rmSync(store.checkedPath(root), { recursive: true, force: true });
    }
  };
}

module.exports = { PluginHost, createPluginProbe };
