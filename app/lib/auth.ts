type ApiLocation = Pick<Location, "protocol" | "hostname" | "port" | "origin">;

export function resolveApiBase(configured: string | undefined, location: ApiLocation): string {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (location.port === "3000") return `${location.protocol}//${location.hostname}:8080`;
  return location.origin;
}

// Web dev(3000) 与 Express(8080) 分进程；静态生产/Electron 仍保持同源。
const API_BASE = typeof window !== "undefined"
  ? resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location)
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

export class ApiRequestError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

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
    const detail = data && typeof data === "object" ? (data as JsonRecord).error : null;
    const code = detail && typeof detail === "object" ? (detail as JsonRecord).code : undefined;
    throw new ApiRequestError(apiErrorMessage(data) || `请求失败 (${res.status})`, res.status, typeof code === "string" ? code : undefined);
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
  return authFetch<{ conversation: { id: string; mode?: string }; messages: unknown[] }>(`/api/conversations/${encodeURIComponent(id)}`);
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
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getTasks(options?: { status?: string; limit?: number; offset?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.cursor) params.set("cursor", options.cursor);
  const qs = params.toString();
  return authFetch(`/api/tasks${qs ? `?${qs}` : ""}`) as Promise<{ tasks: LinkedTask[]; total: number; nextCursor: string | null }>;
}

export async function getTask(id: string) {
  return authFetch<{ task: LinkedTask }>(`/api/tasks/${encodeURIComponent(id)}`);
}

export type AttachmentDescriptor = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export async function uploadAttachments(files: File[]) {
  const token = getToken();
  const body = new FormData();
  for (const file of files) body.append("file", file, file.name);
  const response = await fetch(`${API_BASE}/api/attachments`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload) || `附件上传失败 (${response.status})`);
  }
  return (Array.isArray(payload?.attachments) ? payload.attachments : []) as AttachmentDescriptor[];
}

export async function createTask(input: {
  kind: string;
  title: string;
  origin?: "desktop" | "mobile";
  input?: Record<string, unknown>;
  attachmentIds?: string[];
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
  }) as Promise<{ task: LinkedTask; leaseToken: string }>;
}

// 桌面端稳定的设备 id（localStorage 持久化，用于任务认领与心跳）
export function getDesktopDeviceId(): string {
  if (typeof window === "undefined") return "desktop-creation-center";
  const user = getCachedUser();
  const scope = getToken() && user ? `user:${user.id}` : "guest";
  const key = `tszh:v2:${scope}:desktop-device-id`;
  // A legacy device may belong to another account; do not adopt an unowned ID.
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `desktop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export type RegisteredDevice = {
  id: string;
  name: string;
  type: "desktop" | "mobile" | "web";
  status: "online" | "offline" | "revoked";
  pairedAt: string;
  lastSeen: string;
};

export async function ensureDesktopDevice(name = "桌面创作中心") {
  const id = getDesktopDeviceId();
  return authFetch<{ device: RegisteredDevice }>("/api/devices/register", {
    method: "POST",
    body: JSON.stringify({ id, name, type: "desktop" }),
  });
}

// 桌面端心跳：先登记稳定设备 ID，再报告在线状态。
export function startDesktopHeartbeat(intervalSec = 20): () => void {
  if (typeof window === "undefined") return () => {};
  const deviceId = getDesktopDeviceId();
  const token = getToken();
  let disposed = false;
  let registered = false;
  const beat = async () => {
    try {
      if (disposed || !token || getToken() !== token) return;
      if (!registered) {
        await ensureDesktopDevice();
        registered = true;
      }
      if (disposed || getToken() !== token) return;
      const response = await fetch(`${API_BASE}/api/devices/${deviceId}/heartbeat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) registered = false;
    } catch { /* 网络抖动忽略 */ }
  };
  // 立即打一次 + 定时
  void beat();
  const timer = window.setInterval(beat, intervalSec * 1000);
  return () => { disposed = true; window.clearInterval(timer); };
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

export async function updateTaskProgress(id: string, progress: number, stage: string, leaseToken: string) {
  return authFetch(`/api/tasks/${id}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ progress, stage, leaseToken }),
  }) as Promise<{ task: LinkedTask }>;
}

export async function renewTaskLease(id: string, leaseToken: string) {
  return authFetch(`/api/tasks/${id}/lease/renew`, {
    method: "POST",
    body: JSON.stringify({ leaseToken }),
  }) as Promise<{ task: LinkedTask }>;
}

type TaskLeaseRenewal = {
  stop: () => Promise<void>;
};

export function startTaskLeaseRenewal(options: {
  renew: () => Promise<unknown>;
  onLeaseLost: (error: unknown) => void;
  intervalMs?: number;
}): TaskLeaseRenewal {
  const intervalMs = Math.max(1, Number(options.intervalMs) || 15_000);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      inFlight = Promise.resolve()
        .then(() => options.renew())
        .then(() => undefined)
        .catch((error) => {
          if (stopped) return;
          stopped = true;
          try { options.onLeaseLost(error); } catch { /* 租约循环必须收敛 */ }
        })
        .finally(() => {
          inFlight = null;
          if (!stopped) schedule();
        });
    }, intervalMs);
  };

  schedule();
  return {
    async stop() {
      if (!stopped) stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const pending = inFlight;
      if (pending) await pending;
    },
  };
}

export async function executeTask(
  task: LinkedTask,
  leaseToken: string,
  signal?: AbortSignal,
  options: {
    renewIntervalMs?: number;
    renewLease?: (id: string, token: string) => Promise<unknown>;
  } = {}
): Promise<LinkedTask | null> {
  const executionController = new AbortController();
  const forwardAbort = () => {
    if (!executionController.signal.aborted) {
      executionController.abort(signal?.reason || new Error("任务执行已中止"));
    }
  };
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });

  let leaseLost = false;
  let renewal: TaskLeaseRenewal | null = null;
  const stopRenewal = async () => {
    const activeRenewal = renewal;
    renewal = null;
    if (activeRenewal) await activeRenewal.stop();
  };

  const prompt = String(task.input?.prompt || "").trim();
  if (!prompt) {
    try {
      const failed = await taskAction(task.id, "fail", {
        leaseToken,
        error: "任务缺少创作提示词",
      });
      return failed.task;
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
    }
  }
  try {
    await updateTaskProgress(
      task.id,
      12,
      "桌面创作中心已接收，正在调用创作智能体",
      leaseToken
    );
    renewal = startTaskLeaseRenewal({
      intervalMs: options.renewIntervalMs,
      renew: () => (options.renewLease || renewTaskLease)(task.id, leaseToken),
      onLeaseLost: (error) => {
        leaseLost = true;
        if (!executionController.signal.aborted) executionController.abort(error);
      },
    });
    const output = await authFetch<{ result?: unknown } & JsonRecord>("/api/agent", {
      method: "POST",
      body: JSON.stringify({ prompt, history: [] }),
      signal: executionController.signal,
    });
    if (executionController.signal.aborted) {
      throw executionController.signal.reason || new Error("任务租约已失效");
    }
    await updateTaskProgress(task.id, 88, "生成完成，正在整理作品与元数据", leaseToken);
    await stopRenewal();
    const completed = await taskAction(task.id, "complete", {
      leaseToken,
      output: output.result || output,
      stage: "创作任务已完成",
    });
    return completed.task;
  } catch (cause) {
    if (signal?.aborted || leaseLost) return null;
    await stopRenewal();
    const message = cause instanceof Error ? cause.message : "创作智能体执行失败";
    try {
      const failed = await taskAction(task.id, "fail", { leaseToken, error: message });
      return failed.task;
    } catch {
      throw cause;
    }
  } finally {
    await stopRenewal();
    signal?.removeEventListener("abort", forwardAbort);
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
