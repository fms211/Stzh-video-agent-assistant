"use strict";

class PluginError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PluginError";
    this.code = code;
    this.status = status;
  }
}

module.exports = { PluginError };
