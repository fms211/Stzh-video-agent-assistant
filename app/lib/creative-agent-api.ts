"use client";

import { ApiRequestError, getToken, resolveApiBase } from "./auth";

const apiBase = () => resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location);

export async function creativeApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  return captureCreativeApi()<T>(path, options);
}

/** Pin multi-request operations to the account that initiated them. */
export function captureCreativeApi() {
  const token = getToken();
  const base = apiBase();
  const assertCurrent = () => { if (getToken() !== token) throw new DOMException("账户已切换，请重新操作", "AbortError"); };
  return async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  assertCurrent();
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(typeof FormData !== "undefined" && options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  assertCurrent();
  if (!response.ok) {
    throw new ApiRequestError(body?.error?.message || body?.message || `请求失败（${response.status}）`, response.status, body?.error?.code);
  }
  return body as T;
  };
}

export type SafeProvider = {
  id: string;
  name: string;
  protocol: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  vendorId?: string;
  websiteUrl?: string;
  thinkingMode?: "default" | "enabled" | "disabled";
  contextWindowTokens?: number | null;
  maxOutputTokens?: number;
  safetyMarginTokens?: number;
  outputTokenParameter?: "max_tokens" | "max_completion_tokens";
  isActive: boolean;
  hasSecret: boolean;
  keyLast4: string | null;
  verifiedAt: number | null;
};

export type AgentRole = {
  id: string;
  name: string;
  prompt: string;
  capabilities: string[];
  defaultProviderId: string | null;
  enabled: boolean;
};

export type AgentRun = {
  currentConstraints?: Record<string, string>;
  id: string;
  projectId: string;
  task: string;
  budget: "economy" | "standard" | "deep";
  status: string;
  finalInstruction: string | null;
  taskId: string | null;
  rationale: string | null;
  risks: string | null;
  cozeDeliveredAt: number | null;
  error: string | null;
  createdAt?: number;
  updatedAt?: number;
  teamSnapshot?: Array<{ name: string; prompt: string; capabilities?: string[]; defaultProviderId?: string | null }>;
};
