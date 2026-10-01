"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Download, RefreshCw, Pencil } from "lucide-react";
import { needsUnoptimized } from "@/app/lib/needsUnoptimized";

type AgentPayload = {
  requestId: string;
  createdAt?: string;
  videoUrl?: string;
  imageUrls?: string[];
  raw?: unknown;
};

type Props = {
  payload: AgentPayload;
  originalPrompt?: string;
  onRegenerate?: (prompt: string) => void;
  onModify?: (prompt: string) => void;
};

export default function ResultCard({ payload, originalPrompt, onRegenerate, onModify }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // 下载媒体文件
  const handleDownload = useCallback(async () => {
    const url = payload.videoUrl || payload.imageUrls?.[0];
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const ext = payload.videoUrl ? ".mp4" : url.match(/\.(png|jpg|jpeg|webp|gif)/i)?.[0] || ".png";
      a.download = `tszh-${payload.requestId.slice(0, 8)}${ext}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // 降级：直接打开链接
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  }, [payload]);

  // 重新生成
  const handleRegenerate = useCallback(() => {
    if (originalPrompt && onRegenerate) {
      onRegenerate(originalPrompt);
    }
  }, [originalPrompt, onRegenerate]);

  // 基于此修改 — 通过回调把 prompt 交给上层，避免直接操纵 React 受控 textarea
  const handleModify = useCallback(() => {
    if (!originalPrompt || !onModify) return;
    const base = originalPrompt.replace(/^基于上面的结果[，,]\s*/, "");
    onModify(`基于上面的结果，${base}，但是请`);
  }, [originalPrompt, onModify]);

  const hasMedia = !!(payload.videoUrl || (payload.imageUrls && payload.imageUrls.length > 0));

  return (
    <>
      <div className="result-card edge-glow edge-glow-sweep">
        {payload.videoUrl ? (
          <div className="result-card-video">
            <video controls src={payload.videoUrl} />
          </div>
        ) : payload.imageUrls ? (
          <>
            <div className="result-card-images">
              {payload.imageUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  aria-label={`预览图片 ${i + 1}`}
                >
                  <Image
                    src={url}
                    alt={`生成图片 ${i + 1}`}
                    width={320}
                    height={240}
                    sizes="33vw"
                    unoptimized={needsUnoptimized(url)}
                  />
                </button>
              ))}
            </div>
          </>
        ) : payload.raw ? (
          <div className="result-card-text">
            {typeof (payload.raw as any)?.text === "string" ? (
              <p className="result-card-plain-text">{(payload.raw as any).text}</p>
            ) : (
              <pre className="result-card-json">
                {JSON.stringify(payload.raw, null, 2)}
              </pre>
            )}
          </div>
        ) : null}

        {/* 操作按钮栏 */}
        {hasMedia && (
          <div className="result-card-actions">
            <button
              type="button"
              className="result-action-btn"
              onClick={handleDownload}
              disabled={downloading}
              aria-label="下载"
            >
              <span className="result-action-icon"><Download size={13} strokeWidth={1.8} /></span>
              <span className="result-action-label">{downloading ? "下载中…" : "下载"}</span>
            </button>
            {originalPrompt && onRegenerate && (
              <button
                type="button"
                className="result-action-btn"
                onClick={handleRegenerate}
                aria-label="重新生成"
              >
                <span className="result-action-icon"><RefreshCw size={13} strokeWidth={1.8} /></span>
                <span className="result-action-label">重新生成</span>
              </button>
            )}
            {originalPrompt && onModify && (
              <button
                type="button"
                className="result-action-btn"
                onClick={handleModify}
                aria-label="基于此修改"
              >
                <span className="result-action-icon"><Pencil size={13} strokeWidth={1.8} /></span>
                <span className="result-action-label">基于此修改</span>
              </button>
            )}
          </div>
        )}

        {/* 底部元信息 */}
        <div className="result-card-meta">
          <span className="result-card-id">id: {payload.requestId.slice(0, 8)}</span>
          {payload.imageUrls && payload.imageUrls.length > 1 && (
            <div className="result-card-links">
              {payload.imageUrls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`打开图片 ${i + 1}`}>
                  {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)} aria-label="关闭预览">
            &times;
          </button>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <Image
              src={lightboxUrl}
              alt="放大预览"
              width={1200}
              height={900}
              sizes="90vw"
              unoptimized={needsUnoptimized(lightboxUrl)}
            />
          </div>
        </div>
      )}

      <style>{`
        .result-card-actions {
          display: flex;
          gap: 6px;
          padding: 8px 12px;
          border-top: 1px solid var(--border-subtle);
        }
        .result-action-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: var(--shape-control);
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--space-surface) 60%, transparent);
          color: var(--text-muted);
          font-family: var(--font-ui);
          font-size: var(--text-label-size);
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: all 0.2s var(--ease-out-quart);
          white-space: nowrap;
          outline: none; line-height: var(--text-label-line); }
        .result-action-btn:hover {
          color: var(--glow-warm);
          border-color: color-mix(in srgb, var(--glow-warm) 40%, transparent);
          background: color-mix(in srgb, var(--glow-warm) 8%, transparent);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2), 0 0 12px color-mix(in srgb, var(--glow-warm) 10%, transparent);
        }
        .result-action-btn:active {
          transform: translateY(0) scale(0.97);
        }
        .result-action-btn:focus-visible {
          border-color: var(--glow-warm);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }
        .result-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .result-action-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .result-card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          border-top: 1px solid var(--border-subtle);
          font-size: var(--text-caption-size);
          color: var(--text-muted);
          opacity: 0.6; line-height: var(--text-caption-line); }
        .result-card-id {
          font-family: var(--font-code);
          letter-spacing: 0.04em;
        }
        .result-card-links {
          display: flex;
          gap: 6px;
        }
        .result-card-links a {
          color: var(--glow-cool);
          text-decoration: none;
          font-size: var(--text-caption-size);
          opacity: 0.7;
          transition: opacity 0.15s; line-height: var(--text-caption-line); }
        .result-card-links a:hover { opacity: 1; }
      `}</style>
    </>
  );
}
