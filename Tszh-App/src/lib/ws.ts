// Tszh Remote - WebSocket 客户端
// 实时接收任务状态推送（可选功能，服务器不支持时静默降级）

import { getServerUrl, getToken } from './api';

type MessageHandler = (data: any) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private shouldReconnect = true;
  private retryCount = 0;
  private maxRetries = 3;

  // 连接 WebSocket
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    // 超过最大重试次数，停止重连
    if (this.retryCount >= this.maxRetries) {
      console.log('[WS] 已达最大重试次数，跳过 WebSocket 连接');
      return;
    }

    try {
      const serverUrl = await getServerUrl();
      const token = await getToken();

      // 将 http:// 转为 ws://
      const wsUrl = serverUrl
        .replace('http://', 'ws://')
        .replace('https://', 'wss://');

      const url = token ? `${wsUrl}/ws/mobile?token=${token}` : `${wsUrl}/ws/mobile`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] 连接成功');
        this.isConnected = true;
        this.retryCount = 0; // 重置重试计数
        this.emit('connected', {});
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type || 'message', data);
        } catch (e) {
          // 消息解析失败，静默忽略
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('disconnected', {});
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // WebSocket 连接失败，静默忽略（服务器可能不支持 WS）
        this.isConnected = false;
      };
    } catch (e) {
      // 连接失败，静默忽略
      this.isConnected = false;
    }
  }

  // 断线重连（指数退避）
  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.retryCount++;

    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // 发送消息
  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // 订阅事件
  on(event: string, handler: MessageHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  // 取消订阅
  off(event: string, handler: MessageHandler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  // 触发事件
  private emit(event: string, data: any) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach((h) => h(data));
  }

  // 断开连接
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  // 获取连接状态
  getStatus(): boolean {
    return this.isConnected;
  }
}

// 单例
export const wsClient = new WsClient();
