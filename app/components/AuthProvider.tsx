"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type AuthResponse,
  type User,
  commitAuthSession,
  getCachedUser,
  getMe,
  getToken,
  logout as authLogout,
  removeToken,
  setCachedUser,
  setToken,
} from "@/app/lib/auth";
import { mergeLocalToServer, syncServerToLocal } from "@/app/lib/sync";
import {
  copyWorkspaceData,
  dataOwnerFromUser,
  migrateLegacyWorkspaceData,
} from "@/app/lib/data-owner";
import type { GuestImportDecision } from "@/app/lib/entry-flow";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
  acceptAuth: (response: AuthResponse, decision: GuestImportDecision) => Promise<{ ok: boolean; failed: number }>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refreshUser: async () => {},
  acceptAuth: async () => ({ ok: true, failed: 0 }),
});

function notifyDataOwnerChanged() {
  window.dispatchEvent(new CustomEvent("tszh_data_owner_changed"));
}

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

      migrateLegacyWorkspaceData(localStorage, dataOwnerFromUser(data.user));

      // 登录后合并本地数据到服务端，再从服务端拉取最新数据
      await mergeLocalToServer();
      await syncServerToLocal();
      notifyDataOwnerChanged();
    } catch {
      setUser(null);
      localStorage.removeItem("stzh_token");
      localStorage.removeItem("stzh_user");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshUser());
  }, [refreshUser]);

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
    migrateLegacyWorkspaceData(localStorage, { kind: "guest" });
    notifyDataOwnerChanged();
  }, []);

  const acceptAuth = useCallback(async (response: AuthResponse, decision: GuestImportDecision) => {
    const previousToken = getToken();
    const previousUser = getCachedUser();

    try {
      commitAuthSession(response);
      const verified = await getMe();
      const accountOwner = dataOwnerFromUser(verified.user);
      migrateLegacyWorkspaceData(localStorage, accountOwner);
      if (decision === "import") {
        copyWorkspaceData(localStorage, { kind: "guest" }, accountOwner);
      }
      setUser(verified.user);
      setCachedUser(verified.user);
      const merged = decision === "import" ? await mergeLocalToServer() : { ok: true, failed: 0 };
      await syncServerToLocal();
      notifyDataOwnerChanged();
      return merged;
    } catch (cause) {
      if (previousToken && previousUser) {
        setToken(previousToken);
        setCachedUser(previousUser);
        setUser(previousUser);
      } else {
        removeToken();
        setUser(null);
      }
      throw cause;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser, acceptAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
