type ExportMessage = {
  role: "user" | "agent"; text?: string; textIsPayload?: boolean;
  payload?: { requestId?: string; videoUrl?: string; imageUrls?: string[]; raw?: unknown };
  contextTrace?: unknown; isError?: boolean; errorText?: string;
};

/** Export the preserved transcript, not the truncated outbound context. No network access. */
export function exportCozeConversation(messages: ExportMessage[], options: {
  format: "markdown" | "txt" | "json"; sessionId: string;
  timestamp?: string; exportedAt: string;
}) {
  if (options.format === "json") return {
    content: JSON.stringify({ exportedAt: options.exportedAt, sessionId: options.sessionId,
      messages: messages.map(({ role, text, payload, contextTrace, isError, errorText }) => ({ role, text, payload, contextTrace, isError, errorText })),
    }, null, 2), type: "application/json;charset=utf-8", extension: "json",
  };
  const markdown = options.format === "markdown";
  const lines = [markdown ? "# 腾昇智和 · 对话记录\n" : "腾昇智和 · 对话记录\n"];
  if (options.timestamp) lines.push(`${markdown ? "> " : "导出时间："}${options.timestamp}\n`);
  for (const message of messages) {
    const label = message.role === "user" ? "用户" : message.isError ? "错误" : "Agent";
    lines.push(markdown ? `### ${label}` : `[${label}]`);
    if (message.role === "user") { lines.push(message.text || "", ""); continue; }
    if (message.isError) { lines.push(message.errorText || message.text || "请求失败（未记录原因）", ""); continue; }
    const text = !message.textIsPayload ? message.text || "" : "";
    if (text) lines.push(text);
    const payload = message.payload;
    if (payload) {
      const raw = payload.raw;
      const rawText = raw && typeof raw === "object" && "text" in raw && typeof raw.text === "string" ? raw.text : "";
      if (rawText && rawText !== text) lines.push(rawText);
      else if (!rawText && raw !== undefined && !payload.videoUrl && !payload.imageUrls?.length) {
        const json = JSON.stringify(raw, null, 2);
        if (json !== undefined) lines.push(markdown ? `\n\`\`\`json\n${json}\n\`\`\`` : json);
      }
      const item = (label: string, value: string) => `${markdown ? "- " : ""}${label}: ${value}`;
      if (payload.videoUrl) lines.push(item("视频", payload.videoUrl));
      payload.imageUrls?.forEach(url => lines.push(item("图片", url)));
      if (payload.requestId) lines.push(item("requestId", payload.requestId));
    }
    lines.push("");
  }
  return { content: lines.join("\n"), type: markdown ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8", extension: markdown ? "md" : "txt" };
}
