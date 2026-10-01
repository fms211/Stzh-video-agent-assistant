"use strict";

function normalizeCapabilities(input = {}) {
  const contextWindowTokens = input.contextWindowTokens == null ? null : input.contextWindowTokens;
  const maxOutputTokens = input.maxOutputTokens ?? 2000;
  const safetyMarginTokens = input.safetyMarginTokens ?? 1024;
  const outputTokenParameter = input.outputTokenParameter ?? "max_tokens";
  if ((contextWindowTokens !== null && (!Number.isSafeInteger(contextWindowTokens) || contextWindowTokens < 2048 || contextWindowTokens > 2000000))
    || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 200000
    || !Number.isSafeInteger(safetyMarginTokens) || safetyMarginTokens < 256 || safetyMarginTokens > 200000
    || (contextWindowTokens !== null && contextWindowTokens - maxOutputTokens - safetyMarginTokens < 256)
    || !["max_tokens", "max_completion_tokens"].includes(outputTokenParameter)) {
    throw Object.assign(new Error("模型容量无效：上下文须足够容纳输出上限、安全余量和至少256输入单位"), { status: 400, code: "INVALID_MODEL_CAPACITY" });
  }
  return { contextWindowTokens, maxOutputTokens, safetyMarginTokens, outputTokenParameter };
}

function providerPayload(config, messages) {
  const capacity = normalizeCapabilities(config);
  if(config.thinkingMode!==undefined && !["default","enabled","disabled"].includes(config.thinkingMode)) throw Object.assign(new Error("思考设置无效"),{status:400});
  const thinking = config.thinkingMode && config.thinkingMode!=="default" ? {thinking:{type:config.thinkingMode}} : {};
  if (config.protocol === "anthropic") return {
    model: config.model, max_tokens: capacity.maxOutputTokens, ...thinking,
    messages: messages.filter(message => message.role !== "system"),
    system: messages.filter(message => message.role === "system").map(message => message.content).join("\n\n") || undefined,
  };
  return { model: config.model, messages, temperature: 0.7, ...thinking,
    ...(config.maxOutputTokens !== undefined ? { [capacity.outputTokenParameter]: capacity.maxOutputTokens } : {}),
  };
}
function estimatePayload(config, messages) {
  // Byte-based conservative estimate of the complete outgoing JSON; this is
  // deliberately labelled an estimate, not a provider tokenizer measurement.
  return Buffer.byteLength(JSON.stringify(providerPayload(config, messages)), "utf8") + 16;
}
module.exports = { normalizeCapabilities, providerPayload, estimatePayload };
