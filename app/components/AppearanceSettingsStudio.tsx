"use client";
import { LiquidMaterialBackdrop } from "@/app/components/LiquidMaterialBackdrop";
import { MaterialSelect } from "@/app/components/MaterialSelect";

// 创意工坊统一工作区 — AppearanceSettingsStudio（规划 §3：760–880px 宽幅模态）
// 左分类（外观主题/壁纸与玻璃/界面效果/对话与工作流/导出与数据）+ 右实时预览（同款渲染组件）。
// 无障碍：focus trap（Tab/Shift+Tab 循环）+ role=dialog + Escape 关闭 + 焦点恢复 + 背景 inert；
// 未保存壁纸裁切变化离开确认。

import SquishSwitch from "@/app/components/SquishSwitch";
import HistoryRetentionSettings from "./HistoryRetentionSettings";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Palette, Image as ImageIcon, Sparkles, MessageSquare, Download, Link2, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { THEMES, DEFAULT_THEME } from "@/app/lib/theme-registry";
import { getPreferences, savePreferences, resetPreferences, type UserPreferences } from "@/app/lib/preferences";
import type { WorkspaceThemeSnapshot } from "@/app/lib/workspace-theme-store";
import { saveSettingToServer } from "@/app/lib/server-sync";
import { useAuth } from "./AuthProvider";
import type { WallpaperAppearance, WallpaperAsset, GlassPreset, GlassSettings } from "@/app/lib/appearance-types";
import { DEFAULT_WALLPAPER_APPEARANCE, THEME_ENERGY_STATES, defaultGlassSettings } from "@/app/lib/appearance-types";
import { createVideoPosterBlob, listWallpapers, deleteWallpaper, touchWallpaper, putWallpaper, validateWallpaperInput } from "@/app/lib/wallpaper-store";
import { WallpaperLayer } from "./WallpaperLayer";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { GlassSurfaceSettingsPanel } from "./GlassSurfaceSettingsPanel";
import { CLEAR_GLASS_SURFACE } from "@/app/lib/glass-surface-settings";
import dynamic from "next/dynamic";
import { GalaxySettingsPanel } from "./GalaxySettingsPanel";
import { CozeGlowSettingsPanel } from "./CozeGlowSettingsPanel";
import { DialogueLoaderSettingsPanel } from "./DialogueLoaderSettingsPanel";
import { galaxyHueFromHex } from "@/app/lib/galaxy-settings";

const GalaxyBackground = dynamic(() => import("./GalaxyBackground"), { ssr: false });

type StudioSection = "theme" | "wallpaper" | "galaxy" | "glow" | "loader" | "effects" | "chat" | "export";

const SECTIONS: Array<{ key: StudioSection; label: string; icon: typeof Palette }> = [
  { key: "theme", label: "外观主题", icon: Palette },
  { key: "wallpaper", label: "壁纸与玻璃", icon: ImageIcon },
  { key: "galaxy", label: "银河星场", icon: Sparkles },
  { key: "glow", label: "对话边缘光", icon: Sparkles },
  { key: "loader", label: "等待动效", icon: Sparkles },
  { key: "effects", label: "界面效果", icon: Sparkles },
  { key: "chat", label: "对话与工作流", icon: MessageSquare },
  { key: "export", label: "导出与数据", icon: Download },
];

type Props = {
  open: boolean;
  onClose: () => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  appearance?: WallpaperAppearance;
  onAppearanceChange?: (appearance: WallpaperAppearance) => void;
  glassSettings?: GlassSettings;
  onGlassSettingsChange?: (settings: GlassSettings) => { wallpaperLinked: boolean };
  onGlassSettingsPreview?: (settings: GlassSettings) => void;
  themeId?: string;
  onThemeChange?: (themeId: string) => void | Promise<void>;
  themeStatus?: WorkspaceThemeSnapshot;
  onThemeRetry?: () => void | Promise<void>;
};

export function AppearanceSettingsStudio({
  open,
  onClose,
  restoreFocusRef,
  appearance: externalAppearance,
  onAppearanceChange,
  glassSettings: externalGlass,
  onGlassSettingsChange,
  onGlassSettingsPreview,
  themeId: externalTheme = DEFAULT_THEME,
  onThemeChange,
  themeStatus,
  onThemeRetry,
}: Props) {
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outsidePress = useRef(false);
  const [section, setSection] = useState<StudioSection>("theme");
  const [prefs, setPrefs] = useState<UserPreferences>(getPreferences());
  const [wallpapers, setWallpapers] = useState<WallpaperAsset[]>([]);
  const [wallpaperRevision, setWallpaperRevision] = useState(0);
  const [wallpaperLoading, setWallpaperLoading] = useState(false);
  const [wallpaperError, setWallpaperError] = useState("");
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperActionError, setWallpaperActionError] = useState("");
  const wallpaperOperation = useRef<symbol | null>(null);
  const wallpaperReadSequence = useRef(0);
  const settingsGeneration = useRef(0);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const theme = externalTheme;
  const [glass, setGlass] = useState<GlassSettings>(externalGlass ?? defaultGlassSettings());
  const [localAppearance, setLocalAppearance] = useState<WallpaperAppearance>(externalAppearance ?? DEFAULT_WALLPAPER_APPEARANCE);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [glassDirty, setGlassDirty] = useState(false);
  const [glassLinkPending, setGlassLinkPending] = useState(false);
  const savedGlassRef = useRef(externalGlass ?? defaultGlassSettings());
  const [confirmClose, setConfirmClose] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [urlKind, setUrlKind] = useState<"image" | "video">("image");
  const [previewVideoPaused, setPreviewVideoPaused] = useState(false);
  const [advancedGlassOpen, setAdvancedGlassOpen] = useState(false);

  const appearance = localAppearance;
  const selectedTheme = useMemo(() => THEMES.find((item) => item.id === theme) ?? THEMES[0], [theme]);

  useLayoutEffect(() => {
    if (open && contentRef.current) contentRef.current.scrollTop = 0;
  }, [open, section]);

  useLayoutEffect(() => {
    settingsGeneration.current++;
    wallpaperReadSequence.current++;
    wallpaperOperation.current = null;
    setWallpaperBusy(false); setWallpaperActionError(""); setConfirmPurge(null);
    return () => {
      settingsGeneration.current++;
      wallpaperReadSequence.current++;
      wallpaperOperation.current = null;
    };
  }, [open, user?.id]);

  // 打开时刷新数据 + 焦点入框
  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setGlassDirty(false);
    setGlassLinkPending(false);
    setConfirmClose(false);
    setMessage("");
    setUrlDraft("");
    setPrefs(getPreferences());
    setGlass(externalGlass ?? defaultGlassSettings());
    savedGlassRef.current = externalGlass ?? defaultGlassSettings();
    setLocalAppearance(externalAppearance ?? DEFAULT_WALLPAPER_APPEARANCE);
    setWallpapers([]);
  }, [open, user?.id]);

  // Retrying the library must not reset unsaved glass or wallpaper adjustments.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const sequence = ++wallpaperReadSequence.current;
    const current = () => !cancelled && sequence === wallpaperReadSequence.current;
    setWallpaperLoading(true); setWallpaperError("");
    void listWallpapers(user?.id ? `user:${user.id}` : "guest")
      .then(list => { if (current()) setWallpapers(list); })
      .catch(cause => { if (current()) setWallpaperError(cause instanceof Error ? cause.message : "本地壁纸库暂时无法读取"); })
      .finally(() => { if (current()) setWallpaperLoading(false); });
    return () => { cancelled = true; };
  }, [open, user?.id, wallpaperRevision]);

  // Native modal semantics make the entire document inert, including the global navigation.
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : restoreFocusRef?.current;
    dialog.showModal();
    return () => {
      dialog.close();
      // On narrow screens the generic settings entry is inert behind the
      // session overlay. Return to the button that actually opened this dialog.
      const target = [returnFocus, restoreFocusRef?.current].find(node =>
        node?.isConnected && node.getClientRects().length > 0 && !node.closest('[inert], [aria-hidden="true"]'));
      target?.focus({ preventScroll: true });
    };
  }, [open, restoreFocusRef]);

  useLayoutEffect(() => {
    if (confirmClose) keepEditingRef.current?.focus();
  }, [confirmClose]);

  // 未保存壁纸裁切离开确认
  const requestClose = useCallback(() => {
    if (dirty || glassDirty || glassLinkPending || wallpaperOperation.current) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, glassDirty, glassLinkPending, onClose]);

  const applyTheme = useCallback(
    (id: string) => {
      // The parent publishes the committed local theme. Do not show an unsaved selection.
      void onThemeChange?.(id);
    },
    [onThemeChange],
  );

  const setPresetGlass = useCallback(
    (preset: GlassPreset) => {
      const opacity = { clear: .24, balanced: .34, deep: .5 }[preset];
      const next = { ...glass, preset, surface: { ...CLEAR_GLASS_SURFACE, backgroundOpacity: opacity } };
      setGlass(next);
      setGlassDirty(true);
      onGlassSettingsPreview?.(next);
    },
    [glass, onGlassSettingsPreview],
  );

  const updateGlass = useCallback((patch: Partial<GlassSettings>) => {
    const next = { ...glass, ...patch };
    setGlass(next);
    setGlassDirty(true);
    onGlassSettingsPreview?.(next);
  }, [glass, onGlassSettingsPreview]);

  const saveGlass = useCallback(() => {
    if (glassLinkPending && !glassDirty) {
      // Retry only the failed record, leaving the committed glass record intact.
      try {
        if (!onAppearanceChange) throw new Error("保存入口不可用");
        const dim = savedGlassRef.current.wallpaperDim;
        onAppearanceChange({ ...(externalAppearance ?? DEFAULT_WALLPAPER_APPEARANCE), dim });
        setLocalAppearance(current => ({ ...current, dim }));
        setGlassLinkPending(false);
        setMessage("壁纸压暗联动已保存；玻璃参数保持不变");
      } catch {
        setMessage("壁纸压暗联动仍未保存，请重试或取消联动；已保存的玻璃参数保持不变。");
      }
      return;
    }
    try {
      if (!onGlassSettingsChange) throw new Error("保存入口不可用");
      const result = onGlassSettingsChange(glass);
      savedGlassRef.current = glass;
      setGlassDirty(false);
      setGlassLinkPending(!result.wallpaperLinked);
      if (result.wallpaperLinked) {
        setLocalAppearance(current => ({ ...current, dim: glass.wallpaperDim }));
        setMessage("玻璃参数与壁纸压暗已保存到当前账号的本机设置");
      } else {
        setMessage("玻璃参数已保存；壁纸压暗联动未保存，可重试联动。取消不会撤销已保存的玻璃参数。");
      }
    } catch {
      setMessage("玻璃参数未保存：浏览器存储不可用，请保留当前窗口后重试。");
    }
  }, [glass, glassDirty, glassLinkPending, onGlassSettingsChange, onAppearanceChange, externalAppearance]);

  const cancelGlass = useCallback(() => {
    setGlass(savedGlassRef.current);
    onGlassSettingsPreview?.(savedGlassRef.current);
    setGlassDirty(false);
    setGlassLinkPending(false);
    setMessage(glassLinkPending ? "已取消未完成的壁纸联动，保留最近保存的玻璃参数。" : "已取消玻璃调整，恢复最近保存的外观");
  }, [onGlassSettingsPreview, glassLinkPending]);

  const updatePreference = useCallback(<K extends keyof UserPreferences,>(key: K, value: UserPreferences[K]) => {
    try {
      savePreferences({ [key]: value });
      setPrefs(getPreferences());
      window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
      setMessage("偏好已保存到本机；云端同步结果尚未确认");
    } catch {
      setMessage("偏好未保存：浏览器存储不可用，请重试。原设置已保留。");
    }
  }, []);

  const updateAppearance = useCallback(
    (patch: Partial<WallpaperAppearance>) => {
      const next = { ...appearance, ...patch };
      setLocalAppearance(next);
      setDirty(true);
    },
    [appearance],
  );

  const commitAppearance = useCallback(() => {
    try {
      if (!onAppearanceChange) throw new Error("保存入口不可用");
      onAppearanceChange(localAppearance);
      setDirty(false);
      setMessage("壁纸显示设置已保存到本机并应用");
    } catch {
      setMessage("壁纸设置未保存：请检查浏览器存储后重试，当前调整仍保留在窗口中。");
    }
  }, [localAppearance, onAppearanceChange]);

  const runWallpaperOperation = async (job: (current: () => boolean) => Promise<void>) => {
    if (!open || confirmClose || wallpaperOperation.current) return;
    const token = Symbol("wallpaper-operation");
    const generation = settingsGeneration.current;
    wallpaperOperation.current = token;
    wallpaperReadSequence.current++;
    const current = () => generation === settingsGeneration.current && wallpaperOperation.current === token;
    setWallpaperBusy(true); setWallpaperLoading(false); setWallpaperActionError(""); setMessage("");
    try { await job(current); }
    catch (cause) { if (current()) setWallpaperActionError(cause instanceof Error ? cause.message : "壁纸操作暂未完成，请重新读取壁纸库核对。"); }
    finally {
      if (current()) { wallpaperOperation.current = null; setWallpaperBusy(false); }
    }
  };

  const removeWallpaper = (asset: WallpaperAsset) => runWallpaperOperation(async current => {
      // 规划 §2.5：先切回主题背景，再删除 IndexedDB Blob
      if (externalAppearance?.assetId === asset.id) {
        const fallback = { ...externalAppearance, assetId: null };
        onAppearanceChange?.(fallback);
        setLocalAppearance(previous => previous.assetId === asset.id ? { ...previous, assetId: null } : previous);
      }
      await deleteWallpaper(asset.id, ownerScopeOf(user));
      if (!current()) return;
      setWallpapers(previous => previous.filter(w => w.id !== asset.id));
      setLocalAppearance(previous => previous.assetId === asset.id ? { ...previous, assetId: null } : previous);
      setConfirmPurge(null); setMessage("壁纸已从本机库移除。");
      setWallpaperRevision(value => value + 1);
      void saveSettingToServer("wallpaper_removed", asset.id).catch(() => {});
  });

  const ownerScopeOf = useCallback((u: { id?: number } | null) => (u?.id ? `user:${u.id}` : "guest"), []);

  const addUrlWallpaper = () => runWallpaperOperation(async current => {
    const candidate = urlDraft.trim();
    const result = await validateWallpaperInput(urlKind, "url", null, candidate);
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    const now = Date.now();
    const asset: WallpaperAsset = {
      id: `wall-url-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ownerScope: ownerScopeOf(user),
      kind: urlKind,
      source: "url",
      mimeType: urlKind === "video" ? "video/*" : "image/*",
      url: candidate,
      width: result.width,
      height: result.height,
      durationMs: result.durationMs,
      createdAt: now,
      lastUsedAt: now,
    };
    await putWallpaper(asset, ownerScopeOf(user));
    if (!current()) return;
    setWallpapers((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    setLocalAppearance(previous => ({ ...previous, assetId: asset.id })); setDirty(true);
    setUrlDraft("");
    setMessage("HTTPS 壁纸已保存到当前设备");
    setWallpaperRevision(value => value + 1);
  });

  const uploadWallpaper = (file: File) => runWallpaperOperation(async current => {
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const result = await validateWallpaperInput(kind, "local", file, null);
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    const posterBlob = kind === "video" ? (await createVideoPosterBlob(file)) ?? undefined : undefined;
    if (!current()) return;
    const now = Date.now();
    const asset: WallpaperAsset = {
      id: `wall-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ownerScope: ownerScopeOf(user), kind, source: "local", blob: file, posterBlob,
      mimeType: file.type || (kind === "video" ? "video/mp4" : "image/png"),
      width: result.width, height: result.height, durationMs: result.durationMs,
      createdAt: now, lastUsedAt: now,
    };
    await putWallpaper(asset, ownerScopeOf(user));
    if (!current()) return;
    setWallpapers(previous => [asset, ...previous.filter(item => item.id !== asset.id)]);
    setMessage(`已添加壁纸 ${file.name}`);
    setWallpaperRevision(value => value + 1);
  });

  const restoreRecommendedPerformance = useCallback(() => {
    try {
      savePreferences({ particleEffects: true, reducedMotion: false });
    } catch {
      setMessage("推荐配置未应用：浏览器存储不可用，请重试。");
      return;
    }
    const recommended = defaultGlassSettings();
    setGlass(recommended);
    setGlassDirty(true);
    onGlassSettingsPreview?.(recommended);
    updateAppearance({ starfieldOpacity: 1, orbitOpacity: 1 });
    const nextPrefs = { ...prefs, particleEffects: true, reducedMotion: false };
    setPrefs(nextPrefs);
    window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
    setMessage("动画偏好已保存到本机；玻璃参数和壁纸显示调整仍需分别保存。");
  }, [onGlassSettingsPreview, prefs, updateAppearance]);

  if (!open) return null;

  const previewAsset = appearance.assetId ? wallpapers.find((w) => w.id === appearance.assetId) ?? null : null;

  return (
    <>
      <dialog
        ref={dialogRef}
        className="cws-studio liquid-material-host"
        role="dialog"
        aria-modal="true"
        aria-label="个性化工作室"
        tabIndex={-1}
        onKeyDown={event => {
          if (event.key === "Escape") {
            if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="listbox"]'))) return;
            event.preventDefault(); event.stopPropagation();
            if (confirmClose) { setConfirmClose(false); dialogRef.current?.focus(); }
            else requestClose();
            return;
          }
          if (event.key !== "Tab") return;
          event.stopPropagation();
          if (event.defaultPrevented) return;
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]), select, textarea, a[href], summary, [contenteditable="true"], [tabindex]')).filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0 && !node.closest('[inert], [aria-hidden="true"]'));
          const first = items[0], last = items.at(-1);
          if (!first || !last) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
        onCancel={event => { event.preventDefault(); event.stopPropagation(); if (confirmClose) { setConfirmClose(false); dialogRef.current?.focus(); } else requestClose(); }}
        onPointerDown={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          outsidePress.current = event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
        }}
        onClick={event => {
          const startedOutside = outsidePress.current;
          outsidePress.current = false;
          if (!startedOutside || event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
        }}
      >
        <LiquidMaterialBackdrop />
        <div className="cws-studio__head" inert={confirmClose}>
          <h2>个性化工作室</h2>
          <button type="button" autoFocus className="cws-studio__close" aria-label="关闭个性化工作室" onClick={requestClose}>
            <X size={16} />
          </button>
        </div>
        <div className="cws-studio__body" inert={confirmClose}>
          {/* 左侧分类 */}
          <nav className="cws-studio__nav" aria-label="设置分类">
            {SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`cws-studio__nav-item${section === key ? " is-active" : ""}`}
                aria-current={section === key ? "page" : undefined}
                onClick={() => setSection(key)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>

          {/* 右侧内容 */}
          <div className="cws-studio__content" ref={contentRef}>
            {section === "theme" && (
              <div className="cws-studio__theme-section">
                {themeStatus?.message && <div id="workspace-theme-status" className="auth-session-notice" role="status">
                  <p>{themeStatus.message}</p>
                  {themeStatus.retry && onThemeRetry && <button type="button" disabled={themeStatus.phase === "saving" || themeStatus.phase === "loading"} onClick={() => void onThemeRetry()}>{themeStatus.retry === "save" ? "重试同步" : "重新读取"}</button>}
                </div>}
                <div className="cws-studio__theme-grid" aria-label="主题网格">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`cws-theme-card${theme === t.id ? " is-active" : ""}`}
                      aria-pressed={theme === t.id}
                      title={t.description}
                      onClick={() => applyTheme(t.id)}
                      disabled={themeStatus?.phase === "saving"}
                      aria-describedby={themeStatus?.message ? "workspace-theme-status" : undefined}
                    >
                      <span className="cws-theme-card__swatches" aria-hidden="true">
                        <i style={{ background: t.colors.primary }} />
                        <i style={{ background: t.colors.cool }} />
                        <i style={{ background: t.colors.deep }} />
                      </span>
                      <b>{t.name}</b>
                      <small>{t.description}</small>
                    </button>
                  ))}
                </div>
                <section className="cws-energy-preview" aria-label={`${selectedTheme.name} 能谱状态预览`}>
                  <div>
                    <span>能谱预览</span>
                    <small>仅展示主题 token；真实工作区仍由任务状态驱动</small>
                  </div>
                  <div className="cws-energy-preview__states">
                    {THEME_ENERGY_STATES.map((state) => (
                      <span key={state} style={{ "--preview-energy": selectedTheme.energy[state] } as React.CSSProperties}>
                        <i aria-hidden="true" /> {state}
                      </span>
                    ))}
                  </div>
                  <button type="button" className="cws-btn" disabled={themeStatus?.phase === "saving"} onClick={() => applyTheme(DEFAULT_THEME)}>
                    <RotateCcw size={13} /> 恢复主题默认值
                  </button>
                </section>
              </div>
            )}

            {section === "wallpaper" && (
              <div className="cws-studio__wallpaper">
                <div className="cws-studio__preview" aria-label="壁纸实时预览">
                  <div className="cws-studio__preview-starfield" style={{ opacity: appearance.starfieldOpacity * (previewAsset?.kind === "video" ? 0.28 : 0.55) }}>
                    <GalaxyBackground settings={prefs.galaxySettings} staticPreview mouseInteraction={false} reducedMotion={prefs.reducedMotion} visible={prefs.particleEffects && appearance.starfieldOpacity > 0} />
                  </div>
                  {previewAsset && (
                    <WallpaperLayer
                      appearance={appearance}
                      asset={previewAsset}
                      videoPaused={previewVideoPaused}
                      onFocalPointChange={(focalX, focalY) => updateAppearance({ focalX, focalY })}
                    />
                  )}
                  <LiquidGlassSurface variant="panel" className="cws-studio__preview-glass" settings={glass}>
                    <span>清透液态玻璃</span><small>背景折射 · 正文清晰</small>
                  </LiquidGlassSurface>
                  {previewAsset?.kind === "video" && (
                    <button type="button" className="cws-studio__video-toggle" onClick={() => setPreviewVideoPaused((value) => !value)}>
                      {previewVideoPaused ? <Play size={13} /> : <Pause size={13} />}
                      {previewVideoPaused ? "继续视频" : "暂停视频"}
                    </button>
                  )}
                </div>

                <div className="cws-studio__row">
                  <label>
                    画幅
                    <MaterialSelect aria-label="壁纸画幅" value={appearance.aspect} onValueChange={selectedValue => updateAppearance({ aspect: selectedValue as "16:9" | "3:2" })}>
                      <option value="16:9">16:9</option>
                      <option value="3:2">3:2</option>
                    </MaterialSelect>
                  </label>
                  <label>
                    填充
                    <MaterialSelect aria-label="壁纸填充方式" value={appearance.fit} onValueChange={selectedValue => updateAppearance({ fit: selectedValue as "cover" | "contain" })}>
                      <option value="cover">cover（自适应裁剪）</option>
                      <option value="contain">contain（完整显示）</option>
                    </MaterialSelect>
                  </label>
                </div>

                <div className="cws-studio__row">
                  <label>
                    压暗强度
                    <input type="range" min="0" max="0.6" step="0.01" value={appearance.dim} onChange={(e) => updateAppearance({ dim: Number(e.target.value) })} />
                  </label>
                </div>

                <div className="cws-studio__row cws-studio__row--ranges">
                  <label>焦点 X {Math.round(appearance.focalX)}%
                    <input type="range" min="0" max="100" value={appearance.focalX} disabled={appearance.fit !== "cover"} onChange={(e) => updateAppearance({ focalX: Number(e.target.value) })} />
                  </label>
                  <label>焦点 Y {Math.round(appearance.focalY)}%
                    <input type="range" min="0" max="100" value={appearance.focalY} disabled={appearance.fit !== "cover"} onChange={(e) => updateAppearance({ focalY: Number(e.target.value) })} />
                  </label>
                  <label>星场 {Math.round(appearance.starfieldOpacity * 100)}%
                    <input type="range" min="0" max="1" step="0.05" value={appearance.starfieldOpacity} onChange={(e) => updateAppearance({ starfieldOpacity: Number(e.target.value) })} />
                  </label>
                  <label>轨道 {Math.round(appearance.orbitOpacity * 100)}%
                    <input type="range" min="0" max="1" step="0.05" value={appearance.orbitOpacity} onChange={(e) => updateAppearance({ orbitOpacity: Number(e.target.value) })} />
                  </label>
                </div>

                <div className="cws-studio__row">
                  <label className="cws-check">
                    <SquishSwitch checked={appearance.smartTintEnabled} onChange={(e) => updateAppearance({ smartTintEnabled: e.target.checked })} />
                    智能取色（默认关闭；提取一个主色混入玻璃）
                  </label>
                  <label>
                    混入强度 {Math.round(appearance.smartTintStrength * 100)}%（上限 25%）
                    <input type="range" min="0" max="0.25" step="0.01" value={appearance.smartTintStrength} onChange={(e) => updateAppearance({ smartTintStrength: Number(e.target.value) })} />
                  </label>
                </div>

                <div className="cws-studio__row">
                  <span>玻璃层次</span>
                  {(["clear", "balanced", "deep"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`cws-chip${glass.preset === preset ? " is-active" : ""}`}
                      aria-pressed={glass.preset === preset}
                      onClick={() => setPresetGlass(preset)}
                    >
                      {preset === "clear" ? "清透" : preset === "balanced" ? "平衡" : "实体"}
                    </button>
                  ))}
                  <button type="button" className="cws-chip" aria-pressed={glass.reduceTransparency} onClick={() => {
                    updateGlass({ reduceTransparency: !glass.reduceTransparency });
                  }}>
                    {glass.reduceTransparency ? "降低透明度：开" : "降低透明度：关"}
                  </button>
                  <button
                    type="button"
                    className="cws-chip"
                    aria-expanded={advancedGlassOpen}
                    onClick={() => setAdvancedGlassOpen((value) => !value)}
                  >
                    <SlidersHorizontal size={12} /> 玻璃辅助设置
                  </button>
                </div>

                {advancedGlassOpen && (
                  <div className="cws-glass-advanced" aria-label="玻璃辅助设置">
                    {(
                      [
                        ["edgeGlow", "边缘辉光", 0, 0.5, 0.01],
                        ["wallpaperDim", "壁纸压暗联动", 0, 0.6, 0.01],
                        ["smartTint", "智能取色上限", 0, 0.25, 0.01],
                      ] as const
                    ).map(([key, label, min, max, step]) => (
                      <label key={key}>
                        <span>{label}<output>{glass[key]}</output></span>
                        <input aria-label={label} type="range" min={min} max={max} step={step} value={glass[key]} onChange={(event) => updateGlass({ [key]: Number(event.target.value) })} />
                      </label>
                    ))}
                  </div>
                )}

                <GlassSurfaceSettingsPanel settings={glass} onChange={next => updateGlass(next)} />

                <div className="cws-url-wallpaper">
                  <div className="cws-url-wallpaper__head"><Link2 size={14} /><b>HTTPS URL</b><small>图片或最长 30 秒的 MP4/WebM；地址只保存在当前设备</small></div>
                  <div className="cws-url-wallpaper__form">
                    <MaterialSelect disabled={wallpaperBusy} value={urlKind} onValueChange={selectedValue => setUrlKind(selectedValue as "image" | "video")} aria-label="URL 媒体类型">
                      <option value="image">图片 URL</option>
                      <option value="video">视频 URL</option>
                    </MaterialSelect>
                    <input type="url" disabled={wallpaperBusy} value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://example.com/wallpaper.webp" aria-label="HTTPS 壁纸 URL" />
                    <button type="button" className="cws-btn cws-btn--primary" disabled={wallpaperBusy || !urlDraft.trim()} onClick={() => void addUrlWallpaper()}>添加 URL</button>
                  </div>
                </div>

                <div className="cws-studio__library">
                  <h3>本地壁纸库</h3>
                  <p className="cws-studio__hint">本机图片/视频（≤25 MiB / 150 MiB、≤4096px、视频 ≤30 秒）；仅保存在当前设备。</p>
                  <div>
                    <button type="button" className="cws-btn cws-btn--primary" disabled={wallpaperBusy} onClick={() => wallpaperInputRef.current?.click()}>上传壁纸（图片/视频）</button>
                    <input
                      ref={wallpaperInputRef}
                      type="file"
                      disabled={wallpaperBusy}
                      accept="image/*,video/*"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        void uploadWallpaper(file);
                      }}
                    />
                  </div>
                  {wallpaperBusy && <p className="cws-studio__hint" role="status">正在处理壁纸，请稍候…</p>}
                  {wallpaperActionError && <div className="cws-studio__hint" role="alert"><p style={{ overflowWrap: "anywhere" }}>{wallpaperActionError}</p><p>可重新读取本地库核对结果。已切换的背景不会因操作报错自动恢复。</p><button type="button" className="cws-btn" disabled={wallpaperBusy || wallpaperLoading} onClick={() => { setWallpaperActionError(""); setWallpaperRevision(value => value + 1); }}>重新读取壁纸库</button></div>}
                  {wallpaperLoading && <p className="cws-studio__hint" role="status">正在读取本地壁纸库…</p>}
                  {wallpaperError && <div className="cws-studio__hint" role="alert"><p style={{ overflowWrap: "anywhere" }}>{wallpaperError}</p><button type="button" className="cws-btn" disabled={wallpaperBusy || wallpaperLoading} onClick={() => setWallpaperRevision(value => value + 1)}>重新读取壁纸库</button></div>}
                  {!wallpaperBusy && !wallpaperLoading && !wallpaperError && !wallpaperActionError && wallpapers.length === 0 && <p className="cws-empty">暂无壁纸。</p>}
                  {wallpapers.map((wallpaper) => (
                    <div key={wallpaper.id} className="cws-wall-row">
                      <b>{wallpaper.kind === "video" ? "视频" : "图片"} · {wallpaper.width}×{wallpaper.height}</b>
                      <small>{wallpaper.durationMs ? `${Math.round(wallpaper.durationMs / 1000)} 秒` : "静帧"}</small>
                      <button
                        type="button"
                        className="cws-btn"
                        disabled={wallpaperBusy}
                        onClick={() => {
                          updateAppearance({ assetId: wallpaper.id });
                          const generation = settingsGeneration.current;
                          void touchWallpaper(wallpaper.id, ownerScopeOf(user)).catch((error) => {
                            if (generation === settingsGeneration.current) setMessage(error instanceof Error ? error.message : "壁纸最近使用时间更新失败");
                          });
                        }}
                      >
                        设为壁纸
                      </button>
                      {confirmPurge === wallpaper.id ? (
                        <>
                          <button type="button" className="cws-btn cws-btn--danger" disabled={wallpaperBusy || Boolean(wallpaperActionError)} onClick={() => void removeWallpaper(wallpaper)}>确认删除</button>
                          <button type="button" className="cws-btn" disabled={wallpaperBusy} onClick={() => setConfirmPurge(null)}>取消</button>
                        </>
                      ) : (
                        <button type="button" className="cws-btn cws-btn--danger" disabled={wallpaperBusy} onClick={() => { setWallpaperActionError(""); setConfirmPurge(wallpaper.id); }}>删除</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="cws-studio__apply-row">
                  <span>{dirty ? "壁纸显示设置尚未应用" : "壁纸显示设置已同步"}</span>
                  <button type="button" className="cws-btn cws-btn--primary" disabled={wallpaperBusy || !dirty} onClick={commitAppearance}>应用壁纸设置</button>
                </div>
              </div>
            )}

            {section === "galaxy" && <div className="galaxy-settings-section">
              <div className="cws-studio__preview" aria-label="银河星场静态预览">
                <div className="cws-studio__preview-starfield" style={{ opacity: appearance.starfieldOpacity * 0.55 }}>
                  <GalaxyBackground settings={prefs.galaxySettings} staticPreview mouseInteraction={false} reducedMotion={prefs.reducedMotion} visible={prefs.particleEffects && appearance.starfieldOpacity > 0} />
                </div>
                <span className="cws-studio__preview-label">静态预览 · 动画与鼠标跟随在工作区查看</span>
              </div>
              <GalaxySettingsPanel settings={prefs.galaxySettings} themeHue={galaxyHueFromHex(selectedTheme.colors.cool)}
                onChange={next => updatePreference("galaxySettings", next)} />
            </div>}

            {section === "glow" && <CozeGlowSettingsPanel settings={prefs.cozeGlow} onChange={next => updatePreference("cozeGlow", next)} />}
            {section === "loader" && <DialogueLoaderSettingsPanel settings={prefs.dialogueLoader} onChange={next => updatePreference("dialogueLoader", next)} />}
            {section === "effects" && (
              <div className="cws-studio__toggles">
                {(
                  [
                    ["particleEffects", "背景动效"],
                    ["reducedMotion", "减少动画"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="cws-check">
                    <SquishSwitch
                      checked={prefs[key]}
                      onChange={(e) => updatePreference(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <label className="cws-check">
                  <SquishSwitch checked={glass.reduceTransparency} onChange={(event) => updateGlass({ reduceTransparency: event.target.checked })} />
                  降低透明度
                </label>
                <label className="cws-check">
                  <SquishSwitch checked={!glass.videoAutoplay} onChange={(event) => updateGlass({ videoAutoplay: !event.target.checked })} />
                  关闭视频自动播放
                </label>
                <label className="cws-check">
                  <SquishSwitch checked={!glass.refractionEnabled} onChange={(event) => updateGlass({ refractionEnabled: !event.target.checked })} />
                  关闭折射，只保留清透高光
                </label>
                <label className="cws-check">
                  <SquishSwitch checked={appearance.starfieldOpacity === 0} onChange={(event) => updateAppearance({ starfieldOpacity: event.target.checked ? 0 : 1 })} />
                  关闭星场
                </label>
                <label className="cws-check">
                  <SquishSwitch checked={appearance.orbitOpacity === 0} onChange={(event) => updateAppearance({ orbitOpacity: event.target.checked ? 0 : 1 })} />
                  关闭轨道
                </label>
                <button type="button" className="cws-btn" onClick={restoreRecommendedPerformance}>
                  <RotateCcw size={13} /> 恢复推荐性能配置
                </button>
              </div>
            )}

            {section === "chat" && (
              <div className="cws-studio__toggles">
                {(
                  [
                    ["autoSave", "自动保存对话"],
                    ["notificationSound", "通知声音"],
                    ["desktopNotification", "桌面通知"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="cws-check">
                    <SquishSwitch
                      checked={prefs[key]}
                      onChange={(e) => updatePreference(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <HistoryRetentionSettings />
              </div>
            )}

            {section === "export" && (
              <div className="cws-studio__toggles">
                {(
                  [
                    { key: "markdown", label: "Markdown" },
                    { key: "json", label: "JSON" },
                    { key: "txt", label: "纯文本" },
                  ] as const
                ).map(({ key: format, label }) => (
                  <label key={format} className="cws-check">
                    <input type="radio" name="export-format" checked={prefs.exportFormat === format} onChange={() => updatePreference("exportFormat", format)} />
                    {label}
                  </label>
                ))}
                <label className="cws-check">
                  <SquishSwitch checked={prefs.includeTimestamp} onChange={(e) => updatePreference("includeTimestamp", e.target.checked)} />
                  导出包含时间戳
                </label>
                <button
                  type="button"
                  className="cws-btn cws-btn--danger"
                  onClick={() => {
                    try {
                      resetPreferences();
                      setPrefs(getPreferences());
                      window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
                      setMessage("本机使用偏好已重置；主题、壁纸、玻璃参数及历史记录保持不变。云端结果尚未确认。");
                      void saveSettingToServer("reset_prefs", "1").catch(() => {});
                    } catch {
                      setMessage("偏好未重置：浏览器存储不可用，请重试。");
                    }
                  }}
                >
                  重置本机使用偏好
                </button>
              </div>
            )}
            {message && <p className="cws-studio__message" role="status">{message}</p>}
            <div className="glass-settings-actions">
              <span>{glassDirty ? "玻璃参数尚未保存" : glassLinkPending ? "玻璃已保存，壁纸联动待重试" : "玻璃参数已同步"}</span>
              <button type="button" className="cws-btn" disabled={!glassDirty && !glassLinkPending} onClick={cancelGlass}>{glassLinkPending && !glassDirty ? "取消未完成联动" : "取消玻璃调整"}</button>
              <button type="button" className="cws-btn cws-btn--primary" disabled={wallpaperBusy || (!glassDirty && !glassLinkPending)} onClick={saveGlass}>{glassLinkPending && !glassDirty ? "重试壁纸联动" : "保存玻璃参数"}</button>
            </div>
          </div>
        </div>
        {confirmClose && <div className="cws-studio__discard" role="alertdialog" aria-modal="true" aria-label="未保存的外观设置"
          onKeyDown={event => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            // Dismiss only this inline confirmation. Do not let the same key
            // trigger the enclosing native dialog's default cancel action.
            event.preventDefault(); event.stopPropagation();
            setConfirmClose(false); dialogRef.current?.focus();
          }}>
          <h3>{wallpaperBusy ? "壁纸操作仍在处理中" : glassLinkPending && !dirty && !glassDirty ? "壁纸联动尚未完成" : "外观设置尚未保存"}</h3>
          {glassLinkPending && <p>玻璃参数已保存。关闭会放弃未完成的壁纸压暗联动，不会撤销已保存的参数。</p>}
          <p>{wallpaperBusy ? "关闭不会撤销已经开始的本机保存或删除，重新打开后请核对结果。未保存的玻璃参数、壁纸裁切和显示调整将放弃。" : "离开后将放弃未保存的玻璃参数、壁纸裁切和显示调整。"}</p>
          <div>
            <button type="button" ref={keepEditingRef} onClick={() => { setConfirmClose(false); dialogRef.current?.focus(); }}>继续编辑</button>
            <button type="button" onClick={() => { setDirty(false); setGlassDirty(false); setConfirmClose(false); onClose(); }}>{wallpaperBusy ? "关闭并稍后核对" : "放弃修改并关闭"}</button>
          </div>
        </div>}
      </dialog>
    </>
  );
}

export default AppearanceSettingsStudio;
