"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import SplashScreen from "./SplashScreen";
import WelcomeScreen from "./WelcomeScreen";
import StarfieldBackground from "./StarfieldBackground";
import OrbitRings from "./OrbitRings";
import CursorTrail from "./CursorTrail";
import NebulaCursorTrail from "./NebulaCursorTrail";
import ChatFlow from "./ChatFlow";
import StatsDashboard from "./StatsDashboard";
import NavigationBar from "./NavigationBar";
import PageTransition from "./PageTransition";
import SettingsDrawer from "./SettingsDrawer";
import { usePreferences } from "@/app/hooks/usePreferences";
import GalleryPanel from "./GalleryPanel";
import OpcAgentPanel from "./opc-agent/OpcAgentPanel";

const OPCPanel = dynamic(() => import("./OPCPanel"), {
  ssr: false,
  loading: () => <div className="opc-loading">加载 OPC 工作区…</div>,
});

const LibTVPanel = dynamic(() => import("./LibTVPanel"), {
  ssr: false,
  loading: () => <div className="opc-loading">加载 LibTV 面板…</div>,
});

type Page = "chat" | "opc" | "stats" | "libtv" | "gallery";

export default function HomeClient() {
  const { prefs } = usePreferences();
  const [entered, setEntered] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("tszh_entered") === "1";
    return false;
  });
  // 如果有旧会话数据，不显示开场白
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const sessions = JSON.parse(localStorage.getItem("tszh_sessions") || "[]");
      return sessions.length === 0; // 没有旧会话才显示开场白
    } catch {
      return true;
    }
  });
  const submitPromptRef = useRef<((prompt: string) => void) | null>(null);
  const [exiting, setExiting] = useState(false);
  const [page, setPage] = useState<Page>(prefs.startPage as Page);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [templateFill, setTemplateFill] = useState("");
  const [stylePrefix, setStylePrefix] = useState("");
  const homeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // OPC 微智能体
  const [opcAgentOpen, setOpcAgentOpen] = useState(false);
  const [opcStyle, setOpcStyle] = useState<string | null>(null);
  const [opcCameraMove, setOpcCameraMove] = useState("");
  const [opcSelectedParams, setOpcSelectedParams] = useState<string[]>([]);
  const [opcDuration, setOpcDuration] = useState(8);
  const [opcAspect, setOpcAspect] = useState("16:9");

  const handleReset = useCallback(() => {
    setResetKey((k) => k + 1);
    setThinkingMode(false);
  }, []);

  const goHome = useCallback(() => {
    setExiting(true);
    homeTimerRef.current = setTimeout(() => {
      sessionStorage.removeItem("tszh_entered");
      setEntered(false);
      setShowWelcome(true);
      setExiting(false);
    }, 500);
  }, []);

  const handleWelcomeStart = useCallback((prompt?: string) => {
    setShowWelcome(false);
    if (prompt && submitPromptRef.current) {
      requestAnimationFrame(() => submitPromptRef.current?.(prompt));
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setShowWelcome(true);
  }, []);

  // 清理 goHome 定时器
  useEffect(() => {
    return () => { if (homeTimerRef.current) clearTimeout(homeTimerRef.current); };
  }, []);

  // 同步 reducedMotion 偏好到 DOM 属性
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = prefs.reducedMotion ? "true" : "false";
  }, [prefs.reducedMotion]);

  // 同步 cursorTrail 偏好
  useEffect(() => {
    document.documentElement.dataset.cursorTrail = prefs.cursorTrail ? "true" : "false";
  }, [prefs.cursorTrail]);

  // 同步 particleEffects 偏好
  useEffect(() => {
    document.documentElement.dataset.particleEffects = prefs.particleEffects ? "true" : "false";
  }, [prefs.particleEffects]);

  if (!entered) {
    return <SplashScreen onEnter={() => { sessionStorage.setItem("tszh_entered", "1"); setEntered(true); }} />;
  }

  const PAGE_TABS: { key: Page; label: string }[] = [
    { key: "chat", label: "对话工作区" },
    { key: "opc", label: "OPC 工作模式" },
    { key: "stats", label: "工作统计" },
    { key: "libtv", label: "LibTV 生图" },
    { key: "gallery", label: "创作画廊" },
  ];

  return (
    <div className={`workspace-wrapper ${exiting ? "exiting" : ""}`}>
      {/* Fixed UI Elements */}
      <NavigationBar page={page} onPageChange={setPage} />
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

      {/* Shared background — respects particleEffects & cursorTrail prefs */}
      {prefs.particleEffects && (
        <>
          <StarfieldBackground key={`stars-${resetKey}`} thinkingMode={thinkingMode} />
          <OrbitRings resetKey={resetKey} burstKey={burstKey} />
        </>
      )}
      {prefs.cursorTrail && (
        <>
          <NebulaCursorTrail />
          <CursorTrail />
        </>
      )}

      {/* Page Transition */}
      <PageTransition page={page}>
        <ChatFlow
          onThinkingChange={setThinkingMode}
          onReset={handleReset}
          onMessageSent={() => setBurstKey(k => k + 1)}
          templateFill={stylePrefix + templateFill}
          onGoHome={goHome}
          onSubmitRef={submitPromptRef}
          onNewChat={handleNewChat}
          showWelcome={showWelcome}
          onWelcomeStart={handleWelcomeStart}
        />
        <section className="opc-section">
          <div className="opc-section-divider" />
          <h2 className="opc-section-title">OPC 工作模式</h2>
          <p className="opc-section-sub">在线个人创作配置</p>
          <OPCPanel
            onTemplateClick={(prompt) => setTemplateFill(prompt)}
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
        <section className="opc-section">
          <div className="opc-section-divider" />
          <StatsDashboard />
        </section>
        <section className="opc-section">
          <div className="opc-section-divider" />
          <h2 className="opc-section-title">LibTV · AI 生图/生视频</h2>
          <p className="opc-section-sub">接入 LibLib.tv 的 AIGC 能力</p>
          <LibTVPanel />
        </section>
        <section className="opc-section">
          <div className="opc-section-divider" />
          <h2 className="opc-section-title">创作画廊</h2>
          <p className="opc-section-sub">所有生成的视频和图片</p>
          <GalleryPanel />
        </section>
      </PageTransition>
    </div>
  );
}
