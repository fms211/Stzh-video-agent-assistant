// 开发环境直接请求 Express 后端
const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || "http://localhost:8080")
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

// === API 请求封装 ===
async function authFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `请求失败 (${res.status})`);
  }
  return data;
}

// === 认证 API ===
export async function register(username: string, password: string, displayName?: string): Promise<AuthResponse> {
  const data = await authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName }),
  });
  setToken(data.token);
  setCachedUser(data.user);
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const data = await authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  setCachedUser(data.user);
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

export async function saveMessages(conversationId: string, messages: any[]) {
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
  return authFetch("/api/generations/stats");
}
