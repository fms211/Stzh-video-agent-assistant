// 网络状态检测 — 离线/在线监听

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // React Native 没有 navigator.onLine，用 fetch 测试
    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch('https://www.google.com/favicon.ico', { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      }
    };

    check();
    const interval = setInterval(check, 30000); // 30s 检测一次
    return () => clearInterval(interval);
  }, []);

  return isOnline;
}
