// Tszh Remote - API 客户端
// 对接桌面端 Express 后端的现有 API

import AsyncStorage from '@react-native-async-storage/async-storage';

// 服务器地址（可通过设置修改）
const DEFAULT_SERVER = 'http://192.168.5.105:8080';
const STORAGE_KEY_SERVER = 'tszh_server_url';
const STORAGE_KEY_TOKEN = 'tszh_token';
const STORAGE_KEY_DEVICE_ID = 'tszh_device_id';

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

export async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_DEVICE_ID);
}

export async function setDeviceId(deviceId: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
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
    throw new Error(error?.error?.message || error?.message || `HTTP ${response.status}`);
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
    body: JSON.stringify({ username, password, displayName }),
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
  return request<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
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
  return request<Template>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
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
  const offset = Math.max(0, page - 1) * limit;
  const data = await request<{
    generations: Array<Generation & { imageUrls?: string[] }>;
    total: number;
  }>(`/api/generations?limit=${limit}&offset=${offset}`);
  return {
    total: data.total,
    generations: (data.generations || []).map((generation) => ({
      ...generation,
      image_urls: generation.image_urls || generation.imageUrls,
    })),
  };
}

export async function getGenerationStats(): Promise<{ total: number; today: number; videos: number }> {
  const data = await request<{ total: number; today: number; totalVideos: number }>('/api/generations/stats');
  return {
    total: data.total,
    today: data.today,
    videos: data.totalVideos,
  };
}

// ============ 统一联动任务 API ============

export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface LinkedTask {
  id: string;
  kind: string;
  title: string;
  status: TaskStatus;
  origin: 'desktop' | 'mobile' | 'server' | 'migration';
  input: Record<string, any>;
  output?: Record<string, any> | null;
  progress: number;
  stage: string;
  error?: string | null;
  workerDeviceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getTasks(options?: { status?: string; limit?: number; offset?: number }): Promise<{ tasks: LinkedTask[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  return request(`/api/tasks${qs ? `?${qs}` : ''}`);
}

export async function createTask(prompt: string): Promise<LinkedTask> {
  const data = await request<{ task: LinkedTask }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'video.generate',
      title: prompt.slice(0, 36),
      origin: 'mobile',
      input: { prompt },
      idempotencyKey: `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    }),
  });
  return data.task;
}

// ============ 离线任务队列（幂等补发） ============
// 断网时 createTask 失败 → 入本地队列；联网后 flushPendingTasks 按幂等 key 补发。
// 服务端 taskCreate 对同 idempotency_key 返回已有任务（不重复创建），保证幂等。

const STORAGE_KEY_PENDING_TASKS = 'tszh_pending_tasks';

interface PendingTask {
  prompt: string;
  idempotencyKey: string;
  queuedAt: number;
}

export async function getPendingTasks(): Promise<PendingTask[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PENDING_TASKS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// 创建任务：失败自动入离线队列
export async function createTaskOrQueue(prompt: string): Promise<{ task: LinkedTask | null; queued: boolean }> {
  const idempotencyKey = `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    const data = await request<{ task: LinkedTask }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'video.generate',
        title: prompt.slice(0, 36),
        origin: 'mobile',
        input: { prompt },
        idempotencyKey,
      }),
    });
    return { task: data.task, queued: false };
  } catch {
    // 离线：入队，稍后补发
    const pending = await getPendingTasks();
    pending.push({ prompt, idempotencyKey, queuedAt: Date.now() });
    await AsyncStorage.setItem(STORAGE_KEY_PENDING_TASKS, JSON.stringify(pending));
    return { task: null, queued: true };
  }
}

// 联网后补发队列中的任务
export async function flushPendingTasks(): Promise<{ flushed: number; failed: number }> {
  const pending = await getPendingTasks();
  if (pending.length === 0) return { flushed: 0, failed: 0 };
  let flushed = 0, failed = 0;
  const remaining: PendingTask[] = [];
  for (const p of pending) {
    try {
      await request<{ task: LinkedTask }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'video.generate',
          title: p.prompt.slice(0, 36),
          origin: 'mobile',
          input: { prompt: p.prompt },
          idempotencyKey: p.idempotencyKey,
        }),
      });
      flushed += 1;
    } catch {
      remaining.push(p); // 仍离线，保留
      failed += 1;
    }
  }
  await AsyncStorage.setItem(STORAGE_KEY_PENDING_TASKS, JSON.stringify(remaining));
  return { flushed, failed };
}

export async function taskAction(
  taskId: string,
  action: 'pause' | 'resume' | 'cancel' | 'retry'
): Promise<LinkedTask> {
  const data = await request<{ task: LinkedTask }>(`/api/tasks/${taskId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  return data.task;
}

export interface PairedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'web';
  status: 'online' | 'offline';
  pairedAt: string;
  lastSeen: string;
}

export async function pairDevice(code: string, name = '我的手机'): Promise<PairedDevice> {
  const data = await request<{ device: PairedDevice }>('/api/devices/pair', {
    method: 'POST',
    body: JSON.stringify({ code, name, type: 'mobile' }),
  });
  await setDeviceId(data.device.id);
  return data.device;
}

export async function getDevices(): Promise<PairedDevice[]> {
  const data = await request<{ devices: PairedDevice[] }>('/api/devices');
  return data.devices || [];
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
