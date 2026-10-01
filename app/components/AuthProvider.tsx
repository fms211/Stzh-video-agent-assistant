"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
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
  const authRevision = useRef(0);

  const refreshUser = useCallback(async () => {
    const revision = ++authRevision.current;
    const token = getToken();
    const isCurrent = () => revision === authRevision.current && token === getToken();
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
      if (!isCurrent()) return;
      setUser(data.user);
      localStorage.setItem("stzh_user", JSON.stringify(data.user));

      migrateLegacyWorkspaceData(localStorage, dataOwnerFromUser(data.user));
      notifyDataOwnerChanged();

      // 登录后合并本地数据到服务端，再从服务端拉取最新数据
      await mergeLocalToServer();
      if (!isCurrent()) return;
      await syncServerToLocal();
      if (!isCurrent()) return;
      notifyDataOwnerChanged();
    } catch {
      if (!isCurrent()) return;
      setUser(null);
      localStorage.removeItem("stzh_token");
      localStorage.removeItem("stzh_user");
      notifyDataOwnerChanged();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshUser());
  }, [refreshUser]);

  const logout = useCallback(() => {
    authRevision.current += 1;
    authLogout();
    setUser(null);
    setLoading(false);
    migrateLegacyWorkspaceData(localStorage, { kind: "guest" });
    notifyDataOwnerChanged();
  }, []);

  const acceptAuth = useCallback(async (response: AuthResponse, decision: GuestImportDecision) => {
    const revision = ++authRevision.current;
    const previousToken = getToken();
    const previousUser = getCachedUser();
    const isCurrent = () => revision === authRevision.current && getToken() === response.token;
    const assertCurrent = () => {
      if (!isCurrent()) throw new DOMException("账户已切换，请使用当前账户继续", "AbortError");
    };

    try {
      commitAuthSession(response);
      const verified = await getMe();
      assertCurrent();
      const accountOwner = dataOwnerFromUser(verified.user);
      migrateLegacyWorkspaceData(localStorage, accountOwner);
      if (decision === "import") {
        copyWorkspaceData(localStorage, { kind: "guest" }, accountOwner);
      }
      setUser(verified.user);
      setCachedUser(verified.user);
      setLoading(false);
      notifyDataOwnerChanged();
      const merged = decision === "import" ? await mergeLocalToServer() : { ok: true, failed: 0 };
      assertCurrent();
      await syncServerToLocal();
      assertCurrent();
      notifyDataOwnerChanged();
      return merged;
    } catch (cause) {
      if (!isCurrent()) throw cause;
      if (previousToken && previousUser) {
        setToken(previousToken);
        setCachedUser(previousUser);
        setUser(previousUser);
      } else {
        removeToken();
        setUser(null);
      }
      notifyDataOwnerChanged();
      throw cause;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser, acceptAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
