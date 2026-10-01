"use strict";

const dbDefault = require("./db.js");
const { publish } = require("./events.js");
const { serializeTask } = require("./routes/tasks.js");
const { AgentServiceError, createConfiguredAgentService } = require("./agent-service.js");
const { AttachmentService } = require("./attachment-service.js");
const { createVideoGenerateExecutor } = require("./video-generate-executor.js");
const { TaskRuntime } = require("./task-runtime.js");
const { syncAgentRunFromTask } = require("./agent-run-linkage.js");
const { createTaskNotification } = require("./task-notifications.js");
const { createAccountAgentService } = require("./account-agent-service.js");

function createTaskRuntime(options = {}) {
  const db = options.db || dbDefault;
  const attachmentService = options.attachmentService || new AttachmentService({ db });
  const agentService = options.agentService || createConfiguredAgentService({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });
  const videoExecutor = options.videoExecutor || createVideoGenerateExecutor({
    agentService: createAccountAgentService({ db, service: agentService }),
    attachmentService,
  });
  const onTaskUpdate = typeof options.onTaskUpdate === "function" ? options.onTaskUpdate : () => {};
  const onError = typeof options.onError === "function"
    ? options.onError
    : (error) => console.error("[TaskRuntime]", error?.message || error);

  const runtime = new TaskRuntime({
    db,
    workerId: options.workerId,
    globalConcurrency: options.globalConcurrency || 2,
    perUserConcurrency: options.perUserConcurrency || 1,
    leaseMs: options.leaseMs,
    renewIntervalMs: options.renewIntervalMs,
    pollIntervalMs: options.pollIntervalMs,
    eventBus: options.eventBus,
    claimOptions: {
      executionMode: "server",
      kinds: ["video.generate"],
    },
    execute: async (task, context) => videoExecutor(task, context),
    onError,
    onTaskUpdate: (task) => {
      syncAgentRunFromTask(db, task);
      const notification = createTaskNotification(db, task);
      if (notification?.created) {
        publish(task.user_id, "notification.created", { notification: notification.notification });
      }
      onTaskUpdate(task);
      publish(task.user_id, "task.updated", { task: serializeTask(task) });
    },
  });
  runtime.attachmentService = attachmentService;
  return runtime;
}

function startProductionTaskRuntime(options = {}) {
  let runtime;
  try {
    runtime = createTaskRuntime(options);
  } catch (error) {
    if (error instanceof AgentServiceError && error.code === "MISSING_CONFIG") {
      return { enabled: false, runtime: null, reason: "MISSING_CONFIG" };
    }
    throw error;
  }

  runtime.start();
  const cleanupIntervalMs = Math.max(60_000, Number(options.cleanupIntervalMs) || 15 * 60_000);
  const cleanupTimer = setInterval(() => {
    runtime.attachmentService.cleanup().catch((error) => {
      (options.onError || console.error)("[AttachmentCleanup]", error?.message || error);
    });
  }, cleanupIntervalMs);
  cleanupTimer.unref?.();
  const stopRuntime = runtime.stop.bind(runtime);
  runtime.stop = () => {
    clearInterval(cleanupTimer);
    return stopRuntime();
  };
  return { enabled: true, runtime, reason: null };
}

module.exports = {
  createTaskRuntime,
  startProductionTaskRuntime,
};
