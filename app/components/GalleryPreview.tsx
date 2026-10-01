"use client";

import { useLayoutEffect, useId, useRef } from "react";
import Image from "next/image";
import type { MediaItem } from "@/app/lib/workspace-media";
import { needsUnoptimized } from "@/app/lib/needsUnoptimized";

export default function GalleryPreview({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // Close before React removes the modal; passive cleanup loses native focus restoration.
    return () => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} className="gallery-preview" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      // Image preview has one interactive control; keep either Tab direction on it.
      event.preventDefault();
      closeButtonRef.current?.focus({ preventScroll: true });
    }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="gallery-preview-panel">
      <header className="gallery-preview-header">
        <h3 id={titleId}>{item.sessionTitle}</h3>
        <button ref={closeButtonRef} type="button" autoFocus className="gallery-filter-btn" onClick={onClose}>关闭预览</button>
      </header>
      <Image src={item.url} alt={item.sessionTitle} width={1200} height={900} sizes="90vw" unoptimized={needsUnoptimized(item.url)} />
    </div>
  </dialog>;
}
