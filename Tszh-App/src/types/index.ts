// Tszh Remote - 类型定义

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

// 任务
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  progress?: number;
  stage?: string;
  remaining?: string;
  scenes?: number;
  duration?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// 通知类型
export type NotificationType = 'success' | 'error' | 'info' | 'system';

// 通知
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  action?: string;
  read: boolean;
}

// 视频作品
export interface Video {
  id: string;
  title: string;
  duration: string;
  mode: '混剪' | '连贯' | 'IP强锁';
  thumbnailUrl?: string;
  videoUrl?: string;
  createdAt: string;
}

// 模板
export interface Template {
  id: string;
  icon: string;
  title: string;
  description: string;
  tags: string;
  category: string;
  createdAt: string;
}

// AI 对话消息
export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

// 定时发布任务
export interface ScheduledTask {
  id: string;
  prompt: string;
  templateId?: string;
  mode: 'remix' | 'continuous';
  scheduleType: 'now' | 'scheduled' | 'repeat';
  scheduledAt?: string;
  repeatPattern?: 'daily' | 'weekly';
  status: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

// 用户信息
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

// 连接状态
export type ConnectionStatus = 'online' | 'offline' | 'connecting';

// 应用设置
export interface AppSettings {
  theme: string;
  notifications: boolean;
  serverUrl: string;
}
