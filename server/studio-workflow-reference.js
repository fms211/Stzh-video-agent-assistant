"use strict";
const { MemoryError } = require("./studio-memory-store.js");

// Local workflows are browser orchestrated. These identifiers support tracing,
// never authorization, execution status, or proof of a completed predecessor.
function workflowReference(value, mode, sessionId) {
  if (value === undefined) return null;
  const id = value => typeof value === "string" && value.length > 0 && value.length <= 200;
  if (mode !== "workflow" || !id(sessionId) || !value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some(key => !["runId", "workflowId", "stepId", "stepIndex", "previousStepIds"].includes(key))
      || ![value.runId, value.workflowId, value.stepId].every(id)
      || !Number.isSafeInteger(value.stepIndex) || value.stepIndex < 0 || value.stepIndex > 100
      || !Array.isArray(value.previousStepIds) || value.previousStepIds.length !== value.stepIndex
      || !value.previousStepIds.every(id) || new Set(value.previousStepIds).size !== value.previousStepIds.length
      || value.previousStepIds.includes(value.stepId)) {
    throw new MemoryError("INVALID_WORKFLOW_REFERENCE", "工作流步骤引用无效");
  }
  return { ...value, previousStepIds: [...value.previousStepIds], sessionId, authority: "client_reference_only" };
}
module.exports = { workflowReference };
