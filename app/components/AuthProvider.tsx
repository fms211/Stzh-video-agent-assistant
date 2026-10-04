"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  ApiRequestError,
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

type VerificationState = "checking" | "verified" | "unavailable" | "signed-out";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  verification: VerificationState;
  notice: string;
  syncing: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
  acceptAuth: (response: AuthResponse, decision: GuestImportDecision, callerCurrent?: () => boolean) => Promise<{ ok: boolean; failed: number }>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  verification: "checking",
  notice: "",
  syncing: false,
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
  const [verification, setVerification] = useState<VerificationState>("checking");
  const [notice, setNotice] = useState("");
  const [syncing, setSyncing] = useState(false);
  const authRevision = useRef(0);

  const refreshUser = useCallback(async () => {
    const revision = ++authRevision.current;
    let token: string | null;
    try { token = getToken(); }
    catch {
      setVerification("unavailable"); setNotice("本机登录存储暂不可用，请恢复浏览器存储后重试。");
      setLoading(false); setSyncing(false); return;
    }
    const isCurrent = () => {
      try { return revision === authRevision.current && token === getToken(); }
      catch { return false; }
    };
    if (!token) {
      setUser(null); setVerification("signed-out"); setNotice(""); setLoading(false); setSyncing(false);
      return;
    }

    setVerification("checking"); setNotice(""); setSyncing(true);
    const cached = getCachedUser();
    if (cached && Number.isSafeInteger(cached.id) && cached.id > 0) {
      setUser(cached); setLoading(false);
    }

    let verified: User;
    try {
      const data = await getMe();
      if (!isCurrent()) return;
      if (!data?.user || !Number.isSafeInteger(data.user.id) || data.user.id <= 0) throw new Error("账户响应格式不正确");
      verified = data.user;
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof ApiRequestError && cause.status === 401) {
        // Only an explicit identity rejection invalidates the current session.
        try {
          authLogout(); setUser(null); setVerification("signed-out");
          setNotice("登录凭据已失效，请重新登录。当前账号的本机历史未删除。");
          notifyDataOwnerChanged();
        } catch {
          setVerification("unavailable"); setNotice("登录凭据已失效，但本机存储清理未完成；请恢复存储后重新验证。");
        }
      } else {
        setVerification("unavailable");
        setNotice("暂时无法验证账户，本机会话已保留；恢复连接后可重新检查，云端权限以服务端验证为准。");
      }
      return;
    } finally {
      if (revision === authRevision.current) { setLoading(false); setSyncing(false); }
    }

    if (!isCurrent()) return;
    setSyncing(true);
    try {
      // Update the stored identity before publishing its account to consumers.
      setCachedUser(verified);
      setUser(verified); setVerification("verified");
      migrateLegacyWorkspaceData(localStorage, dataOwnerFromUser(verified));
      notifyDataOwnerChanged();
      const merged = await mergeLocalToServer();
      if (!isCurrent()) return;
      if (!merged.ok) {
        setNotice(`账户已验证，${merged.failed}项历史同步未确认；本机副本已保留，未用云端列表覆盖。`);
        return;
      }
      const pulled = await syncServerToLocal();
      if (!isCurrent()) return;
      if (!pulled.ok) setNotice("账户已验证，云端历史暂未同步到本机；本机副本保留，可重新检查。");
      notifyDataOwnerChanged();
    } catch {
      if (isCurrent()) {
        if (getCachedUser()?.id !== verified.id) {
          setUser(null); setVerification("unavailable");
          setNotice("账户验证成功，但本机身份缓存未更新；已暂停账户展示，请恢复浏览器存储后重新检查。");
        } else setNotice("账户已验证，但本机初始化或历史同步未完成；本机会话保留，可重新检查。");
      }
    } finally {
      if (revision === authRevision.current) { setLoading(false); setSyncing(false); }
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refreshUser(); });
    return () => { active = false; authRevision.current++; };
  }, [refreshUser]);

  const logout = useCallback(() => {
    authRevision.current += 1;
    authLogout();
    setUser(null);
    setVerification("signed-out"); setNotice(""); setSyncing(false);
    setLoading(false);
    migrateLegacyWorkspaceData(localStorage, { kind: "guest" });
    notifyDataOwnerChanged();
  }, []);

  const acceptAuth = useCallback(async (response: AuthResponse, decision: GuestImportDecision, callerCurrent: () => boolean = () => true) => {
    if (!callerCurrent()) throw new DOMException("登录面板已关闭或切换", "AbortError");
    const revision = ++authRevision.current;
    const previousToken = getToken();
    const previousUser = getCachedUser();
    const previousVerification = verification;
    const previousNotice = notice;
    let accepted = false;
    const isCurrent = () => revision === authRevision.current && getToken() === response.token;
    const assertCurrent = () => {
      if (!isCurrent()) throw new DOMException("账户已切换，请使用当前账户继续", "AbortError");
      if (!callerCurrent()) throw new DOMException("登录面板已关闭或切换", "AbortError");
    };
    setVerification("checking"); setNotice(""); setSyncing(true);

    try {
      commitAuthSession(response);
      const verified = await getMe();
      assertCurrent();
      if (!verified?.user || !Number.isSafeInteger(verified.user.id) || verified.user.id <= 0 || verified.user.id !== response.user.id) {
        throw new Error("账户响应与本次登录不一致，请重新登录");
      }
      accepted = true;
      setCachedUser(verified.user);
      setUser(verified.user); setVerification("verified"); setLoading(false);
      const accountOwner = dataOwnerFromUser(verified.user);
      migrateLegacyWorkspaceData(localStorage, accountOwner);
      if (decision === "import") copyWorkspaceData(localStorage, { kind: "guest" }, accountOwner);
      notifyDataOwnerChanged();
      const merged = decision === "import" ? await mergeLocalToServer() : { ok: true, failed: 0 };
      assertCurrent();
      if (!merged.ok) {
        setNotice("账户已验证，部分导入同步未确认；本机副本保留，未用云端列表覆盖。");
        return merged;
      }
      const pulled = await syncServerToLocal();
      assertCurrent();
      if (!pulled.ok) setNotice("账户已验证，云端历史暂未同步到本机；可先继续工作，稍后重新检查。");
      notifyDataOwnerChanged();
      return pulled.ok ? merged : pulled;
    } catch (cause) {
      if (!isCurrent()) throw cause;
      if (accepted) {
        if (!callerCurrent()) {
          setNotice("账户身份已验证；当前面板已关闭或切换，未继续后续接续。已发生的导入或服务端操作不会自动撤销。");
          notifyDataOwnerChanged();
          throw cause;
        }
        // Identity succeeded. A later migration/storage/sync failure is not a rejected login.
        setUser(response.user); setVerification("verified"); setLoading(false);
        setNotice("账户已验证，但导入或本机初始化未完成；本机会话保留，可先继续工作后重新检查。");
        notifyDataOwnerChanged();
        return { ok: false, failed: 1 };
      }
      if (previousToken && previousUser) {
        setToken(previousToken); setCachedUser(previousUser); setUser(previousUser);
        setVerification(previousVerification === "checking" ? "unavailable" : previousVerification);
        setNotice(previousVerification === "checking" ? "原本机会话已恢复，但身份检查未完成；可重新检查账户。" : previousNotice);
      } else {
        removeToken(); setUser(null); setVerification("signed-out"); setNotice("");
      }
      notifyDataOwnerChanged();
      throw cause;
    } finally {
      if (revision === authRevision.current) setSyncing(false);
    }
  }, [verification, notice]);

  return (
    <AuthContext.Provider value={{ user, loading, verification, notice, syncing, logout, refreshUser, acceptAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
