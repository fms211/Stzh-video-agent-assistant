"use client";

// 创意工坊统一工作区 — CreativeWorkspace（规划 §1.2 三域工作台组合根）
// 上：CreativeParameterBar（Liquid Glass bar）；中：三域（WorkspaceSessionDock 左 /
//     中央创作流 / CreativeContextInspector 右）；底：UnifiedCreativeComposer（四模式）。
// 唯一拥有：mode、CreativeContext、researchRun、layout store 订阅、energy 聚合、
//          AppearanceSettingsStudio 开关与焦点恢复、LiquidGlassFilters 单挂载点。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GripVertical, PanelLeftOpen, PanelRightOpen, Settings2 } from "lucide-react";
import { LiquidGlassFilters } from "./LiquidGlassFilters";
import { CozeDialogueSurface } from "./CozeDialogueSurface";
import type { CozeDialogueState } from "@/app/lib/coze-dialogue-settings";
import { CreativeParameterBar } from "./CreativeParameterBar";
import { CreativeImageParameterDrawer } from "./CreativeImageParameterDrawer";
import { UnifiedCreativeComposer } from "./UnifiedCreativeComposer";
import { CreativeContextInspector } from "./CreativeContextInspector";
import CreativeConversationCore, { type ConversationSubmit } from "./CreativeConversationCore";
import { WorkspaceSessionDock } from "./WorkspaceSessionDock";
import LeftSidebar, { type HistorySession, type StagedFile } from "./LeftSidebar";
import { ResearchWorkbench } from "./research-workbench/ResearchWorkbench";
import { ResearchRunHistoryDialog } from "./research-workbench/ResearchRunHistoryDialog";
import { AppearanceSettingsStudio } from "./AppearanceSettingsStudio";
import { StudioMemoryManager } from "./StudioMemoryManager";
import { useAuth } from "./AuthProvider";
import { DEFAULT_WALLPAPER_APPEARANCE, defaultGlassSettings, emptyCreativeContext, type CreativeContext, type CreativeWorkspaceMode, type GlassSettings, type WallpaperAppearance } from "@/app/lib/appearance-types";
import { restoreWorkspaceLayoutStore, createWorkspaceLayoutPersister, WORKSPACE_LAYOUT_LIMITS, type DockMode } from "./workspace-layout-store";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { globalEnergyStore, useThemeEnergy } from "@/app/hooks/useThemeEnergy";
import { dataOwnerFromUser } from "@/app/lib/data-owner";
import type { ResearchRunSummary, ResearchRuntimeAdapter } from "@/app/lib/research-runtime/adapter";
import type { ResearchLaunchInput } from "@/app/lib/research-runtime/types";
import type { AccessMode } from "@/app/lib/entry-flow";
import { DEFAULT_THEME, getThemeDefinition, type ThemeId } from "@/app/lib/theme-registry";
import { fetchServerSettings, saveServerSettings } from "@/app/lib/sync";
import { CREATIVE_MOTION } from "@/app/lib/creative-motion";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";
import { reduceCreativeContext } from "@/app/lib/creative-context";
import { emptyStudioInspector, updateStudioInspector, describeWorkflow, type AssistantInspectorState, type WorkflowInspectorState, type CollaborationInspectorState } from "@/app/lib/studio-inspector-state";

type Props = {
  accessMode: AccessMode;
  onAuthRequired: () => void;
  onOpenModelCenter?: () => void;
  focusConversation?: { id: string; owner: number; revision: number } | null;
  researchAdapter: ResearchRuntimeAdapter | null;
  pluginCenterAdapter?: unknown;
  wallpaperAppearance?: WallpaperAppearance;
  onWallpaperAppearanceChange?: (appearance: WallpaperAppearance) => void;
};

function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return getThemeDefinition(localStorage.getItem("theme") || DEFAULT_THEME).id;
}

export default function CreativeWorkspace({ accessMode, onAuthRequired, onOpenModelCenter, focusConversation, researchAdapter, wallpaperAppearance = DEFAULT_WALLPAPER_APPEARANCE, onWallpaperAppearanceChange }: Props) {
  const { user } = useAuth();
  const currentOwner = dataOwnerFromUser(user);
  const ownerScope = currentOwner.kind === "account" ? `user:${currentOwner.userId}` : "guest";
  const [inspection, setInspection] = useState(() => emptyStudioInspector(ownerScope));
  const currentInspection = inspection.owner === ownerScope ? inspection : emptyStudioInspector(ownerScope);
  if (currentInspection !== inspection) setInspection(currentInspection);
  const onAssistantInspection = useCallback((value: AssistantInspectorState) => {
    setInspection(previous => updateStudioInspector(previous, ownerScope, "assistant", value));
  }, [ownerScope]);
  const onWorkflowInspection = useCallback((value: WorkflowInspectorState) => {
    setInspection(previous => updateStudioInspector(previous, ownerScope, "workflow", value));
  }, [ownerScope]);
  const onCollaborationInspection = useCallback((value: CollaborationInspectorState) => {
    setInspection(previous => updateStudioInspector(previous, ownerScope, "collaboration", value));
  }, [ownerScope]);
  const glassStorageKey = `tszh:v2:${ownerScope}:glass-settings`;
  const [mode, setMode] = useState<CreativeWorkspaceMode>("coze");
  const [memoryOwner, setMemoryOwner] = useState<string | null>(null);
  if (memoryOwner !== null && (memoryOwner !== ownerScope || accessMode !== "authenticated")) setMemoryOwner(null);
  const [context, setContext] = useState<CreativeContext>(() => emptyCreativeContext());
  const [lastInsertedRevision, setLastInsertedRevision] = useState(0);
  const [insertRequestRevision, setInsertRequestRevision] = useState(0);
  const [cozeTaskStatus, setCozeTaskStatus] = useState<{ active: boolean; label: string } | null>(null);
  const [cozeDialogue, setCozeDialogue] = useState<CozeDialogueState>({ scope: "", ready: false, hasMessages: false, firstSubmission: 0, panelOpen: false });
  const onDialogueStateChange = useCallback((next: CozeDialogueState) => {
    setCozeDialogue(previous => Object.keys(next).every(key => next[key as keyof CozeDialogueState] === previous[key as keyof CozeDialogueState]) ? previous : next);
  }, []);
  const energyState = useThemeEnergy();
  const [glassSettings, setGlassSettings] = useState<GlassSettings>(() => defaultGlassSettings());
  const [themeId, setThemeId] = useState<ThemeId>(readStoredTheme);
  // research run 视图状态（从 CreativeStudio 迁移）
  const [researchRun, setResearchRun] = useState<{ styleName: string; useCase: string } | null>(null);
  const [researchRunId, setResearchRunId] = useState<string | null>(null);
  const [researchLaunchError, setResearchLaunchError] = useState("");
  const [researchHistoryOpen, setResearchHistoryOpen] = useState(false);
  const researchActiveKey = `tszh:v2:${ownerScope}:research-active-run`;

  useEffect(() => {
    let cancelled = false;
    const saved = user ? localStorage.getItem(researchActiveKey) : null;
    setResearchRunId(null);
    setResearchRun(null);
    if (saved && researchAdapter) {
      void researchAdapter.getRun(saved).then((snapshot) => {
        if (cancelled) return;
        setResearchRunId(snapshot.runId);
        setResearchRun(snapshot.input);
      }).catch((error) => {
        if (!cancelled) setResearchLaunchError(error instanceof Error ? error.message : "恢复研究任务失败");
      });
    }
    return () => { cancelled = true; };
  }, [researchActiveKey, researchAdapter, user]);
  // 布局 store（owner-scoped 持久化）
  const layoutStorageKey = `tszh:v2:${ownerScope}:workspace-layout`;
  const [ownedLayout, setOwnedLayout] = useState(() => ({
    owner: ownerScope,
    store: restoreWorkspaceLayoutStore(localStorage, layoutStorageKey, window.innerWidth),
  }));
  const currentLayout = ownedLayout.owner === ownerScope ? ownedLayout : {
    owner: ownerScope,
    store: restoreWorkspaceLayoutStore(localStorage, layoutStorageKey, window.innerWidth),
  };
  if (currentLayout !== ownedLayout) setOwnedLayout(currentLayout);
  const layoutStore = currentLayout.store;
  const layout = useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [rightPanelContent, setRightPanelContent] = useState<"inspector" | "image-parameters">("inspector");
  const [rightOverlayOpen, setRightOverlayOpen] = useState(false);
  const [rightResizing, setRightResizing] = useState(false);
  const rightAsideRef = useRef<HTMLElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const rightTriggerRef = useRef<HTMLButtonElement>(null);
  const imageParametersTriggerRef = useRef<HTMLButtonElement>(null);
  const imageParameterCloseRef = useRef<HTMLButtonElement>(null);
  const imageParameterReturnModeRef = useRef<DockMode | null>(null);
  const rightFocusTimerRef = useRef<number | null>(null);
  const rightResizeFrameRef = useRef<number | null>(null);
  const rightDragState = useRef<{ startX: number; startWidth: number; latestWidth: number } | null>(null);

  // 设置工作室
  const [studioOpen, setStudioOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileSessionTriggerRef = useRef<HTMLButtonElement>(null);
  const { reducedMotion } = useCreativeMotion();

  useEffect(() => {
    globalEnergyStore.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(glassStorageKey);
      setGlassSettings(raw ? { ...defaultGlassSettings(), ...JSON.parse(raw) } : defaultGlassSettings());
    } catch {
      setGlassSettings(defaultGlassSettings());
    }
  }, [glassStorageKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--glass-blur", `${glassSettings.blurPx}px`);
    root.style.setProperty("--glass-opacity", String(glassSettings.opacity));
    root.style.setProperty("--glass-panel-strength", `${Math.round((0.66 + glassSettings.opacity * 0.7) * 100)}%`);
    root.style.setProperty("--glass-refraction", String(glassSettings.refraction));
    root.style.setProperty("--glass-edge-glow", String(glassSettings.edgeGlow));
    root.dataset.reduceTransparency = glassSettings.reduceTransparency ? "true" : "false";
    root.dataset.refractionEnabled = glassSettings.refractionEnabled ? "true" : "false";
    root.dataset.videoAutoplay = glassSettings.videoAutoplay ? "true" : "false";
    window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
  }, [glassSettings]);

  const handleGlassSettingsChange = useCallback((next: GlassSettings) => {
    setGlassSettings(next);
    localStorage.setItem(glassStorageKey, JSON.stringify(next));
    onWallpaperAppearanceChange?.({ ...wallpaperAppearance, dim: next.wallpaperDim });
  }, [glassStorageKey, onWallpaperAppearanceChange, wallpaperAppearance]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => globalEnergyStore.setThemeForPeak(root.dataset.theme || "deep-space");
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme = getThemeDefinition(themeId);
    root.dataset.theme = theme.id;
    root.style.setProperty("--space-deep", theme.colors.deep);
    root.style.setProperty("--space-panel", theme.colors.panel);
    root.style.setProperty("--space-surface", theme.colors.surface);
    root.style.setProperty("--foreground", theme.colors.foreground);
    root.style.setProperty("--foreground-muted", theme.colors.muted);
    root.style.setProperty("--glow-warm", theme.colors.primary);
    root.style.setProperty("--glow-warm-soft", theme.colors.primarySoft);
    root.style.setProperty("--glow-cool", theme.colors.cool);
    root.style.setProperty("--glow-aurora", theme.colors.aurora);
    root.style.setProperty("--theme-glass-tint", theme.glass.tint);
    root.style.setProperty("--theme-glass-border", theme.glass.border);
    root.style.setProperty("--theme-energy-idle", theme.energy.idle);
    root.style.setProperty("--theme-energy-running", theme.energy.running);
    root.style.setProperty("--theme-energy-thinking", theme.energy.thinking);
    root.style.setProperty("--theme-energy-peak", theme.energy.peak);
  }, [themeId]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setThemeId(readStoredTheme());
      return;
    }
    void fetchServerSettings().then((settings) => {
      if (cancelled) return;
      const next = getThemeDefinition(
        typeof settings?.theme === "string" ? settings.theme : readStoredTheme(),
      ).id;
      localStorage.setItem("theme", next);
      setThemeId(next);
    });
    return () => { cancelled = true; };
  }, [user]);

  const handleThemeChange = useCallback((nextThemeId: string) => {
    const next = getThemeDefinition(nextThemeId).id;
    localStorage.setItem("theme", next);
    setThemeId(next);
    if (user) void saveServerSettings({ theme: next });
  }, [user]);

  // 响应式断点必须使用真实 viewport；使用容器宽会在每个断点提前 32px 降级。
  useEffect(() => {
    const syncViewport = () => layoutStore.setViewport(window.innerWidth);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [layoutStore]);

  useEffect(() => {
    if (layout.rightMode !== "overlay") setRightOverlayOpen(false);
  }, [layout.rightMode]);

  const activeOverlay = layout.leftMode === "overlay"
    ? "left"
    : layout.rightMode === "overlay" && rightOverlayOpen
      ? "right"
      : null;
  const imageParametersOpen = rightPanelContent === "image-parameters";

  const focusRightTrigger = useCallback(() => {
    if (rightFocusTimerRef.current !== null) window.clearTimeout(rightFocusTimerRef.current);
    rightFocusTimerRef.current = window.setTimeout(() => {
      rightFocusTimerRef.current = null;
      rightTriggerRef.current?.focus();
    }, reducedMotion ? 0 : 150);
  }, [reducedMotion]);

  const focusImageParametersTrigger = useCallback(() => {
    if (rightFocusTimerRef.current !== null) window.clearTimeout(rightFocusTimerRef.current);
    rightFocusTimerRef.current = window.setTimeout(() => {
      rightFocusTimerRef.current = null;
      imageParametersTriggerRef.current?.focus();
    }, reducedMotion ? 0 : 150);
  }, [reducedMotion]);

  const openImageParameters = useCallback(() => {
    imageParameterReturnModeRef.current = layout.rightMode;
    if (layout.leftMode === "overlay") layoutStore.setLeftMode("rail");
    setRightPanelContent("image-parameters");
    if (layout.rightMode === "rail") {
      layoutStore.setRightMode("docked");
    } else if (layout.rightMode === "overlay") {
      setRightOverlayOpen(true);
    }
  }, [layout.leftMode, layout.rightMode, layoutStore]);

  const closeImageParameters = useCallback(() => {
    setRightPanelContent("inspector");
    if (layout.rightMode === "overlay") setRightOverlayOpen(false);
    if (imageParameterReturnModeRef.current === "rail" && layout.rightMode === "docked") {
      layoutStore.setRightMode("rail");
    }
    imageParameterReturnModeRef.current = null;
    focusImageParametersTrigger();
  }, [focusImageParametersTrigger, layout.rightMode, layoutStore]);

  useEffect(() => () => {
    if (rightFocusTimerRef.current !== null) window.clearTimeout(rightFocusTimerRef.current);
  }, []);

  const closeActiveOverlay = useCallback(() => {
    if (activeOverlay === "left") {
      layoutStore.setLeftMode("rail");
      return;
    }
    if (activeOverlay === "right") {
      if (rightPanelContent === "image-parameters") closeImageParameters();
      else {
        setRightOverlayOpen(false);
        focusRightTrigger();
      }
    }
  }, [activeOverlay, closeImageParameters, focusRightTrigger, layoutStore, rightPanelContent]);

  useEffect(() => {
    if (!activeOverlay) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeActiveOverlay();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeOverlay, closeActiveOverlay]);

  useEffect(() => {
    if (activeOverlay !== "right") return;
    const timer = window.setTimeout(() => {
      if (rightPanelContent === "image-parameters") {
        imageParameterCloseRef.current?.focus();
        return;
      }
      rightPanelRef.current?.querySelector<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")?.focus();
    }, reducedMotion ? 0 : 150);
    return () => window.clearTimeout(timer);
  }, [activeOverlay, reducedMotion, rightPanelContent]);

  const openRightInspector = () => {
    setRightPanelContent("inspector");
    if (layout.viewportWidth < WORKSPACE_LAYOUT_LIMITS.railBreakpoint) {
      if (layout.leftMode === "overlay") layoutStore.setLeftMode("rail");
      setRightOverlayOpen(true);
    } else {
      layoutStore.setRightMode("docked");
    }
  };

  const closeRightInspector = () => {
    if (layout.rightMode === "overlay") {
      setRightOverlayOpen(false);
      focusRightTrigger();
    } else {
      layoutStore.setRightMode("rail");
      focusRightTrigger();
    }
  };

  const handleLeftModeChange = useCallback((nextMode: "docked" | "rail" | "overlay") => {
    if (nextMode === "overlay") {
      setRightOverlayOpen(false);
      setRightPanelContent("inspector");
      imageParameterReturnModeRef.current = null;
    }
    layoutStore.setLeftMode(nextMode);
  }, [layoutStore]);

  const applyRightInlineWidth = (nextWidth: number) => {
    if (!rightAsideRef.current) return;
    const value = `${nextWidth}px`;
    rightAsideRef.current.style.width = value;
    rightAsideRef.current.style.minWidth = value;
  };

  const startRightResize = (event: PointerEvent<HTMLButtonElement>) => {
    rightDragState.current = { startX: event.clientX, startWidth: layout.rightWidth, latestWidth: layout.rightWidth };
    setRightResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveRightResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!rightDragState.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    rightDragState.current.latestWidth = Math.max(
      WORKSPACE_LAYOUT_LIMITS.rightMin,
      Math.min(
        WORKSPACE_LAYOUT_LIMITS.rightMax,
        rightDragState.current.startWidth + rightDragState.current.startX - event.clientX,
      ),
    );
    if (rightResizeFrameRef.current !== null) return;
    rightResizeFrameRef.current = requestAnimationFrame(() => {
      rightResizeFrameRef.current = null;
      if (rightDragState.current) applyRightInlineWidth(rightDragState.current.latestWidth);
    });
  };

  const stopRightResize = (event: PointerEvent<HTMLButtonElement>) => {
    const nextWidth = Math.max(
      WORKSPACE_LAYOUT_LIMITS.rightMin,
      Math.min(WORKSPACE_LAYOUT_LIMITS.rightMax, rightDragState.current?.latestWidth ?? layout.rightWidth),
    );
    if (rightResizeFrameRef.current !== null) {
      cancelAnimationFrame(rightResizeFrameRef.current);
      rightResizeFrameRef.current = null;
    }
    applyRightInlineWidth(nextWidth);
    rightDragState.current = null;
    setRightResizing(false);
    layoutStore.setRightWidth(nextWidth);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resizeRightWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") layoutStore.setRightWidth(layout.rightWidth + 16);
    else if (event.key === "ArrowRight") layoutStore.setRightWidth(layout.rightWidth - 16);
    else if (event.key === "Home") layoutStore.setRightWidth(WORKSPACE_LAYOUT_LIMITS.rightMin);
    else if (event.key === "End") layoutStore.setRightWidth(WORKSPACE_LAYOUT_LIMITS.rightMax);
    else return;
    event.preventDefault();
  };

  useEffect(() => () => {
    if (rightResizeFrameRef.current !== null) cancelAnimationFrame(rightResizeFrameRef.current);
  }, []);

  // 布局持久化（debounce）
  useEffect(() => {
    const persister = createWorkspaceLayoutPersister(layoutStorageKey);
    persister.attach(localStorage);
    persister.save(layout);
    return () => persister.cancel();
  }, [layout, layoutStorageKey]);

  // 能谱：研究 run 状态
  useEffect(() => {
    if (!researchRunId || !researchAdapter) return;
    let closed = false;
    void researchAdapter.getRun(researchRunId).then((snap) => {
      if (closed) return;
      globalEnergyStore.setSource("research", snap.status === "running" ? "running" : snap.status === "awaiting_plan_approval" ? "busy" : "idle");
    }).catch(() => {});
    const sub = researchAdapter.subscribe(researchRunId, 0, {
      onEvent(event) {
        globalEnergyStore.setSource("research", event.type === "run.started" || event.type === "run.resumed" ? "running" : event.type === "run.completed" || event.type === "run.failed" ? "idle" : "busy");
      },
      onError() {},
    });
    return () => {
      closed = true;
      sub.close();
    };
  }, [researchRunId, researchAdapter]);

  // Prompt, selected files and acceptance state travel through the same boundary.
  const coreSubmitRef = useRef<ConversationSubmit | null>(null);
  const [cozeSending, setCozeSending] = useState(false);
  const cozeSubmit = useCallback((prompt: string, files: File[]) => {
    return coreSubmitRef.current?.(prompt, files) ?? false;
  }, []);

  // handleLaunchRuntime（从 CreativeStudio 迁移：style-research → workbench）
  const handleLaunchRuntime = useCallback(async (input: ResearchLaunchInput) => {
    if (accessMode !== "authenticated") { onAuthRequired(); return false; }
    if (!researchAdapter) return false;
    setResearchLaunchError("");
    try {
      const snapshot = await researchAdapter.createRun({ ...input, providerId: input.providerId || null, projectId: input.projectId || null });
      localStorage.setItem(researchActiveKey, snapshot.runId);
      setResearchRun(input);
      setResearchRunId(snapshot.runId);
      return true;
    } catch (error) {
      setResearchLaunchError(error instanceof Error ? error.message : "创建研究任务失败");
      return false;
    }
  }, [researchAdapter, accessMode, onAuthRequired, researchActiveKey]);

  const handleExitWorkbench = useCallback(() => {
    localStorage.removeItem(researchActiveKey);
    setResearchRun(null);
    setResearchRunId(null);
  }, [researchActiveKey]);

  const openResearchHistory = useCallback(() => setResearchHistoryOpen(true), []);
  const closeResearchHistory = useCallback(() => setResearchHistoryOpen(false), []);
  const handleSelectResearchRun = useCallback((run: ResearchRunSummary) => {
    localStorage.setItem(researchActiveKey, run.runId);
    setResearchLaunchError("");
    setResearchRun(run.input);
    setResearchRunId(run.runId);
    setMode("workflow");
  }, [researchActiveKey]);

  // 参数条插入（revision 去重）
  const handleInsert = useCallback((revision: number) => {
    setInsertRequestRevision(revision);
  }, []);

  const handleInserted = useCallback((revision: number) => {
    setLastInsertedRevision(revision);
  }, []);

  const assistantMeta = currentInspection.assistant || {
    providerName: "",
    model: "",
    sessionSummary: "",
    sending: false,
  };

  // 会话坞状态（ConversationCore 上提）
  const [dockState, setDockState] = useState<{
    sessions: HistorySession[];
    files: StagedFile[];
    activeSessionId: string;
    onSessionClick: (id: string) => void;
    onSessionDelete: (id: string) => void;
    onNewChat: () => void;
    onFileClick: (f: StagedFile) => void;
    onClearFiles: () => void;
  } | null>(null);

  const rightPanelVisible = layout.rightMode === "docked" || (layout.rightMode === "overlay" && rightOverlayOpen);
  const rightRailVisible = layout.rightMode === "rail" || (layout.rightMode === "overlay" && !rightOverlayOpen);
  const rightOccupiedWidth = layout.rightMode === "docked"
    ? layout.rightWidth
    : layout.rightMode === "rail"
      ? WORKSPACE_LAYOUT_LIMITS.rightRailWidth
      : rightOverlayOpen
        ? layout.rightWidth
        : WORKSPACE_LAYOUT_LIMITS.rightRailWidth;
  const panelTransition = reducedMotion
    ? { duration: CREATIVE_MOTION.reducedMotionDuration }
    : CREATIVE_MOTION.panelSpring;
  const rightLayoutTransition = { duration: reducedMotion ? CREATIVE_MOTION.reducedMotionDuration : 0.16, ease: "easeOut" as const };
  const rightRailAnimation = reducedMotion
    ? { opacity: rightRailVisible ? 1 : 0 }
    : rightRailVisible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 10, scale: 0.985 };
  const rightPanelAnimation = reducedMotion
    ? { opacity: rightPanelVisible ? 1 : 0 }
    : rightPanelVisible ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 18, scale: 0.985 };

  return (
    <section className={`cws-workspace${reducedMotion ? " is-reduced-motion" : ""}`} ref={viewportRef} data-testid="creative-workspace" data-energy-state={energyState} data-creative-mode={mode}>
      <LiquidGlassFilters />
      {researchLaunchError && <p role="alert" className="cws-inspector__risk">{researchLaunchError}</p>}

      <div className="cws-parameter-bar-shell" inert={activeOverlay ? true : undefined}>
        <CreativeParameterBar
          context={context}
          onContextChange={setContext}
          onInsert={handleInsert}
          lastInsertedRevision={lastInsertedRevision}
          imageParametersOpen={imageParametersOpen}
          onImageParametersOpenChange={(open) => {
            if (open) openImageParameters();
            else closeImageParameters();
          }}
          imageParametersTriggerRef={imageParametersTriggerRef}
          onOpenMemory={() => { if (!user || accessMode !== "authenticated") onAuthRequired(); else setMemoryOwner(ownerScope); }}
        />
      </div>

      <div className="cws-mobile-tools" aria-label="工作区面板" inert={activeOverlay ? true : undefined}>
        <button ref={mobileSessionTriggerRef} type="button" aria-expanded={layout.leftMode === "overlay"} onClick={() => handleLeftModeChange("overlay")}><PanelLeftOpen size={16} />会话与文件</button>
        <button ref={layout.viewportWidth < 720 ? rightTriggerRef : undefined} type="button" aria-expanded={rightPanelVisible} onClick={openRightInspector}><PanelRightOpen size={16} />本次上下文</button>
        <button ref={layout.viewportWidth < 720 ? settingsTriggerRef : undefined} type="button" onClick={() => setStudioOpen(true)} aria-label="打开个性化工作室"><Settings2 size={16} /></button>
      </div>

      <div className="cws-body" data-layout-left={layout.leftMode} data-layout-right={layout.rightMode}>
        {researchRun !== null && researchAdapter ? (
          <div className="cws-research-shell">
            <ResearchWorkbench
              key={`${ownerScope}:${researchRunId}`}
              adapter={researchAdapter}
              runId={researchRunId}
              onExit={handleExitWorkbench}
              promptPane={null}
            />
          </div>
        ) : (
          <>
        <WorkspaceSessionDock
          layoutMode={layout.leftMode}
          width={layout.leftWidth}
          onModeChange={handleLeftModeChange}
          onWidthChange={(width) => layoutStore.setLeftWidth(width)}
          expandMode={layout.viewportWidth < WORKSPACE_LAYOUT_LIMITS.overlayBreakpoint ? "overlay" : "docked"}
          onOpenSettings={() => {
            setStudioOpen(true);
          }}
          settingsTriggerRef={layout.viewportWidth >= 720 ? settingsTriggerRef : undefined}
          returnFocusRef={layout.viewportWidth < 720 ? mobileSessionTriggerRef : undefined}
          backgroundInert={activeOverlay === "right"}
        >
          {dockState && (
            <LeftSidebar
              forceOpen
              files={dockState.files}
              onFileClick={dockState.onFileClick}
              onClear={dockState.onClearFiles}
              sessions={dockState.sessions}
              activeSessionId={dockState.activeSessionId}
              onSessionClick={dockState.onSessionClick}
              onSessionDelete={dockState.onSessionDelete}
              onNewChat={dockState.onNewChat}
            />
          )}
        </WorkspaceSessionDock>

        <main
          className="cws-center"
          style={{ minWidth: WORKSPACE_LAYOUT_LIMITS.centerMin }}
          aria-label="创作内容流"
          inert={activeOverlay ? true : undefined}
        >
          <div className="cws-conversation" hidden={mode !== "coze"} aria-hidden={mode !== "coze"} inert={mode !== "coze" ? true : undefined}>
          <CozeDialogueSurface active={mode === "coze"} conversation={cozeDialogue}>
          <CreativeConversationCore
            creativeContext={context}
            accessMode={accessMode}
            focusConversation={focusConversation}
            onAuthRequired={onAuthRequired}
            onSubmitRef={coreSubmitRef}
            onThinkingChange={setCozeSending}
            onTaskStatusChange={setCozeTaskStatus}
            onDialogueStateChange={onDialogueStateChange}
            draft=""
            onDraftChange={() => {}}
            collabPanel={null}
            showMemoryExclusions={mode === "coze"}
            onDockStateChange={setDockState}
          />
          </CozeDialogueSurface>
          </div>
          <UnifiedCreativeComposer
            mode={mode}
            onModeChange={setMode}
            accessMode={accessMode}
            onAuthRequired={onAuthRequired}
            onOpenModelCenter={onOpenModelCenter}
            context={context}
            onCozeSubmit={cozeSubmit}
            disabled={cozeSending}
            onCollabDispatched={() => {}}
            onLaunchRuntime={handleLaunchRuntime}
            onOpenResearchHistory={researchAdapter && accessMode === "authenticated" ? openResearchHistory : undefined}
            onAssistantInspection={onAssistantInspection}
            onWorkflowInspection={onWorkflowInspection}
            onCollaborationInspection={onCollaborationInspection}
            insertRevision={insertRequestRevision}
            insertFragment={context.promptFragment}
            lastInsertedRevision={lastInsertedRevision}
            onInserted={handleInserted}
          />
        </main>

        <AnimatePresence>
          {activeOverlay && (
            <motion.button
              key="workspace-side-scrim"
              type="button"
              className="cws-side-scrim"
              aria-label="关闭侧栏"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.16 }}
              onClick={closeActiveOverlay}
            />
          )}
        </AnimatePresence>

        <motion.aside
          ref={rightAsideRef}
          layout={rightResizing ? false : "size"}
          transition={{ layout: rightLayoutTransition }}
          className={`cws-right${rightResizing ? " is-resizing" : ""}`}
          data-mode={layout.rightMode}
          data-open={rightPanelVisible ? "true" : "false"}
          style={{ width: rightOccupiedWidth, minWidth: rightOccupiedWidth }}
          aria-label={rightRailVisible ? "上下文检查器（收起）" : imageParametersOpen ? "图像参数" : "上下文检查器"}
          inert={activeOverlay === "left" ? true : undefined}
        >
          {layout.rightMode === "docked" && (
            <button
              type="button"
              className="cws-right__separator"
              role="separator"
              aria-label="调整上下文检查器宽度"
              aria-orientation="vertical"
              aria-valuemin={WORKSPACE_LAYOUT_LIMITS.rightMin}
              aria-valuemax={WORKSPACE_LAYOUT_LIMITS.rightMax}
              aria-valuenow={Math.round(layout.rightWidth)}
              onPointerDown={startRightResize}
              onPointerMove={moveRightResize}
              onPointerUp={stopRightResize}
              onPointerCancel={stopRightResize}
              onKeyDown={resizeRightWithKeyboard}
            >
              <GripVertical aria-hidden="true" size={14} />
            </button>
          )}

          <motion.div
            className={`cws-right__rail-layer${layout.rightMode === "overlay" ? " is-overlay-trigger" : ""}`}
            initial={false}
            animate={rightRailAnimation}
            transition={panelTransition}
            aria-hidden={!rightRailVisible}
            inert={rightRailVisible ? undefined : true}
          >
            <LiquidGlassSurface variant="panel" className="cws-inspector-rail__surface">
              <button
                ref={layout.viewportWidth >= 720 ? rightTriggerRef : undefined}
                type="button"
                className="cws-inspector-rail__toggle"
                aria-label="打开上下文检查器"
                aria-expanded={rightPanelVisible}
                onClick={openRightInspector}
              >
                <PanelRightOpen size={16} />
              </button>
            </LiquidGlassSurface>
          </motion.div>

          <motion.div
            ref={rightPanelRef}
            className="cws-right__inspector-layer"
            initial={false}
            animate={rightPanelAnimation}
            transition={panelTransition}
            aria-hidden={!rightPanelVisible}
            inert={rightPanelVisible ? undefined : true}
          >
            {rightPanelContent === "image-parameters" ? (
              <CreativeImageParameterDrawer
                selectedParams={context.selectedParams}
                onSelectedParamsChange={(selectedParams) => {
                  setContext((current) => reduceCreativeContext(current, { selectedParams }));
                }}
                onClose={closeImageParameters}
                closeButtonRef={imageParameterCloseRef}
                isOverlay={activeOverlay === "right"}
              />
            ) : (
              <CreativeContextInspector
                mode={mode}
                context={context}
                cozeTaskStatus={cozeTaskStatus}
                assistantMeta={assistantMeta}
                workflowState={currentInspection.workflow || describeWorkflow({ selected: null, running: false, choosing: false })}
                collabState={currentInspection.collaboration || { projectName: "", roleCount: 0, stage: "", runId: null, risks: "", active: false }}
                onClose={closeRightInspector}
              />
            )}
          </motion.div>
        </motion.aside>
          </>
        )}
      </div>

      <AppearanceSettingsStudio
        open={studioOpen}
        onClose={() => {
          setStudioOpen(false);
        }}
        restoreFocusRef={settingsTriggerRef}
        appearance={wallpaperAppearance}
        onAppearanceChange={onWallpaperAppearanceChange}
        glassSettings={glassSettings}
        onGlassSettingsChange={handleGlassSettingsChange}
        themeId={themeId}
        onThemeChange={handleThemeChange}
      />
      {memoryOwner === ownerScope && user && accessMode === "authenticated" && <StudioMemoryManager key={ownerScope} mode={mode} onClose={() => setMemoryOwner(null)} />}
      {researchHistoryOpen && researchAdapter && (
        <ResearchRunHistoryDialog
          adapter={researchAdapter}
          onSelect={handleSelectResearchRun}
          onClose={closeResearchHistory}
        />
      )}
    </section>
  );
}
