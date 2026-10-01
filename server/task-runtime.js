"use strict";

const { bus } = require("./events.js");

class LeaseLostError extends Error {
  constructor(taskId, operation) {
    super(`任务 ${taskId} 在 ${operation} 时已失去租约`);
    this.name = "LeaseLostError";
    this.code = "LEASE_LOST";
  }
}

class TaskRuntime {
  constructor(options = {}) {
    if (!options.db) throw new TypeError("TaskRuntime 需要注入 db");
    if (typeof options.execute !== "function") throw new TypeError("TaskRuntime 需要注入 execute(task, context)");

    this.db = options.db;
    this.execute = options.execute;
    this.workerId = String(options.workerId || `server-${process.pid}`);
    this.globalConcurrency = Math.max(1, Number(options.globalConcurrency) || 2);
    this.perUserConcurrency = Math.max(1, Number(options.perUserConcurrency) || 1);
    this.leaseMs = Math.max(1_000, Number(options.leaseMs) || 60_000);
    this.renewIntervalMs = Math.max(10, Number(options.renewIntervalMs) || 15_000);
    this.pollIntervalMs = Math.max(10, Number(options.pollIntervalMs) || 1_000);
    this.eventBus = options.eventBus || bus;
    this.onError = typeof options.onError === "function" ? options.onError : () => {};
    this.onTaskUpdate = typeof options.onTaskUpdate === "function" ? options.onTaskUpdate : () => {};
    this.claimOptions = options.claimOptions && typeof options.claimOptions === "object"
      ? { ...options.claimOptions }
      : {};

    this.started = false;
    this.active = new Map();
    this.pollTimer = null;
    this.eventListener = null;
    this.draining = false;
    this.pendingWake = false;
    this.stopPromise = null;
  }

  get activeCount() {
    return this.active.size;
  }

  _notifyTask(task) {
    if (!task) return;
    try {
      this.onTaskUpdate(task);
    } catch (error) {
      this.onError(error);
    }
  }

  _recoverExpiredLeases() {
    const recovered = this.db.taskRecoverExpiredLeases();
    for (const task of recovered) this._notifyTask(task);
    return recovered;
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.eventListener = (event) => {
      if (event?.type === "task.updated") this.wake();
    };
    this.eventBus.on("event", this.eventListener);
    this.pollTimer = setInterval(() => this.wake(), this.pollIntervalMs);
    this.pollTimer.unref?.();
    this._recoverExpiredLeases();
    this.wake();
    return this;
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    if (!this.started && this.active.size === 0) return Promise.resolve();

    this.started = false;
    this.pendingWake = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.eventListener) {
      this.eventBus.removeListener("event", this.eventListener);
      this.eventListener = null;
    }

    const executions = [];
    for (const entry of this.active.values()) {
      entry.controller.abort(new Error("TaskRuntime 正在优雅停止"));
      executions.push(entry.promise);
    }
    for (const task of this.db.taskReleaseWorkerLeases(this.workerId)) this._notifyTask(task);

    this.stopPromise = Promise.allSettled(executions).then(() => {
      for (const task of this.db.taskReleaseWorkerLeases(this.workerId)) this._notifyTask(task);
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  wake() {
    if (!this.started) return this;
    this.pendingWake = true;
    if (this.draining) return this;
    this.draining = true;
    queueMicrotask(() => {
      try {
        while (this.started && this.pendingWake) {
          this.pendingWake = false;
          this._fillAvailableSlots();
        }
      } catch (error) {
        this.onError(error);
      } finally {
        this.draining = false;
        if (this.started && this.pendingWake) this.wake();
      }
    });
    return this;
  }

  abortTask(taskId, reason = new Error("任务执行已中止")) {
    const entry = this.active.get(taskId);
    if (!entry) return false;
    if (!entry.controller.signal.aborted) entry.controller.abort(reason);
    return true;
  }

  _fillAvailableSlots() {
    this._recoverExpiredLeases();
    while (this.started && this.active.size < this.globalConcurrency) {
      const task = this.db.taskClaimNext(this.workerId, {
        ...this.claimOptions,
        leaseSeconds: Math.ceil(this.leaseMs / 1000),
      });
      if (!task) break;

      const activeForUser = [...this.active.values()].filter(
        (entry) => entry.task.user_id === task.user_id
      ).length;
      if (activeForUser >= this.perUserConcurrency) {
        this.db.taskReleaseLease(task.id, task.lease_token);
        break;
      }
      this._notifyTask(task);
      this._beginExecution(task);
    }
  }

  _beginExecution(task) {
    const controller = new AbortController();
    const entry = {
      task,
      controller,
      renewalTimer: null,
      promise: null,
    };
    this.active.set(task.id, entry);

    entry.renewalTimer = setInterval(() => {
      try {
        const result = this.db.taskRenewLease(task.id, task.lease_token, {
          leaseSeconds: Math.ceil(this.leaseMs / 1000),
        });
        if (!result.ok) controller.abort(new LeaseLostError(task.id, "续租"));
      } catch (error) {
        this.onError(error);
        controller.abort(error);
      }
    }, this.renewIntervalMs);
    entry.renewalTimer.unref?.();

    const context = {
      signal: controller.signal,
      reportProgress: async (progress, stage = "", output) => {
        const result = this.db.taskReportProgress(task.id, task.lease_token, {
          progress,
          stage,
          output,
          leaseSeconds: Math.ceil(this.leaseMs / 1000),
        });
        if (!result.ok) throw new LeaseLostError(task.id, "更新进度");
        this._notifyTask(result.task);
        return result.task;
      },
    };

    entry.promise = Promise.resolve()
      .then(() => this.execute(task, context))
      .then((output) => {
        const result = this.db.taskCompleteLease(task.id, task.lease_token, { output });
        if (result.ok) this._notifyTask(result.task);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          const result = this.db.taskFailLease(task.id, task.lease_token, {
            error: error?.message || String(error),
          });
          if (result.ok) this._notifyTask(result.task);
          if (!result.ok && result.reason !== "lease_lost") this.onError(error);
        }
      })
      .finally(() => {
        clearInterval(entry.renewalTimer);
        this.active.delete(task.id);
        if (this.started) this.wake();
      });
  }
}

module.exports = { LeaseLostError, TaskRuntime };
