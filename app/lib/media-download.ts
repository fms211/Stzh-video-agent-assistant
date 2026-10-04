import type { MediaItem } from "./workspace-media";

const MAX_BYTES = 128 * 1024 * 1024;
const FORMATS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp",
  "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogv",
  "video/quicktime": "mov", "video/x-m4v": "m4v",
};

/** Fetch an existing asset only. Never invokes a generation API or sends account credentials. */
export async function prepareMediaDownload(
  item: Pick<MediaItem, "url" | "type" | "id" | "sessionTitle">,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; maxBytes?: number; timeoutMs?: number } = {},
): Promise<{ blob: Blob; filename: string }> {
  const url = new URL(item.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("原文件地址无效");
  }
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error("下载超时，请重试或打开原文件保存")), options.timeoutMs ?? 60_000);
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  try {
    controller.signal.throwIfAborted();
    const response = await (options.fetchImpl ?? fetch)(url.href, {
      signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", mode: "cors",
    });
    if (!response.ok) throw new Error(`原文件读取失败（HTTP ${response.status}），请重试或打开原文件`);
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    let extension = mime.startsWith(`${item.type}/`) ? FORMATS[mime] : undefined;
    if (!mime || mime === "application/octet-stream") {
      const suffix = url.pathname.split(".").pop()?.toLowerCase();
      extension = Object.entries(FORMATS).find(([key, value]) => key.startsWith(`${item.type}/`) && value === (suffix === "jpeg" ? "jpg" : suffix))?.[1];
    }
    if (!extension) throw new Error("返回的内容不是支持的媒体文件，请打开原文件检查");
    const tooLarge = () => new Error("文件超过直接下载上限（128 MiB），请打开原文件保存");
    if (Number(response.headers.get("content-length")) > maxBytes) throw tooLarge();
    if (!response.body) throw new Error("原文件内容为空");
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
      while (true) {
        controller.signal.throwIfAborted();
        const { value, done } = await reader.read();
        controller.signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw tooLarge();
        chunks.push(new Uint8Array(value).buffer);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    if (!size) throw new Error("原文件内容为空");
    const safe = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_").replace(/[. ]+$/g, "").slice(0, 80);
    const filename = `${safe(item.sessionTitle) || "作品"}-${safe(item.id) || "media"}.${extension}`;
    return { blob: new Blob(chunks, { type: mime || "application/octet-stream" }), filename };
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

export function saveFileDownload(file: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(file.blob);
  let link: HTMLAnchorElement | null = null;
  let handedOff = false;
  try {
    link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    handedOff = true;
  } finally {
    try { link?.remove(); }
    finally {
      // A failed setup releases immediately; successful navigation needs time.
      if (handedOff) setTimeout(() => URL.revokeObjectURL(url), 30_000);
      else URL.revokeObjectURL(url);
    }
  }
}

export { saveFileDownload as saveMediaDownload };
