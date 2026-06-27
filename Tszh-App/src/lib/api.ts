// Tszh Remote - API 客户端
// 对接桌面端 Express 后端的现有 API

import AsyncStorage from '@react-native-async-storage/async-storage';

// 服务器地址（可通过设置修改）
const DEFAULT_SERVER = 'http://192.168.5.105:8080';
const STORAGE_KEY_SERVER = 'tszh_server_url';
const STORAGE_KEY_TOKEN = 'tszh_token';

// 确保 URL 有协议前缀
function ensureProtocol(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `http://${url}`;
  }
  return url;
}

// 获取服务器地址
export async function getServerUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER);
  return ensureProtocol(saved || DEFAULT_SERVER);
}

// 设置服务器地址
export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_SERVER, ensureProtocol(url));
}

// 获取 Token
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_TOKEN);
}

// 保存 Token
export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
}

// 清除 Token
export async function removeToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
}

// 通用请求函数
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const serverUrl = await getServerUrl();
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${serverUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============ 认证 API ============

export async function login(username: string, password: string) {
  const data = await request<{ token: string; user: any }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  await setToken(data.token);
  return data;
}

export async function register(username: string, password: string, displayName?: string) {
  const data = await request<{ token: string; user: any }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, display_name: displayName }),
  });
  await setToken(data.token);
  return data;
}

export async function getMe() {
  return request<{ user: any }>('/api/auth/me');
}

export async function logout() {
  await removeToken();
}

export async function changePassword(oldPassword: string, newPassword: string) {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export async function resetPassword(username: string, newPassword: string) {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ username, newPassword }),
  });
}

// ============ 会话 API ============

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  payload?: any;
  created_at: string;
}

export async function getConversations(): Promise<Conversation[]> {
  const data = await request<{ conversations: Conversation[] }>('/api/conversations');
  return data.conversations || [];
}

export async function getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }> {
  return request(`/api/conversations/${id}`);
}

export async function createConversation(title: string): Promise<Conversation> {
  const data = await request<{ conversation: Conversation }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return data.conversation;
}

export async function saveMessages(conversationId: string, messages: Partial<Message>[]) {
  return request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
}

// ============ 模板 API ============

export interface Template {
  id: number;
  user_id: number;
  category: string;
  icon: string;
  label: string;
  prompt: string;
}

export async function getTemplates(): Promise<Template[]> {
  const data = await request<{ templates: Template[] }>('/api/templates');
  return data.templates || [];
}

export async function createTemplate(template: Omit<Template, 'id' | 'user_id'>): Promise<Template> {
  const data = await request<{ template: Template }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
  return data.template;
}

export async function deleteTemplate(id: number) {
  return request(`/api/templates/${id}`, { method: 'DELETE' });
}

// ============ 生成记录 API ============

export interface Generation {
  id: number;
  prompt: string;
  video_url?: string;
  image_urls?: string[];
  status: string;
  created_at: string;
}

export async function getGenerations(page = 1, limit = 20): Promise<{ generations: Generation[]; total: number }> {
  return request(`/api/generations?page=${page}&limit=${limit}`);
}

export async function getGenerationStats() {
  return request<{ total: number; today: number; videos: number }>('/api/generations/stats');
}

// ============ 通知 API ============

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export async function getNotifications(): Promise<Notification[]> {
  const data = await request<{ notifications: Notification[] }>('/api/notifications');
  return data.notifications || [];
}

export async function markNotificationRead(id: number) {
  return request(`/api/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  return request('/api/notifications/read-all', { method: 'POST' });
}

export async function deleteAllNotifications() {
  return request('/api/notifications', { method: 'DELETE' });
}

// ============ OPC AI 助手 API ============

export interface OpcSession {
  id: string;
  title: string;
  message_count: number;
  summary?: string;
  created_at: string;
  updated_at: string;
}

export interface OpcMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  created_at: string;
}

export async function getOpcSessions(): Promise<OpcSession[]> {
  const data = await request<{ sessions: OpcSession[] }>('/api/opc/sessions');
  return data.sessions || [];
}

export async function createOpcSession(title: string): Promise<OpcSession> {
  const data = await request<{ session: OpcSession }>('/api/opc/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return data.session;
}

export async function getOpcMessages(sessionId: string): Promise<OpcMessage[]> {
  const data = await request<{ messages: OpcMessage[] }>(`/api/opc/sessions/${sessionId}/messages`);
  return data.messages || [];
}

export async function addOpcMessage(sessionId: string, role: 'user' | 'assistant', content: string) {
  return request(`/api/opc/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content }),
  });
}

// ============ 设置 API ============

export async function getSettings() {
  return request<{ settings: any }>('/api/settings');
}

export async function updateSettings(settings: Record<string, any>) {
  return request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ============ AI Agent API ============

export interface AgentResponse {
  text?: string;
  videoUrl?: string;
  imageUrls?: string[];
  followUp?: string[];
}

export async function sendAgentMessage(prompt: string, history?: { role: string; content: string }[]): Promise<AgentResponse> {
  const data = await request<{ result?: AgentResponse; text?: string; videoUrl?: string; imageUrls?: string[] }>('/api/agent', {
    method: 'POST',
    body: JSON.stringify({ prompt, history }),
  });

  // 兼容不同的返回格式
  if (data.result) return data.result;
  return {
    text: data.text || '',
    videoUrl: data.videoUrl,
    imageUrls: data.imageUrls,
  };
}

// ============ 健康检查 ============

export async function healthCheck(): Promise<boolean> {
  try {
    const serverUrl = await getServerUrl();
    const response = await fetch(`${serverUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}
