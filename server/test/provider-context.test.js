"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCapabilities, providerPayload, estimatePayload } = require("../lib/provider-context.js");
test("model capacity rejects impossible reservations and does not invent an unknown window", () => {
  assert.equal(normalizeCapabilities({}).contextWindowTokens, null);
  for (const value of [{ contextWindowTokens: 2048 }, { maxOutputTokens: 0 }, { safetyMarginTokens: 0 }, { contextWindowTokens: "8192" }, { outputTokenParameter: "unknown" }]) {
    assert.throws(() => normalizeCapabilities(value), error => error.code === "INVALID_MODEL_CAPACITY");
  }
});
test("model capacity serializes the configured output field and all Anthropic system rules", () => {
  const messages = [{ role: "system", content: "rule one" }, { role: "system", content: "rule two" }, { role: "user", content: "hello" }];
  const openai = providerPayload({ model: "fixture", maxOutputTokens: 333, outputTokenParameter: "max_completion_tokens" }, messages);
  assert.equal(openai.max_completion_tokens, 333); assert.equal(openai.max_tokens, undefined);
  const anthropic = providerPayload({ protocol: "anthropic", model: "fixture", maxOutputTokens: 444 }, messages);
  assert.equal(anthropic.max_tokens, 444); assert.equal(anthropic.system, "rule one\n\nrule two");
  assert.deepEqual(anthropic.messages, [messages[2]]);
  assert.equal(providerPayload({ model: "legacy" }, messages).max_tokens, undefined);
});
test("model capacity estimate includes the exact protocol payload instead of message text alone", () => {
  const config = { protocol: "anthropic", model: "fixture", maxOutputTokens: 256 };
  const messages = [{ role: "system", content: "规则" }, { role: "user", content: "完整输入" }];
  assert.equal(estimatePayload(config, messages), Buffer.byteLength(JSON.stringify(providerPayload(config, messages)), "utf8") + 16);
});
