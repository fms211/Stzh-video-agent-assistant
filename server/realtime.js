"use strict";

const jwt = require("jsonwebtoken");
const { WebSocketServer, WebSocket } = require("ws");
const db = require("./db.js");
const { JWT_SECRET } = require("./routes/auth.js");
const { bus, publish } = require("./events.js");
const { serializeTask } = require("./routes/tasks.js");

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function attachRealtime(server) {
  if (server.stzhRealtime) return server.stzhRealtime;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: false,
  });

  function onUpgrade(request, socket, head) {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (!url.pathname.startsWith("/ws/")) return;

    wss.handleUpgrade(request, socket, head, (websocket) => {
      websocket.stzhUrl = url;
      wss.emit("connection", websocket, request);
    });
  }

  server.on("upgrade", onUpgrade);

  wss.on("connection", (socket) => {
    const token = socket.stzhUrl.searchParams.get("token");
    const deviceId = socket.stzhUrl.searchParams.get("deviceId");
    let user;
    try {
      user = jwt.verify(token || "", JWT_SECRET);
    } catch {
      socket.close(4401, "需要登录");
      return;
    }

    let device = null;
    if (deviceId) {
      device = db.deviceGet(deviceId, user.userId);
      if (!device) {
        socket.close(4403, "设备未配对");
        return;
      }
      db.deviceTouch(deviceId, user.userId, "online");
    }

    const onEvent = (event) => {
      if (event.userId === user.userId) send(socket, event);
    };
    bus.on("event", onEvent);

    send(socket, {
      id: `evt_${Date.now()}_ready`,
      type: "connection.ready",
      timestamp: new Date().toISOString(),
      payload: {
        userId: user.userId,
        deviceId: device?.id || null,
        paired: Boolean(device),
      },
    });

    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", payload: { message: "消息格式不正确" } });
        return;
      }
      if (message.type === "ping") {
        send(socket, { type: "pong", timestamp: new Date().toISOString() });
        if (deviceId) db.deviceTouch(deviceId, user.userId, "online");
        return;
      }
      if (message.type === "task.action") {
        const result = db.taskAction(
          String(message.payload?.taskId || ""),
          user.userId,
          String(message.payload?.action || ""),
          message.payload || {}
        );
        if (result.task && !result.reason) {
          publish(user.userId, "task.updated", { task: serializeTask(result.task) });
        } else {
          send(socket, {
            type: "task.rejected",
            payload: { taskId: message.payload?.taskId, reason: result.reason || "unknown" },
          });
        }
      }
    });

    socket.on("close", () => {
      bus.off("event", onEvent);
      if (deviceId) db.deviceTouch(deviceId, user.userId, "offline");
    });
  });

  const realtime = {
    wss,
    async close() {
      server.off("upgrade", onUpgrade);
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
  server.stzhRealtime = realtime;
  return realtime;
}

module.exports = { attachRealtime };
