// OPC API requests pin their original credentials across asynchronous synchronization.
import type { OpcAgentMessage } from "@/app/components/opc-agent/types";
import { getToken, resolveApiBase } from "./auth";

export type OpcRequestContext = { base: string; token: string | null };
export const captureOpcRequestContext = (): OpcRequestContext => ({ base: typeof window === "undefined" ? "" : resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location), token: getToken() });

async function request<T>(path: string, options: RequestInit = {}, context = captureOpcRequestContext()): Promise<T> {
  const response = await fetch(`${context.base}/api/opc${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(context.token ? { Authorization: `Bearer ${context.token}` } : {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `会话同步失败（${response.status}）`);
  return body as T;
}

export async function apiCreateSession(id: string, title?: string, context?: OpcRequestContext): Promise<void> {
  await request("/sessions", { method: "POST", body: JSON.stringify({ id, title }) }, context);
}

export async function apiListSessions(context?: OpcRequestContext, offset = 0): Promise<Array<{ id: string; title: string; updated_at: number; message_count: number; mode?: "chat" | "workflow" | "coze" }>> {
  const body = await request<{ sessions: Array<{ id: string; title: string; updated_at: number; message_count: number; mode?: "chat" | "workflow" | "coze" }> }>(`/sessions?limit=100&offset=${offset}`, {}, context);
  return body.sessions;
}

export async function apiDeleteSession(id: string, context?: OpcRequestContext): Promise<void> {
  await request(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, context);
}

export async function apiGetMessages(sessionId: string, limit = 200, context?: OpcRequestContext, offset = 0): Promise<OpcAgentMessage[]> {
  const body = await request<{ messages: Record<string, unknown>[] }>(`/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}&offset=${offset}`, {}, context);
  return body.messages.map(message => {
    const metadata = parseMetadata(message.metadata);
    return {
      ...Object.fromEntries(Object.entries(metadata).filter(([key]) => ["isError", "contextTrace", "referenceNotes", "workflowRunId", "workflowStepId", "workflowId", "workflowInput", "workflowName", "workflowIcon", "stepName", "stepIndex", "totalSteps", "cards", "attachments", "ragSources"].includes(key))),
      id: typeof metadata.clientMessageId === "string" ? metadata.clientMessageId : String(message.id),
      role: message.role as OpcAgentMessage["role"],
      content: String(message.content || ""),
      timestamp: Number(message.timestamp || 0) * 1000,
    };
  });
}

export async function apiBatchAddMessages(sessionId: string, messages: Array<{ id?: string; timestamp?: number; role: string; content: string; metadata?: Record<string, unknown> }>, context?: OpcRequestContext): Promise<number> {
  const body = await request<{ count: number }>(`/sessions/${encodeURIComponent(sessionId)}/messages/batch`, { method: "POST", body: JSON.stringify({ messages }) }, context);
  return body.count;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
