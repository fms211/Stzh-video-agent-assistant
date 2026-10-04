"use client";

import { useId, useState } from "react";
import Image from "next/image";
import type { MediaItem } from "@/app/lib/workspace-media";
import { needsUnoptimized } from "@/app/lib/needsUnoptimized";
import { ModalDialog } from "./ModalDialog";
import "./GalleryMedia.css";

export default function GalleryPreview({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  return <ModalDialog className="gallery-preview" labelledBy={titleId} onClose={onClose}>
    <div className="gallery-preview-panel">
      <header className="gallery-preview-header">
        <h3 id={titleId}>{item.sessionTitle}</h3>
        <button type="button" autoFocus className="gallery-filter-btn" onClick={onClose}>关闭预览</button>
      </header>
      {failed ? <div className="gallery-preview-error" role="alert"><p>图片暂时无法显示，原作品记录仍保留。可重新加载，或关闭预览后从作品卡片打开原文件。</p><button type="button" className="gallery-filter-btn" onClick={() => { setFailed(false); setRevision(value => value + 1); }}>重新加载图片</button></div>
        : <Image key={revision} src={item.url} alt={item.sessionTitle} width={1200} height={900} sizes="90vw" unoptimized={needsUnoptimized(item.url)} onError={() => setFailed(true)} />}
    </div>
  </ModalDialog>;
}
