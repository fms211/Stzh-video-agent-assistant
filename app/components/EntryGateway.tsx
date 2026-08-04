"use client";

import { useState } from "react";
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
import { authenticateLogin, authenticateRegister } from "@/app/lib/auth";
import { hasWorkspaceData } from "@/app/lib/data-owner";
import type { AuthView, GuestImportDecision } from "@/app/lib/entry-flow";
import { useAuth } from "./AuthProvider";

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
  const { user, loading, logout, acceptAuth } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingAuth, setPendingAuth] = useState<AuthResponse | null>(null);
  const [decision, setDecision] = useState<GuestImportDecision>("pending");
  const [importResult, setImportResult] = useState<{ failed: number } | null>(null);

  const changeAuthView = (view: AuthView) => {
    setError("");
    setPendingAuth(null);
    setImportResult(null);
    onAuthViewChange(view);
  };

  const finishAuthentication = async (response: AuthResponse, selected: GuestImportDecision) => {
    setBusy(true);
    setError("");
    setImportResult(null);
    try {
      const merged = await acceptAuth(response, selected);
      if (selected === "import" && !merged.ok) {
        setImportResult({ failed: merged.failed });
        return;
      }
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "身份验证失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = authView === "register"
        ? await authenticateRegister(username.trim(), password, displayName.trim() || undefined)
        : await authenticateLogin(username.trim(), password);
      const guestHasData = hasWorkspaceData(localStorage, { kind: "guest" });
      if (guestHasData) {
        setPendingAuth(response);
        setBusy(false);
      } else {
        await finishAuthentication(response, "keep-local");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "服务暂时不可用，请稍后重试");
      setBusy(false);
    }
  };

  if (loading) {
    return <section className="entry-gateway is-loading" aria-busy="true">正在确认本机会话…</section>;
  }

  if (pendingAuth) {
    return (
      <section className={`entry-gateway ${compact ? "is-compact" : ""}`}>
        <div className="entry-gateway__heading">
          <span className="entry-eyebrow"><Download size={13} /> LOCAL HANDOFF</span>
          <h2>发现本机访客内容</h2>
          <p>选择是否把访客会话复制到“{pendingAuth.user.displayName || pendingAuth.user.username}”。访客副本不会被删除。</p>
        </div>
        <div className="entry-import-actions">
          <Button
            className="entry-primary-action"
            onPress={() => { setDecision("import"); void finishAuthentication(pendingAuth, "import"); }}
            isDisabled={busy}
          >
            导入到账户并进入 <ArrowRight size={16} />
          </Button>
          <Button
            className="entry-secondary-action"
            onPress={() => { setDecision("keep-local"); void finishAuthentication(pendingAuth, "keep-local"); }}
            isDisabled={busy}
          >
            继续留在本机
          </Button>
          <Button className="entry-text-action" onPress={() => setPendingAuth(null)} isDisabled={busy}>
            返回修改账户
          </Button>
        </div>
        {importResult && (
          <p className="entry-form-error" role="alert">
            {importResult.failed > 0
              ? `部分数据未同步（${importResult.failed} 项），本地副本已保留。`
              : "数据已导入账户。"}
            {importResult.failed > 0 && (
              <button
                type="button"
                className="entry-retry-link"
                onClick={() => void finishAuthentication(pendingAuth, "import")}
                disabled={busy}
              >
                重试同步
              </button>
            )}
          </p>
        )}
        {error && <p className="entry-form-error" role="alert">{error}</p>}
      </section>
    );
  }

  if (user && authView === "account") {
    return (
      <section className={`entry-gateway ${compact ? "is-compact" : ""}`}>
        <div className="entry-gateway__heading">
          <span className="entry-eyebrow"><Cloud size={13} /> SESSION READY</span>
          <h2>继续进入创作中心</h2>
          <p>账户会话已验证。进入后可使用云端历史、任务中心和手机联动。</p>
        </div>
        <div className="entry-account-card">
          <span><UserRound size={20} /></span>
          <div>
            <strong>{user.displayName || user.username}</strong>
            <small>@{user.username}</small>
          </div>
          <i>已验证</i>
        </div>
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
              logout();
              changeAuthView("login");
            }}
          >
            <LogOut size={14} /> 退出登录
          </Button>
        </div>
        <Button className="entry-guest-action" onPress={() => { logout(); onGuest(); }}>以访客模式浏览工作区</Button>
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
              <TextField value={displayName} onChange={setDisplayName}>
                <Label>显示名称</Label>
                <Input placeholder="例如：创意导演" autoComplete="name" />
              </TextField>
            )}
            <TextField value={username} onChange={setUsername} isRequired>
              <Label>账户名</Label>
              <Input placeholder="输入账户名" autoComplete="username" minLength={2} maxLength={20} />
            </TextField>
            <TextField value={password} onChange={setPassword} isRequired>
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
        <Button className="entry-guest-action" onPress={onGuest}>暂不登录，浏览真实工作区</Button>
        {onCancel && <Button className="entry-text-action" onPress={onCancel}>取消</Button>}
      </div>
    </section>
  );
}
