// 用户偏好设置管理 — 服务端 SQLite + localStorage 缓存

import { savePrefsBatchToServer } from "./server-sync";
import { currentDataOwner, workspaceDataKey } from "./data-owner";
import type { MappedStartPage } from "./appearance-types";
import { normalizeScalarPreferences, type ScalarPreferences } from "./preference-values";
import { normalizeGalaxySettings, type GalaxySettings } from "./galaxy-settings";
import { normalizeCozeGlow, type CozeGlowSettings } from "./coze-dialogue-settings";
import { normalizeDialogueLoader, type DialogueLoaderSettings } from "./dialogue-loader-settings";

function preferencesKey() {
  if (typeof window === "undefined") return "tszh:v2:guest:preferences";
  return workspaceDataKey(currentDataOwner(localStorage), "preferences");
}

export type StartPage = MappedStartPage;

export interface UserPreferences extends ScalarPreferences {
  galaxySettings: GalaxySettings;
  cozeGlow: CozeGlowSettings;
  dialogueLoader: DialogueLoaderSettings;
}

export function normalizePreferences(value: unknown): UserPreferences {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    ...normalizeScalarPreferences(source),
    galaxySettings: normalizeGalaxySettings(source.galaxySettings),
    cozeGlow: normalizeCozeGlow(source.cozeGlow),
    dialogueLoader: normalizeDialogueLoader(source.dialogueLoader),
  };
}

// 读取偏好
export function getPreferences(): UserPreferences {
  if (typeof window === "undefined") return normalizePreferences(null);
  try {
    const stored = localStorage.getItem(preferencesKey());
    if (!stored) return normalizePreferences(null);
    // Read without rewriting the original record or touching conversation history.
    return normalizePreferences(JSON.parse(stored));
  } catch {
    return normalizePreferences(null);
  }
}

// 保存偏好
export function savePreferences(prefs: Partial<UserPreferences>): void {
  if (typeof window === "undefined") return;
  const current = getPreferences();
  const updated = normalizePreferences({ ...current, ...prefs });
  // Sync only supplied, recognized fields; never send invalid raw values or other settings.
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(prefs) as Array<keyof UserPreferences>) {
    if (Object.prototype.hasOwnProperty.call(updated, key)) normalized[key] = updated[key];
  }
  localStorage.setItem(preferencesKey(), JSON.stringify(updated));
  // 异步同步到服务端
  savePrefsBatchToServer(normalized).catch(() => {});
}

// 重置偏好
export function resetPreferences(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(preferencesKey());
}

// 获取单个偏好
export function getPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
  return getPreferences()[key];
}

// 设置单个偏好
export function setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
  savePreferences({ [key]: value });
}
