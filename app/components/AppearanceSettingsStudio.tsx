"use client";

// 创意工坊统一工作区 — AppearanceSettingsStudio（规划 §3：760–880px 宽幅模态）
// 左分类（外观主题/壁纸与玻璃/界面效果/对话与工作流/导出与数据）+ 右实时预览（同款渲染组件）。
// 无障碍：focus trap（Tab/Shift+Tab 循环）+ role=dialog + Escape 关闭 + 焦点恢复 + 背景 inert；
// 未保存壁纸裁切变化离开确认。

import SquishSwitch from "@/app/components/SquishSwitch";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Palette, Image as ImageIcon, Sparkles, MessageSquare, Download, Link2, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { THEMES, DEFAULT_THEME } from "@/app/lib/theme-registry";
import { getPreferences, savePreferences, resetPreferences, type UserPreferences } from "@/app/lib/preferences";
import { saveSettingToServer } from "@/app/lib/server-sync";
import { useAuth } from "./AuthProvider";
import type { WallpaperAppearance, WallpaperAsset, GlassPreset, GlassSettings } from "@/app/lib/appearance-types";
import { DEFAULT_WALLPAPER_APPEARANCE, GLASS_PRESETS, THEME_ENERGY_STATES, defaultGlassSettings } from "@/app/lib/appearance-types";
import { createVideoPosterBlob, listWallpapers, deleteWallpaper, touchWallpaper, putWallpaper, validateWallpaperInput } from "@/app/lib/wallpaper-store";
import { WallpaperLayer } from "./WallpaperLayer";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import dynamic from "next/dynamic";
import { GalaxySettingsPanel } from "./GalaxySettingsPanel";
import { CozeGlowSettingsPanel } from "./CozeGlowSettingsPanel";
import { galaxyHueFromHex } from "@/app/lib/galaxy-settings";

const GalaxyBackground = dynamic(() => import("./GalaxyBackground"), { ssr: false });

type StudioSection = "theme" | "wallpaper" | "galaxy" | "glow" | "effects" | "chat" | "export";

const SECTIONS: Array<{ key: StudioSection; label: string; icon: typeof Palette }> = [
  { key: "theme", label: "外观主题", icon: Palette },
  { key: "wallpaper", label: "壁纸与玻璃", icon: ImageIcon },
  { key: "galaxy", label: "银河星场", icon: Sparkles },
  { key: "glow", label: "对话边缘光", icon: Sparkles },
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
  onGlassSettingsChange?: (settings: GlassSettings) => void;
  themeId?: string;
  onThemeChange?: (themeId: string) => void;
};

export function AppearanceSettingsStudio({
  open,
  onClose,
  restoreFocusRef,
  appearance: externalAppearance,
  onAppearanceChange,
  glassSettings: externalGlass,
  onGlassSettingsChange,
  themeId: externalTheme = DEFAULT_THEME,
  onThemeChange,
}: Props) {
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<StudioSection>("theme");
  const [prefs, setPrefs] = useState<UserPreferences>(getPreferences());
  const [wallpapers, setWallpapers] = useState<WallpaperAsset[]>([]);
  const [theme, setTheme] = useState<string>(externalTheme);
  const [glass, setGlass] = useState<GlassSettings>(externalGlass ?? defaultGlassSettings());
  const [localAppearance, setLocalAppearance] = useState<WallpaperAppearance>(externalAppearance ?? DEFAULT_WALLPAPER_APPEARANCE);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [urlKind, setUrlKind] = useState<"image" | "video">("image");
  const [previewVideoPaused, setPreviewVideoPaused] = useState(false);
  const [advancedGlassOpen, setAdvancedGlassOpen] = useState(false);

  const appearance = localAppearance;
  const selectedTheme = useMemo(() => THEMES.find((item) => item.id === theme) ?? THEMES[0], [theme]);

  // 打开时刷新数据 + 焦点入框
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDirty(false);
    setConfirmClose(false);
    setPrefs(getPreferences());
    setTheme(externalTheme);
    setGlass(externalGlass ?? defaultGlassSettings());
    if (externalAppearance) setLocalAppearance(externalAppearance);
    setWallpapers([]);
    void listWallpapers(ownerScopeOf(user)).then((list) => { if (!cancelled) setWallpapers(list); });
    return () => { cancelled = true; };
  }, [open, user]);

  // Native modal semantics make the entire document inert, including the global navigation.
  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocus = restoreFocusRef?.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialog.showModal();
    return () => {
      dialog.close();
      const target = restoreFocusRef?.current || returnFocus;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, restoreFocusRef]);

  useLayoutEffect(() => {
    if (confirmClose) keepEditingRef.current?.focus();
  }, [confirmClose]);

  // 未保存壁纸裁切离开确认
  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose, restoreFocusRef]);

  const applyTheme = useCallback(
    (id: string) => {
      setTheme(id);
      onThemeChange?.(id);
      saveSettingToServer("theme", id).catch(() => {});
    },
    [onThemeChange],
  );

  const setPresetGlass = useCallback(
    (preset: GlassPreset) => {
      const next = { ...glass, preset, ...GLASS_PRESETS[preset] };
      setGlass(next);
      onGlassSettingsChange?.(next);
    },
    [glass, onGlassSettingsChange],
  );

  const updateGlass = useCallback((patch: Partial<GlassSettings>) => {
    const next = { ...glass, ...patch };
    setGlass(next);
    onGlassSettingsChange?.(next);
  }, [glass, onGlassSettingsChange]);

  const updatePreference = useCallback(<K extends keyof UserPreferences,>(key: K, value: UserPreferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePreferences({ [key]: value });
    window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
  }, [prefs]);

  const updateAppearance = useCallback(
    (patch: Partial<WallpaperAppearance>) => {
      const next = { ...appearance, ...patch };
      setLocalAppearance(next);
      setDirty(true);
    },
    [appearance],
  );

  const commitAppearance = useCallback(() => {
    onAppearanceChange?.(localAppearance);
    setDirty(false);
    setMessage("壁纸显示设置已应用");
  }, [localAppearance, onAppearanceChange]);

  const removeWallpaper = useCallback(
    async (asset: WallpaperAsset) => {
      // 规划 §2.5：先切回主题背景，再删除 IndexedDB Blob
      if (externalAppearance?.assetId === asset.id) {
        const fallback = { ...localAppearance, assetId: null };
        setLocalAppearance(fallback);
        onAppearanceChange?.(fallback);
        setDirty(false);
      }
      await deleteWallpaper(asset.id, ownerScopeOf(user));
      const remaining = wallpapers.filter((w) => w.id !== asset.id);
      setWallpapers(remaining);
      void saveSettingToServer("wallpaper_removed", asset.id).catch(() => {});
    },
    [externalAppearance?.assetId, localAppearance, onAppearanceChange, user, wallpapers],
  );

  const ownerScopeOf = useCallback((u: { id?: number } | null) => (u?.id ? `user:${u.id}` : "guest"), []);

  const addUrlWallpaper = useCallback(async () => {
    setMessage("");
    const candidate = urlDraft.trim();
    const result = await validateWallpaperInput(urlKind, "url", null, candidate);
    if (!result.ok) { setMessage(result.error); return; }
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
    setWallpapers((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    updateAppearance({ assetId: asset.id });
    setUrlDraft("");
    setMessage("HTTPS 壁纸已保存到当前设备");
  }, [ownerScopeOf, updateAppearance, urlDraft, urlKind, user]);

  const restoreRecommendedPerformance = useCallback(() => {
    const recommended = defaultGlassSettings();
    setGlass(recommended);
    onGlassSettingsChange?.(recommended);
    updateAppearance({ starfieldOpacity: 1, orbitOpacity: 1 });
    const nextPrefs = { ...prefs, particleEffects: true, reducedMotion: false };
    setPrefs(nextPrefs);
    savePreferences({ particleEffects: true, reducedMotion: false });
    window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
    setMessage("已恢复推荐性能配置");
  }, [onGlassSettingsChange, prefs, updateAppearance]);

  if (!open) return null;

  const previewAsset = appearance.assetId ? wallpapers.find((w) => w.id === appearance.assetId) ?? null : null;

  return (
    <>
      <dialog
        ref={dialogRef}
        className="cws-studio"
        role="dialog"
        aria-modal="true"
        aria-label="个性化工作室"
        tabIndex={-1}
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(node => node.getClientRects().length > 0 && !node.closest("[inert]"));
          const first = items[0], last = items.at(-1);
          if (!first || !last) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
        onCancel={event => { event.preventDefault(); if (confirmClose) { setConfirmClose(false); dialogRef.current?.focus(); } else requestClose(); }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
        }}
      >
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
          <div className="cws-studio__content">
            {section === "theme" && (
              <div className="cws-studio__theme-section">
                <div className="cws-studio__theme-grid" aria-label="主题网格">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`cws-theme-card${theme === t.id ? " is-active" : ""}`}
                      aria-pressed={theme === t.id}
                      title={t.description}
                      onClick={() => applyTheme(t.id)}
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
                  <button type="button" className="cws-btn" onClick={() => applyTheme(DEFAULT_THEME)}>
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
                  <LiquidGlassSurface variant="panel" className="cws-studio__preview-glass">
                    当前预览
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
                    <select value={appearance.aspect} onChange={(e) => updateAppearance({ aspect: e.target.value as "16:9" | "3:2" })}>
                      <option value="16:9">16:9</option>
                      <option value="3:2">3:2</option>
                    </select>
                  </label>
                  <label>
                    填充
                    <select value={appearance.fit} onChange={(e) => updateAppearance({ fit: e.target.value as "cover" | "contain" })}>
                      <option value="cover">cover（自适应裁剪）</option>
                      <option value="contain">contain（完整显示）</option>
                    </select>
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
                  <span>玻璃预设</span>
                  {(["clear", "balanced", "deep"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`cws-chip${glass.preset === preset ? " is-active" : ""}`}
                      aria-pressed={glass.preset === preset}
                      onClick={() => setPresetGlass(preset)}
                    >
                      {preset === "clear" ? "清透" : preset === "balanced" ? "平衡" : "深邃"}
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
                    <SlidersHorizontal size={12} /> 高级玻璃设置
                  </button>
                </div>

                {advancedGlassOpen && (
                  <div className="cws-glass-advanced" aria-label="高级玻璃设置">
                    {(
                      [
                        ["blurPx", "模糊", 0, 36, 1],
                        ["opacity", "不透明度", 0.08, 0.5, 0.01],
                        ["refraction", "折射尺度", 0, 48, 1],
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

                <div className="cws-url-wallpaper">
                  <div className="cws-url-wallpaper__head"><Link2 size={14} /><b>HTTPS URL</b><small>图片或最长 30 秒的 MP4/WebM；地址只保存在当前设备</small></div>
                  <div className="cws-url-wallpaper__form">
                    <select value={urlKind} onChange={(event) => setUrlKind(event.target.value as "image" | "video")} aria-label="URL 媒体类型">
                      <option value="image">图片 URL</option>
                      <option value="video">视频 URL</option>
                    </select>
                    <input type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://example.com/wallpaper.webp" aria-label="HTTPS 壁纸 URL" />
                    <button type="button" className="cws-btn cws-btn--primary" disabled={!urlDraft.trim()} onClick={() => void addUrlWallpaper()}>添加 URL</button>
                  </div>
                </div>

                <div className="cws-studio__library">
                  <h3>本地壁纸库</h3>
                  <p className="cws-studio__hint">本机图片/视频（≤25 MiB / 150 MiB、≤4096px、视频 ≤30 秒）；仅保存在当前设备。</p>
                  <label className="cws-btn cws-btn--primary" style={{ cursor: "pointer" }}>
                    上传壁纸（图片/视频）
                    <input
                      type="file"
                      accept="image/*,video/*"
                      style={{ display: "none" }}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const kind = file.type.startsWith("video/") ? "video" : "image";
                        const result = await validateWallpaperInput(kind, "local", file, null);
                        if (!result.ok) {
                          setMessage(result.error);
                          return;
                        }
                        const asset: WallpaperAsset = {
                          id: `wall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                          ownerScope: ownerScopeOf(user),
                          kind,
                          source: "local",
                          mimeType: file.type || (kind === "video" ? "video/mp4" : "image/png"),
                          blob: file,
                          posterBlob: kind === "video" ? (await createVideoPosterBlob(file)) ?? undefined : undefined,
                          width: result.width,
                          height: result.height,
                          durationMs: result.durationMs,
                          createdAt: Date.now(),
                          lastUsedAt: Date.now(),
                        };
                        await putWallpaper(asset, ownerScopeOf(user));
                        setMessage(`已添加壁纸 ${file.name}`);
                        setWallpapers(await listWallpapers(ownerScopeOf(user)));
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {wallpapers.length === 0 && <p className="cws-empty">暂无壁纸。</p>}
                  {wallpapers.map((wallpaper) => (
                    <div key={wallpaper.id} className="cws-wall-row">
                      <b>{wallpaper.kind === "video" ? "视频" : "图片"} · {wallpaper.width}×{wallpaper.height}</b>
                      <small>{wallpaper.durationMs ? `${Math.round(wallpaper.durationMs / 1000)} 秒` : "静帧"}</small>
                      <button
                        type="button"
                        className="cws-btn"
                        onClick={() => {
                          updateAppearance({ assetId: wallpaper.id });
                          void touchWallpaper(wallpaper.id, ownerScopeOf(user)).catch((error) => {
                            setMessage(error instanceof Error ? error.message : "壁纸最近使用时间更新失败");
                          });
                        }}
                      >
                        设为壁纸
                      </button>
                      {confirmPurge === wallpaper.id ? (
                        <>
                          <button type="button" className="cws-btn cws-btn--danger" onClick={() => void removeWallpaper(wallpaper)}>确认删除</button>
                          <button type="button" className="cws-btn" onClick={() => setConfirmPurge(null)}>取消</button>
                        </>
                      ) : (
                        <button type="button" className="cws-btn cws-btn--danger" onClick={() => setConfirmPurge(wallpaper.id)}>删除</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="cws-studio__apply-row">
                  <span>{dirty ? "壁纸显示设置尚未应用" : "壁纸显示设置已同步"}</span>
                  <button type="button" className="cws-btn cws-btn--primary" disabled={!dirty} onClick={commitAppearance}>应用壁纸设置</button>
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
                  关闭折射，只保留模糊
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
                <label className="cws-studio__row">
                  历史保留（天）
                  <input type="number" min="1" max="90" value={prefs.historyDays} onChange={(e) => updatePreference("historyDays", Math.max(1, Number(e.target.value) || 1))} />
                </label>
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
                    resetPreferences();
                    setPrefs(getPreferences());
                    void saveSettingToServer("reset_prefs", "1").catch(() => {});
                  }}
                >
                  重置所有设置
                </button>
              </div>
            )}
            {message && <p className="cws-studio__message" role="status">{message}</p>}
          </div>
        </div>
        {confirmClose && <div className="cws-studio__discard" role="alertdialog" aria-modal="true" aria-label="未保存的壁纸设置">
          <h3>壁纸设置尚未保存</h3>
          <p>离开后将放弃本次裁切和显示调整。</p>
          <div>
            <button type="button" ref={keepEditingRef} onClick={() => { setConfirmClose(false); dialogRef.current?.focus(); }}>继续编辑</button>
            <button type="button" onClick={() => { setDirty(false); setConfirmClose(false); onClose(); }}>放弃修改并关闭</button>
          </div>
        </div>}
      </dialog>
    </>
  );
}

export default AppearanceSettingsStudio;
