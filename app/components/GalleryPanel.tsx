"use client";

import { useState, useMemo, useEffect } from "react";
import { RefreshCw, Palette } from "lucide-react";
import { loadMessages, loadSessions } from "@/app/lib/sync";
import { PluginSlot } from "./plugin-slots/PluginSlot";
import { useAuth } from "./AuthProvider";
import { getTasks } from "@/app/lib/auth";
import { loadTaskMedia, mergeMedia, type MediaItem } from "@/app/lib/workspace-media";
import GalleryMediaActions from "./GalleryMediaActions";
import GalleryPreview from "./GalleryPreview";
import GalleryImage from "./GalleryImage";

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
  const { user, loading } = useAuth();
  if (loading) return <p role="status">正在确认作品账户…</p>;
  const owner = user ? `user:${user.id}` : "guest";
  return <GalleryPanelView key={owner} owner={owner} authenticated={Boolean(user)} />;
}

function GalleryPanelView({ owner, authenticated }: { owner: string; authenticated: boolean }) {
  const [remote, setRemote] = useState<{ owner: string; items: MediaItem[] }>({ owner: "", items: [] });
  const [remoteError, setRemoteError] = useState("");
  const [loading, setLoading] = useState(authenticated);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const media = useMemo(() => mergeMedia(remote.owner === owner ? remote.items : [], collectMedia()), [refreshKey, owner, remote]);

  useEffect(() => {
    let cancelled = false;
    setRemoteError("");
    setLoading(authenticated);
    if (authenticated) {
      void loadTaskMedia((cursor) => getTasks({ status: "completed", limit: 100, cursor }), () => !cancelled)
        .then((items) => { if (!cancelled) setRemote({ owner, items }); })
        .catch((error) => { if (!cancelled) setRemoteError(error instanceof Error ? error.message : "读取服务端作品失败"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [owner, authenticated, refreshKey]);

  // 监听 storage 变化刷新
  useEffect(() => {
    const handleStorage = () => setRefreshKey((k) => k + 1);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleStorage);
    const timer = window.setInterval(handleStorage, 30_000);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleStorage);
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return media;
    return media.filter((m) => m.type === filter);
  }, [media, filter]);

  const videoCount = media.filter((m) => m.type === "video").length;
  const imageCount = media.filter((m) => m.type === "image").length;

  return (
    <div className="gallery-panel">
      {/* 插件槽位：gallery.itemActions（additive，Mock 阶段无贡献时不渲染） */}
      <PluginSlot slot="gallery.itemActions" contributions={[]} projectId="project-a" />
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
              aria-pressed={filter === f}
            >
              {f === "all" ? "全部" : f === "video" ? "视频" : "图片"}
            </button>
          ))}
          <button
            type="button"
            className="gallery-filter-btn"
            onClick={() => { if (!loading) setRefreshKey((k) => k + 1); }}
            aria-label="刷新"
            aria-disabled={loading}
          >
            <RefreshCw size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* 网格 */}
      {remoteError && <p className="gallery-feedback" role="alert">服务端作品暂未同步：{remoteError}。可点击刷新重试。</p>}
      {loading && media.length > 0 && <p className="gallery-feedback" role="status">正在同步服务端作品，当前作品仍可查看。</p>}
      {filtered.length === 0 ? (
        <div className="gallery-empty">
          <span className="gallery-empty-icon"><Palette size={28} strokeWidth={1.5} /></span>
          <p className="gallery-empty-title">{media.length ? "当前分类没有作品" : loading ? "正在同步作品…" : remoteError ? "暂时无法确认服务端作品" : "还没有创作作品"}</p>
          <p className="gallery-empty-desc">{media.length ? "切换到全部，查看其他类型的作品" : loading ? "正在读取已有作品记录，请稍候。" : remoteError ? "已有记录保持原状，可点击右上角刷新重新读取。" : "在对话工作区中生成视频或图片，作品会自动出现在这里"}</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {filtered.map((item) => (
            <div key={item.id} className="gallery-card">
              {item.type === "video" ? (
                <div className="gallery-media">
                  <video src={item.url} controls preload="metadata" />
                  <span className="gallery-badge video">视频</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="gallery-media"
                  onClick={() => setPreview(item)}
                  aria-label={`预览 ${item.sessionTitle}`}
                >
                  <GalleryImage key={item.url} item={item} />
                  <span className="gallery-badge image">图片</span>
                </button>
              )}
              <div className="gallery-card-info">
                <span className="gallery-card-title">{item.sessionTitle}</span>
                <span className="gallery-card-date">
                  {new Date(item.timestamp).toLocaleDateString("zh-CN")}
                </span>
              </div>
              <GalleryMediaActions key={item.url} item={item} />
            </div>
          ))}
        </div>
      )}

      {preview && <GalleryPreview item={preview} onClose={() => setPreview(null)} />}

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
          font-family: var(--font-ui);
          font-size: var(--text-section-size);
          color: var(--glow-warm);
          font-feature-settings: "tnum";
          font-variant-numeric: tabular-nums;
          text-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 40%, transparent); line-height: var(--text-section-line); }
        .gallery-stat-label {
          font-size: var(--text-caption-size);
          color: var(--text-muted);
          letter-spacing: 0.06em; line-height: var(--text-caption-line); }
        .gallery-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .gallery-feedback { margin: 12px 0; font-size: var(--text-label-size); line-height: var(--text-label-line); overflow-wrap: anywhere; }
        .gallery-media:focus-visible { outline: 2px solid var(--glow-warm); outline-offset: -3px; }

        /* 空状态 */
        .gallery-empty {
          text-align: center;
          padding: 80px 20px;
        }
        .gallery-empty-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          opacity: 0.6;
          color: var(--glow-aurora);
        }
        .gallery-empty-title {
          font-family: var(--font-ui);
          font-size: var(--text-subheading-size);
          color: var(--foreground);
          margin: 0 0 8px; line-height: var(--text-subheading-line); }
        .gallery-empty-desc {
          font-size: var(--text-label-size);
          color: var(--text-muted);
          margin: 0;
          max-width: 300px;
          margin-inline: auto; line-height: var(--text-label-line); }

        /* 网格 */
        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
          gap: 16px;
        }
        .gallery-card {
          border-radius: var(--shape-control);
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
          border-radius: var(--shape-control);
          font-family: var(--font-ui);
          font-size: var(--text-caption-size);
          letter-spacing: 0.06em;
          pointer-events: none; line-height: var(--text-caption-line); }
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
          font-size: var(--text-caption-size);
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1; line-height: var(--text-caption-line); }
        .gallery-card-date {
          font-size: var(--text-caption-size);
          color: var(--text-muted);
          opacity: 0.85;
          white-space: nowrap;
          flex-shrink: 0; line-height: var(--text-caption-line); }

        @media (max-width: 640px) {
          .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 10px; }
          .gallery-header { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
