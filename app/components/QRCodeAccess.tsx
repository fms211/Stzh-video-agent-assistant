"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Network,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  createPairingCode,
  getPairingNetworkTargets,
  type NetworkTarget,
} from "@/app/lib/auth";

type Props = { compact?: boolean; disabled?: boolean };

function isVirtualTarget(target: NetworkTarget) {
  return /vethernet|wsl|hyper-v|vmware|virtualbox|loopback/i.test(target.label);
}

function preferredTarget(targets: NetworkTarget[]) {
  return targets.find((target) => !isVirtualTarget(target)) || targets[0] || null;
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function QRCodeAccess({ compact = false, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [targets, setTargets] = useState<NetworkTarget[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const visible = compact || showPanel;
  const pairPayload = useMemo(() => {
    if (!pairingCode || !targetUrl) return "";
    return `tszh-remote://connection?server=${encodeURIComponent(targetUrl)}&code=${encodeURIComponent(pairingCode)}`;
  }, [pairingCode, targetUrl]);

  const generatePairingSession = useCallback(async () => {
    if (disabled) return;
    setLoading(true);
    setCopied(false);
    setError("");
    try {
      const [pairing, network] = await Promise.all([
        createPairingCode(),
        getPairingNetworkTargets().catch(() => ({ targets: [] as NetworkTarget[] })),
      ]);
      const fallback = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin;
      const availableTargets = network.targets || [];
      const preferred = preferredTarget(availableTargets);
      setTargets(availableTargets);
      setTargetUrl(preferred?.url || fallback);
      setPairingCode(pairing.code);
      setExpiresAt(pairing.expiresAt);
      setRemaining(Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "配对会话生成失败");
    } finally {
      setLoading(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!visible || disabled) return;
    const start = window.setTimeout(() => void generatePairingSession(), 0);
    return () => window.clearTimeout(start);
  }, [disabled, generatePairingSession, visible]);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (!pairPayload || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, pairPayload, {
      width: compact ? 118 : 188,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#d8dce8", light: "#0a1228" },
    }).catch(() => setError("二维码渲染失败，请改用手动配对码"));
  }, [compact, pairPayload]);

  async function copyCode() {
    if (!pairingCode) return;
    await navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (compact) {
    return (
      <button type="button" className="qr-compact" disabled={disabled} onClick={() => setShowPanel((open) => !open)}>
        <canvas ref={canvasRef} className="qr-canvas-compact" />
        <span>{loading ? "生成中" : pairingCode || "设备配对"}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="qr-trigger"
        disabled={disabled}
        title={disabled ? "登录后可配对手机" : "配对手机远程控制台"}
        onClick={() => setShowPanel(true)}
      >
        <Smartphone size={15} strokeWidth={1.7} />
        <span>{disabled ? "登录后配对" : "配对手机"}</span>
      </button>

      {showPanel && (
        <div className="qr-overlay" onMouseDown={() => setShowPanel(false)}>
          <section
            className="qr-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pairing-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="qr-panel__header">
              <div className="qr-panel__mark"><QrCode size={20} strokeWidth={1.6} /></div>
              <div>
                <span>SECURE HANDSHAKE</span>
                <h3 id="pairing-title">连接手机远程控制台</h3>
              </div>
              <button type="button" aria-label="关闭配对窗口" onClick={() => setShowPanel(false)}>
                <X size={17} strokeWidth={1.7} />
              </button>
            </header>

            <div className="qr-panel__body">
              <div className={`qr-scanner ${loading ? "is-loading" : ""}`}>
                <div className="qr-scanner__bezel">
                  {loading ? (
                    <div className="qr-scanner__loading"><RefreshCw size={24} strokeWidth={1.5} /><span>建立安全通道</span></div>
                  ) : error ? (
                    <div className="qr-scanner__loading is-error"><TriangleAlert size={24} strokeWidth={1.5} /><span>无法生成二维码</span></div>
                  ) : (
                    <canvas ref={canvasRef} className="qr-canvas" />
                  )}
                </div>
                <span className="qr-scanner__corner corner-a" />
                <span className="qr-scanner__corner corner-b" />
                <span className="qr-scanner__corner corner-c" />
                <span className="qr-scanner__corner corner-d" />
              </div>

              <div className="qr-session">
                <div className="qr-session__status">
                  <span><i className={remaining > 0 ? "is-ready" : ""} />{remaining > 0 ? "等待手机确认" : "配对码已过期"}</span>
                  <strong>{formatRemaining(remaining)}</strong>
                </div>

                <div className="qr-session__code">
                  <span>一次性配对码</span>
                  <div>
                    <strong>{pairingCode || "········"}</strong>
                    <button type="button" aria-label="复制配对码" onClick={() => void copyCode()}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>

                <div className="qr-session__network">
                  <span><Network size={13} strokeWidth={1.7} /> 手机将连接到</span>
                  {targets.length > 1 ? (
                    <select value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)}>
                      {targets.map((target) => (
                        <option value={target.url} key={`${target.label}-${target.address}`}>
                          {target.label} · {target.url}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <code>{targetUrl || "正在识别局域网地址"}</code>
                  )}
                </div>

                <ol className="qr-session__steps">
                  <li><span>01</span><p><strong>打开手机端连接管理</strong>使用扫码入口识别此二维码。</p></li>
                  <li><span>02</span><p><strong>确认局域网地址</strong>手机与电脑需处于可互通网络。</p></li>
                  <li><span>03</span><p><strong>完成安全握手</strong>配对成功后任务状态会实时同步。</p></li>
                </ol>

                {error && <p className="qr-error"><TriangleAlert size={13} /> {error}</p>}
                {remaining === 0 && !loading && (
                  <button type="button" className="qr-regenerate" onClick={() => void generatePairingSession()}>
                    <RefreshCw size={14} /> 重新生成配对码
                  </button>
                )}
                <p className="qr-session__secure"><ShieldCheck size={13} strokeWidth={1.7} /> 配对码仅可使用一次，5 分钟后自动失效</p>
              </div>
            </div>
          </section>
        </div>
      )}

      <style>{`
        .qr-trigger { min-height:38px; padding:0 13px; display:flex; align-items:center; gap:7px; border:1px solid var(--border-subtle); border-radius:10px; background:color-mix(in srgb,var(--space-panel) 92%,transparent); color:var(--foreground); cursor:pointer; font-size:11px; transition:border-color 160ms cubic-bezier(.16,1,.3,1),color 160ms cubic-bezier(.16,1,.3,1),transform 160ms cubic-bezier(.16,1,.3,1); }
        .qr-trigger:hover:not(:disabled) { transform:translateY(-1px); border-color:color-mix(in srgb,var(--glow-warm) 35%,transparent); color:var(--glow-warm); }
        .qr-trigger:disabled { opacity:.48; cursor:not-allowed; }
        .qr-compact { display:flex; flex-direction:column; align-items:center; gap:6px; padding:8px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--space-panel); color:var(--foreground-muted); cursor:pointer; }
        .qr-canvas-compact { border-radius:5px; }.qr-compact span { font-size:10px; }
        .qr-overlay { position:fixed; inset:0; z-index:var(--z-max); display:grid; place-items:center; padding:24px; background:rgba(2,5,13,.88); animation:qr-overlay-in 180ms cubic-bezier(.16,1,.3,1) both; }
        .qr-panel { width:min(780px,100%); overflow:hidden; border:1px solid color-mix(in srgb,var(--glow-warm) 20%,var(--border-subtle)); border-radius:18px; background:var(--space-panel); box-shadow:0 26px 80px rgba(0,0,0,.55); animation:qr-panel-in 240ms cubic-bezier(.16,1,.3,1) both; }
        .qr-panel__header { min-height:82px; padding:16px 18px; display:grid; grid-template-columns:44px minmax(0,1fr) 34px; align-items:center; gap:12px; border-bottom:1px solid var(--border-subtle); }
        .qr-panel__mark { width:44px; height:44px; display:grid; place-items:center; border:1px solid color-mix(in srgb,var(--glow-warm) 30%,transparent); border-radius:11px; color:var(--glow-warm); background:color-mix(in srgb,var(--glow-warm) 8%,transparent); }
        .qr-panel__header span { color:var(--glow-cool); font:9px "Geist Mono",monospace; letter-spacing:.16em; }
        .qr-panel__header h3 { margin:5px 0 0; color:var(--foreground); font-size:17px; font-weight:560; }
        .qr-panel__header > button { width:34px; height:34px; display:grid; place-items:center; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--foreground-muted); cursor:pointer; }
        .qr-panel__header > button:hover { color:var(--foreground); border-color:var(--border-subtle); }
        .qr-panel__body { padding:24px; display:grid; grid-template-columns:250px minmax(0,1fr); gap:28px; }
        .qr-scanner { position:relative; width:250px; height:250px; padding:18px; display:grid; place-items:center; border:1px solid var(--border-subtle); border-radius:16px; background:var(--space-base); }
        .qr-scanner__bezel { width:210px; height:210px; display:grid; place-items:center; border:1px solid color-mix(in srgb,var(--glow-cool) 20%,transparent); border-radius:12px; background:#0a1228; box-shadow:inset 0 0 0 5px rgba(255,255,255,.018); }
        .qr-canvas { width:188px!important; height:188px!important; border-radius:6px; }
        .qr-scanner__corner { position:absolute; width:23px; height:23px; border-color:var(--glow-warm); opacity:.75; }
        .corner-a{top:9px;left:9px;border-top:1px solid;border-left:1px solid}.corner-b{top:9px;right:9px;border-top:1px solid;border-right:1px solid}.corner-c{bottom:9px;left:9px;border-bottom:1px solid;border-left:1px solid}.corner-d{bottom:9px;right:9px;border-bottom:1px solid;border-right:1px solid}
        .qr-scanner__loading { display:flex; flex-direction:column; align-items:center; gap:10px; color:var(--foreground-muted); font-size:10px; }.qr-scanner.is-loading .qr-scanner__loading svg { color:var(--glow-warm); animation:qr-spin 1s linear infinite; }.qr-scanner__loading.is-error svg{color:var(--error)}
        .qr-session { min-width:0; }
        .qr-session__status { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .qr-session__status span { display:flex; align-items:center; gap:7px; color:var(--foreground-muted); font-size:10px; }
        .qr-session__status i { width:6px; height:6px; border-radius:50%; background:var(--error); }.qr-session__status i.is-ready { background:#7cc79a; box-shadow:0 0 10px rgba(124,199,154,.45); }
        .qr-session__status strong { color:var(--foreground); font:500 13px "Geist Mono",monospace; }
        .qr-session__code { margin-top:14px; padding:13px 14px; border:1px solid var(--border-subtle); border-radius:11px; background:var(--space-surface); }
        .qr-session__code > span { color:var(--foreground-muted); font-size:9px; }
        .qr-session__code > div { margin-top:6px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .qr-session__code strong { color:var(--glow-warm); font:600 24px "Geist Mono",monospace; letter-spacing:.17em; }
        .qr-session__code button { width:30px; height:30px; display:grid; place-items:center; border:1px solid var(--border-subtle); border-radius:8px; background:transparent; color:var(--foreground-muted); cursor:pointer; }
        .qr-session__network { margin-top:12px; }.qr-session__network > span { display:flex; align-items:center; gap:6px; color:var(--foreground-muted); font-size:9px; }.qr-session__network code,.qr-session__network select { display:block; width:100%; margin-top:6px; padding:8px 9px; overflow:hidden; border:1px solid var(--border-subtle); border-radius:8px; background:var(--space-base); color:var(--foreground); font:9px "Geist Mono",monospace; text-overflow:ellipsis; }
        .qr-session__steps { margin:15px 0 0; padding:0; display:flex; flex-direction:column; gap:9px; list-style:none; }
        .qr-session__steps li { display:grid; grid-template-columns:27px 1fr; gap:9px; align-items:start; }.qr-session__steps li>span{padding-top:2px;color:var(--glow-cool);font:9px "Geist Mono",monospace}.qr-session__steps p{margin:0;color:var(--foreground-muted);font-size:9px;line-height:1.5}.qr-session__steps strong{display:block;color:var(--foreground);font-size:10px;font-weight:540}
        .qr-error { margin:12px 0 0; padding:8px; display:flex; gap:6px; border:1px solid color-mix(in srgb,var(--error) 30%,transparent); border-radius:8px; color:var(--error); font-size:9px; }
        .qr-regenerate { margin-top:12px; min-height:34px; padding:0 11px; display:flex; align-items:center; gap:6px; border:1px solid color-mix(in srgb,var(--glow-warm) 30%,transparent); border-radius:8px; background:transparent; color:var(--glow-warm); font-size:10px; cursor:pointer; }
        .qr-session__secure { margin:13px 0 0; display:flex; align-items:center; gap:6px; color:var(--foreground-muted); font-size:8px; }
        @keyframes qr-overlay-in{from{opacity:0}to{opacity:1}}@keyframes qr-panel-in{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}@keyframes qr-spin{to{transform:rotate(360deg)}}
        @media(max-width:680px){.qr-overlay{padding:12px;align-items:end}.qr-panel__body{grid-template-columns:1fr;max-height:calc(100svh - 110px);overflow:auto}.qr-scanner{margin:0 auto}.qr-panel{border-radius:18px 18px 0 0}.qr-session__code strong{font-size:20px}}
        @media(prefers-reduced-motion:reduce){.qr-overlay,.qr-panel,.qr-scanner__loading svg{animation:none}.qr-trigger{transition:none}}
      `}</style>
    </>
  );
}
