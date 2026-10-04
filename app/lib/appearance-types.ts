// 创意工坊统一工作区 — 领域类型与迁移契约（规划 §1.3/§1.4/§2.1–§2.4/§4.3）
// 零运行时依赖纯类型模块（node:test 原生 type-stripping 直载）。
// 名称与字面量为页面/组件/存储共同契约，不得自行改名。

import { CLEAR_GLASS_SURFACE, normalizeGlassSurface, type GlassSurfaceSettings } from "./glass-surface-settings.ts";

// ---- §1.4 底部四模式 ----

export type CreativeWorkspaceMode = "coze" | "assistant" | "workflow" | "collaboration";

export const CREATIVE_WORKSPACE_MODES: readonly CreativeWorkspaceMode[] = ["coze", "assistant", "workflow", "collaboration"] as const;

export const CREATIVE_WORKSPACE_MODE_LABELS: Record<CreativeWorkspaceMode, string> = {
  coze: "Coze 创作",
  assistant: "单助手",
  workflow: "工作流",
  collaboration: "协作编排",
};

// ---- §1.3 CreativeContext ----

export type CreativeContext = {
  revision: number;
  styleId: string | null;
  styleLabel: string;
  cameraMoveId: string | null;
  cameraMoveLabel: string;
  selectedParams: string[];
  durationSeconds: number;
  aspect: "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "9:21" | "adaptive";
  promptFragment: string;
};

export function emptyCreativeContext(): CreativeContext {
  return {
    revision: 0,
    styleId: null,
    styleLabel: "",
    cameraMoveId: null,
    cameraMoveLabel: "",
    selectedParams: [],
    durationSeconds: 8,
    aspect: "16:9",
    promptFragment: "",
  };
}

// ---- §2.2 Liquid Glass ----

export type LiquidGlassVariant = "bar" | "panel" | "capsule" | "popover";

export const LIQUID_GLASS_VARIANTS: readonly LiquidGlassVariant[] = ["bar", "panel", "capsule", "popover"] as const;

// ---- §2.3 玻璃预设 ----

export type GlassPreset = "clear" | "balanced" | "deep";

export type GlassSettings = {
  preset: GlassPreset;
  blurPx: number;
  opacity: number;
  refraction: number;
  edgeGlow: number;
  wallpaperDim: number;
  smartTint: number;
  reduceTransparency: boolean;
  refractionEnabled: boolean;
  videoAutoplay: boolean;
  /** Optional for old stored records; normalized before rendering or saving. */
  surface?: GlassSurfaceSettings;
};

export const GLASS_PRESETS: Record<GlassPreset, Omit<GlassSettings, "preset" | "reduceTransparency" | "refractionEnabled" | "videoAutoplay" | "surface">> = {
  clear: { blurPx: 12, opacity: 0.14, refraction: 32, edgeGlow: 0.18, wallpaperDim: 0.2, smartTint: 0.12 },
  balanced: { blurPx: 18, opacity: 0.22, refraction: 24, edgeGlow: 0.24, wallpaperDim: 0.32, smartTint: 0.18 },
  deep: { blurPx: 24, opacity: 0.34, refraction: 16, edgeGlow: 0.3, wallpaperDim: 0.48, smartTint: 0.25 },
};

export function defaultGlassSettings(): GlassSettings {
  return {
    preset: "balanced",
    ...GLASS_PRESETS.balanced,
    reduceTransparency: false,
    refractionEnabled: true,
    videoAutoplay: true,
    surface: { ...CLEAR_GLASS_SURFACE },
  };
}

/** Accept legacy records without trusting arbitrary CSS values or non-finite numbers. */
export function normalizeGlassSettings(value: unknown): GlassSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = defaultGlassSettings();
  if (raw.preset === "clear" || raw.preset === "balanced" || raw.preset === "deep") next.preset = raw.preset;
  const bounds = { blurPx: [0, 36], opacity: [0, 1], refraction: [0, 300], edgeGlow: [0, .5], wallpaperDim: [0, .6], smartTint: [0, .25] } as const;
  for (const key of Object.keys(bounds) as Array<keyof typeof bounds>) {
    const number = raw[key];
    if (typeof number === "number" && Number.isFinite(number)) next[key] = Math.max(bounds[key][0], Math.min(bounds[key][1], number));
  }
  for (const key of ["reduceTransparency", "refractionEnabled", "videoAutoplay"] as const) {
    if (typeof raw[key] === "boolean") next[key] = raw[key];
  }
  next.surface = normalizeGlassSurface(raw.surface);
  return next;
}

// ---- §2.4 壁纸显示配置 ----

export type WallpaperAppearance = {
  assetId: string | null;
  aspect: "16:9" | "3:2";
  fit: "cover" | "contain";
  focalX: number;
  focalY: number;
  dim: number;
  starfieldOpacity: number;
  orbitOpacity: number;
  smartTintEnabled: boolean;
  smartTintStrength: number;
};

export const DEFAULT_WALLPAPER_APPEARANCE: WallpaperAppearance = {
  assetId: null,
  aspect: "16:9",
  fit: "cover",
  focalX: 50,
  focalY: 50,
  dim: 0.32,
  starfieldOpacity: 1,
  orbitOpacity: 1,
  smartTintEnabled: false,
  smartTintStrength: 0.15,
};

// ---- §2.5 壁纸资产 ----

export type WallpaperAsset = {
  id: string;
  ownerScope: string;
  kind: "image" | "video";
  source: "local" | "url";
  mimeType: string;
  blob?: Blob;
  url?: string;
  posterBlob?: Blob;
  width: number;
  height: number;
  durationMs: number | null;
  createdAt: number;
  lastUsedAt: number;
};

// ---- §4.3 能谱状态 ----

export type ThemeEnergyState = "idle" | "running" | "thinking" | "peak";

export const THEME_ENERGY_STATES: readonly ThemeEnergyState[] = ["idle", "running", "thinking", "peak"] as const;

// ---- §5.3 起始页迁移（chat/opc/libtv → studio）----
// 纯函数：只做 startPage 字符串变换，不触碰任何 storage（会话/消息/任务数据零影响）。

export type LegacyStartPage = "chat" | "opc" | "tasks" | "stats" | "libtv" | "gallery";
export type MappedStartPage = "studio" | "tasks" | "stats" | "gallery";

export function migrateStartPage(page: string): MappedStartPage {
  return page === "chat" || page === "opc" || page === "libtv" ? "studio" : (page as MappedStartPage);
}
