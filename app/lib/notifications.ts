// 通知管理工具 — 服务端 SQLite + localStorage 缓存

import { addNotificationToServer, markAllReadOnServer, clearNotificationsOnServer } from "./server-sync";

const NOTIF_KEY = "tszh_notifications";

export type NotificationType = "success" | "error" | "info";

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: Date;
  read: boolean;
  type: NotificationType;
}

// 生成唯一 ID
function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 获取所有通知
export function getNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(NOTIF_KEY);
    if (!stored) return [];
    return JSON.parse(stored).map((n: any) => ({ ...n, time: new Date(n.time) }));
  } catch {
    return [];
  }
}

// 添加通知
export function addNotification(title: string, message: string, type: NotificationType = "info"): void {
  if (typeof window === "undefined") return;

  const notifications = getNotifications();
  const newNotif: Notification = {
    id: createId(),
    title,
    message,
    time: new Date(),
    read: false,
    type,
  };

  // 最多保留 50 条通知
  const updated = [newNotif, ...notifications].slice(0, 50);
  localStorage.setItem(NOTIF_KEY, JSON.stringify(updated));

  // 触发自定义事件，通知 NavigationBar 更新
  window.dispatchEvent(new CustomEvent("tszh_notification_added", { detail: newNotif }));

  // 同步到服务端
  addNotificationToServer(newNotif.id, title, message, type).catch(() => {});
}

// 标记单条已读
export function markAsRead(id: string): void {
  const notifications = getNotifications();
  const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  localStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
}

// 标记全部已读
export function markAllAsRead(): void {
  const notifications = getNotifications();
  const updated = notifications.map((n) => ({ ...n, read: true }));
  localStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
  markAllReadOnServer().catch(() => {});
}

// 清空通知
export function clearAllNotifications(): void {
  localStorage.removeItem(NOTIF_KEY);
  clearNotificationsOnServer().catch(() => {});
}

// 获取未读数
export function getUnreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

// 便捷方法
export function notifySuccess(title: string, message: string): void {
  addNotification(title, message, "success");
}

export function notifyError(title: string, message: string): void {
  addNotification(title, message, "error");
}

export function notifyInfo(title: string, message: string): void {
  addNotification(title, message, "info");
}
