// React Bits BorderGlow Customize ranges, checked 2026-10-01.
export type CozeGlowSettings = {
  edgeSensitivity: number; borderRadius: number; glowRadius: number;
  glowIntensity: number; coneSpread: number; animated: boolean;
  backgroundColor: string; colors: [string, string, string]; useThemeColors: boolean;
  borderWidth: number; fillOpacity: number;
};
export const COZE_GLOW_CONTROLS = [
  { key: "edgeSensitivity", label: "边缘敏感度", official: "Edge Sensitivity", min: 0, max: 80, step: 1 },
  { key: "borderRadius", label: "圆角", official: "Border Radius", min: 0, max: 50, step: 1 },
  { key: "glowRadius", label: "辉光范围", official: "Glow Radius", min: 10, max: 80, step: 1 },
  { key: "glowIntensity", label: "辉光强度", official: "Glow Intensity", min: .1, max: 3, step: .1 },
  { key: "coneSpread", label: "光锥展开", official: "Cone Spread", min: 5, max: 45, step: 1 },
  { key: "borderWidth", label: "发光边宽", official: "本站扩展 · Border Width", min: 1, max: 4, step: .5 },
  { key: "fillOpacity", label: "内侧染色", official: "fillOpacity · 保持正文清晰", min: 0, max: .15, step: .01 },
] as const;
export const OFFICIAL_COZE_GLOW: CozeGlowSettings = {
  edgeSensitivity: 30, borderRadius: 28, glowRadius: 40, glowIntensity: 1,
  coneSpread: 25, animated: false, backgroundColor: "#120f17",
  colors: ["#c084fc", "#f472b6", "#38bdf8"], useThemeColors: false, borderWidth: 1, fillOpacity: 0,
};
export const DEFAULT_COZE_GLOW: CozeGlowSettings = {
  ...OFFICIAL_COZE_GLOW, glowIntensity: 3, coneSpread: 34, glowRadius: 56,
  borderWidth: 2, backgroundColor: "#3b4049", useThemeColors: true,
};
export function normalizeCozeGlow(value: unknown): CozeGlowSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = { ...DEFAULT_COZE_GLOW, colors: [...DEFAULT_COZE_GLOW.colors] as [string, string, string] };
  for (const field of COZE_GLOW_CONTROLS) {
    const n = input[field.key];
    if (typeof n === "number" && Number.isFinite(n)) next[field.key] = Math.min(field.max, Math.max(field.min, n));
  }
  for (const key of ["animated", "useThemeColors"] as const) if (typeof input[key] === "boolean") next[key] = input[key];
  if (typeof input.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(input.backgroundColor)) next.backgroundColor = input.backgroundColor;
  if (Array.isArray(input.colors)) next.colors = next.colors.map((fallback, i) => typeof input.colors === "object" && Array.isArray(input.colors) && typeof input.colors[i] === "string" && /^#[0-9a-f]{6}$/i.test(input.colors[i]) ? input.colors[i] : fallback) as [string, string, string];
  return next;
}
export type CozeDialogueState = { scope: string; ready: boolean; hasMessages: boolean; firstSubmission: number; panelOpen: boolean };
export type CozeDialoguePhase = "loading" | "idle" | "opening" | "active";
export function cozeDialoguePhase(state: CozeDialogueState, openingScope: string | null): CozeDialoguePhase {
  if (!state.ready) return "loading";
  if (!state.hasMessages) return "idle";
  return openingScope === `${state.scope}:${state.firstSubmission}` && state.firstSubmission > 0 ? "opening" : "active";
}
export function cozeIdleFrame(area: { width: number; height: number; left: number; top: number }, star: { x: number; y: number }, panelHeight = 0) {
  const gutter = area.width < 720 ? 12 : 16;
  const width = Math.min(600, Math.max(0, area.width - gutter * 2));
  const height = Math.min(area.height, 240 + Math.min(280, panelHeight));
  return { width, height, x: Math.max(0, Math.min(area.width - width, star.x - area.left - width / 2)), y: Math.max(0, Math.min(area.height - height, star.y - area.top - height / 2)) };
}
