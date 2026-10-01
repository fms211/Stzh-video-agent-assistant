"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getToken } from "@/app/lib/auth";
import { fetchServerSettings, saveServerSettings } from "@/app/lib/sync";
import { getPreferences, savePreferences, resetPreferences, type UserPreferences, type StartPage } from "@/app/lib/preferences";
import { saveSettingToServer } from "@/app/lib/server-sync";
import { THEMES, type ThemeId, DEFAULT_THEME } from "@/app/lib/theme-registry";
import { Settings, MessageSquare, BarChart3, Palette } from "lucide-react";

function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = localStorage.getItem("theme");
  if (THEMES.some((t) => t.id === stored)) return stored as ThemeId;
  return DEFAULT_THEME;
}

const ASPECTS = ["3:2", "16:9"] as const;
const FITS = ["cover", "contain"] as const;

const START_PAGES: { key: StartPage; label: string; icon: React.ReactNode }[] = [
  { key: "studio", label: "创意工坊", icon: <MessageSquare size={16} strokeWidth={1.8} /> },
  { key: "stats", label: "工作统计", icon: <BarChart3 size={16} strokeWidth={1.8} /> },
  { key: "gallery", label: "创作画廊", icon: <Palette size={16} strokeWidth={1.8} /> },
];

const EXPORT_FORMATS = [
  { key: "markdown", label: "Markdown" },
  { key: "json", label: "JSON" },
  { key: "txt", label: "纯文本" },
] as const;

export default function SettingsDrawer() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [theme, setThemeState] = useState<ThemeId>("deep-space");
  const [aspect, setAspectState] = useState<(typeof ASPECTS)[number]>("16:9");
  const [fit, setFitState] = useState<(typeof FITS)[number]>("cover");
  const [prefs, setPrefs] = useState<UserPreferences>(getPreferences());

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 220);
  };

  const handleOpen = () => {
    setOpen(true);
    setClosing(false);
    setPrefs(getPreferences()); // 刷新偏好
  };

  useEffect(() => { setThemeState(getStoredTheme()); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // 登录后从服务端加载主题
  useEffect(() => {
    if (!user) return;
    fetchServerSettings().then((s) => {
      if (s?.theme && THEMES.some((t) => t.id === s.theme)) {
        setThemeState(s.theme as ThemeId);
        localStorage.setItem("theme", s.theme);
        document.documentElement.dataset.theme = s.theme;
      }
    });
  }, [user]);

  const setTheme = (id: ThemeId) => {
    setThemeState(id);
    localStorage.setItem("theme", id);
    if (user && getToken()) {
      saveServerSettings({ theme: id });
    }
    // 同步到 app_settings 表
    saveSettingToServer("theme", id).catch(() => {});
  };

  // 更新偏好
  const updatePref = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    savePreferences({ [key]: value });
  };

  // 重置所有偏好
  const handleReset = () => {
    if (confirm("确定要重置所有设置吗？")) {
      resetPreferences();
      setPrefs(getPreferences());
      setThemeState("deep-space");
      localStorage.setItem("theme", "deep-space");
      document.documentElement.dataset.theme = "deep-space";
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && open) handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="settings-gear" onClick={handleOpen} aria-label="设置"><Settings size={18} strokeWidth={1.8} /></button>
      {open && (
        <>
          <div className={`settings-overlay ${closing ? "closing" : ""}`} onClick={handleClose} />
          <div className={`settings-drawer edge-glow ${closing ? "closing" : ""}`}>
            <div className="settings-drawer-header">
              <span className="settings-drawer-title">设置</span>
              <button className="settings-drawer-close" onClick={handleClose} aria-label="关闭设置">&times;</button>
            </div>

            <div className="settings-drawer-content">
            {/* 主题设置 */}
            <div className="settings-section">
              <div className="settings-section-label">主题</div>
              <div className="flex flex-col gap-2">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTheme(t.id)}
                    className={`settings-theme-card ${theme === t.id ? "active" : ""}`}>
                    <div className="settings-theme-colors">
                      {[t.colors.primary, t.colors.cool, t.colors.deep].map((c) => (<span key={c} className="settings-theme-swatch" style={{ background: c }} />))}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="settings-theme-name">{t.name}</span>
                      <span className="settings-theme-desc">{t.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 画面设置 */}
            <div className="settings-section">
              <div className="settings-section-label">画面设置</div>
              <div className="settings-section-group">
                <div className="settings-row">
                  <span className="settings-row-label">画面比例</span>
                  <div className="settings-chip-row">
                    {ASPECTS.map((v) => (
                      <button key={v} type="button" onClick={() => setAspectState(v)} className={`settings-chip ${aspect === v ? "active" : ""}`}>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">适配方式</span>
                  <div className="settings-chip-row">
                    {FITS.map((v) => (
                      <button key={v} type="button" onClick={() => setFitState(v)} className={`settings-chip ${fit === v ? "active" : ""}`}>{v}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 起始页设置 */}
            <div className="settings-section">
              <div className="settings-section-label">起始页</div>
              <div className="settings-section-desc">打开应用时默认显示的页面</div>
              <div className="settings-grid">
                {START_PAGES.map((p) => (
                  <button key={p.key} type="button"
                    onClick={() => updatePref("startPage", p.key)}
                    className={`settings-grid-item ${prefs.startPage === p.key ? "active" : ""}`}>
                    <span className="settings-grid-icon">{p.icon}</span>
                    <span className="settings-grid-label">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 通知设置 */}
            <div className="settings-section">
              <div className="settings-section-label">通知</div>
              <div className="settings-section-group">
                <div className="settings-row">
                  <span className="settings-row-label">提示音</span>
                  <button type="button"
                    onClick={() => updatePref("notificationSound", !prefs.notificationSound)}
                    className={`settings-toggle ${prefs.notificationSound ? "active" : ""}`}>
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">桌面通知</span>
                  <button type="button"
                    onClick={() => updatePref("desktopNotification", !prefs.desktopNotification)}
                    className={`settings-toggle ${prefs.desktopNotification ? "active" : ""}`}>
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>

            {/* 对话设置 */}
            <div className="settings-section">
              <div className="settings-section-label">对话</div>
              <div className="settings-section-group">
                <div className="settings-row">
                  <span className="settings-row-label">自动保存</span>
                  <button type="button"
                    onClick={() => updatePref("autoSave", !prefs.autoSave)}
                    className={`settings-toggle ${prefs.autoSave ? "active" : ""}`}>
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">消息上限</span>
                  <div className="settings-chip-row">
                    {[100, 300, 500, 1000].map((v) => (
                      <button key={v} type="button"
                        onClick={() => updatePref("maxMessages", v)}
                        className={`settings-chip ${prefs.maxMessages === v ? "active" : ""}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 界面效果 */}
            <div className="settings-section">
              <div className="settings-section-label">界面效果</div>
              <div className="settings-section-group">
                <div className="settings-row">
                  <span className="settings-row-label">粒子背景</span>
                  <button type="button"
                    onClick={() => updatePref("particleEffects", !prefs.particleEffects)}
                    className={`settings-toggle ${prefs.particleEffects ? "active" : ""}`}>
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">减少动画</span>
                  <button type="button"
                    onClick={() => updatePref("reducedMotion", !prefs.reducedMotion)}
                    className={`settings-toggle ${prefs.reducedMotion ? "active" : ""}`}>
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>

            {/* 导出设置 */}
            <div className="settings-section">
              <div className="settings-section-label">导出</div>
              <div className="settings-section-group">
                <div className="settings-row">
                  <span className="settings-row-label">默认格式</span>
                  <div className="settings-chip-row">
                    {EXPORT_FORMATS.map((f) => (
                      <button key={f.key} type="button"
                        onClick={() => updatePref("exportFormat", f.key)}
                        className={`settings-chip ${prefs.exportFormat === f.key ? "active" : ""}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">包含时间戳</span>
                  <button type="button"
                    onClick={() => updatePref("includeTimestamp", !prefs.includeTimestamp)}
                    className={`settings-toggle ${prefs.includeTimestamp ? "active" : ""}`}>
                    <span className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>

            {/* 重置按钮 */}
            <div className="settings-section">
              <button type="button" className="settings-reset-btn" onClick={handleReset}>
                重置所有设置
              </button>
            </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
