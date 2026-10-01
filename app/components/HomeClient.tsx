"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SplashScreen from "./SplashScreen";
import ChatFlow from "./ChatFlow";
import StatsDashboard from "./StatsDashboard";
import PageTransition from "./PageTransition";
import { usePreferences } from "@/app/hooks/usePreferences";
import GalleryPanel from "./GalleryPanel";
import TaskCenter from "./TaskCenter";
import ProductShell from "./ProductShell";
import EntryGateway from "./EntryGateway";
import WorkspaceAuthDialog from "./WorkspaceAuthDialog";
import CreativeStudio from "./CreativeStudio";
import CreativeWorkspace from "./CreativeWorkspace";
import ModelRoleCenter from "./ModelRoleCenter";
import { useAuth } from "./AuthProvider";
import { loadSessions } from "@/app/lib/sync";
import { dataOwnerFromUser, migrateLegacyWorkspaceData, ownerScope, workspaceDataKey } from "@/app/lib/data-owner";
import { getWallpaper } from "@/app/lib/wallpaper-store";
import { DEFAULT_WALLPAPER_APPEARANCE, type WallpaperAppearance, type WallpaperAsset } from "@/app/lib/appearance-types";
import { createHttpResearchRuntimeAdapter } from "@/app/lib/research-runtime/http-adapter";
import { creativeApi } from "@/app/lib/creative-agent-api";
import type { ResearchRuntimeAdapter } from "@/app/lib/research-runtime/adapter";
import { createHttpPluginCenterAdapter } from "@/app/lib/plugin-center/http-adapter";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import {
  ENTRY_SESSION_KEY,
  createInitialEntryState,
  reduceEntryState,
  serializeEntryState,
  type AuthView,
  type EntryEvent,
  type EntryState,
} from "@/app/lib/entry-flow";
import type { WorkspacePage } from "./NavigationBar";
import { migrateStartPage } from "@/app/lib/appearance-types";

// 兼容存量 localStorage 的 chat/opc 和已移除页面的起始页值。
function migratePageFromPrefs(startPage: string): WorkspacePage {
  return migrateStartPage(startPage) as WorkspacePage;
}

export default function HomeClient() {
  const { prefs } = usePreferences();
  const { user, loading: authLoading } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [entryState, setEntryState] = useState<EntryState>({
    phase: "splash",
    accessMode: null,
    authView: "login",
  });
  const [showWelcome, setShowWelcome] = useState(true);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [page, setPage] = useState<WorkspacePage>(migratePageFromPrefs(prefs.startPage as string));
  const [taskFocus, setTaskFocus] = useState<{ id: string; owner: number; revision: number } | null>(null);
  const [conversationFocus, setConversationFocus] = useState<{ id: string; owner: number; revision: number } | null>(null);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const submitPromptRef = useRef<((prompt: string) => void) | null>(null);
  const effectiveEntryState = entryState.accessMode === "authenticated" && !user
    ? reduceEntryState(entryState, { type: "RETURN_TO_GATEWAY", authenticated: false })
    : entryState;

  // ---- 研究运行工作台 HTTP Adapter（页面生命周期单例，owner-scoped）----
  // 规划 Task 7 Step 3：组件卸载只关订阅不停 Run；账号切换时 dispose 旧实例并按新 owner 重建。
  const researchOwner = dataOwnerFromUser(user);
  const researchOwnerKind = researchOwner.kind;
  const researchOwnerUserId = researchOwner.kind === "account" ? researchOwner.userId : null;
  const wallpaperOwnerScope = ownerScope(researchOwner);
  const wallpaperAppearanceKey = workspaceDataKey(researchOwner, "wallpaper-appearance");
  const researchAdapterRef = useRef<{ ownerKind: string; ownerUserId: number | null; adapter: ResearchRuntimeAdapter } | null>(null);
  const [researchAdapter, setResearchAdapter] = useState<ResearchRuntimeAdapter | null>(null);
  const [wallpaperAppearance, setWallpaperAppearance] = useState<WallpaperAppearance>(DEFAULT_WALLPAPER_APPEARANCE);
  const [wallpaperAsset, setWallpaperAsset] = useState<WallpaperAsset | null>(null);

  useEffect(() => {
    const current = researchAdapterRef.current;
    if (current && current.ownerKind === researchOwnerKind && current.ownerUserId === researchOwnerUserId) return;

    current?.adapter.dispose();
    const adapter = createHttpResearchRuntimeAdapter({ request: creativeApi });
    researchAdapterRef.current = { ownerKind: researchOwnerKind, ownerUserId: researchOwnerUserId, adapter };
    setResearchAdapter(adapter);
  }, [researchOwnerKind, researchOwnerUserId]);

  // 卸载时释放（页面生命周期结束）
  useEffect(() => {
    return () => {
      researchAdapterRef.current?.adapter.dispose();
      researchAdapterRef.current = null;
      pluginAdapterRef.current?.adapter.dispose();
      pluginAdapterRef.current = null;
    };
  }, []);

  // ---- 插件中心 Mock Adapter（owner-scoped，与研究 Adapter 同生命周期模式）----
  const pluginAdapterRef = useRef<{ ownerKind: string; ownerUserId: number | null; adapter: PluginCenterAdapter } | null>(null);
  const [pluginCenterAdapter, setPluginCenterAdapter] = useState<PluginCenterAdapter | null>(null);

  useEffect(() => {
    const current = pluginAdapterRef.current;
    if (current && current.ownerKind === researchOwnerKind && current.ownerUserId === researchOwnerUserId) return;

    current?.adapter.dispose();
    const adapter = createHttpPluginCenterAdapter({ request: creativeApi });
    pluginAdapterRef.current = { ownerKind: researchOwnerKind, ownerUserId: researchOwnerUserId, adapter };
    setPluginCenterAdapter(adapter);
  }, [researchOwnerKind, researchOwnerUserId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = localStorage.getItem(wallpaperAppearanceKey);
      setWallpaperAppearance(raw ? { ...DEFAULT_WALLPAPER_APPEARANCE, ...JSON.parse(raw) } : DEFAULT_WALLPAPER_APPEARANCE);
    } catch {
      setWallpaperAppearance(DEFAULT_WALLPAPER_APPEARANCE);
    }
  }, [hydrated, wallpaperAppearanceKey]);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated || !wallpaperAppearance.assetId) {
      setWallpaperAsset(null);
      return;
    }
    void getWallpaper(wallpaperAppearance.assetId, wallpaperOwnerScope).then((asset) => {
      if (!cancelled) setWallpaperAsset(asset);
    });
    return () => { cancelled = true; };
  }, [hydrated, wallpaperAppearance.assetId, wallpaperOwnerScope]);

  const onWallpaperAppearanceChange = useCallback((next: WallpaperAppearance) => {
    setWallpaperAppearance(next);
    localStorage.setItem(wallpaperAppearanceKey, JSON.stringify(next));
  }, [wallpaperAppearanceKey]);

  useEffect(() => {
    if (authLoading || hydrated) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const owner = dataOwnerFromUser(user);
      migrateLegacyWorkspaceData(localStorage, owner);
      setEntryState(createInitialEntryState(sessionStorage.getItem(ENTRY_SESSION_KEY), Boolean(user)));
      setShowWelcome(loadSessions().length === 0);
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [authLoading, hydrated, user]);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(ENTRY_SESSION_KEY, serializeEntryState(effectiveEntryState));
  }, [effectiveEntryState, hydrated]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = prefs.reducedMotion ? "true" : "false";
    document.documentElement.dataset.cursorTrail = "false";
    document.documentElement.dataset.particleEffects = prefs.particleEffects ? "true" : "false";
  }, [prefs.particleEffects, prefs.reducedMotion]);

  // 登录面板 ESC 关闭
  useEffect(() => {
    if (!authPromptOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAuthPromptOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authPromptOpen]);

  const sendEntryEvent = useCallback((event: EntryEvent) => {
    setEntryState((current) => reduceEntryState(current, event));
  }, []);

  const setAuthView = useCallback((view: AuthView) => {
    sendEntryEvent({ type: "SET_AUTH_VIEW", view });
  }, [sendEntryEvent]);

  const handleReset = useCallback(() => {
    setResetKey((key) => key + 1);
    setThinkingMode(false);
  }, []);

  const goHome = useCallback(() => {
    setAuthPromptOpen(false);
    sendEntryEvent({ type: "RETURN_TO_GATEWAY", authenticated: Boolean(user) });
  }, [sendEntryEvent, user]);

  const handleWelcomeStart = useCallback((prompt?: string) => {
    setShowWelcome(false);
    if (prompt && submitPromptRef.current) {
      requestAnimationFrame(() => submitPromptRef.current?.(prompt));
    }
  }, []);

  const handleAuthenticated = useCallback(() => {
    sendEntryEvent({ type: "ENTER_WORKSPACE" });
    setAuthPromptOpen(false);
  }, [sendEntryEvent]);

  const handleGuest = useCallback(() => {
    sendEntryEvent({ type: "ENTER_GUEST" });
    setAuthPromptOpen(false);
  }, [sendEntryEvent]);

  if (!hydrated) {
    return (
      <div className="product-shell product-shell--loading" aria-busy="true">
        <div className="loading-brand" role="status" aria-label="正在加载">
          <span className="loading-brand-core" aria-hidden="true" />
          <span className="loading-brand-text">正在同步天文台…</span>
        </div>
      </div>
    );
  }

  const workspaceMode = effectiveEntryState.accessMode || "guest";

  return (
    <ProductShell
      phase={effectiveEntryState.phase}
      accessMode={effectiveEntryState.accessMode}
      page={page}
      onPageChange={setPage}
      onOpenTask={id => { if (user) { setTaskFocus({ id, owner: user.id, revision: Date.now() }); setPage("tasks"); } }}
      onAuthOpen={() => { if (user) setAuthView("account"); setAuthPromptOpen(true); }}
      reducedMotion={prefs.reducedMotion}
      particleEffects={prefs.particleEffects}
      galaxySettings={prefs.galaxySettings}
      thinkingMode={thinkingMode}
      resetKey={resetKey}
      burstKey={burstKey}
      wallpaperAppearance={wallpaperAppearance}
      wallpaperAsset={wallpaperAsset}
      videoWallpaperActive={wallpaperAsset?.kind === "video"}
    >
      {effectiveEntryState.phase === "splash" && (
        <SplashScreen
          onEnter={() => sendEntryEvent({
            type: "SPLASH_COMPLETE",
            authenticated: Boolean(user),
          })}
        />
      )}

      {effectiveEntryState.phase === "gateway" && (
        <div className="entry-stage entry-stage--gateway">
          <EntryGateway
            authView={effectiveEntryState.authView}
            onAuthViewChange={setAuthView}
            onAuthenticated={handleAuthenticated}
            onGuest={handleGuest}
          />
        </div>
      )}

      {effectiveEntryState.phase === "workspace" && (
        <div className="workspace-wrapper">
          <PageTransition page={page}>
            <>
              <CreativeWorkspace
                accessMode={workspaceMode}
                onAuthRequired={() => setAuthPromptOpen(true)}
                onOpenModelCenter={() => setPage("modelCenter")}
                focusConversation={conversationFocus?.owner === user?.id ? conversationFocus : null}
                researchAdapter={researchAdapter}
                pluginCenterAdapter={pluginCenterAdapter}
                wallpaperAppearance={wallpaperAppearance}
                onWallpaperAppearanceChange={onWallpaperAppearanceChange}
              />
            </>
            <ModelRoleCenter accessMode={workspaceMode} key={wallpaperOwnerScope} onAuthRequired={() => setAuthPromptOpen(true)} pluginCenterAdapter={pluginCenterAdapter} />
            <TaskCenter accessMode={workspaceMode} onAuthRequired={() => setAuthPromptOpen(true)} focusTask={taskFocus?.owner === user?.id ? taskFocus : null}
              onOpenConversation={id => { if (user) { setConversationFocus({ id, owner: user.id, revision: Date.now() }); setPage("studio"); } }} />
            <section className="opc-section"><div className="opc-section-divider" /><StatsDashboard /></section>
            <section className="opc-section">
              <div className="opc-section-divider" />
              <h2 className="opc-section-title page-title">创作画廊</h2>
              <p className="opc-section-sub">当前数据仓中的视频和图片</p>
              <GalleryPanel />
            </section>
          </PageTransition>

          {authPromptOpen && (
            <WorkspaceAuthDialog label={user ? "管理账户" : "登录后继续创作"} onClose={() => setAuthPromptOpen(false)}>
                <EntryGateway
                  compact
                  authView={effectiveEntryState.authView === "account" && !user ? "login" : effectiveEntryState.authView}
                  onAuthViewChange={setAuthView}
                  onAuthenticated={handleAuthenticated}
                  onGuest={handleGuest}
                  onCancel={() => setAuthPromptOpen(false)}
                />
            </WorkspaceAuthDialog>
          )}
        </div>
      )}
    </ProductShell>
  );
}
