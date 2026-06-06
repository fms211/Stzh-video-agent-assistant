"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type User, getToken, getCachedUser, getMe, logout as authLogout } from "@/app/lib/auth";
import { mergeLocalToServer, syncServerToLocal } from "@/app/lib/sync";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    // 先用缓存
    const cached = getCachedUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }

    // 再验证 token
    try {
      const data = await getMe();
      setUser(data.user);
      localStorage.setItem("stzh_user", JSON.stringify(data.user));

      // 登录后合并本地数据到服务端，再从服务端拉取最新数据
      await mergeLocalToServer();
      await syncServerToLocal();
    } catch {
      setUser(null);
      localStorage.removeItem("stzh_token");
      localStorage.removeItem("stzh_user");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
    // 清除本地存储的会话数据
    localStorage.removeItem("tszh_sessions");
    localStorage.removeItem("tszh_active");
    // 清除所有消息缓存
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("tszh_msgs_"));
    keys.forEach((k) => localStorage.removeItem(k));
    // 刷新页面确保 UI 更新
    window.location.reload();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
