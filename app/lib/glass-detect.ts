// 创意工坊统一工作区 — 玻璃渲染分级检测纯函数（规划 §2.2）
// 零运行时依赖（node:test 可直载）。Surface 组件从此 import，避免测试直接加载 .tsx。

import type { GlassPreset } from "./appearance-types.ts";
import { GLASS_PRESETS } from "./appearance-types.ts";

export type GlassRenderTier = 0 | 1 | 2;

/** 浏览器能力探测（Safari 用 webkit 前缀实现；类型层面以 Record 收窄） */
type GlassCssProbe = { backdropFilter?: string | undefined; webkitBackdropFilter?: string | undefined };

export function detectGlassTier(css: GlassCssProbe): GlassRenderTier {
  const supported = Boolean((css.backdropFilter ?? "").trim()) || Boolean((css.webkitBackdropFilter ?? "").trim());
  return supported ? 1 : 0;
}

export function isChromiumRefractionCapable(ua: string): boolean {
  // Chromium 系（Chrome/Edge 新/Opera 等），不含 Firefox/Safari
  return /Chrom(e|ium)/.test(ua) && !/Firefox/i.test(ua) && !/(Version\/.*Safari)/.test(ua);
}

/** variant × preset 配置锚点（测试与设置工作室共用） */
export function glassConfigForVariant(_variant: string, preset: GlassPreset) {
  return GLASS_PRESETS[preset];
}
