"use strict";

const { MODES } = require("../shared/studio-context/index.cjs");
const VALID = new Set(["off", "shadow", "enforce"]);
const MODE_KEYS = Object.freeze(Object.fromEntries(MODES.map(mode => [mode, `STZH_CONTEXT_MODE_${mode.toUpperCase()}`])));

// Keep the legacy global default. Never return raw environment values.
function globalRollout(env = process.env) {
  const value = env.STZH_CONTEXT_MODE;
  if (value === undefined || value === "") return { rollout: "shadow", source: "default", configurationValid: true };
  if (VALID.has(value)) return { rollout: value, source: "global", configurationValid: true };
  return { rollout: "shadow", source: "invalid_global", configurationValid: false };
}
function resolveContextRollout(mode, env = process.env) {
  if (!Object.hasOwn(MODE_KEYS, mode)) return { mode: null, rollout: "off", source: "invalid_mode", configurationValid: false };
  const global = globalRollout(env);
  // Explicit global off is the emergency stop for every mode, even overrides.
  if (global.rollout === "off") return { mode, rollout: "off", source: "global_off", configurationValid: true };
  const value = env[MODE_KEYS[mode]];
  if (value === undefined || (typeof value === "string" && !value.trim())) return { mode, ...global };
  const setting = typeof value === "string" ? value.trim() : value;
  if (!VALID.has(setting)) return { mode, rollout: "off", source: "invalid_override", configurationValid: false };
  return { mode, rollout: setting, source: "mode_override", configurationValid: true };
}
function rolloutMode(mode, env = process.env) {
  return mode === undefined ? globalRollout(env).rollout : resolveContextRollout(mode, env).rollout;
}
function contextRolloutStatus(env = process.env) {
  return { ...globalRollout(env), byMode: Object.fromEntries(MODES.map(mode => {
    const { mode: _mode, ...status } = resolveContextRollout(mode, env);
    return [mode, status];
  })) };
}
module.exports = { MODE_KEYS, globalRollout, resolveContextRollout, rolloutMode, contextRolloutStatus };
