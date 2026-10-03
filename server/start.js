// 云服务器启动入口
// 用法: node start.js

require("dotenv").config({ path: __dirname + "/.env.local" });

const app = require("./app.js");
const { attachRealtime } = require("./realtime.js");
const { startProductionTaskRuntime } = require("./task-runtime-bootstrap.js");
const PORT = Number(process.env.PORT) || 80;

const runtimeState = startProductionTaskRuntime();
app.locals.taskRuntime = runtimeState.runtime;
app.locals.taskRuntimeState = runtimeState;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  腾昇智和 · Video Workspace`);
  console.log  (`  监听: http://0.0.0.0:${PORT}`);
  console.log(runtimeState.enabled
    ? "[TaskRuntime] 服务端视频任务执行已启用"
    : `[TaskRuntime] 未启用（${runtimeState.reason}）：此进程不领取视频任务`);
  console.log  (`  鉴权: ${process.env.API_SECRET_KEY ? "已启用" : "未启用"}\n`);
});
server.stzhTaskRuntime = runtimeState.runtime;
const realtime = attachRealtime(server);
server.on("close", () => {
  void app.locals.researchRuntime?.stop();
  void app.locals.pluginService?.stop();
  void runtimeState.runtime?.stop();
  void realtime?.close();
});
