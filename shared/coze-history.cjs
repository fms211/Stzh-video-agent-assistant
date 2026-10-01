"use strict";

// Bound only the outbound copy. Stored transcripts remain unchanged.
function prepareCozeHistory(input) {
  const source = Array.isArray(input) ? input : [];
  const eligible = source.flatMap(message => {
    if (!message || typeof message !== "object" || message.isError) return [];
    const role = message.role === "user" ? "user" : ["agent", "assistant"].includes(message.role) ? "assistant" : null;
    const value = message.text ?? message.content ?? message.payload?.raw?.text;
    if (!role || typeof value !== "string" || !value.trim()) return [];
    return [{ role, content: value.trim(), content_type: "text" }];
  });
  const history = eligible.slice(-20);
  // A sliced assistant reply has no question to establish its meaning.
  while (history[0]?.role === "assistant") history.shift();
  return { history, historyOmitted: history.length < eligible.length };
}

module.exports = { prepareCozeHistory };
