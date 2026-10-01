// React Bits Galaxy: Customize ranges and Props verified on 2026-10-01.
// Keep one normalized configuration for the workspace, preview and settings UI.
export type GalaxySettings = {
  density: number;
  glowIntensity: number;
  saturation: number;
  hueShift: number;
  twinkleIntensity: number;
  rotationSpeed: number;
  repulsionStrength: number;
  autoCenterRepulsion: number;
  starSpeed: number;
  speed: number;
  mouseInteraction: boolean;
  mouseRepulsion: boolean;
  disableAnimation: boolean;
  transparent: boolean;
  focal: [number, number];
  rotation: [number, number];
  useThemeHue: boolean;
};

type ScalarKey = Exclude<keyof GalaxySettings, "mouseInteraction" | "mouseRepulsion" | "disableAnimation" | "transparent" | "focal" | "rotation" | "useThemeHue">;
export const GALAXY_CONTROLS: readonly { key: ScalarKey; label: string; official: string; min: number; max: number; step: number }[] = [
  { key: "density", label: "星场密度", official: "Density", min: 0.1, max: 3, step: 0.1 },
  { key: "glowIntensity", label: "辉光强度", official: "Glow Intensity", min: 0, max: 1, step: 0.1 },
  { key: "saturation", label: "色彩饱和度", official: "Saturation", min: 0, max: 1, step: 0.1 },
  { key: "hueShift", label: "色相偏移", official: "Hue Shift", min: 0, max: 360, step: 10 },
  { key: "twinkleIntensity", label: "闪烁强度", official: "Twinkle Intensity", min: 0, max: 1, step: 0.1 },
  { key: "rotationSpeed", label: "旋转速度", official: "Rotation Speed", min: 0, max: 0.5, step: 0.05 },
  { key: "repulsionStrength", label: "鼠标排斥强度", official: "Repulsion Strength", min: 0, max: 10, step: 0.5 },
  { key: "autoCenterRepulsion", label: "中心扩散强度", official: "Auto Center Repulsion", min: 0, max: 20, step: 1 },
  { key: "starSpeed", label: "星星移动速度", official: "Star Speed", min: 0.1, max: 2, step: 0.1 },
  { key: "speed", label: "动画速度", official: "Animation Speed", min: 0.1, max: 3, step: 0.1 },
];

export const OFFICIAL_GALAXY_SETTINGS: GalaxySettings = {
  focal: [0.5, 0.5], rotation: [1, 0], starSpeed: 0.5, density: 1, hueShift: 140,
  disableAnimation: false, speed: 1, mouseInteraction: true, glowIntensity: 0.3,
  saturation: 0, mouseRepulsion: true, twinkleIntensity: 0.3, rotationSpeed: 0.1,
  repulsionStrength: 2, autoCenterRepulsion: 0, transparent: true, useThemeHue: false,
};

export const DEFAULT_GALAXY_SETTINGS: GalaxySettings = {
  ...OFFICIAL_GALAXY_SETTINGS,
  density: 0.65, glowIntensity: 0.12, saturation: 0.10, twinkleIntensity: 0.08,
  rotationSpeed: 0.01, starSpeed: 0.18, speed: 0.35, mouseRepulsion: false,
  useThemeHue: true,
};

function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeGalaxySettings(value: unknown): GalaxySettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const settings = { ...DEFAULT_GALAXY_SETTINGS };
  for (const field of GALAXY_CONTROLS) settings[field.key] = finite(input[field.key], settings[field.key], field.min, field.max);
  for (const key of ["mouseInteraction", "mouseRepulsion", "disableAnimation", "transparent", "useThemeHue"] as const) {
    if (typeof input[key] === "boolean") settings[key] = input[key];
  }
  for (const key of ["focal", "rotation"] as const) {
    const pair = Array.isArray(input[key]) ? input[key] : [];
    settings[key] = [0, 1].map(index => finite(pair[index], DEFAULT_GALAXY_SETTINGS[key][index], key === "focal" ? 0 : -1, 1)) as [number, number];
  }
  return settings;
}

export function galaxyHueFromHex(color: string) {
  const hex = /^#([\da-f]{6})$/i.exec(color.trim())?.[1] ?? "5888d8";
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta === 0) return 0;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}
