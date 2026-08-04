"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import SplashScreen from "./SplashScreen";
import ChatFlow from "./ChatFlow";
import StatsDashboard from "./StatsDashboard";
import PageTransition from "./PageTransition";
import SettingsDrawer from "./SettingsDrawer";
import { usePreferences } from "@/app/hooks/usePreferences";
import GalleryPanel from "./GalleryPanel";
import OpcAgentPanel from "./opc-agent/OpcAgentPanel";
import TaskCenter from "./TaskCenter";
import ProductShell from "./ProductShell";
import EntryGateway from "./EntryGateway";
import { useAuth } from "./AuthProvider";
import { loadSessions } from "@/app/lib/sync";
import { dataOwnerFromUser, migrateLegacyWorkspaceData } from "@/app/lib/data-owner";
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

const OPCPanel = dynamic(() => import("./OPCPanel"), {
  ssr: false,
  loading: () => <div className="opc-loading">加载 OPC 工作区…</div>,
});

const LibTVPanel = dynamic(() => import("./LibTVPanel"), {
  ssr: false,
  loading: () => <div className="opc-loading">加载 LibTV 面板…</div>,
});

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
  const [page, setPage] = useState<WorkspacePage>(prefs.startPage as WorkspacePage);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [templateFill, setTemplateFill] = useState("");
  const [stylePrefix, setStylePrefix] = useState("");
  const submitPromptRef = useRef<((prompt: string) => void) | null>(null);

  const [opcAgentOpen, setOpcAgentOpen] = useState(false);
  const [opcStyle, setOpcStyle] = useState<string | null>(null);
  const [opcCameraMove, setOpcCameraMove] = useState("");
  const [opcSelectedParams, setOpcSelectedParams] = useState<string[]>([]);
  const [opcDuration, setOpcDuration] = useState(8);
  const [opcAspect, setOpcAspect] = useState("16:9");
  const effectiveEntryState = entryState.accessMode === "authenticated" && !user
    ? reduceEntryState(entryState, { type: "RETURN_TO_GATEWAY", authenticated: false })
    : entryState;

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
    document.documentElement.dataset.cursorTrail = prefs.cursorTrail ? "true" : "false";
    document.documentElement.dataset.particleEffects = prefs.particleEffects ? "true" : "false";
  }, [prefs.cursorTrail, prefs.particleEffects, prefs.reducedMotion]);

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
    return <div className="product-shell product-shell--loading" aria-busy="true" />;
  }

  const workspaceMode = effectiveEntryState.accessMode || "guest";

  return (
    <ProductShell
      phase={effectiveEntryState.phase}
      accessMode={effectiveEntryState.accessMode}
      page={page}
      onPageChange={setPage}
      onAuthOpen={() => setAuthPromptOpen(true)}
      reducedMotion={prefs.reducedMotion}
      particleEffects={prefs.particleEffects}
      cursorTrail={prefs.cursorTrail}
      thinkingMode={thinkingMode}
      resetKey={resetKey}
      burstKey={burstKey}
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
          <SettingsDrawer />
          <OpcAgentPanel
            open={opcAgentOpen}
            onClose={() => setOpcAgentOpen(false)}
            opcContext={{
              activeStyle: opcStyle,
              cameraMove: opcCameraMove,
              selectedParams: opcSelectedParams,
              duration: opcDuration,
              aspect: opcAspect,
              stylePrefix: stylePrefix || "",
            }}
          />

          <PageTransition page={page}>
            <ChatFlow
              accessMode={workspaceMode}
              onAuthRequired={() => setAuthPromptOpen(true)}
              onThinkingChange={setThinkingMode}
              onReset={handleReset}
              onMessageSent={() => setBurstKey((key) => key + 1)}
              templateFill={stylePrefix + templateFill}
              onGoHome={goHome}
              onSubmitRef={submitPromptRef}
              onNewChat={() => setShowWelcome(true)}
              showWelcome={showWelcome}
              onWelcomeStart={handleWelcomeStart}
            />
            <section className="opc-section">
              <div className="opc-section-divider" />
              <h2 className="opc-section-title">OPC 工作模式</h2>
              <p className="opc-section-sub">在线个人创作配置</p>
              <OPCPanel
                onTemplateClick={setTemplateFill}
                onStyleClick={(prefix) => {
                  setStylePrefix(prefix);
                  setOpcStyle(prefix ? prefix.split("，")[0] : null);
                }}
                onParamsChange={(params) => {
                  setOpcCameraMove(params.cameraMove);
                  setOpcSelectedParams(params.selectedParams);
                  setOpcDuration(params.duration);
                  setOpcAspect(params.aspect);
                }}
                onOpenAgent={() => setOpcAgentOpen(true)}
              />
            </section>
            <TaskCenter accessMode={workspaceMode} onAuthRequired={() => setAuthPromptOpen(true)} />
            <section className="opc-section"><div className="opc-section-divider" /><StatsDashboard /></section>
            <section className="opc-section">
              <div className="opc-section-divider" />
              <h2 className="opc-section-title">LibTV · AI 生图/生视频</h2>
              <p className="opc-section-sub">接入 LibLib.tv 的 AIGC 能力</p>
              <LibTVPanel />
            </section>
            <section className="opc-section">
              <div className="opc-section-divider" />
              <h2 className="opc-section-title">创作画廊</h2>
              <p className="opc-section-sub">当前数据仓中的视频和图片</p>
              <GalleryPanel />
            </section>
          </PageTransition>

          {authPromptOpen && (
            <div className="workspace-auth-overlay" role="dialog" aria-modal="true" aria-label="登录后继续创作">
              <button type="button" className="workspace-auth-overlay__backdrop" onClick={() => setAuthPromptOpen(false)} aria-label="关闭登录面板" />
              <div className="workspace-auth-overlay__panel">
                <EntryGateway
                  compact
                  authView={effectiveEntryState.authView === "account" && !user ? "login" : effectiveEntryState.authView}
                  onAuthViewChange={setAuthView}
                  onAuthenticated={handleAuthenticated}
                  onGuest={() => setAuthPromptOpen(false)}
                  onCancel={() => setAuthPromptOpen(false)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </ProductShell>
  );
}
