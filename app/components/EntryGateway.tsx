"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  Label,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
} from "react-aria-components";
import { ArrowRight, Cloud, Download, LogOut, UserRound } from "lucide-react";
import type { AuthResponse } from "@/app/lib/auth";
import { authenticateLogin, authenticateRegister, getToken, getCachedUser } from "@/app/lib/auth";
import { hasWorkspaceData } from "@/app/lib/data-owner";
import type { AuthView, GuestImportDecision } from "@/app/lib/entry-flow";
import { useAuth } from "./AuthProvider";
import AuthSessionNotice from "./AuthSessionNotice";

type IdentityScope = { token: string | null; userId: number | null };
type EntryOperation = { view: AuthView; initial: IdentityScope; handoff?: IdentityScope };

function readIdentityScope(): IdentityScope {
  return { token: getToken(), userId: getCachedUser()?.id ?? null };
}
function matchesIdentity(scope: IdentityScope): boolean {
  try { const current = readIdentityScope(); return current.token === scope.token && current.userId === scope.userId; }
  catch { return false; }
}

type Props = {
  authView: AuthView;
  onAuthViewChange: (view: AuthView) => void;
  onAuthenticated: () => void;
  onGuest: () => void;
  onCancel?: () => void;
  compact?: boolean;
};

export default function EntryGateway({
  authView,
  onAuthViewChange,
  onAuthenticated,
  onGuest,
  onCancel,
  compact = false,
}: Props) {
  const { user, loading, verification, logout, acceptAuth } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingAuth, setPendingAuth] = useState<AuthResponse | null>(null);
  const [importResult, setImportResult] = useState<{ failed: number } | null>(null);

  const alive = useRef(true);
  const view = useRef(authView);
  const operation = useRef<EntryOperation | null>(null);
  const pendingScope = useRef<IdentityScope | null>(null);
  const pendingResponse = useRef<AuthResponse | null>(null);
  const current = (job: EntryOperation) => alive.current && operation.current === job && view.current === job.view;

  const invalidate = () => {
    operation.current = null; pendingScope.current = null; pendingResponse.current = null;
    if (alive.current) { setBusy(false); setPendingAuth(null); setImportResult(null); setPassword(""); }
  };

  useLayoutEffect(() => {
    alive.current = true;
    const ownerChanged = () => {
      const job = operation.current;
      if (job) {
        // A rollback to the initiating identity is allowed; a third identity invalidates the operation.
        if (!matchesIdentity(job.initial) && !(job.handoff && matchesIdentity(job.handoff))) invalidate();
      } else if (pendingScope.current && !matchesIdentity(pendingScope.current)) invalidate();
    };
    const storageChanged = (event: StorageEvent) => {
      if (!event.key || event.key === "stzh_token" || event.key === "stzh_user") ownerChanged();
    };
    window.addEventListener("tszh_data_owner_changed", ownerChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      alive.current = false; operation.current = null; pendingScope.current = null; pendingResponse.current = null;
      window.removeEventListener("tszh_data_owner_changed", ownerChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  useLayoutEffect(() => {
    view.current = authView;
    invalidate();
  }, [authView]);

  const begin = (): EntryOperation | null => {
    if (!alive.current || operation.current) return null;
    try {
      const job = { view: view.current, initial: readIdentityScope() };
      operation.current = job; setBusy(true); setError(""); setImportResult(null);
      return job;
    } catch { setError("本机登录存储暂不可用，请恢复浏览器存储后重试。"); return null; }
  };
  const finish = (job: EntryOperation) => {
    if (current(job)) { operation.current = null; setBusy(false); }
  };
  const showFailure = (job: EntryOperation, cause: unknown, fallback: string) => {
    if (!current(job) || (!matchesIdentity(job.initial) && !(job.handoff && matchesIdentity(job.handoff)))) return;
    setPendingAuth(null); pendingScope.current = null; pendingResponse.current = null;
    setError(cause instanceof Error ? cause.message : fallback);
  };

  const changeAuthView = (next: AuthView) => {
    invalidate(); view.current = next; setError("");
    onAuthViewChange(next);
  };
  const cancel = () => { invalidate(); onCancel?.(); };
  const enterGuest = () => {
    invalidate();
    try { logout(); onGuest(); }
    catch { setError("退出账户未完成，请恢复浏览器存储后重试；当前会话未按访客模式继续。"); }
  };

  const applyAuthentication = async (job: EntryOperation, response: AuthResponse, selected: GuestImportDecision) => {
    if (!current(job) || !matchesIdentity(job.initial)) return;
    job.handoff = { token: response.token, userId: response.user.id };
    pendingScope.current = job.handoff;
    setPassword("");
    const merged = await acceptAuth(response, selected, () => current(job));
    if (!current(job) || !matchesIdentity(job.handoff)) return;
    if (selected === "import" && !merged.ok) { setImportResult({ failed: merged.failed }); return; }
    onAuthenticated();
  };
  const finishAuthentication = async (response: AuthResponse, selected: GuestImportDecision) => {
    if (pendingResponse.current !== response) return;
    if (!pendingScope.current || !matchesIdentity(pendingScope.current)) {
      invalidate(); setError("账户已变化，请在当前账户重新验证身份。"); return;
    }
    const job = begin(); if (!job) return;
    try { await applyAuthentication(job, response, selected); }
    catch (cause) { showFailure(job, cause, "身份验证未完成，请稍后重试"); }
    finally { finish(job); }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const job = begin(); if (!job) return;
    try {
      const response = job.view === "register"
        ? await authenticateRegister(username.trim(), password, displayName.trim() || undefined)
        : await authenticateLogin(username.trim(), password);
      if (!current(job) || !matchesIdentity(job.initial)) return;
      setPassword("");
      if (hasWorkspaceData(localStorage, { kind: "guest" })) {
        pendingScope.current = job.initial; pendingResponse.current = response; setPendingAuth(response);
      } else await applyAuthentication(job, response, "keep-local");
    } catch (cause) { showFailure(job, cause, "账户服务暂时不可用，请稍后重试"); }
    finally { finish(job); }
  };

  if (loading) {
    return <section className="entry-gateway is-loading" aria-busy="true">正在确认本机会话…</section>;
  }

  const visiblePendingAuth = pendingAuth && pendingResponse.current === pendingAuth && pendingScope.current && matchesIdentity(pendingScope.current) ? pendingAuth : null;
  if (visiblePendingAuth) {
    return (
      <section className={`entry-gateway ${compact ? "is-compact" : ""}`}>
        <div className="entry-gateway__heading">
          <span className="entry-eyebrow"><Download size={13} /> LOCAL HANDOFF</span>
          <h2>发现本机访客内容</h2>
          <p>选择是否把访客会话复制到“{visiblePendingAuth.user.displayName || visiblePendingAuth.user.username}”。访客副本不会被删除。</p>
        </div>
        <div className="entry-import-actions">
          <Button
            className="entry-primary-action"
            onPress={() => void finishAuthentication(visiblePendingAuth, "import")}
            isDisabled={busy}
          >
            导入到账户并进入 <ArrowRight size={16} />
          </Button>
          <Button
            className="entry-secondary-action"
            onPress={() => void finishAuthentication(visiblePendingAuth, "keep-local")}
            isDisabled={busy}
          >
            继续留在本机
          </Button>
          <Button className="entry-text-action" onPress={invalidate}>
            返回修改账户
          </Button>
        </div>
        {onCancel && <Button className="entry-text-action" onPress={cancel}>取消并关闭</Button>}
        <AuthSessionNotice />
        {importResult && (
          <p className="entry-form-error" role="alert">
            {importResult.failed > 0
              ? `部分同步未确认（${importResult.failed} 项），本机副本已保留。`
              : "数据已导入账户。"}
            {importResult.failed > 0 && (
              <button
                type="button"
                className="entry-retry-link"
                onClick={() => void finishAuthentication(visiblePendingAuth, "import")}
                disabled={busy}
              >
                重试同步
              </button>
            )}
          </p>
        )}
        {importResult && user?.id === visiblePendingAuth.user.id && verification === "verified" && <Button className="entry-secondary-action" isDisabled={busy} onPress={onAuthenticated}>保留未同步副本并进入</Button>}
        {error && <p className="entry-form-error" role="alert">{error}</p>}
      </section>
    );
  }

  if (user && authView === "account") {
    return (
      <section className={`entry-gateway ${compact ? "is-compact" : ""}`}>
        <div className="entry-gateway__heading">
          <span className="entry-eyebrow"><Cloud size={13} /> {verification === "verified" ? "SESSION READY" : "LOCAL SESSION"}</span>
          <h2>继续进入创作中心</h2>
          <p>{verification === "verified" ? "账户身份已验证；云端历史与任务仍以实际同步结果为准。" : verification === "checking" ? "正在向服务端确认身份，本机账户资料暂时保留。" : "当前仅保留本机会话，云端身份暂未验证；可恢复连接后重新检查。"}</p>
        </div>
        <div className="entry-account-card">
          <span><UserRound size={20} /></span>
          <div>
            <strong>{user.displayName || user.username}</strong>
            <small>@{user.username}</small>
          </div>
          <i>{verification === "verified" ? "已验证" : verification === "checking" ? "验证中" : "暂未验证"}</i>
        </div>
        <AuthSessionNotice />
        {error && <p className="entry-form-error" role="alert">{error}</p>}
        <div className="entry-account-actions">
          <Button className="entry-primary-action" onPress={onAuthenticated}>
            继续进入 <ArrowRight size={16} />
          </Button>
          <Button className="entry-secondary-action" onPress={() => changeAuthView("login")}>
            切换账户
          </Button>
          <Button
            className="entry-text-action"
            onPress={() => {
              invalidate();
              try { logout(); changeAuthView("login"); }
              catch { setError("退出账户未完成，请恢复浏览器存储后重试。"); }
            }}
          >
            <LogOut size={14} /> 退出登录
          </Button>
        </div>
        <Button className="entry-guest-action" onPress={enterGuest}>以访客模式浏览工作区</Button>
      </section>
    );
  }

  const selectedTab = authView === "register" ? "register" : "login";

  return (
    <section className={`entry-gateway ${compact ? "is-compact" : ""}`}>
      <div className="entry-gateway__heading">
        <span className="entry-eyebrow"><UserRound size={13} /> IDENTITY HANDOFF</span>
        <h2>{selectedTab === "login" ? "进入创作中心" : "建立创作者账户"}</h2>
        <p>登录后启用跨设备历史、实时任务和手机远程控制。</p>
      </div>

      <AuthSessionNotice />
      <Tabs
        className="entry-auth-tabs"
        selectedKey={selectedTab}
        onSelectionChange={(key) => changeAuthView(key === "register" ? "register" : "login")}
      >
        <TabList aria-label="登录或注册">
          <Tab id="login">登录</Tab>
          <Tab id="register">注册</Tab>
        </TabList>
        <TabPanel id={selectedTab}>
          <Form className="entry-auth-form" onSubmit={submit}>
            {selectedTab === "register" && (
              <TextField value={displayName} onChange={setDisplayName} isDisabled={busy}>
                <Label>显示名称</Label>
                <Input placeholder="例如：创意导演" autoComplete="name" />
              </TextField>
            )}
            <TextField value={username} onChange={setUsername} isRequired isDisabled={busy}>
              <Label>账户名</Label>
              <Input placeholder="输入账户名" autoComplete="username" minLength={2} maxLength={20} />
            </TextField>
            <TextField value={password} onChange={setPassword} isRequired isDisabled={busy}>
              <Label>密码</Label>
              <Input
                type="password"
                placeholder="输入密码"
                autoComplete={selectedTab === "register" ? "new-password" : "current-password"}
                minLength={6}
              />
            </TextField>
            {error && <p className="entry-form-error" role="alert">{error}</p>}
            <Button className="entry-primary-action" type="submit" isDisabled={busy}>
              {busy ? "正在验证" : selectedTab === "login" ? "验证身份并继续" : "注册并继续"}
              <ArrowRight size={16} />
            </Button>
          </Form>
        </TabPanel>
      </Tabs>

      <div className="entry-gateway__footer">
        <Button className="entry-guest-action" onPress={enterGuest}>暂不登录，浏览真实工作区</Button>
        {onCancel && <Button className="entry-text-action" onPress={cancel}>取消</Button>}
      </div>
    </section>
  );
}
