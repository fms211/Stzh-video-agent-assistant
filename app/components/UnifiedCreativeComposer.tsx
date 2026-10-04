"use client";

// 创意工坊统一工作区 — UnifiedCreativeComposer（规划 §1.4 底部统一输入工作栏）
// 固定四模式：Coze 创作 / 单助手 / 工作流 / 协作编排。
// 行为边界：四模式各自保存草稿；切换模式不得清空其他模式输入；
// 发送按钮/附件/参数插入/错误状态随当前模式变化。
// 禁止复制后端调用逻辑：assistant/workflow 复用 ModelAssistantPanel（callModel 已在其内），
// collaboration 复用 CollaborativeRunPanel（onRunningChange 上报能谱）。

import { Activity, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import ChatInput from "./ChatInput";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { useAuth } from "./AuthProvider";
import { globalEnergyStore } from "@/app/hooks/useThemeEnergy";
import type { AccessMode } from "@/app/lib/entry-flow";
import type { ResearchLaunchInput } from "@/app/lib/research-runtime/types";
import type { CreativeContext, CreativeWorkspaceMode } from "@/app/lib/appearance-types";
import { creativeConstraints } from "@/app/lib/creative-context";
import { CREATIVE_WORKSPACE_MODES } from "@/app/lib/appearance-types";
import { CREATIVE_MOTION, createDirectionalVariants, motionDirection } from "@/app/lib/creative-motion";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";
import { createComposerDrafts, readComposerDrafts, switchComposerDraftOwner, updateComposerDrafts, writeComposerDrafts, type ComposerDrafts } from "@/app/lib/composer-drafts";
import type { AssistantInspectorState, WorkflowInspectorState, CollaborationInspectorState } from "@/app/lib/studio-inspector-state";

const loadModelAssistantPanel = () => import("./ModelAssistantPanel");
const loadCollaborativeRunPanel = () => import("./CollaborativeRunPanel");

const ModelAssistantPanel = dynamic(loadModelAssistantPanel, { ssr: false });
const CollaborativeRunPanel = dynamic(loadCollaborativeRunPanel, { ssr: false });

type Props = {
  mode: CreativeWorkspaceMode;
  onModeChange: (mode: CreativeWorkspaceMode) => void;
  accessMode: AccessMode;
  onAuthRequired: () => void;
  onOpenModelCenter?: () => void;
  context: CreativeContext;
  /** Coze 模式提交（经 ConversationCore 的 requestPrompt 链路） */
  onCozeSubmit: (prompt: string, files: File[]) => boolean | void;
  /** 协作确认投递回执 */
  onCollabDispatched: (taskId: string) => void;
  /** 工作流运行时启动（style-research → ResearchWorkbench） */
  onLaunchRuntime?: (input: ResearchLaunchInput) => void | Promise<boolean>;
  /** 打开当前账户保存的研究运行记录 */
  onOpenResearchHistory?: () => void;
  /** 插入到输入的参数片段（revision 去重由 Workspace 层持有） */
  insertFragment?: string;
  insertRevision?: number;
  lastInsertedRevision?: number;
  onInserted?: (revision: number) => void;
  onAssistantSendingChange?: (sending: boolean) => void;
  onAssistantInspection?: (state: AssistantInspectorState) => void;
  onWorkflowInspection?: (state: WorkflowInspectorState) => void;
  onCollaborationInspection?: (state: CollaborationInspectorState) => void;
  disabled?: boolean;
};

const MODE_LABELS: Record<CreativeWorkspaceMode, string> = {
  coze: "Coze 创作",
  assistant: "单助手",
  workflow: "工作流",
  collaboration: "协作编排",
};

export function UnifiedCreativeComposer({
  mode,
  onModeChange,
  accessMode,
  onAuthRequired,
  onOpenModelCenter,
  context,
  onCozeSubmit,
  onCollabDispatched,
  onLaunchRuntime,
  onOpenResearchHistory,
  insertFragment,
  insertRevision,
  lastInsertedRevision,
  onInserted,
  onAssistantSendingChange,
  onAssistantInspection,
  onWorkflowInspection,
  onCollaborationInspection,
  disabled = false,
}: Props) {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const { reducedMotion } = useCreativeMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousModeRef = useRef(mode);
  const direction = motionDirection(CREATIVE_WORKSPACE_MODES, previousModeRef.current, mode);
  const cozeActive = mode === "coze";
  const assistantActive = mode === "assistant";
  const workflowActive = mode === "workflow";
  const collaborationActive = mode === "collaboration";

  // 四模式草稿独立（规划 §1.4：切换不得清空其他模式输入）
  const draftOwner = user ? `user:${user.id}` : "guest";
  const [draftState, setDraftState] = useState(() => createComposerDrafts(draftOwner));
  const currentDraftState = switchComposerDraftOwner(draftState, draftOwner);
  if (currentDraftState !== draftState) setDraftState(currentDraftState);
  const drafts = currentDraftState.byOwner[draftOwner];
  const [restoredDraftOwner, setRestoredDraftOwner] = useState<string | null>(null);
  const [draftStorageWarning, setDraftStorageWarning] = useState("");
  const setDrafts = (update: (value: ComposerDrafts) => ComposerDrafts) => {
    setDraftState(previous => updateComposerDrafts(previous, draftOwner, update));
  };
  useEffect(() => {
    const saved = readComposerDrafts(sessionStorage, draftOwner);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDraftState(previous => {
        const current = switchComposerDraftOwner(previous, draftOwner);
        return saved ? { ...current, byOwner: { ...current.byOwner, [draftOwner]: saved } } : current;
      });
      setRestoredDraftOwner(draftOwner);
    });
    return () => { cancelled = true; };
  }, [draftOwner]);
  useEffect(() => {
    if (restoredDraftOwner !== draftOwner) return;
    let warning = "";
    try {
      writeComposerDrafts(sessionStorage, draftOwner, drafts);
    } catch {
      warning = "本次浏览器会话无法保留未发送的草稿，请在刷新前复制内容。";
    }
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setDraftStorageWarning(warning); });
    return () => { cancelled = true; };
  }, [draftOwner, drafts, restoredDraftOwner]);
  const [errors, setErrors] = useState<Partial<Record<CreativeWorkspaceMode, string>>>({});
  const [assistantSending, setAssistantSending] = useState(false);
  const [collabRunning, setCollabRunning] = useState(false);
  const [visitedModes, setVisitedModes] = useState<Set<CreativeWorkspaceMode>>(() => new Set(["coze"]));

  const visitMode = (next: CreativeWorkspaceMode) => {
    setVisitedModes((current) => {
      if (current.has(next)) return current;
      const nextVisitedModes = new Set(current);
      nextVisitedModes.add(next);
      return nextVisitedModes;
    });
  };

  const switchMode = (next: CreativeWorkspaceMode) => {
    if (next === mode) return;
    visitMode(next);
    onModeChange(next);
  };

  const preloadMode = (next: CreativeWorkspaceMode) => {
    if (next === "assistant" || next === "workflow") {
      void loadModelAssistantPanel();
    } else if (next === "collaboration") {
      void loadCollaborativeRunPanel();
    }
  };

  useEffect(() => {
    previousModeRef.current = mode;
    visitMode(mode);
    // `mode` may also change from a parent-side route or restore action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const modeVariants = useMemo(
    () => createDirectionalVariants({ offset: 4, reducedMotion, scale: 1, enterTransition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }),
    [reducedMotion],
  );

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + CREATIVE_WORKSPACE_MODES.length) % CREATIVE_WORKSPACE_MODES.length;
    else if (event.key === "ArrowRight") nextIndex = (index + 1) % CREATIVE_WORKSPACE_MODES.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = CREATIVE_WORKSPACE_MODES.length - 1;
    else return;
    event.preventDefault();
    switchMode(CREATIVE_WORKSPACE_MODES[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  // 参数片段插入（revision 去重）：仅写入当前 mode 草稿
  useEffect(() => {
    if (!insertFragment || typeof insertRevision !== "number") return;
    if (typeof lastInsertedRevision === "number" && insertRevision <= lastInsertedRevision) return;
    setDrafts((prev) => ({ ...prev, [mode]: prev[mode] ? `${prev[mode]} ${insertFragment}` : insertFragment }));
    onInserted?.(insertRevision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertFragment, insertRevision]);

  // 能谱协作信号
  useEffect(() => {
    globalEnergyStore.setSource("collab", collabRunning ? "running" : "idle");
    return () => globalEnergyStore.clearSource("collab");
  }, [collabRunning]);

  useEffect(() => {
    globalEnergyStore.setSource("assistant", assistantSending ? "busy" : "idle");
    onAssistantSendingChange?.(assistantSending);
    return () => globalEnergyStore.clearSource("assistant");
  }, [assistantSending, onAssistantSendingChange]);

  const assistantOpc = useMemo(() => ({
    stylePrefix: context.styleLabel,
    duration: context.durationSeconds,
    aspect: context.aspect,
    cameraMove: context.cameraMoveLabel,
    selectedParams: context.selectedParams,
  }), [context]);

  const renderVisitedMode = (m: CreativeWorkspaceMode, modeActive: boolean, content: () => ReactNode) => {
    // External mode changes arrive before the effect can persist the mode as visited.
    // Rendering the active mode immediately prevents a blank frame; the effect above
    // records it for subsequent Activity preservation.
    const shouldRender = m === mode || visitedModes.has(m);
    if (!shouldRender) return null;
    return (
      <Activity mode={modeActive ? "visible" : "hidden"}>
        <motion.div
          className="cws-composer__mode"
          custom={direction}
          variants={modeVariants}
          initial="enter"
          animate={modeActive ? "active" : "inactive"}
          aria-hidden={!modeActive}
          inert={!modeActive}
          style={{ width: "100%", pointerEvents: modeActive ? "auto" : "none" }}
        >
          {content()}
        </motion.div>
      </Activity>
    );
  };

  return (
    <LiquidGlassSurface variant="capsule" className="cws-composer" data-testid="unified-composer" style={{ position: "relative" }}>
      <div className="cws-composer__tabs" role="tablist" aria-label="创作模式">
        {CREATIVE_WORKSPACE_MODES.map((m, index) => (
          <motion.button
            ref={(node) => { tabRefs.current[index] = node; }}
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            tabIndex={mode === m ? 0 : -1}
            className={`cws-composer__tab${mode === m ? " is-active" : ""}`}
            onClick={() => switchMode(m)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            onMouseEnter={() => preloadMode(m)}
            onFocus={() => preloadMode(m)}
            whileHover={reducedMotion ? { opacity: 0.96 } : { y: -1 }}
            whileTap={reducedMotion
              ? { opacity: 0.9, transition: { duration: CREATIVE_MOTION.reducedMotionDuration } }
              : { scale: CREATIVE_MOTION.pressScale, transition: { duration: CREATIVE_MOTION.pressDuration } }}
            transition={{ duration: reducedMotion ? CREATIVE_MOTION.reducedMotionDuration : CREATIVE_MOTION.hoverDuration }}
          >
            {mode === m && (
              reducedMotion ? (
                <span aria-hidden="true" className="cws-composer__active-pill" />
              ) : (
                <motion.span
                  aria-hidden="true"
                  className="cws-composer__active-pill"
                  layoutId="creative-composer-active-pill"
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                />
              )
            )}
            {MODE_LABELS[m]}
          </motion.button>
        ))}
      </div>

      <div className="cws-composer__content">
        {renderVisitedMode("coze", cozeActive,
          () => <ChatInput key={`${draftOwner}:coze`} onSubmit={onCozeSubmit} disabled={disabled} fillText={drafts.coze} onTextChange={(value) => setDrafts((prev) => ({ ...prev, coze: value }))} onFilesAdded={() => {}} />,
        )}
        {renderVisitedMode("assistant", assistantActive,
          () => <ModelAssistantPanel key={`${user?.id ?? "guest"}:assistant`} seed="" draftValue={drafts.assistant} onDraftChange={(value) => setDrafts((prev) => ({ ...prev, assistant: value }))} opcContext={assistantOpc} remoteEnabled={accessMode === "authenticated"} onAuthRequired={onAuthRequired} onOpenModelCenter={onOpenModelCenter} onSeedConsumed={() => {}} onSendingChange={(sending) => setAssistantSending(sending)} onAssistantInspection={onAssistantInspection} compact />,
        )}
        {renderVisitedMode("workflow", workflowActive,
          () => <ModelAssistantPanel key={`${user?.id ?? "guest"}:workflow`} seed="" draftValue={drafts.workflow} onDraftChange={(value) => setDrafts((prev) => ({ ...prev, workflow: value }))} opcContext={assistantOpc} remoteEnabled={accessMode === "authenticated"} onAuthRequired={onAuthRequired} onOpenModelCenter={onOpenModelCenter} onSeedConsumed={() => {}} onLaunchRuntime={onLaunchRuntime} onOpenResearchHistory={onOpenResearchHistory} onWorkflowInspection={onWorkflowInspection} initialMode="workflow" compact />,
        )}
        {renderVisitedMode("collaboration", collaborationActive,
          () => <CollaborativeRunPanel currentConstraints={creativeConstraints(context)} compact signedIn={signedIn} draftValue={drafts.collaboration} onDraftChange={(value) => setDrafts(prev => ({ ...prev, collaboration: value }))} onAuthRequired={onAuthRequired} onDispatch={(taskId) => { setCollabRunning(false); onCollabDispatched(taskId); }} onRunningChange={setCollabRunning} onInspection={onCollaborationInspection} />,
        )}
      </div>

      {errors[mode] && (
        <p className="cws-composer__error" role="alert">{errors[mode]}</p>
      )}
      {draftStorageWarning && <p className="cws-composer__error" role="alert">{draftStorageWarning}</p>}
    </LiquidGlassSurface>
  );
}
