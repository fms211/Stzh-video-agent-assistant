// Lattice Loader-inspired orbit; independent renderer with clear glass tiles.
export type DialogueLoaderSettings = {
  useThemeColor: boolean; color: string; step: number;
  cellSize: number; gap: number; idleOpacity: number; glow: boolean;
};
export const DEFAULT_DIALOGUE_LOADER: Readonly<DialogueLoaderSettings> = Object.freeze({
  useThemeColor: true, color: "#2020eb", step: 90,
  cellSize: 8, gap: 3, idleOpacity: .3, glow: true,
});
export const DIALOGUE_LOADER_CONTROLS = [
  { key: "step", label: "点亮间隔", unit: "ms", min: 50, max: 240, step: 10 },
  { key: "cellSize", label: "方块大小", unit: "px", min: 6, max: 12, step: 1 },
  { key: "gap", label: "方块间距", unit: "px", min: 1, max: 5, step: 1 },
  { key: "idleOpacity", label: "未点亮透明度", unit: "", min: .15, max: .6, step: .05 },
] as const;
export function normalizeDialogueLoader(value: unknown): DialogueLoaderSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const next = { ...DEFAULT_DIALOGUE_LOADER };
  for (const control of DIALOGUE_LOADER_CONTROLS) {
    const value = input[control.key];
    if (typeof value === "number" && Number.isFinite(value)) next[control.key] = Math.min(control.max, Math.max(control.min, value));
  }
  for (const key of ["useThemeColor", "glow"] as const) if (typeof input[key] === "boolean") next[key] = input[key];
  if (typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color)) next.color = input.color.toLowerCase();
  return next;
}
// Clockwise perimeter positions in a 3x3 grid; the centre remains empty.
export function dialogueLatticeCells(step: number) {
  const perimeter = [0, 1, 2, 5, 8, 7, 6, 3];
  const tick = normalizeDialogueLoader({ step }).step * 1.2;
  return Array.from({ length: 9 }, (_, index) => {
    const phase = perimeter.indexOf(index);
    return { hole: phase < 0, delay: phase < 0 ? 0 : -Math.round((8 - phase) * tick) };
  });
}
export function isPendingDialogueReply(pending: { id: string; sessionId: string } | null, id: string, sessionId: string, active: boolean): boolean {
  return active && pending?.id === id && pending.sessionId === sessionId;
}
