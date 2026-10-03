"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/app/lib/workspace-media";
import { prepareMediaDownload, saveMediaDownload } from "@/app/lib/media-download";
import "./GalleryMedia.css";

export default function GalleryMediaActions({ item }: { item: MediaItem }) {
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { request.current?.abort(); }, []);

  async function download() {
    if (request.current && !request.current.signal.aborted) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const file = await prepareMediaDownload(item, { signal: controller.signal });
      if (controller.signal.aborted) return;
      saveMediaDownload(file);
      setMessage("已交给浏览器保存");
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailed(true);
      setMessage(error instanceof TypeError ? "无法直接下载，可能是网络或来源访问限制。可重试或打开原文件保存。" : error instanceof Error ? error.message : "下载失败，请重试或打开原文件保存");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  return <div className="gallery-download">
    <div className="gallery-actions">
      <button type="button" className="gallery-filter-btn" aria-disabled={pending} onClick={() => void download()} aria-label={`下载 ${item.sessionTitle}`}>{pending ? "正在下载…" : failed ? "重试下载" : "下载文件"}</button>
      {pending && <button type="button" className="gallery-filter-btn" onClick={() => { request.current?.abort(); setPending(false); setMessage("已取消下载"); }}>取消</button>}
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="gallery-filter-btn" aria-label={`打开原文件：${item.sessionTitle}`}>打开原文件</a>
    </div>
    {message && <p className="gallery-download-message" role={failed ? "alert" : "status"}>{message}</p>}
  </div>;
}
