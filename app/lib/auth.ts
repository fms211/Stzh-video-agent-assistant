// 开发环境直接请求 Express 后端
const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin)
  : "";

export type User = {
  id: number;
  username: string;
  displayName: string;
  createdAt?: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

type JsonRecord = Record<string, unknown>;

function apiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const error = (data as JsonRecord).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as JsonRecord).message;
  return typeof message === "string" ? message : null;
}

// === Token 管理 ===
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("stzh_token");
}

export function setToken(token: string) {
  localStorage.setItem("stzh_token", token);
}

export function removeToken() {
  localStorage.removeItem("stzh_token");
  localStorage.removeItem("stzh_user");
}

export function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("stzh_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: User) {
  localStorage.setItem("stzh_user", JSON.stringify(user));
}

export function commitAuthSession(data: AuthResponse) {
  setToken(data.token);
  setCachedUser(data.user);
}

// === API 请求封装 ===
export async function authFetch<T = JsonRecord>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data: unknown = await res.json();

  if (!res.ok) {
    throw new Error(apiErrorMessage(data) || `请求失败 (${res.status})`);
  }
  return data as T;
}

// === 认证 API ===
export async function authenticateRegister(username: string, password: string, displayName?: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName }),
  });
}

export async function register(username: string, password: string, displayName?: string): Promise<AuthResponse> {
  const data = await authenticateRegister(username, password, displayName);
  commitAuthSession(data);
  return data;
}

export async function authenticateLogin(username: string, password: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const data = await authenticateLogin(username, password);
  commitAuthSession(data);
  return data;
}

export async function getMe(): Promise<{ user: User }> {
  return authFetch("/api/auth/me");
}

export function logout() {
  removeToken();
}

// === 会话 API ===
export async function getConversations() {
  return authFetch("/api/conversations");
}

export async function getConversation(id: string) {
  return authFetch(`/api/conversations/${id}`);
}

export async function createConversation(id: string, title?: string) {
  return authFetch("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ id, title }),
  });
}

export async function updateConversation(id: string, title: string) {
  return authFetch(`/api/conversations/${id}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string) {
  return authFetch(`/api/conversations/${id}`, { method: "DELETE" });
}

export async function saveMessages(conversationId: string, messages: unknown[]) {
  return authFetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

// === 模板 API ===
export async function getTemplates() {
  return authFetch("/api/templates");
}

export async function createTemplate(category: string, label: string, prompt: string, icon?: string) {
  return authFetch("/api/templates", {
    method: "POST",
    body: JSON.stringify({ category, label, prompt, icon }),
  });
}

export async function deleteTemplate(id: number) {
  return authFetch(`/api/templates/${id}`, { method: "DELETE" });
}

// === 生成记录 API ===
export async function getGenerations(limit = 50, offset = 0) {
  return authFetch(`/api/generations?limit=${limit}&offset=${offset}`);
}

export async function getGenerationStats() {
  return authFetch<{ total: number; today: number; totalVideos: number }>("/api/generations/stats");
}

// === 两端联动任务 ===
export type LinkedTask = {
  id: string;
  kind: string;
  title: string;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  origin: "desktop" | "mobile" | "server" | "migration";
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  progress: number;
  stage: string;
  error?: string | null;
  workerDeviceId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getTasks(options?: { status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return authFetch(`/api/tasks${qs ? `?${qs}` : ""}`) as Promise<{ tasks: LinkedTask[]; total: number }>;
}

export async function createTask(input: {
  kind: string;
  title: string;
  origin?: "desktop" | "mobile";
  input?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  return authFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<{ task: LinkedTask; created: boolean }>;
}

export async function claimTask(id: string, deviceId = "desktop-creation-center") {
  return authFetch(`/api/tasks/${id}/claim`, {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  }) as Promise<{ task: LinkedTask }>;
}

// 桌面端稳定的设备 id（localStorage 持久化，用于任务认领与心跳）
export function getDesktopDeviceId(): string {
  if (typeof window === "undefined") return "desktop-creation-center";
  let id = window.localStorage.getItem("tszh_desktop_device_id");
  if (!id) {
    id = `desktop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem("tszh_desktop_device_id", id);
  }
  return id;
}

// 桌面端心跳：定期向服务器报告在线，僵尸任务回收依赖它
export function startDesktopHeartbeat(intervalSec = 20): () => void {
  if (typeof window === "undefined") return () => {};
  const deviceId = getDesktopDeviceId();
  const beat = async () => {
    try {
      const token = getToken();
      if (!token) return;
      await fetch(`${API_BASE}/api/devices/${deviceId}/heartbeat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* 网络抖动忽略 */ }
  };
  // 立即打一次 + 定时
  void beat();
  const timer = window.setInterval(beat, intervalSec * 1000);
  return () => window.clearInterval(timer);
}

export async function taskAction(
  id: string,
  action: "pause" | "resume" | "cancel" | "retry" | "complete" | "fail",
  payload: Record<string, unknown> = {}
) {
  return authFetch(`/api/tasks/${id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  }) as Promise<{ task: LinkedTask }>;
}

export async function updateTaskProgress(id: string, progress: number, stage: string) {
  return authFetch(`/api/tasks/${id}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ progress, stage }),
  }) as Promise<{ task: LinkedTask }>;
}

export async function executeTask(task: LinkedTask, signal?: AbortSignal): Promise<LinkedTask | null> {
  const prompt = String(task.input?.prompt || "").trim();
  if (!prompt) {
    const failed = await taskAction(task.id, "fail", { error: "任务缺少创作提示词" });
    return failed.task;
  }
  try {
    await updateTaskProgress(task.id, 12, "桌面创作中心已接收，正在调用创作智能体");
    const output = await authFetch<{ result?: unknown } & JsonRecord>("/api/agent", {
      method: "POST",
      body: JSON.stringify({ prompt, history: [] }),
      signal,
    });
    await updateTaskProgress(task.id, 88, "生成完成，正在整理作品与元数据");
    const completed = await taskAction(task.id, "complete", {
      output: output.result || output,
      stage: "创作任务已完成",
    });
    return completed.task;
  } catch (cause) {
    if (signal?.aborted) return null;
    const message = cause instanceof Error ? cause.message : "创作智能体执行失败";
    try {
      const failed = await taskAction(task.id, "fail", { error: message });
      return failed.task;
    } catch {
      throw cause;
    }
  }
}

export async function createPairingCode(deviceName = "桌面创作中心") {
  return authFetch("/api/devices/pairing-codes", {
    method: "POST",
    body: JSON.stringify({ deviceName }),
  }) as Promise<{ code: string; expiresAt: string }>;
}

export type NetworkTarget = {
  label: string;
  address: string;
  url: string;
};

export async function getPairingNetworkTargets() {
  return authFetch("/api/devices/network-targets") as Promise<{ targets: NetworkTarget[] }>;
}
