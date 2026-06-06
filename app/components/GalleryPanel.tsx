"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { needsUnoptimized } from "@/app/lib/needsUnoptimized";
import { loadMessages, loadSessions } from "@/app/lib/sync";

type MediaItem = {
  id: string;
  type: "video" | "image";
  url: string;
  sessionTitle: string;
  sessionId: string;
  timestamp: number;
};

function collectMedia(): MediaItem[] {
  const sessions = loadSessions();
  const items: MediaItem[] = [];

  for (const session of sessions) {
    try {
      const msgs = loadMessages(session.id);
      for (const msg of msgs) {
        if (!msg.payload) continue;
        if (msg.payload.videoUrl) {
          items.push({
            id: `${msg.id}-video`,
            type: "video",
            url: msg.payload.videoUrl,
            sessionTitle: session.title,
            sessionId: session.id,
            timestamp: session.timestamp,
          });
        }
        if (msg.payload.imageUrls) {
          for (let i = 0; i < msg.payload.imageUrls.length; i++) {
            items.push({
              id: `${msg.id}-img-${i}`,
              type: "image",
              url: msg.payload.imageUrls[i],
              sessionTitle: session.title,
              sessionId: session.id,
              timestamp: session.timestamp,
            });
          }
        }
      }
    } catch { /* skip corrupt sessions */ }
  }

  // 按时间倒序
  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

export default function GalleryPanel() {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const media = useMemo(() => collectMedia(), [refreshKey]);

  // 监听 storage 变化刷新
  useEffect(() => {
    const handleStorage = () => setRefreshKey((k) => k + 1);
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return media;
    return media.filter((m) => m.type === filter);
  }, [media, filter]);

  const videoCount = media.filter((m) => m.type === "video").length;
  const imageCount = media.filter((m) => m.type === "image").length;

  return (
    <div className="gallery-panel">
      {/* 头部 */}
      <div className="gallery-header">
        <div className="gallery-stats">
          <span className="gallery-stat">
            <span className="gallery-stat-num">{media.length}</span>
            <span className="gallery-stat-label">总作品</span>
          </span>
          <span className="gallery-stat">
            <span className="gallery-stat-num">{videoCount}</span>
            <span className="gallery-stat-label">视频</span>
          </span>
          <span className="gallery-stat">
            <span className="gallery-stat-num">{imageCount}</span>
            <span className="gallery-stat-label">图片</span>
          </span>
        </div>
        <div className="gallery-filters">
          {(["all", "video", "image"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`gallery-filter-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "全部" : f === "video" ? "视频" : "图片"}
            </button>
          ))}
          <button
            type="button"
            className="gallery-filter-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="刷新"
          >
            ↻
          </button>
        </div>
      </div>

      {/* 网格 */}
      {filtered.length === 0 ? (
        <div className="gallery-empty">
          <span className="gallery-empty-icon">🎨</span>
          <p className="gallery-empty-title">还没有创作作品</p>
          <p className="gallery-empty-desc">在对话工作区中生成视频或图片，作品会自动出现在这里</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {filtered.map((item) => (
            <div key={item.id} className="gallery-card">
              {item.type === "video" ? (
                <div className="gallery-media">
                  <video src={item.url} muted preload="metadata" />
                  <span className="gallery-badge video">视频</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="gallery-media"
                  onClick={() => setLightboxUrl(item.url)}
                >
                  <Image
                    src={item.url}
                    alt={item.sessionTitle}
                    width={320}
                    height={240}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized={needsUnoptimized(item.url)}
                  />
                  <span className="gallery-badge image">图片</span>
                </button>
              )}
              <div className="gallery-card-info">
                <span className="gallery-card-title">{item.sessionTitle}</span>
                <span className="gallery-card-date">
                  {new Date(item.timestamp).toLocaleDateString("zh-CN")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)} aria-label="关闭">
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
        .gallery-panel {
          width: 100%;
          max-width: 960px;
          margin: 0 auto;
          padding: 0 16px;
        }

        /* 头部 */
        .gallery-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .gallery-stats {
          display: flex;
          gap: 20px;
        }
        .gallery-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .gallery-stat-num {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 22px;
          color: var(--glow-warm);
          font-feature-settings: "tnum";
          font-variant-numeric: tabular-nums;
          text-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }
        .gallery-stat-label {
          font-size: 10px;
          color: var(--foreground-muted);
          letter-spacing: 0.06em;
        }
        .gallery-filters {
          display: flex;
          gap: 6px;
        }
        .gallery-filter-btn {
          padding: 5px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
          outline: none;
        }
        .gallery-filter-btn:hover {
          border-color: color-mix(in srgb, var(--glow-warm) 40%, transparent);
          color: var(--foreground);
        }
        .gallery-filter-btn.active {
          border-color: var(--glow-warm);
          color: var(--glow-warm);
          background: color-mix(in srgb, var(--glow-warm) 10%, transparent);
        }
        .gallery-filter-btn:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }

        /* 空状态 */
        .gallery-empty {
          text-align: center;
          padding: 80px 20px;
        }
        .gallery-empty-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 16px;
          opacity: 0.6;
        }
        .gallery-empty-title {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 16px;
          color: var(--foreground);
          margin: 0 0 8px;
        }
        .gallery-empty-desc {
          font-size: 13px;
          color: var(--foreground-muted);
          margin: 0;
          max-width: 300px;
          margin-inline: auto;
        }

        /* 网格 */
        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }
        .gallery-card {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: var(--space-panel);
          transition: border-color 0.2s, transform 0.2s var(--ease-out-quart), box-shadow 0.2s;
        }
        .gallery-card:hover {
          border-color: color-mix(in srgb, var(--glow-warm) 35%, transparent);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3), 0 0 16px color-mix(in srgb, var(--glow-warm) 8%, transparent);
        }

        .gallery-media {
          position: relative;
          aspect-ratio: 16 / 10;
          overflow: hidden;
          display: block;
          width: 100%;
          border: none;
          padding: 0;
          cursor: pointer;
          background: var(--space-deep);
        }
        .gallery-media video,
        .gallery-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .gallery-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 2px 8px;
          border-radius: 6px;
          font-family: "GeistPixel-Square", var(--font-sans);
          font-size: 9px;
          letter-spacing: 0.06em;
          pointer-events: none;
        }
        .gallery-badge.video {
          background: color-mix(in srgb, var(--glow-cool) 20%, transparent);
          color: var(--glow-cool);
          border: 1px solid color-mix(in srgb, var(--glow-cool) 30%, transparent);
        }
        .gallery-badge.image {
          background: color-mix(in srgb, var(--glow-warm) 20%, transparent);
          color: var(--glow-warm);
          border: 1px solid color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }

        .gallery-card-info {
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .gallery-card-title {
          font-size: 11px;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .gallery-card-date {
          font-size: 9px;
          color: var(--foreground-muted);
          opacity: 0.6;
          white-space: nowrap;
          flex-shrink: 0;
        }

        @media (max-width: 640px) {
          .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
          .gallery-header { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
