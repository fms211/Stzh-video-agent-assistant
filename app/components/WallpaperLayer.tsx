"use client";

// 创意工坊统一工作区 — WallpaperLayer（规划 §2.4：图片/视频/URL/fallback）
// 图层顺序：主题色 → 壁纸 → 压暗 → 渐晕 → 星尘/轨道（外部叠加）。
// cover 支持焦点拖动；contain 用主题色模糊延展；视频静音循环自动播放；
// 降级（visibilitychange / prefers-reduced-motion / saveData / 外部 videoPaused）暂停视频并显示 poster。

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { WallpaperAppearance, WallpaperAsset } from "@/app/lib/appearance-types";

type Props = {
  appearance: WallpaperAppearance;
  asset: WallpaperAsset | null;
  videoPaused?: boolean;
  onFocalPointChange?: (x: number, y: number) => void;
  onSmartTintColor?: (color: string | null) => void;
  className?: string;
};

export function WallpaperLayer({ appearance, asset, videoPaused = false, onFocalPointChange, onSmartTintColor, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [resolvedMedia, setResolvedMedia] = useState<{ asset: WallpaperAsset | null; mediaUrl: string | null; posterUrl: string | null }>({ asset: null, mediaUrl: null, posterUrl: null });
  // A URL may only render with the exact asset that created it.
  const mediaUrl = asset && resolvedMedia.asset === asset ? resolvedMedia.mediaUrl : null;
  const posterUrl = asset && resolvedMedia.asset === asset ? resolvedMedia.posterUrl : null;
  const [videoAutoplay, setVideoAutoplay] = useState(true);

  // 资产对象 URL 生命周期：仅本地 blob 需要；URL 来源直接用原 url
  useEffect(() => {
    const nextMediaUrl = asset?.blob ? URL.createObjectURL(asset.blob) : (asset?.url ?? null);
    const nextPosterUrl = asset?.posterBlob ? URL.createObjectURL(asset.posterBlob) : null;
    setResolvedMedia({ asset, mediaUrl: nextMediaUrl, posterUrl: nextPosterUrl });
    return () => {
      if (asset?.blob && nextMediaUrl) URL.revokeObjectURL(nextMediaUrl);
      if (nextPosterUrl) URL.revokeObjectURL(nextPosterUrl);
    };
  }, [asset]);

  // 降级判定：visibilitychange + prefers-reduced-motion + saveData + 外部 videoPaused
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const apply = () => setVideoAutoplay(document.documentElement.dataset.videoAutoplay !== "false");
    apply();
    window.addEventListener("tszh_preferences_changed", apply);
    return () => window.removeEventListener("tszh_preferences_changed", apply);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const dataSave = Boolean((navigator as { connection?: { saveData?: boolean } }).connection?.saveData);
      setDegraded(media.matches || dataSave || document.visibilityState === "hidden" || videoPaused || !videoAutoplay);
    };
    update();
    window.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, [videoAutoplay, videoPaused]);

  // 视频暂停/恢复
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (degraded) {
      video.pause();
    } else {
      void video.play().catch(() => {
        // 自动播放被浏览器策略阻止时静默（用户交互后会恢复）
      });
    }
  }, [degraded]);

  // 图片焦点拖动（仅 cover；拖动定位由 CSS 变量即时呈现，上层经 appearance onPointerUp 回传存储）
  const draggingRef = useRef(false);
  const focalRef = useRef({ x: appearance.focalX, y: appearance.focalY });

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (appearance.fit !== "cover") return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [appearance.fit]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    focalRef.current = { x, y };
    event.currentTarget.style.setProperty("--wl-focal-x", `${x}%`);
    event.currentTarget.style.setProperty("--wl-focal-y", `${y}%`);
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onFocalPointChange?.(focalRef.current.x, focalRef.current.y);
  }, [onFocalPointChange]);

  // 智能取色：默认关闭；开启时从图片提取主色（失败/无权限回传 null，图片仍显示）
  useEffect(() => {
    if (!appearance.smartTintEnabled || !asset) { onSmartTintColor?.(null); return; }
    let cancelled = false;
    const imgSrc = asset.kind === "video" ? posterUrl : mediaUrl;
    if (!imgSrc) { onSmartTintColor?.(null); return; }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      try {
        ctx.drawImage(image, 0, 0, 8, 8);
        const data = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
        }
        onSmartTintColor?.(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
      } catch {
        onSmartTintColor?.(null);
      }
    };
    image.onerror = () => {
      if (!cancelled) onSmartTintColor?.(null);
    };
    image.src = imgSrc;
    return () => {
      cancelled = true;
    };
  }, [appearance.smartTintEnabled, asset, mediaUrl, posterUrl, onSmartTintColor]);

  if (!mediaUrl) return null;

  const isVideo = asset?.kind === "video";

  return (
    <div
      className={className ? `wl-layer ${className}` : "wl-layer"}
      data-aspect={appearance.aspect}
      data-fit={appearance.fit}
      data-focal-layer
      aria-hidden="true"
      style={
        {
          "--wl-dim": appearance.dim,
          "--wl-focal-x": `${appearance.focalX}%`,
          "--wl-focal-y": `${appearance.focalY}%`,
          "--wl-starfield-opacity": appearance.starfieldOpacity,
          "--wl-orbit-opacity": appearance.orbitOpacity,
        } as CSSProperties
      }
    >
      <div className="wl-media" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {isVideo ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            muted
            playsInline
            autoPlay={videoAutoplay}
            loop
            preload="metadata"
            poster={posterUrl ?? undefined}
            className="wl-media__el"
          />
        ) : (
          <img src={mediaUrl} alt="" draggable={false} className="wl-media__el" />
        )}
      </div>
      <div className="wl-dim" />
      <div className="wl-vignette" />
    </div>
  );
}
