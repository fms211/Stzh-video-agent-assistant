// Runtime boundaries for persisted scalar preferences. No storage or network access.
import type { MappedStartPage } from "./appearance-types";

export interface ScalarPreferences {
  notificationSound: boolean;
  desktopNotification: boolean;
  autoSave: boolean;
  maxMessages: number;
  historyDays: number; // Legacy preference only; the explicit server retention policy controls cleanup.
  startPage: MappedStartPage;
  particleEffects: boolean;
  reducedMotion: boolean;
  cursorTrail: boolean; // Compatibility field: the removed cursor trail stays disabled.
  exportFormat: "markdown" | "json" | "txt";
  includeTimestamp: boolean;
}

export const DEFAULT_SCALAR_PREFERENCES: Readonly<ScalarPreferences> = Object.freeze({
  notificationSound: true,
  desktopNotification: true,
  autoSave: true,
  maxMessages: 500,
  historyDays: 0,
  startPage: "studio",
  particleEffects: true,
  reducedMotion: false,
  cursorTrail: false,
  exportFormat: "markdown",
  includeTimestamp: true,
});

export function normalizeScalarPreferences(value: unknown): ScalarPreferences {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const bool = (key: keyof ScalarPreferences): boolean =>
    typeof source[key] === "boolean" ? source[key] as boolean : DEFAULT_SCALAR_PREFERENCES[key] as boolean;
  const integer = (key: "maxMessages" | "historyDays", minimum: number): number =>
    typeof source[key] === "number" && Number.isSafeInteger(source[key]) && (source[key] as number) >= minimum
      ? source[key] as number : DEFAULT_SCALAR_PREFERENCES[key];
  // Legacy chat/opc/libtv and unknown pages all fall back to the current studio.
  const startPage = source.startPage === "tasks" || source.startPage === "stats" || source.startPage === "gallery"
    ? source.startPage : "studio";
  const exportFormat = source.exportFormat === "json" || source.exportFormat === "txt"
    ? source.exportFormat : "markdown";
  return {
    notificationSound: bool("notificationSound"),
    desktopNotification: bool("desktopNotification"),
    autoSave: bool("autoSave"),
    maxMessages: integer("maxMessages", 1),
    // Preserve valid older values; the current editor offers 0–90 days.
    historyDays: integer("historyDays", 0),
    startPage,
    particleEffects: bool("particleEffects"),
    reducedMotion: bool("reducedMotion"),
    cursorTrail: false,
    exportFormat,
    includeTimestamp: bool("includeTimestamp"),
  };
}
