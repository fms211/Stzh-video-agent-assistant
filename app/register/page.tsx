"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/app/lib/auth";
import { useAuth } from "@/app/components/AuthProvider";
import { toast } from "@/app/components/Toast";
import dynamic from "next/dynamic";

const StarfieldBackground = dynamic(() => import("@/app/components/StarfieldBackground"), { ssr: false });

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 个字符");
      return;
    }

    setLoading(true);
    try {
      await register(username, password);
      await refreshUser();
      toast.success("注册成功，欢迎加入！");
      router.push("/");
    } catch (err: any) {
      setError(err.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <StarfieldBackground />
      <div className="auth-porthole">
        <div className="auth-porthole-ring" />
        <div className="auth-porthole-inner">
          <h1 className="auth-title">腾昇智和</h1>
          <p className="auth-subtitle">创建新账户</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">用户名</label>
              <input
                className="auth-input"
                type="text"
                placeholder="2-20 个字符"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">密码</label>
              <div className="auth-input-wrap">
                <input
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="至少 6 个字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="auth-toggle-pw" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-label">确认密码</label>
              <input
                className="auth-input"
                type={showPassword ? "text" : "password"}
                placeholder="再次输入密码"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </button>
          </form>

          <p className="auth-switch">
            已有账户？{" "}
            <button type="button" className="auth-link" onClick={() => router.push("/login")}>
              去登录
            </button>
          </p>

          <button type="button" className="auth-skip" onClick={() => router.push("/")}>
            跳过注册，先体验
          </button>
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: var(--space-deep, #050a14); padding: 20px;
        }
        .auth-porthole {
          position: relative; width: 400px; max-width: 90vw;
          background: var(--space-deep, #050a14);
          border-radius: 24px; padding: 3px;
          z-index: 25;
          box-shadow: 0 0 60px color-mix(in srgb, var(--glow-warm) 15%, transparent),
                      0 0 120px color-mix(in srgb, var(--glow-cool) 8%, transparent);
        }
        .auth-porthole-ring {
          position: absolute; inset: 0; border-radius: 24px; padding: 2px;
          background: conic-gradient(from 0deg,
            color-mix(in srgb, var(--glow-warm) 40%, transparent),
            color-mix(in srgb, var(--glow-cool) 40%, transparent),
            color-mix(in srgb, var(--glow-aurora) 40%, transparent),
            color-mix(in srgb, var(--glow-warm) 40%, transparent));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: auth-ring-spin 8s linear infinite;
          pointer-events: none;
        }
        @keyframes auth-ring-spin { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
        .auth-porthole-inner {
          border-radius: 22px; padding: 36px 32px;
          background: var(--space-panel, #0a1228);
          position: relative; z-index: 1;
          display: flex; flex-direction: column; align-items: center;
        }
        .auth-title {
          font-family: "GeistPixel-Line", var(--font-display), var(--font-sans);
          font-size: 24px; font-weight: 400; margin: 0 0 6px;
          background: linear-gradient(135deg, var(--glow-warm-soft), var(--glow-aurora));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          letter-spacing: 0.08em;
        }
        .auth-subtitle {
          font-size: 13px; color: var(--foreground-muted); margin: 0 0 28px;
          font-family: "GeistPixel-Line", var(--font-sans);
        }
        .auth-form { width: 100%; display: flex; flex-direction: column; gap: 16px; }
        .auth-field { display: flex; flex-direction: column; gap: 6px; }
        .auth-label {
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px;
          color: var(--foreground-muted); letter-spacing: 0.04em;
        }
        .auth-input {
          width: 100%; padding: 12px 16px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: var(--space-surface);
          color: var(--foreground); font-family: var(--font-sans); font-size: 14px;
          outline: none; transition: border-color 0.2s; box-sizing: border-box;
        }
        .auth-input:focus { border-color: var(--glow-warm); }
        .auth-input::placeholder { color: var(--foreground-muted); }
        .auth-input-wrap { position: relative; }
        .auth-input-wrap .auth-input { padding-right: 40px; }
        .auth-toggle-pw {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; font-size: 16px;
          padding: 4px; opacity: 0.6; transition: opacity 0.15s;
        }
        .auth-toggle-pw:hover { opacity: 1; }
        .auth-error {
          font-size: 12px; color: #e85050; margin: 0; text-align: center;
          padding: 8px; background: rgba(232, 80, 80, 0.1); border-radius: 8px;
        }
        .auth-submit {
          width: 100%; padding: 12px; border-radius: 10px; border: none;
          background: var(--glow-warm); color: #0a0812;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 14px; font-weight: 500;
          cursor: pointer; transition: all 0.2s; letter-spacing: 0.04em; margin-top: 4px;
        }
        .auth-submit:hover { background: var(--glow-warm-soft); }
        .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-switch {
          font-size: 13px; color: var(--foreground-muted); margin: 20px 0 0;
          font-family: "GeistPixel-Line", var(--font-sans);
        }
        .auth-link {
          background: none; border: none; color: var(--glow-cool); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px;
          text-decoration: underline; text-underline-offset: 3px;
        }
        .auth-link:hover { color: var(--foreground); }
        .auth-skip {
          margin-top: 16px; background: none; border: 1px solid var(--border-subtle);
          border-radius: 8px; padding: 8px 20px; color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px;
          cursor: pointer; transition: all 0.15s;
        }
        .auth-skip:hover { border-color: var(--glow-warm); color: var(--glow-warm); }
      `}</style>
    </div>
  );
}
