"use strict";

const { EventEmitter } = require("events");

const bus = new EventEmitter();
bus.setMaxListeners(100);

function publish(userId, type, payload) {
  bus.emit("event", {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { bus, publish };
