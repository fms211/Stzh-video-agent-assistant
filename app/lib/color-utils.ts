// 创意工坊统一工作区 — 颜色工具（智能取色，规划 §2.6）
// OKLCH 转换与对比度计算纯函数（无运行时依赖，node:test 可直载）。
// 智能取色约束：默认混入 15%、上限 25%；低对比自动回退。

export type RGB = { r: number; g: number; b: number }; // 0-255

/** sRGB → 线性 RGB */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 线性 RGB → OKLab（简化，无中间 XYZ 显式） */
export function rgbToOklch(rgb: RGB): { l: number; c: number; h: number } {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + b_ * b_);
  const hRad = Math.atan2(b_, a);
  const hDeg = ((hRad * 180) / Math.PI + 360) % 360;
  return { l: L, c: C, h: hDeg };
}

/** 相对亮度（WCAG） */
export function relativeLuminance(rgb: RGB): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** 对比度（WCAG 2.x，1:1 到 21:1） */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 把提取的主色调整为安全混入强度（OKLCH 亮度/饱和度钳制，规划 §2.6） */
export function clampOklchTint(
  color: string,
  targetLMin = 0.55,
  targetLMax = 0.75,
  targetCMin = 0.12,
  targetCMax = 0.2,
): string {
  // 解析 rgb(r,g,b) 或 #hex
  const rgb = parseColor(color);
  if (!rgb) return color;
  const oklch = rgbToOklch(rgb);
  const l = Math.min(targetLMax, Math.max(targetLMin, oklch.l));
  const c = Math.min(targetCMax, Math.max(targetCMin, oklch.c));
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${oklch.h.toFixed(1)})`;
}

export function parseColor(color: string): RGB | null {
  const hexMatch = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const v = Number.parseInt(hexMatch[1], 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  return null;
}

/** 智能取色混入：确保对比度足够，否则降低强度（规划 §2.6「低对比自动回退」） */
export function smartTintForBackground(
  tintColor: string,
  background: string,
  strength: number, // 0-0.25
): { color: string; strength: number } {
  const tint = parseColor(tintColor);
  const bg = parseColor(background);
  if (!tint || !bg) return { color: tintColor, strength };
  let current = strength;
  const safe = clampOklchTint(tintColor);
  // 逐档降低混入直到对比度 ≥ 4.5（普通正文标准），最低到 0
  let mixed = mixColors(bg, tint, current);
  while (current > 0 && contrastRatio(mixed, bg) < 4.5) {
    current = Math.max(0, current - 0.05);
    mixed = mixColors(bg, tint, current);
  }
  return { color: safe, strength: current };
}

function mixColors(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
