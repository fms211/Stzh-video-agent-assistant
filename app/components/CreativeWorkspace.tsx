"use client";

// 创意工坊统一工作区 — CreativeWorkspace（规划 §1.2 三域工作台组合根）
// 上：CreativeParameterBar（Liquid Glass bar）；中：三域（WorkspaceSessionDock 左 /
//     中央创作流 / CreativeContextInspector 右）；底：UnifiedCreativeComposer（四模式）。
// 唯一拥有：mode、CreativeContext、researchRun、layout store 订阅、energy 聚合、
//          AppearanceSettingsStudio 开关与焦点恢复；玻璃配置由 ProductShell 按账号管理。

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GripVertical, PanelLeftOpen, PanelRightOpen, Settings2 } from "lucide-react";
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
import { DEFAULT_WALLPAPER_APPEARANCE, emptyCreativeContext, type CreativeContext, type CreativeWorkspaceMode, type GlassSettings, type WallpaperAppearance } from "@/app/lib/appearance-types";
import { useLiquidGlassSettings } from "./LiquidGlassProvider";
import { restoreWorkspaceLayoutStore, createWorkspaceLayoutPersister, workspaceResizeLimits, workspaceLeftExpandMode, WORKSPACE_LAYOUT_LIMITS, type DockMode, type LayoutPersistenceIssue } from "./workspace-layout-store";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { globalEnergyStore, useThemeEnergy } from "@/app/hooks/useThemeEnergy";
import { dataOwnerFromUser, currentDataOwner } from "@/app/lib/data-owner";
import type { ResearchRunSummary, ResearchRuntimeAdapter } from "@/app/lib/research-runtime/adapter";
import type { ResearchLaunchInput } from "@/app/lib/research-runtime/types";
import type { AccessMode } from "@/app/lib/entry-flow";
import { getThemeDefinition } from "@/app/lib/theme-registry";
import { useWorkspaceTheme } from "@/app/hooks/useWorkspaceTheme";
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

function restoreStoredWorkspaceLayout(scope: string, key: string) {
  return restoreWorkspaceLayoutStore({
    getItem: name => localStorage.getItem(name), setItem: (name, value) => localStorage.setItem(name, value),
  }, key, typeof window === "undefined" ? 1600 : window.innerWidth, () => {
    if (typeof window === "undefined") return false;
    const owner = currentDataOwner(localStorage);
    return (owner.kind === "account" ? `user:${owner.userId}` : "guest") === scope;
  });
}
function layoutIssueMessage(issue: LayoutPersistenceIssue) {
  if (issue === "read") return "本机布局读取未完成，当前使用临时布局。原记录未删除；可恢复存储后重新打开工坊，或保存当前布局。";
  if (issue === "format") return "本机布局记录格式异常，当前使用默认布局。原记录保留；保存当前布局会替换它。";
  return "当前布局调整尚未保存到本机；可恢复存储后重试。";
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
  const [mode, setMode] = useState<CreativeWorkspaceMode>("coze");
  const [memoryOwner, setMemoryOwner] = useState<string | null>(null);
  if (memoryOwner !== null && (memoryOwner !== ownerScope || accessMode !== "authenticated")) setMemoryOwner(null);
  const [context, setContext] = useState<CreativeContext>(() => emptyCreativeContext());
  const [lastInsertedRevision, setLastInsertedRevision] = useState(0);
  const [insertRequestRevision, setInsertRequestRevision] = useState(0);
  const [ownedCozeTaskStatus, setCozeTaskStatus] = useState<{ owner: string; active: boolean; label: string } | null>(null);
  const cozeTaskStatus = ownedCozeTaskStatus?.owner === ownerScope ? ownedCozeTaskStatus : null;
  const [cozeDialogue, setCozeDialogue] = useState<CozeDialogueState>({ scope: "", ready: false, hasMessages: false, firstSubmission: 0, panelOpen: false });
  const onDialogueStateChange = useCallback((next: CozeDialogueState) => {
    setCozeDialogue(previous => Object.keys(next).every(key => next[key as keyof CozeDialogueState] === previous[key as keyof CozeDialogueState]) ? previous : next);
  }, []);
  const currentCozeDialogue = cozeDialogue.scope.startsWith(`${user?.id ?? "guest"}:`) ? cozeDialogue : { scope: "", ready: false, hasMessages: false, firstSubmission: 0, panelOpen: false };
  const energyState = useThemeEnergy();
  const glassController = useLiquidGlassSettings();
  const glassSettings = glassController.settings;
  useEffect(() => () => glassController.cancel(), [glassController.cancel]);
  const themeController = useWorkspaceTheme(ownerScope);
  const themeId = themeController.theme;
  // research run 视图状态（从 CreativeStudio 迁移）
  const [researchView, setResearchView] = useState<{
    owner: string; adapter: ResearchRuntimeAdapter | null;
    runId: string; input: { styleName: string; useCase: string };
  } | null>(null);
  const currentResearchView = researchView?.owner === ownerScope && researchView.adapter === researchAdapter ? researchView : null;
  const researchRun = currentResearchView?.input ?? null;
  const researchRunId = currentResearchView?.runId ?? null;
  const [researchNotice, setResearchNotice] = useState<{ owner: string; adapter: ResearchRuntimeAdapter | null; message: string } | null>(null);
  const researchLaunchError = researchNotice?.owner === ownerScope && researchNotice.adapter === researchAdapter ? researchNotice.message : "";
  const setResearchLaunchError = useCallback((message: string) => {
    setResearchNotice({ owner: ownerScope, adapter: researchAdapter, message });
  }, [ownerScope, researchAdapter]);
  const [researchHistoryOpen, setResearchHistoryOpen] = useState(false);
  const researchActiveKey = `tszh:v2:${ownerScope}:research-active-run`;
  const researchSelectionRevision = useRef(0);
  const researchLaunchPending = useRef<symbol | null>(null);

  useLayoutEffect(() => {
    researchSelectionRevision.current++;
    researchLaunchPending.current = null;
    return () => {
      researchSelectionRevision.current++;
      researchLaunchPending.current = null;
    };
  }, [ownerScope, researchAdapter]);

  useEffect(() => {
    const revision = ++researchSelectionRevision.current;
    const current = () => revision === researchSelectionRevision.current;
    setResearchView(null);
    setResearchLaunchError("");
    let saved: string | null = null;
    try { saved = ownerScope !== "guest" ? localStorage.getItem(researchActiveKey) : null; }
    catch { setResearchLaunchError("无法读取本机研究入口，可从研究历史重新打开已保存的任务。"); }
    if (saved && researchAdapter) {
      void researchAdapter.getRun(saved).then((snapshot) => {
        if (current()) setResearchView({ owner: ownerScope, adapter: researchAdapter, runId: snapshot.runId, input: snapshot.input });
      }).catch((error) => {
        if (current()) setResearchLaunchError(error instanceof Error ? error.message : "恢复研究任务失败");
      });
    }
    return () => { researchSelectionRevision.current++; };
  }, [researchActiveKey, researchAdapter, ownerScope, setResearchLaunchError]);
  // 布局 store（owner-scoped 持久化）
  const layoutStorageKey = `tszh:v2:${ownerScope}:workspace-layout`;
  const [ownedLayout, setOwnedLayout] = useState(() => ({
    owner: ownerScope,
    store: restoreStoredWorkspaceLayout(ownerScope, layoutStorageKey),
  }));
  const currentLayout = ownedLayout.owner === ownerScope ? ownedLayout : {
    owner: ownerScope,
    store: restoreStoredWorkspaceLayout(ownerScope, layoutStorageKey),
  };
  if (currentLayout !== ownedLayout) setOwnedLayout(currentLayout);
  const layoutStore = currentLayout.store;
  const layout = useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot);
  const resizeLimits = workspaceResizeLimits(layout);
  const [ownedLayoutNotice, setLayoutNotice] = useState<{ owner: string; store: typeof layoutStore; message: string } | null>(null);
  const layoutNotice = ownedLayoutNotice?.owner === ownerScope && ownedLayoutNotice.store === layoutStore ? ownedLayoutNotice.message : "";
  const layoutPersistenceRef = useRef<{ owner: string; store: typeof layoutStore; persister: ReturnType<typeof createWorkspaceLayoutPersister>; allowAutomaticSave: boolean } | null>(null);
  const retryLayoutSave = useCallback(() => {
    const active = layoutPersistenceRef.current;
    if (!active || active.owner !== ownerScope || active.store !== layoutStore) return;
    active.allowAutomaticSave = true;
    active.persister.save(layoutStore.getSnapshot()); active.persister.flush();
  }, [layoutStore, ownerScope]);
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

  const handleGlassSettingsChange = useCallback((next: GlassSettings) => {
    glassController.save(next);
    // These are separate local records. Report a partial save instead of
    // claiming the already committed glass settings were not saved.
    try {
      if (!onWallpaperAppearanceChange) return { wallpaperLinked: false };
      onWallpaperAppearanceChange({ ...wallpaperAppearance, dim: next.wallpaperDim });
      return { wallpaperLinked: true };
    } catch {
      return { wallpaperLinked: false };
    }
  }, [glassController.save, onWallpaperAppearanceChange, wallpaperAppearance]);

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
      if (layoutStore.getSnapshot().rightMode === "overlay") setRightOverlayOpen(true);
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
      // Native dialogs own Escape. Let their cancel handler close or confirm
      // the foreground window without dismissing its background sidebar.
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
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
      if (layoutStore.getSnapshot().rightMode === "overlay") setRightOverlayOpen(true);
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
        resizeLimits.rightMax,
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
      Math.min(resizeLimits.rightMax, rightDragState.current?.latestWidth ?? layout.rightWidth),
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
    else if (event.key === "End") layoutStore.setRightWidth(resizeLimits.rightMax);
    else return;
    event.preventDefault();
  };

  useEffect(() => () => {
    if (rightResizeFrameRef.current !== null) cancelAnimationFrame(rightResizeFrameRef.current);
  }, []);

  // Subscribe once per owner/store: changes debounce, navigation commits the last pending value.
  useEffect(() => {
    let mounted = true;
    const persister = createWorkspaceLayoutPersister(layoutStorageKey, {
      current: () => {
        const owner = currentDataOwner(localStorage);
        return (owner.kind === "account" ? `user:${owner.userId}` : "guest") === ownerScope;
      },
      onFailure: issue => { if (mounted) setLayoutNotice({ owner: ownerScope, store: layoutStore, message: layoutIssueMessage(issue) }); },
      onSaved: () => { if (mounted) setLayoutNotice(null); },
    });
    persister.attach({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
    const active = { owner: ownerScope, store: layoutStore, persister, allowAutomaticSave: !layoutStore.restoreIssue };
    layoutPersistenceRef.current = active;
    setLayoutNotice(layoutStore.restoreIssue ? { owner: ownerScope, store: layoutStore, message: layoutIssueMessage(layoutStore.restoreIssue) } : null);
    // Reading/default restoration never overwrites an existing record automatically.
    const unsubscribe = layoutStore.subscribe(() => { if (active.allowAutomaticSave) persister.save(layoutStore.getSnapshot()); });
    const commit = () => { persister.flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") commit(); };
    window.addEventListener("pagehide", commit);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false; unsubscribe();
      persister.flush(); persister.cancel();
      window.removeEventListener("pagehide", commit);
      document.removeEventListener("visibilitychange", onVisibility);
      if (layoutPersistenceRef.current === active) layoutPersistenceRef.current = null;
    };
  }, [layoutStore, layoutStorageKey, ownerScope]);

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
        if (closed) return;
        globalEnergyStore.setSource("research", event.type === "run.started" || event.type === "run.resumed" ? "running" : event.type === "run.completed" || event.type === "run.failed" ? "idle" : "busy");
      },
      onError() {},
    });
    return () => {
      closed = true;
      sub.close();
      globalEnergyStore.setSource("research", "idle");
    };
  }, [researchRunId, researchAdapter]);

  // Prompt, selected files and acceptance state travel through the same boundary.
  const coreSubmitRef = useRef<ConversationSubmit | null>(null);
  const [ownedCozeSending, setOwnedCozeSending] = useState({ owner: ownerScope, sending: false });
  const cozeSending = ownedCozeSending.owner === ownerScope && ownedCozeSending.sending;
  const setCozeSending = useCallback((sending: boolean) => {
    const current = currentDataOwner(localStorage);
    const currentScope = current.kind === "account" ? `user:${current.userId}` : "guest";
    if (currentScope === ownerScope) setOwnedCozeSending({ owner: ownerScope, sending });
  }, [ownerScope]);
  const cozeSubmit = useCallback((prompt: string, files: File[]) => {
    return coreSubmitRef.current?.(prompt, files) ?? false;
  }, []);

  // handleLaunchRuntime（从 CreativeStudio 迁移：style-research → workbench）
  const handleLaunchRuntime = useCallback(async (input: ResearchLaunchInput) => {
    if (accessMode !== "authenticated") { onAuthRequired(); return false; }
    if (!researchAdapter || researchLaunchPending.current) return false;
    const token = Symbol("research-launch");
    researchLaunchPending.current = token;
    const revision = ++researchSelectionRevision.current;
    const current = () => revision === researchSelectionRevision.current && researchLaunchPending.current === token;
    setResearchLaunchError("");
    try {
      const snapshot = await researchAdapter.createRun({ ...input, providerId: input.providerId || null, projectId: input.projectId || null });
      // A newer selection owns the screen; creation success must not override it.
      if (!current()) return true;
      setResearchView({ owner: ownerScope, adapter: researchAdapter, runId: snapshot.runId, input: snapshot.input });
      try { localStorage.setItem(researchActiveKey, snapshot.runId); }
      catch { setResearchLaunchError("研究任务已创建并打开，但本机无法记住入口。请从研究历史重新打开，不必重复创建。"); }
      return true;
    } catch (error) {
      if (current()) setResearchLaunchError(error instanceof Error ? error.message : "创建研究任务失败");
      return false;
    } finally {
      if (researchLaunchPending.current === token) researchLaunchPending.current = null;
    }
  }, [researchAdapter, accessMode, onAuthRequired, researchActiveKey, ownerScope, setResearchLaunchError]);

  const handleExitWorkbench = useCallback(() => {
    researchSelectionRevision.current++;
    setResearchView(null);
    setResearchLaunchError("");
    try { localStorage.removeItem(researchActiveKey); }
    catch { setResearchLaunchError("已返回工坊，但本机最近任务入口未清除。刷新后可能再次恢复此任务；服务端任务没有被取消。"); }
  }, [researchActiveKey, setResearchLaunchError]);

  const openResearchHistory = useCallback(() => setResearchHistoryOpen(true), []);
  const closeResearchHistory = useCallback(() => setResearchHistoryOpen(false), []);
  const handleSelectResearchRun = useCallback((run: ResearchRunSummary) => {
    researchSelectionRevision.current++;
    setResearchLaunchError("");
    setResearchView({ owner: ownerScope, adapter: researchAdapter, runId: run.runId, input: run.input });
    setMode("workflow");
    try { localStorage.setItem(researchActiveKey, run.runId); }
    catch { setResearchLaunchError("已打开研究任务，但本机无法记住入口；重新打开页面后可从研究历史选择。"); }
  }, [researchActiveKey, ownerScope, researchAdapter, setResearchLaunchError]);

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
  const [ownedDockState, setDockState] = useState<{
    owner: string;
    sessions: HistorySession[];
    files: StagedFile[];
    activeSessionId: string;
    onSessionClick: (id: string) => void;
    onSessionDelete: (id: string) => void;
    onNewChat: () => void;
    onFileClick: (f: StagedFile) => void;
    onClearFiles: () => void;
  } | null>(null);

  const dockState = ownedDockState?.owner === ownerScope ? ownedDockState : null;

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
      {researchLaunchError && <p role="alert" className="cws-inspector__risk">{researchLaunchError}</p>}
      {layoutNotice && <div className="auth-session-notice" role="status">
        <p>{layoutNotice}</p><button type="button" onClick={retryLayoutSave}>保存当前布局</button>
      </div>}

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
          maxWidth={resizeLimits.leftMax}
          onModeChange={handleLeftModeChange}
          onWidthChange={(width) => layoutStore.setLeftWidth(width)}
          expandMode={workspaceLeftExpandMode(layout)}
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
          <CozeDialogueSurface active={mode === "coze"} conversation={currentCozeDialogue}>
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
              aria-valuemax={resizeLimits.rightMax}
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
        key={`appearance:${ownerScope}`}
        open={studioOpen}
        onClose={() => {
          glassController.cancel();
          setStudioOpen(false);
        }}
        restoreFocusRef={settingsTriggerRef}
        appearance={wallpaperAppearance}
        onAppearanceChange={onWallpaperAppearanceChange}
        glassSettings={glassSettings}
        onGlassSettingsChange={handleGlassSettingsChange}
        onGlassSettingsPreview={glassController.preview}
        themeId={themeId}
        onThemeChange={themeController.choose}
        themeStatus={themeController}
        onThemeRetry={themeController.retrySync}
      />
      {memoryOwner === ownerScope && user && accessMode === "authenticated" && <StudioMemoryManager key={`memory:${ownerScope}`} mode={mode} onClose={() => setMemoryOwner(null)} />}
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
