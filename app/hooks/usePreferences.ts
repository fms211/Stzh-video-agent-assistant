"use client";

import { useState, useEffect, useCallback } from "react";
import { getPreferences, savePreferences, type UserPreferences } from "@/app/lib/preferences";

// 偏好设置变更事件
const PREFS_EVENT = "tszh_preferences_changed";

// 触发偏好变更事件
function dispatchPrefsChange() {
  window.dispatchEvent(new CustomEvent(PREFS_EVENT));
}

// Hook: 使用偏好设置
export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(getPreferences);

  useEffect(() => {
    // 监听偏好变更
    const handleChange = () => {
      setPrefs(getPreferences());
    };

    window.addEventListener(PREFS_EVENT, handleChange);
    window.addEventListener("tszh_data_owner_changed", handleChange);
    // 也监听 storage 事件（跨标签页同步）
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener(PREFS_EVENT, handleChange);
      window.removeEventListener("tszh_data_owner_changed", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  // 更新偏好
  const updatePrefs = useCallback((updates: Partial<UserPreferences>) => {
    savePreferences(updates);
    setPrefs(getPreferences());
    dispatchPrefsChange();
  }, []);

  return { prefs, updatePrefs };
}

// Hook: 使用单个偏好
export function usePreference<K extends keyof UserPreferences>(key: K): [UserPreferences[K], (value: UserPreferences[K]) => void] {
  const { prefs, updatePrefs } = usePreferences();

  const setValue = useCallback((value: UserPreferences[K]) => {
    updatePrefs({ [key]: value });
  }, [key, updatePrefs]);

  return [prefs[key], setValue];
}
