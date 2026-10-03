// 创意工坊统一工作区 — WallpaperStore（规划 §2.5：owner-scoped IndexedDB）
// db `tszh-personalization` / store `wallpapers`（by-owner index）；
// 记录内冗余 ownerScope，读取双重校验；Object URL 生命周期集中管理（模块级 Map）。
// 校验纯函数：25MiB 图片 / 150MiB 视频 / 4096px 图片边 / 3840×2160 视频边 / 30s 视频 / 仅 https 无账号密码。
// 测试注入锚点：setDatabaseFactoryForTest（Node 无真实 IDB 时用内存 shim）。

import type { WallpaperAppearance, WallpaperAsset } from "./appearance-types";

export const WALLPAPER_DB = "tszh-personalization";
export const WALLPAPER_STORE = "wallpapers";

export const WALLPAPER_LIMITS = {
  imageBytes: 25 * 1024 * 1024,
  videoBytes: 150 * 1024 * 1024,
  maxDimensionPx: 4096,
  videoMaxDimensionPx: 3840,
  videoDurationMs: 30_000,
} as const;

// ---- 数据库工厂（可注入） ----

type OpenResult = { db: unknown; version: number };
type DatabaseFactory = { open(name: string): Promise<OpenResult> };

let factoryOverride: DatabaseFactory | null = null;

export function setDatabaseFactoryForTest(factory: DatabaseFactory): void {
  factoryOverride = factory;
}

function realFactory(): DatabaseFactory {
  return {
    async open(name: string) {
      const request = indexedDB.open(name, 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(WALLPAPER_STORE)) {
            const store = database.createObjectStore(WALLPAPER_STORE, { keyPath: "id" });
            store.createIndex("by-owner", "ownerScope", { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("索引数据库打开失败"));
      });
      return { db, version: 1 };
    },
  };
}

// ---- CRUD（容错：不支持 IDB 的环境直接明确报错，不静默） ----

async function withDb(): Promise<unknown> {
  const factory = factoryOverride ?? realFactory();
  const { db } = await factory.open(WALLPAPER_DB);
  return db;
}

type AsyncRequest<T> = { result: T; error?: unknown; onsuccess: ((event?: unknown) => void) | null; onerror: ((event?: unknown) => void) | null };

function waitForRequest<T>(request: AsyncRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 请求失败"));
  });
}

type WallpaperWriteTransaction = {
  error?: unknown;
  oncomplete: (() => void) | null;
  onabort: (() => void) | null;
  onerror: (() => void) | null;
  abort(): void;
  objectStore(name: string): {
    get(id: string): AsyncRequest<WallpaperAsset | undefined>;
    put(asset: WallpaperAsset): AsyncRequest<unknown>;
    delete(id: string): AsyncRequest<unknown>;
  };
};

/** Ownership check and mutation share one transaction; success means commit. */
async function mutateWallpaper(id: string, ownerScope: string, change: (existing: WallpaperAsset | undefined) => WallpaperAsset | null | undefined): Promise<void> {
  const db = await withDb();
  const apply = (existing: WallpaperAsset | undefined) => {
    if (existing && existing.ownerScope !== ownerScope) throw new Error("无法修改不属于当前账号的壁纸");
    return change(existing);
  };
  if (db instanceof Object && (db as { stores?: Map<string, unknown> }).stores instanceof Map) {
    const store = (db as { stores: Map<string, { records: Map<string, unknown> }> }).stores.get(WALLPAPER_STORE);
    if (!store) throw new Error("壁纸存储未初始化");
    const next = apply(store.records.get(id) as WallpaperAsset | undefined);
    if (next === null) store.records.delete(id);
    else if (next !== undefined) store.records.set(id, next);
    return;
  }
  const tx = (db as { transaction(name: string, mode: string): WallpaperWriteTransaction }).transaction(WALLPAPER_STORE, "readwrite");
  if (!("oncomplete" in tx) || typeof tx.abort !== "function") throw new Error("当前壁纸存储无法确认事务完成");
  await new Promise<void>((resolve, reject) => {
    let failure: unknown;
    const abort = (cause: unknown) => {
      failure = cause;
      try { tx.abort(); } catch { reject(cause); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure || tx.error || new Error("壁纸存储事务已取消"));
    tx.onerror = () => { failure ||= tx.error || new Error("壁纸存储事务失败"); };
    try {
      const store = tx.objectStore(WALLPAPER_STORE);
      const read = store.get(id);
      read.onerror = () => abort(read.error || new Error("无法核对壁纸归属"));
      read.onsuccess = () => {
        try {
          const next = apply(read.result);
          const write = next === null ? store.delete(id) : next !== undefined ? store.put(next) : null;
          if (write) write.onerror = () => abort(write.error || new Error("壁纸写入失败"));
        } catch (cause) { abort(cause); }
      };
    } catch (cause) { abort(cause); }
  });
}

export async function putWallpaper(asset: WallpaperAsset, ownerScope: string): Promise<void> {
  try {
    if (asset.ownerScope !== ownerScope) throw new Error("壁纸所属账号与当前操作不一致");
    await mutateWallpaper(asset.id, ownerScope, () => ({ ...asset, ownerScope }));
  } catch (error) {
    throw new Error(error instanceof Error ? `壁纸保存失败：${error.message}` : "壁纸保存失败");
  }
}

export async function getWallpaper(id: string, ownerScope: string): Promise<WallpaperAsset | null> {
  const db = await withDb();
  try {
    if (db instanceof Object && (db as { stores?: Map<string, unknown> }).stores instanceof Map) {
      const store = (db as { stores: Map<string, { records: Map<string, unknown> }> }).stores.get(WALLPAPER_STORE);
      if (!store) return null;
      const record = store.records.get(String(id)) as WallpaperAsset | undefined;
      return record && record.ownerScope === ownerScope ? record : null;
    }
    if (db && typeof (db as { transaction?: unknown }).transaction === "function") {
      const tx = (db as { transaction(name: string): { objectStore(name: string): { get(key: string): unknown } } }).transaction(WALLPAPER_STORE);
      const record = await waitForRequest(tx.objectStore(WALLPAPER_STORE).get(id) as AsyncRequest<WallpaperAsset | undefined>);
      return record && record.ownerScope === ownerScope ? record : null;
    }
  } catch (cause) {
    throw new Error(cause instanceof Error ? `壁纸读取失败：${cause.message}` : "壁纸读取失败");
  }
  return null;
}

export async function listWallpapers(ownerScope: string): Promise<WallpaperAsset[]> {
  const db = await withDb();
  try {
    if (db instanceof Object && (db as { stores?: Map<string, unknown> }).stores instanceof Map) {
      const store = (db as { stores: Map<string, { records: Map<string, unknown> }> }).stores.get(WALLPAPER_STORE);
      if (!store) throw new Error("壁纸存储未初始化");
      return [...store.records.values()]
        .filter((r) => (r as WallpaperAsset).ownerScope === ownerScope)
        .sort((a, b) => (b as WallpaperAsset).lastUsedAt - (a as WallpaperAsset).lastUsedAt) as WallpaperAsset[];
    }
    // 真实 IDB：全量扫描（演示规模足够）后按 owner 过滤
    const tx = (db as { transaction(name: string): { objectStore(name: string): { getAll(): unknown } } }).transaction(WALLPAPER_STORE);
    const all = await waitForRequest(tx.objectStore(WALLPAPER_STORE).getAll() as AsyncRequest<WallpaperAsset[]>);
    return all.filter((r) => r.ownerScope === ownerScope).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch (cause) {
    throw new Error(cause instanceof Error ? `壁纸列表读取失败：${cause.message}` : "壁纸列表读取失败");
  }
}

export async function deleteWallpaper(id: string, ownerScope: string): Promise<void> {
  try {
    await mutateWallpaper(id, ownerScope, existing => existing ? null : undefined);
  } catch (cause) {
    throw new Error(cause instanceof Error ? `壁纸删除失败：${cause.message}` : "壁纸删除失败");
  }
}

export async function touchWallpaper(id: string, ownerScope: string): Promise<void> {
  await mutateWallpaper(id, ownerScope, asset => asset ? { ...asset, lastUsedAt: Date.now() } : undefined);
}

// ---- Object URL 生命周期（模块级集中管理） ----

const activeUrls = new Map<string, string>();

export function createAssetObjectUrl(asset: WallpaperAsset): string {
  if (!asset.blob) throw new Error("资产无 blob，无法创建 URL");
  const url = URL.createObjectURL(asset.blob);
  activeUrls.set(asset.id, url);
  return url;
}

export function revokeAssetObjectUrl(id: string): void {
  const url = activeUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    activeUrls.delete(id);
  }
}

export function revokeAllAssetObjectUrls(exceptId?: string): void {
  for (const [id, url] of activeUrls) {
    if (exceptId && id === exceptId) continue;
    URL.revokeObjectURL(url);
    activeUrls.delete(id);
  }
}

export function hasObjectUrl(id: string): boolean {
  return activeUrls.has(id);
}

export function createVideoPosterBlob(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) { cleanup(); resolve(null); return; }
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { cleanup(); resolve(blob); }, "image/webp", 0.82);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onerror = () => { cleanup(); resolve(null); };
    video.src = objectUrl;
  });
}

// ---- 校验纯函数 ----

export function isValidWallpaperUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function validateAppearance(appearance: WallpaperAppearance): { ok: true } | { ok: false; error: string } {
  if (appearance.aspect !== "16:9" && appearance.aspect !== "3:2") {
    return { ok: false, error: "画幅仅支持 16:9 与 3:2" };
  }
  if (appearance.fit !== "cover" && appearance.fit !== "contain") {
    return { ok: false, error: "填充方式仅支持 cover 与 contain" };
  }
  if (appearance.dim < 0 || appearance.dim > 0.6) {
    return { ok: false, error: "压暗强度超出范围（0–0.6）" };
  }
  if (appearance.focalX < 0 || appearance.focalX > 100 || appearance.focalY < 0 || appearance.focalY > 100) {
    return { ok: false, error: "焦点坐标超出范围（0–100）" };
  }
  if (appearance.smartTintStrength < 0 || appearance.smartTintStrength > 0.25) {
    return { ok: false, error: "智能取色混入强度不得超过 25%" };
  }
  return { ok: true };
}

export type WallpaperValidationResult =
  | { ok: true; width: number; height: number; durationMs: number | null }
  | { ok: false; error: string };

export async function validateWallpaperInput(
  kind: "image" | "video",
  source: "local" | "url",
  file: Blob | null,
  url: string | null,
): Promise<WallpaperValidationResult> {
  if (source === "url") {
    if (!url || !isValidWallpaperUrl(url)) {
      return { ok: false, error: "壁纸 URL 必须使用 HTTPS，且不能包含账号或密码" };
    }
    try {
      const size = await probeRemoteMediaSize(url, kind);
      return validateMediaMetrics(kind, size);
    } catch {
      return { ok: false, error: "无法读取 HTTPS 媒体信息，请确认地址可公开访问" };
    }
  }
  if (!file) return { ok: false, error: "未选择文件" };
  const allowedMime = kind === "image"
    ? ["image/jpeg", "image/png", "image/webp", "image/avif"]
    : ["video/mp4", "video/webm"];
  if (file.type && !allowedMime.includes(file.type)) {
    return { ok: false, error: kind === "image" ? "图片仅支持 JPG、PNG、WebP、AVIF" : "视频仅支持 MP4、WebM" };
  }
  if (kind === "image" && file.size > WALLPAPER_LIMITS.imageBytes) {
    return { ok: false, error: `图片超过 25 MiB 上限（当前 ${Math.round(file.size / 1024 / 1024)} MiB）` };
  }
  if (kind === "video" && file.size > WALLPAPER_LIMITS.videoBytes) {
    return { ok: false, error: `视频超过 150 MiB 上限（当前 ${Math.round(file.size / 1024 / 1024)} MiB）` };
  }
  // 媒体尺寸/时长探测（仅元数据；视频不加载全片）
  try {
    const size = await probeMediaSize(file, kind);
    return validateMediaMetrics(kind, size);
  } catch {
    return { ok: false, error: "无法读取媒体信息（文件可能损坏）" };
  }
}

function validateMediaMetrics(
  kind: "image" | "video",
  size: { width: number; height: number; durationMs: number | null },
): WallpaperValidationResult {
  if (size.width <= 0 || size.height <= 0) return { ok: false, error: "媒体尺寸无效" };
  if (kind === "image" && Math.max(size.width, size.height) > WALLPAPER_LIMITS.maxDimensionPx) {
    return { ok: false, error: `图片边长超过 ${WALLPAPER_LIMITS.maxDimensionPx}px` };
  }
  if (kind === "video" && (size.width > 3840 || size.height > 2160)) {
    return { ok: false, error: "视频分辨率超过 3840×2160" };
  }
  if (kind === "video" && size.durationMs !== null && size.durationMs > WALLPAPER_LIMITS.videoDurationMs) {
    return { ok: false, error: `视频超过 30 秒（当前 ${Math.round(size.durationMs / 1000)} 秒）` };
  }
  return { ok: true, ...size };
}

function probeMediaSize(file: Blob, kind: "image" | "video"): Promise<{ width: number; height: number; durationMs: number | null }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    if (kind === "image") {
      const img = new Image();
      img.onload = () => {
        cleanup();
        resolve({ width: img.naturalWidth, height: img.naturalHeight, durationMs: null });
      };
      img.onerror = () => {
        cleanup();
        reject(new Error("图片元数据读取失败"));
      };
      img.src = objectUrl;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => {
        const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : null;
        cleanup();
        resolve({ width: video.videoWidth, height: video.videoHeight, durationMs });
      };
      video.onerror = () => {
        cleanup();
        reject(new Error("视频元数据读取失败"));
      };
      video.src = objectUrl;
    }
  });
}

function probeRemoteMediaSize(url: string, kind: "image" | "video"): Promise<{ width: number; height: number; durationMs: number | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: { width: number; height: number; durationMs: number | null } | Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
    const timeout = window.setTimeout(() => finish(new Error("远程媒体读取超时")), 8_000);
    if (kind === "image") {
      const image = new Image();
      image.referrerPolicy = "no-referrer";
      image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight, durationMs: null });
      image.onerror = () => finish(new Error("远程图片不可访问"));
      image.src = url;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish({
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : null,
    });
    video.onerror = () => finish(new Error("远程视频不可访问"));
    video.src = url;
  });
}
