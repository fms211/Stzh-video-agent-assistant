"use strict";

const crypto = require("node:crypto");
const { Router } = require("express");
const db = require("../db.js");
const { createAccountAgentService } = require("../account-agent-service.js");
const {
  AgentServiceError,
  createConfiguredAgentService,
  validatePrompt,
} = require("../agent-service.js");

function createRequestId() {
  return crypto.randomUUID();
}

function createDefaultAgentService() {
  return createConfiguredAgentService();
}

function createDisconnectController(res) {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded && !controller.signal.aborted) {
      controller.abort(new DOMException("客户端已断开", "AbortError"));
    }
  };
  res.once("close", abort);
  return {
    signal: controller.signal,
    dispose() { res.removeListener("close", abort); },
  };
}

function errorStatus(error) {
  if (error instanceof AgentServiceError && [400, 401, 404, 409, 413, 500].includes(error.status)) return error.status;
  return 502;
}

function errorBody(error) {
  return {
    message: error instanceof Error ? error.message : "Internal server error",
    ...(error instanceof AgentServiceError && error.code ? { code: error.code } : {}),
  };
}

function createAgentRouter(options = {}) {
  const router = Router();
  const maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 5);
  let activeRequests = 0;
  let defaultService;
  const accountServices = new WeakMap();
  const serviceFor = (req) => {
    const service = req.app.locals.agentService
      || (typeof req.app.locals.agentServiceFactory === "function"
        ? req.app.locals.agentServiceFactory(req)
        : (defaultService ||= createDefaultAgentService()));
    if (!accountServices.has(service)) accountServices.set(service, createAccountAgentService({ db, service }));
    return accountServices.get(service);
  };

  router.post("/api/agent", async (req, res) => {
    if (activeRequests >= maxConcurrent) {
      return res.status(429).json({ error: { message: "服务器繁忙，请稍后再试" } });
    }
    try {
      validatePrompt(req.body?.prompt);
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: { message: error.message } });
    }
    activeRequests += 1;
    const requestId = createRequestId();
    const createdAt = new Date().toISOString();
    const disconnect = createDisconnectController(res);
    try {
      const result = await serviceFor(req).generate({
        accountId: req.user.userId,
        prompt: req.body.prompt,
        history: req.body.history,
        historyOmitted: req.body.historyOmitted,
        currentConstraints: req.body.currentConstraints,
        excludedMemoryIds: req.body.excludedMemoryIds,
        projectId: req.body.projectId,
        conversationId: req.body.conversation_id || req.body.conversationId,
        attachments: [],
        signal: disconnect.signal,
      });
      const response = {
        requestId,
        createdAt,
        ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
        ...(result.imageUrls?.length ? { imageUrls: result.imageUrls } : {}),
        text: result.text || "",
        conversationId: result.conversationId || null,
        chatId: result.chatId || null,
        followUps: Array.isArray(result.followUps) ? result.followUps : [],
        ...(result.contextTrace ? { contextTrace: result.contextTrace } : {}),
        ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      };
      if (!response.videoUrl && !response.imageUrls) response.raw = { text: response.text };
      if (!res.destroyed) return res.json(response);
    } catch (error) {
      if (!res.destroyed) {
        return res.status(errorStatus(error)).json({
          error: errorBody(error),
        });
      }
    } finally {
      disconnect.dispose();
      activeRequests -= 1;
    }
  });

  router.post("/api/agent/stream", async (req, res) => {
    if (activeRequests >= maxConcurrent) {
      return res.status(429).json({ error: { message: "服务器繁忙，请稍后再试" } });
    }
    try {
      validatePrompt(req.body?.prompt);
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: { message: error.message } });
    }
    activeRequests += 1;
    const disconnect = createDisconnectController(res);
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      const result = await serviceFor(req).generate({
        accountId: req.user.userId,
        prompt: req.body.prompt,
        history: req.body.history,
        historyOmitted: req.body.historyOmitted,
        currentConstraints: req.body.currentConstraints,
        excludedMemoryIds: req.body.excludedMemoryIds,
        projectId: req.body.projectId,
        conversationId: req.body.conversation_id || req.body.conversationId,
        attachments: [],
        signal: disconnect.signal,
        onDelta: (content) => {
          if (!res.destroyed) {
            res.write(`event: delta\ndata: ${JSON.stringify({ content })}\n\n`);
          }
        },
      });
      if (res.destroyed) return;
      for (const suggestion of result.followUps || []) {
        res.write(`event: follow_up\ndata: ${JSON.stringify({ suggestions: [suggestion] })}\n\n`);
      }
      res.write(`event: done\ndata: ${JSON.stringify({
        ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
        ...(result.imageUrls?.length ? { imageUrls: result.imageUrls } : {}),
        text: result.text || "",
        conversationId: result.conversationId || null,
        chatId: result.chatId || null,
        done: true,
        ...(result.contextTrace ? { contextTrace: result.contextTrace } : {}),
        ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      })}\n\n`);
      res.end();
    } catch (error) {
      if (!res.destroyed) {
        const errorPayload = errorBody(error);
        if (!res.headersSent) return res.status(errorStatus(error)).json({ error: errorPayload });
        res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
        res.end();
      }
    } finally {
      disconnect.dispose();
      activeRequests -= 1;
    }
  });

  router.getAgentRouteState = () => ({ activeRequests, maxConcurrent });
  return router;
}

module.exports = createAgentRouter();
module.exports.createAgentRouter = createAgentRouter;
module.exports.createDefaultAgentService = createDefaultAgentService;
