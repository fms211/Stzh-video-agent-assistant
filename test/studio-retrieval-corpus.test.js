"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateInput } = require("./helpers/studio-memory-eval.cjs");
const inputs = require("./fixtures/studio-memory-eval-inputs.json");
const labels = require("./fixtures/studio-memory-eval-labels.json");

test("中文评测输入和标签一一对应，不能漏掉或覆盖重复场景", () => {
  assert.equal(new Set(inputs.map(input => input.id)).size, inputs.length);
  assert.deepEqual(inputs.map(input => input.id).sort(), Object.keys(labels).sort());
});
for (const input of inputs) {
  if (!labels[input.id].gate) continue;
  test(`中文检索固定语料：${input.id}`, () => {
    assert.deepEqual(evaluateInput(input).selected.map(item => item.item.id).sort(), [...labels[input.id].expectedIds].sort());
  });
}
