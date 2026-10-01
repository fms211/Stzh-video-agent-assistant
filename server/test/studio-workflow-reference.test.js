"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { workflowReference } = require("../studio-workflow-reference.js");

test("browser workflow references cannot claim authority or malformed predecessor chains", () => {
  const input = { runId: "run-a", workflowId: "research", stepId: "step-2", stepIndex: 1, previousStepIds: ["step-1"] };
  const result = workflowReference(input, "workflow", "session-a");
  assert.equal(result.authority, "client_reference_only");
  assert.equal(result.sessionId, "session-a");
  input.previousStepIds.push("changed-after-validation");
  assert.deepEqual(result.previousStepIds, ["step-1"]);
  for (const patch of [{ approved: true }, { authority: "server" }, { stepIndex: 2 }, { previousStepIds: ["step-2"] }, { stepIndex: 2, previousStepIds: ["step-1", "step-1"] }]) {
    assert.throws(() => workflowReference({ ...input, previousStepIds: ["step-1"], ...patch }, "workflow", "session-a"), error => error.code === "INVALID_WORKFLOW_REFERENCE");
  }
  assert.throws(() => workflowReference(input, "assistant", "session-a"), error => error.code === "INVALID_WORKFLOW_REFERENCE");
  assert.equal(workflowReference(undefined, "assistant", "session-a"), null);
});
