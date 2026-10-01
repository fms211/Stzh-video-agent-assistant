// 用户偏好设置管理 — 服务端 SQLite + localStorage 缓存

import { savePrefToServer, savePrefsBatchToServer } from "./server-sync";
import { currentDataOwner, workspaceDataKey } from "./data-owner";
import { migrateStartPage, type MappedStartPage } from "./appearance-types";
import { DEFAULT_GALAXY_SETTINGS, normalizeGalaxySettings, type GalaxySettings } from "./galaxy-settings";
import { DEFAULT_COZE_GLOW, normalizeCozeGlow, type CozeGlowSettings } from "./coze-dialogue-settings";

function preferencesKey() {
  if (typeof window === "undefined") return "tszh:v2:guest:preferences";
  return workspaceDataKey(currentDataOwner(localStorage), "preferences");
}

export type StartPage = MappedStartPage;

export interface UserPreferences {
  // 通知偏好
  notificationSound: boolean;      // 提示音开关
  desktopNotification: boolean;    // 桌面通知开关

  // 对话设置
  autoSave: boolean;               // 自动保存对话
  maxMessages: number;             // 单会话最大消息数
  historyDays: number;             // 历史记录保留天数（0=永久）

  // 界面设置
  startPage: StartPage;            // 起始页
  particleEffects: boolean;        // 粒子效果开关
  reducedMotion: boolean;          // 减少动画（无障碍）
  cursorTrail: boolean;            // 兼容旧偏好字段；鼠标拖尾暂时停用
  galaxySettings: GalaxySettings;  // 银河星场：官网可调参数与主题配色
  cozeGlow: CozeGlowSettings;

  // 导出设置
  exportFormat: "markdown" | "json" | "txt";  // 默认导出格式
  includeTimestamp: boolean;       // 导出时包含时间戳
}

const DEFAULT_PREFERENCES: UserPreferences = {
  // 通知偏好
  notificationSound: true,
  desktopNotification: true,

  // 对话设置
  autoSave: true,
  maxMessages: 500,
  historyDays: 0,

  // 界面设置
  startPage: "studio",
  particleEffects: true,
  reducedMotion: false,
  cursorTrail: false,
  galaxySettings: DEFAULT_GALAXY_SETTINGS,
  cozeGlow: DEFAULT_COZE_GLOW,

  // 导出设置
  exportFormat: "markdown",
  includeTimestamp: true,
};

// 读取偏好
export function getPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = localStorage.getItem(preferencesKey());
    if (!stored) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(stored);
    // 合并默认值，防止新增字段缺失
    return { ...DEFAULT_PREFERENCES, ...parsed, cursorTrail: false, cozeGlow: normalizeCozeGlow(parsed.cozeGlow), galaxySettings: normalizeGalaxySettings(parsed.galaxySettings), startPage: migrateStartPage(parsed.startPage ?? DEFAULT_PREFERENCES.startPage) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

// 保存偏好
export function savePreferences(prefs: Partial<UserPreferences>): void {
  if (typeof window === "undefined") return;
  const current = getPreferences();
  const normalized = { ...prefs, ...(prefs.galaxySettings ? { galaxySettings: normalizeGalaxySettings(prefs.galaxySettings) } : {}), ...(prefs.cozeGlow ? { cozeGlow: normalizeCozeGlow(prefs.cozeGlow) } : {}) };
  const updated = { ...current, ...normalized, cursorTrail: false };
  localStorage.setItem(preferencesKey(), JSON.stringify(updated));
  // 异步同步到服务端
  savePrefsBatchToServer(normalized as Record<string, unknown>).catch(() => {});
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
