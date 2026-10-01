"use strict";
const { selectMemories } = require("../../shared/studio-context/index.cjs");
const { context, memory } = require("./studio-memory-fixtures.cjs");
function evaluateInput(input) {
  return selectMemories({
    items: input.items.map(item => memory(item.id, item.content, item)), query: input.query,
    context: context({ mode: input.mode, currentConstraints: input.currentConstraints || {} }),
    authorize: item => !(input.deniedIds || []).includes(item.id), limit: input.limit ?? 5,
  });
}
module.exports = { evaluateInput };
