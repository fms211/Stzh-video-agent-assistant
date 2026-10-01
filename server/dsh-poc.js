"use strict";

const { spawn } = require("node:child_process");

function safeEnvironment() {
  const env = {};
  for (const key of ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function runDshPoc({ command, task, args = [], signal, spawnImpl = spawn }) {
  if (!command || typeof command !== "string") return Promise.reject(new Error("必须显式提供 DSH headless 命令"));
  const safeTask = String(task || "").trim();
  if (!safeTask || safeTask.length > 2_000) return Promise.reject(new Error("POC 任务必须是 1-2000 字符的合成测试说明"));
  const payload = JSON.stringify({
    kind: "isolated-dsh-poc",
    task: safeTask,
    allowNetwork: false,
    allowUserData: false,
    allowCoze: false,
    allowModelSecrets: false,
  });
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, [...args, payload], {
      env: safeEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    child.stdout?.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(0, 1_000_000); });
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(0, 32_000); });
    child.on("error", finish((error) => reject(error)));
    child.on("close", finish((code) => {
      if (code !== 0) return reject(new Error(`DSH POC 退出码 ${code}: ${stderr || "无错误输出"}`));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error("DSH POC 未返回有效 JSON 结果")); }
    }));
    signal?.addEventListener("abort", () => {
      child.kill();
      finish(() => reject(signal.reason || new DOMException("Aborted", "AbortError")))();
    }, { once: true });
  });
}

if (require.main === module) {
  const command = process.env.DSH_HEADLESS_COMMAND;
  const task = process.argv.slice(2).join(" ");
  runDshPoc({ command, task }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { runDshPoc, safeEnvironment };
