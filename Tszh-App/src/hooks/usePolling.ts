// 自动轮询刷新 Hook
// 每 interval 毫秒调用一次 fetchData，组件卸载时自动停止

import { useEffect, useRef, useCallback } from 'react';

export function usePolling(fetchData: () => Promise<void>, interval = 30000) {
  const savedCallback = useRef(fetchData);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 每次渲染更新回调引用
  useEffect(() => {
    savedCallback.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    // 立即执行一次
    savedCallback.current();

    // 定时轮询
    timerRef.current = setInterval(() => {
      savedCallback.current();
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [interval]);
}
