"use strict";

// This process has no application environment or database handles.
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const readline = require("node:readline");
const MAX_MESSAGE = 256 * 1024;
let session, plugin, ready = false;
const brokerRequests = new Map();

console.log = console.info = console.warn = (...args) => process.stderr.write(`${args.map(String).join(" ").slice(0, 2000)}\n`);
function send(type, requestId, payload = {}) {
  const message = JSON.stringify({ protocolVersion: 1, generationId: session.generationId, token: session.token, type, requestId, ...payload });
  if (Buffer.byteLength(message) > MAX_MESSAGE) throw new Error("Plugin response exceeds 256KB");
  process.stdout.write(`${message}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("close", () => process.exit(0));
rl.on("line", line => {
  if (Buffer.byteLength(line) > MAX_MESSAGE) { process.exit(2); return; }
  let message;
  try { message = JSON.parse(line); } catch { process.exit(2); return; }
  if (!message || message.protocolVersion !== 1 || typeof message.requestId !== "string" || message.requestId.length > 100) return;
  if (!session) {
    if (message.type !== "hello" || !/^[a-f0-9]{64}$/.test(message.token || "")) return;
    session = { generationId: message.generationId, token: message.token };
  }
  if (message.generationId !== session.generationId || message.token !== session.token) return;
  if (message.type === "result") {
    const pending = brokerRequests.get(message.requestId);
    if (!pending) return;
    brokerRequests.delete(message.requestId);
    if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.value);
    return;
  }
  void (async () => {
    if (message.type === "hello") {
      if (ready) throw new Error("Duplicate plugin initialization");
      const root = process.cwd();
      const entry = path.resolve(root, message.entrypoint);
      if (path.relative(root, entry).startsWith("..") || path.isAbsolute(path.relative(root, entry))) throw new Error("Invalid plugin entrypoint");
      const module = await import(pathToFileURL(entry).href);
      const exported = module.default || module;
      const context = Object.freeze({
        pluginId: message.pluginId,
        config: Object.freeze(message.config || {}),
        call(method, input = {}) {
          if (brokerRequests.size >= 16) return Promise.reject(new Error("Too many pending capability requests"));
          const requestId = randomUUID();
          return new Promise((resolve, reject) => {
            brokerRequests.set(requestId, { resolve, reject });
            try { send("event", requestId, { method, input }); }
            catch (error) { brokerRequests.delete(requestId); reject(error); }
          });
        },
      });
      plugin = typeof exported.activate === "function" ? await exported.activate(context) : exported;
      if (!plugin || typeof plugin !== "object") throw new Error("Plugin must export an object or activate(context)");
      const tools = Object.keys(plugin.tools || {});
      if (tools.some(name => typeof plugin.tools[name] !== "function")) throw new Error("Plugin tools must be functions");
      ready = true;
      send("register", message.requestId, { value: { tools, protocolVersion: 1 } });
    } else if (message.type === "invoke") {
      if (!ready || !Object.hasOwn(plugin.tools || {}, message.tool)) throw new Error("Unknown plugin tool");
      const value = await plugin.tools[message.tool](message.input);
      send("result", message.requestId, { value: value ?? null });
    } else if (message.type === "health") {
      const result = typeof plugin?.health === "function" ? await plugin.health() : true;
      send("result", message.requestId, { value: { ok: ready && result !== false && result?.ok !== false } });
    } else if (message.type === "dispose" || message.type === "shutdown") {
      ready = false;
      if (typeof plugin?.dispose === "function") await plugin.dispose();
      send("result", message.requestId, { value: { ok: true } });
      setImmediate(() => process.exit(0));
    } else throw new Error("Unknown protocol message");
  })().catch(error => {
    try { send("result", message.requestId, { error: String(error?.message || error).slice(0, 2000) }); }
    catch { process.exit(2); }
  });
});
