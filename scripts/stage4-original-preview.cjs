"use strict";

const path = require("node:path"), net = require("node:net");
const root = path.resolve(__dirname, "..");
const { inspectOriginalWebPreview, backupOriginalWebPreview } = require(path.join(root, "server/lib/original-web-preview.js"));

async function assertPortAvailable() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () => reject(Object.assign(new Error("18080仍被占用，请先在原后端终端停止旧服务；不会自动结束进程或换端口"), { code: "ORIGINAL_PORT_IN_USE" })));
    probe.listen(18080, "127.0.0.1", () => probe.close(resolve));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(value => value !== "--check")) throw Object.assign(new Error("仅支持--check只读检查，或不带参数启动"), { code: "ORIGINAL_ARGUMENT_INVALID" });
  const prepared = inspectOriginalWebPreview({ root });
  if (args.includes("--check")) { console.log(JSON.stringify(prepared.report)); return; }
  // Detect the old listener before any backup/application migration. This is
  // not a process manager and never stops/replaces someone else's service.
  await assertPortAvailable();
  const backup = await backupOriginalWebPreview(prepared);
  Object.assign(process.env, prepared.effective, { STZH_WEATHER_ENABLED: "0" });
  const { createLocalModelPreviewFetch } = require(path.join(root, "server/lib/local-model-preview.js"));
  const network = createLocalModelPreviewFetch(global.fetch);
  global.fetch = network.fetch;
  const app = require(path.join(root, "server/app.js"));
  app.locals.taskRuntimeState = { enabled: false, runtime: null, reason: "CONFIG_DISABLED" };
  const { attachRealtime } = require(path.join(root, "server/realtime.js"));
  const server = app.listen(18080, "127.0.0.1", () => {
    console.log(JSON.stringify({ base: "http://127.0.0.1:18080", dataDir: prepared.dataDir,
      originalAccountEnvironment: true, mediaRuntimeEnabled: false, contextMode: "shadow",
      externalPolicy: "mimo_text_and_models_only", backupIntegrity: backup.backupIntegrity }));
  });
  const realtime = attachRealtime(server);
  server.on("error", () => { console.error("原账号服务启动失败；请检查端口。不会自动结束其他进程。"); process.exitCode = 1; });
  server.on("close", () => { void realtime.close(); void app.locals.researchRuntime?.stop(); void app.locals.pluginService?.stop(); });
  const shutdown = () => { server.close(); void realtime.close(); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch(error => {
  const expected = typeof error.code === "string" && error.code.startsWith("ORIGINAL_");
  console.error(JSON.stringify({ ready: false, code: expected ? error.code : "ORIGINAL_START_FAILED",
    message: expected ? error.message : "原账号检查或启动失败；请核对数据库与原配置，不会自动重置账户或密钥" }));
  process.exitCode = 1;
});
