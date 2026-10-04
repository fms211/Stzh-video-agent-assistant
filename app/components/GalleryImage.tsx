"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import type { MediaItem } from "@/app/lib/workspace-media";
import { needsUnoptimized } from "@/app/lib/needsUnoptimized";

// The parent remains the preview button, including when its image is unavailable.
export default function GalleryImage({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="gallery-media-unavailable">
    <ImageOff size={24} strokeWidth={1.5} aria-hidden="true" />
    <span>图片暂时无法显示</span>
    <small>作品记录仍保留 · 点击查看详情</small>
  </span>;
  return <Image src={item.url} alt={item.sessionTitle} width={320} height={240}
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    unoptimized={needsUnoptimized(item.url)} onError={() => setFailed(true)} />;
}
