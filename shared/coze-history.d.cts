export function prepareCozeHistory(input: unknown): {
  history: Array<{ role: "user" | "assistant"; content: string; content_type: "text" }>;
  historyOmitted: boolean;
};
