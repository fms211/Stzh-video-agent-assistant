"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type Props = { compact?: boolean };

export default function QRCodeAccess({ compact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    // 获取当前网络地址（优先显示局域网 IP，手机扫码更方便）
    const host = window.location.hostname;
    const port = window.location.port || "3000";
    const protocol = window.location.protocol;
    // 如果是 localhost 或 127.0.0.1，尝试获取局域网 IP
    const displayHost = (host === "localhost" || host === "127.0.0.1") ? host : host;
    const networkUrl = `${protocol}//${displayHost}:${port}`;
    setUrl(networkUrl);

    // 生成二维码
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, networkUrl, {
        width: compact ? 120 : 180,
        margin: 1,
        color: {
          dark: "#e89840",
          light: "#0a1228",
        },
      });
    }
  }, [compact]);

  if (compact) {
    return (
      <div className="qr-compact" onClick={() => setShowPanel(!showPanel)}>
        <canvas ref={canvasRef} className="qr-canvas-compact" />
        <span className="qr-compact-label">扫码访问</span>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="qr-trigger" onClick={() => setShowPanel(!showPanel)}>
        <span className="qr-trigger-icon">📱</span>
        <span className="qr-trigger-text">手机扫码访问</span>
      </button>

      {showPanel && (
        <div className="qr-overlay" onClick={() => setShowPanel(false)}>
          <div className="qr-panel" onClick={(e) => e.stopPropagation()}>
            <div className="qr-porthole">
              <div className="qr-porthole-ring" />
              <div className="qr-porthole-inner">
                <h3 className="qr-title">手机扫码访问</h3>
                <p className="qr-desc">确保手机和电脑在同一 WiFi 下</p>
                <div className="qr-code-wrap">
                  <canvas ref={canvasRef} className="qr-canvas" />
                </div>
                <p className="qr-url">{url}</p>
                <div className="qr-instructions">
                  <p>1. 打开手机相机或微信扫一扫</p>
                  <p>2. 对准上方二维码</p>
                  <p>3. 在浏览器中打开</p>
                </div>
                <button type="button" className="qr-close" onClick={() => setShowPanel(false)}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .qr-trigger {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: var(--space-panel);
          color: var(--foreground-muted); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px;
          transition: all 0.2s;
        }
        .qr-trigger:hover { border-color: var(--glow-warm); color: var(--glow-warm); }
        .qr-trigger-icon { font-size: 16px; }
        .qr-trigger-text { letter-spacing: 0.04em; }

        .qr-compact {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          cursor: pointer; padding: 8px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: var(--space-panel);
          transition: all 0.2s;
        }
        .qr-compact:hover { border-color: var(--glow-warm); }
        .qr-canvas-compact { border-radius: 6px; }
        .qr-compact-label {
          font-size: 10px; color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans);
        }

        .qr-overlay {
          position: fixed; inset: 0; z-index: var(--z-max);
          display: flex; align-items: center; justify-content: center;
          background: rgba(2, 4, 12, 0.85); backdrop-filter: blur(8px);
          animation: qr-fade-in 0.25s ease-out;
        }
        @keyframes qr-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .qr-panel { animation: qr-modal-in 0.35s cubic-bezier(0.16,1,0.3,1); }
        @keyframes qr-modal-in { from { opacity: 0; transform: scale(0.9) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        .qr-porthole {
          position: relative; width: 380px; max-width: 90vw;
          background: var(--space-deep, #050a14);
          border-radius: 24px; padding: 3px;
          box-shadow: 0 0 60px color-mix(in srgb, var(--glow-warm) 15%, transparent),
                      0 0 120px color-mix(in srgb, var(--glow-cool) 8%, transparent),
                      inset 0 0 40px rgba(0,0,0,0.5);
        }
        .qr-porthole-ring {
          position: absolute; inset: 0; border-radius: 24px; padding: 2px;
          background: conic-gradient(
            from 0deg,
            color-mix(in srgb, var(--glow-warm) 40%, transparent),
            color-mix(in srgb, var(--glow-cool) 40%, transparent),
            color-mix(in srgb, var(--glow-aurora) 40%, transparent),
            color-mix(in srgb, var(--glow-warm) 40%, transparent)
          );
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: qr-porthole-spin 8s linear infinite;
          pointer-events: none;
        }
        @keyframes qr-porthole-spin { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }

        .qr-porthole-inner {
          border-radius: 22px; padding: 28px 24px;
          background: var(--space-panel, #0a1228);
          position: relative; z-index: 1;
          display: flex; flex-direction: column; align-items: center;
        }
        .qr-title {
          font-family: "GeistPixel-Line", var(--font-display), var(--font-sans);
          font-size: 16px; font-weight: 400; margin: 0 0 6px;
          color: var(--glow-warm-soft);
          text-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 30%, transparent);
          letter-spacing: 0.06em;
        }
        .qr-desc {
          font-size: 12px; color: var(--foreground-muted); margin: 0 0 16px;
          font-family: "GeistPixel-Line", var(--font-sans);
        }
        .qr-code-wrap {
          padding: 12px; background: var(--space-surface); border-radius: 12px;
          border: 1px solid var(--border-subtle); margin-bottom: 12px;
        }
        .qr-canvas { display: block; border-radius: 6px; }
        .qr-url {
          font-family: "Geist Mono", monospace; font-size: 12px;
          color: var(--glow-warm); margin: 0 0 16px; word-break: break-all;
          text-align: center;
        }
        .qr-instructions {
          display: flex; flex-direction: column; gap: 6px;
          margin-bottom: 16px; width: 100%;
        }
        .qr-instructions p {
          font-size: 12px; color: var(--foreground-muted); margin: 0;
          font-family: "GeistPixel-Line", var(--font-sans); letter-spacing: 0.04em;
        }
        .qr-close {
          padding: 8px 24px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: transparent; color: var(--foreground-muted); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px;
          transition: all 0.15s;
        }
        .qr-close:hover { border-color: var(--glow-warm); color: var(--glow-warm); }
      `}</style>
    </>
  );
}
