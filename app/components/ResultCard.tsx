"use client";

import { useState, useCallback } from "react";
import { RefreshCw, Pencil } from "lucide-react";
import GalleryImage from "./GalleryImage";
import GalleryMediaActions from "./GalleryMediaActions";
import GalleryPreview from "./GalleryPreview";
import { normalizeMediaUrl, type MediaItem } from "@/app/lib/workspace-media";

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
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const safeUrl = (value: unknown) => {
    const url = normalizeMediaUrl(value);
    if (!url) return null;
    const parsed = new URL(url);
    return parsed.username || parsed.password ? null : url;
  };
  const videoUrl = safeUrl(payload.videoUrl);
  const imageUrls = (payload.imageUrls || []).map(safeUrl).filter((url): url is string => !!url);
  const media = (url: string, index = 0): MediaItem => ({
    id: `${payload.requestId}-${videoUrl ? "video" : `image-${index}`}`, type: videoUrl ? "video" : "image", url,
    sessionTitle: "Coze结果", sessionId: "", timestamp: 0,
  });

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

  const downloadUrl = videoUrl || imageUrls[0];
  const hasMedia = !!downloadUrl;

  return (
    <>
      <div className="result-card edge-glow edge-glow-sweep">
        {videoUrl ? (
          <div className="result-card-video">
            <video controls src={videoUrl} />
          </div>
        ) : imageUrls.length > 0 ? (
          <>
            <div className="result-card-images">
              {imageUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPreview(media(url, i))}
                  aria-label={`预览图片 ${i + 1}`}
                >
                  <GalleryImage item={media(url, i)} />
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
            <GalleryMediaActions key={`${payload.requestId}:${downloadUrl}`} item={media(downloadUrl!)} />
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
          {imageUrls.length > 1 && (
            <div className="result-card-links">
              {imageUrls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`打开图片 ${i + 1}`}>
                  {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {preview && <GalleryPreview item={preview} onClose={() => setPreview(null)} />}

      <style>{`
        .result-card-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 6px;
          padding: 8px 12px;
          border-top: 1px solid var(--border-subtle);
        }
        .result-card-actions .gallery-download { flex: 1 1 220px; min-width: 0; }
        .result-card-images { grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 10px; padding: 12px; }
        .result-card-images button { min-width: 0; overflow: hidden; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--shape-control); background: var(--space-surface); }
        .result-card-images img { aspect-ratio: 16/9; object-fit: contain; }
        .result-card-images button:focus-visible { outline: 2px solid var(--glow-warm); outline-offset: 2px; }
        .result-action-btn {
          display: flex;
          min-height: 44px;
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
          flex-wrap: wrap;
          gap: 8px;
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
          overflow-wrap: anywhere;
        }
        .result-card-links {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .result-card-links a {
          display: grid; place-items: center; min-width: 44px; min-height: 44px;
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
