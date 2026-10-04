import type { OpcAgentMessage } from "../components/opc-agent/types";
import { normalizeReferenceNotes } from "./reference-retrieval.ts";

export function assistantContentWithReferences(content: string, referenceNotes?: string[]) {
  const notes = normalizeReferenceNotes(referenceNotes);
  return notes.length ? `> 资料状态：\n${notes.map(note => `> - ${note.replace(/\r?\n/g, " ")}`).join("\n")}\n\n${content}` : content;
}

/** Descriptive metadata only: never export attachment previews or credentials. */
export function assistantMessageDetails(message: OpcAgentMessage): string[] {
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter(file => file && typeof file.name === "string") : [];
  const sources = Array.isArray(message.ragSources) ? message.ragSources.filter(source => source && typeof source.name === "string") : [];
  return [
    ...attachments.map(file => `附件：${file.name}（${typeof file.type === "string" && file.type ? file.type : "未知类型"}，${Number.isFinite(file.size) && file.size >= 0 ? `${file.size} 字节` : "大小未知"}）`),
    ...sources.map(source => `检索来源：${source.name}（${typeof source.kb_type === "string" ? source.kb_type : "未知类型"}；相关度 ${Number.isFinite(source.score) ? source.score : "未知"}，不代表已核实）`),
  ];
}

export function assistantSessionMode(id: string, messages: OpcAgentMessage[] = []): "chat" | "workflow" {
  return id.startsWith("opc_workflow_") || messages.some(message => ["workflow", "workflow-step", "action-cards"].includes(message.role)) ? "workflow" : "chat";
}

export function prepareAssistantRetry(messages: OpcAgentMessage[], id: string) {
  const failed = messages.at(-1);
  const question = messages.at(-2);
  if (failed?.id !== id || failed.role !== "assistant" || !failed.isError || question?.role !== "user" || !question.content.trim()) return null;
  return {
    assistantId: id,
    messages: messages.slice(0, -2).filter(message => ["user", "assistant"].includes(message.role) && !message.isError && message.content.trim())
      .map(message => ({ role: message.role as "user" | "assistant", content: message.content }))
      .concat({ role: "user", content: question.content }),
  };
}

export async function openAssistantSession<T>(options: {
  flush: () => Promise<unknown>;
  read: () => Promise<T>;
  isCurrent: () => boolean;
  commit: (value: T) => void;
}) {
  if (!options.isCurrent()) return false;
  await options.flush();
  if (!options.isCurrent()) return false;
  const value = await options.read();
  if (!options.isCurrent()) return false;
  options.commit(value);
  return true;
}

export function exportAssistantConversation(messages: OpcAgentMessage[], title = "创意工坊对话") {
  const labels: Record<OpcAgentMessage["role"], string> = {
    user: "用户", assistant: "助手", workflow: "工作流", "workflow-step": "工作流步骤", "action-cards": "工作流结果",
  };
  return `# ${title}\n\n` + messages.map(message => {
    const date = new Date(message.timestamp);
    const when = Number.isFinite(date.getTime()) ? date.toISOString() : "时间未知";
    const name = [labels[message.role] || message.role, message.workflowName, message.stepName].filter(Boolean).join(" · ");
    const input = message.workflowInput ? `\n\n输入参数：\n${Object.entries(message.workflowInput).map(([key, value]) => `- ${key}: ${value}`).join("\n")}` : "";
    const details = assistantMessageDetails(message);
    const metadata = details.length ? `\n\n附件与资料：\n${details.map(detail => `- ${detail.replace(/\r?\n/g, " ")}`).join("\n")}` : "";
    return `## ${name}\n\n${when}${message.isError ? " · 执行失败" : ""}\n\n${assistantContentWithReferences(message.content || "（无文本内容）", message.referenceNotes)}${input}${metadata}`;
  }).join("\n\n---\n\n") + "\n";
}
