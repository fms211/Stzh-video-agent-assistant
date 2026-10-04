"use client";

// 创意工坊统一工作区 — CreativeConversationCore（规划 §5.2：从 ChatFlow 抽离）
// 承载：会话生命周期、消息列表渲染、可靠任务链路（uploadAttachments/createTask/getTask/11min 轮询）、
//       建议/导出/重试、插件槽位 chat.message.after。
// 不拥有：侧栏 portal（移入 WorkspaceSessionDock）、底部 Composer（移入 UnifiedCreativeComposer）、
//        Welcome 定位（由 Workspace 布局层决定）。collabPanel 由上层注入。

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { AlertCircle, ChevronDown, Download } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { StudioContextTrace } from "./StudioContextTrace";
import { DialogueLatticeLoader } from "./DialogueLatticeLoader";
import { isPendingDialogueReply } from "@/app/lib/dialogue-loader-settings";
import ResultCard from "./ResultCard";
import MarkdownRenderer from "./MarkdownRenderer";
import WelcomeScreen from "./WelcomeScreen";
import { PluginSlot } from "./plugin-slots/PluginSlot";
import { notify } from "@/app/lib/notify";
import { logCall, logGeneration } from "@/app/lib/tracker";
import { useAuth } from "./AuthProvider";
import { createConversation, createTask, getTask, getToken, uploadAttachments } from "@/app/lib/auth";
import { RequestMemoryExclusions, useRequestMemoryExclusions } from "./RequestMemoryExclusions";
import { waitForTask, TaskTerminalError } from "@/app/lib/wait-for-task";
import { useCozeTaskRecovery } from "@/app/hooks/useCozeTaskRecovery";
import { cozeTaskLabel, cozeRecoveryStatus } from "@/app/lib/coze-task-recovery";
import { saveFileDownload } from "@/app/lib/media-download";
import { exportCozeConversation } from "@/app/lib/coze-export";
import { usePreferences } from "@/app/hooks/usePreferences";
import { useConversationRecovery } from "@/app/hooks/useConversationRecovery";
import { useSessionProject } from "@/app/hooks/useSessionProject";
import { prepareCozeHistory } from "@/shared/coze-history.cjs";
import { creativeConstraints } from "@/app/lib/creative-context";
import { currentDataOwner, ownerScope } from "@/app/lib/data-owner";
import type { CreativeContext } from "@/app/lib/appearance-types";
import { ResearchProjectSelect } from "./research-workbench/ResearchProjectSelect";
import { StudioProjectNotes } from "./StudioProjectNotes";
import { canUseWorkspaceCapability } from "@/app/lib/access-policy";
import type { AccessMode } from "@/app/lib/entry-flow";
import { globalEnergyStore } from "@/app/hooks/useThemeEnergy";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";
import { useCozeDialoguePhase } from "./CozeDialogueSurface";
import type { CozeDialogueState } from "@/app/lib/coze-dialogue-settings";
import type { HistorySession, StagedFile } from "./LeftSidebar";

// 注意：LeftSidebar/ChatInput 的类型导入仅用于类型；渲染主体已移出。

type AgentPayload = {
  requestId: string; createdAt?: string;
  videoUrl?: string; imageUrls?: string[]; raw?: unknown;
};

type ChatMessage = {
  id: string; role: "user" | "agent";
  text?: string; payload?: AgentPayload;
  contextTrace?: unknown;
  textIsPayload?: boolean;
  isError?: boolean; errorText?: string;
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 使用 sync 模块的函数（支持 localStorage + 服务端同步）
import {
  loadSessions as syncLoadSessions,
  saveSessions as syncSaveSessions,
  loadMessages as syncLoadMessages,
  saveMessages as syncSaveMessages,
  removeMessages as syncRemoveMessages,
  getActiveSessionId,
  setActiveSessionId,
  fetchServerSessions,
} from "@/app/lib/sync";

function loadSessions(): HistorySession[] { return syncLoadSessions(); }
function saveSessions(s: HistorySession[], options?: { localOnly?: boolean }) { syncSaveSessions(s, options); }
function loadMessages(id: string): ChatMessage[] { return syncLoadMessages(id); }
function saveMessages(id: string, msgs: ChatMessage[]) { syncSaveMessages(id, msgs); }
function deleteMessages(id: string) { syncRemoveMessages(id); }
function getActiveId(): string | null { return getActiveSessionId(); }
function setActiveId(id: string | null) { setActiveSessionId(id); }

export type ConversationSubmit = (prompt: string, files?: File[]) => boolean | void;

function readConversationDataScope() {
  if (typeof window === "undefined") return { owner: "guest", token: null as string | null };
  return { owner: ownerScope(currentDataOwner(localStorage)), token: getToken() };
}

type Props = {
  creativeContext?: CreativeContext;
  accessMode: AccessMode;
  focusConversation?: { id: string; owner: number; revision: number } | null;
  onAuthRequired: (draft?: string) => void;
  onThinkingChange?: (v: boolean) => void;
  onMessageSent?: () => void;
  onReset?: () => void;
  onTaskStatusChange?: (status: { owner: string; active: boolean; label: string } | null) => void;
  onDialogueStateChange?: (state: CozeDialogueState) => void;
  onGoHome?: () => void;
  onSubmitRef?: React.MutableRefObject<ConversationSubmit | null>;
  onNewChat?: () => void;
  showWelcome?: boolean;
  onWelcomeStart?: (prompt?: string) => void;
  insertFragment?: string;
  insertRevision?: number;
  lastInsertedRevision?: number;
  onInserted?: (revision: number) => void;
  draft: string;
  onDraftChange: (v: string) => void;
  collabPanel?: React.ReactNode;
  showMemoryExclusions?: boolean;
  /** 会话坞状态上提（sessions/stagedFiles/activeSessionId + 操作，供 WorkspaceSessionDock 渲染） */
  onDockStateChange?: (state: {
    owner: string;
    sessions: HistorySession[];
    files: StagedFile[];
    activeSessionId: string;
    onSessionClick: (id: string) => void;
    onSessionDelete: (id: string) => void;
    onNewChat: () => void;
    onFileClick: (f: StagedFile) => void;
    onClearFiles: () => void;
  }) => void;
};

const inputTabVariants = {
  enter: (direction: 1 | -1) => ({ x: direction > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: 1 | -1) => ({ x: direction > 0 ? -200 : 200, opacity: 0 }),
};

export default function CreativeConversationCore({
  creativeContext,
  accessMode,
  focusConversation,
  onAuthRequired,
  onThinkingChange,
  onMessageSent,
  onReset,
  onTaskStatusChange,
  onDialogueStateChange,
  onGoHome,
  onSubmitRef,
  onNewChat,
  showWelcome,
  onWelcomeStart,
  insertFragment,
  insertRevision,
  lastInsertedRevision,
  onInserted,
  draft,
  onDraftChange,
  collabPanel,
  showMemoryExclusions = true,
  onDockStateChange,
}: Props) {
  const { user } = useAuth();
  const { prefs } = usePreferences();
  const [dataScope, setDataScope] = useState(readConversationDataScope);
  const dataScopeRef = useRef(dataScope);
  const viewerOwner = user ? `user:${user.id}` : "guest";
  const isCurrentDataScope = () => {
    const current = readConversationDataScope();
    return dataScope.owner === viewerOwner && dataScope.owner === current.owner && dataScope.token === current.token;
  };
  const dataReady = isCurrentDataScope();
  const [sessionId, setSessionId] = useState<string>("");
  const sessionProject = useSessionProject(user?.id,sessionId);
  const projectId = sessionProject.projectId;
  const exclusionScope = `${user?.id ?? "guest"}:coze:${sessionId}:${projectId}`;
  const memoryExclusions = useRequestMemoryExclusions(exclusionScope);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const sessionsRef = useRef<HistorySession[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const dialogueScope = `${user?.id ?? "guest"}:${sessionId}`;
  const dialoguePhase = useCozeDialoguePhase();
  const [recoveryState, setRecoveryState] = useState({ scope: "", pending: true });
  const [firstSubmission, setFirstSubmission] = useState({ scope: "", revision: 0 });
  const invalidateHistoryRecovery = useConversationRecovery(sessionId, user?.id, hydrated, setMessages, setRecoveryState);
  const [isThinking, setIsThinking] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ scope: string; error: boolean; message: string } | null>(null);
  const submittingRef = useRef(false);
  const submissionRevision = useRef(0);
  useEffect(() => () => { submissionRevision.current += 1; }, []);
  const [pendingMessage, setPendingMessage] = useState<{ id: string; sessionId: string; owner: number | undefined; taskStatus?: string } | null>(null);
  const [taskRecoveryRevision, setTaskRecoveryRevision] = useState(0);
  const taskRecovery = useCozeTaskRecovery(sessionId, user?.id, hydrated && dataReady && !!user, setMessages, taskRecoveryRevision);
  const isBusy = isThinking || Object.keys(taskRecovery.tasks).length > 0;
  useEffect(() => { onThinkingChange?.(isBusy); }, [isBusy, onThinkingChange]);
  useEffect(() => {
    const recoveryStatus = cozeRecoveryStatus(taskRecovery);
    if (recoveryStatus) onTaskStatusChange?.({ owner: dataScope.owner, ...recoveryStatus });
    else if (!isThinking) onTaskStatusChange?.(null);
    if (pendingMessage && taskRecovery.settled.includes(pendingMessage.id) && !submittingRef.current) {
      setPendingMessage(null); setIsThinking(false);
    }
  }, [taskRecovery.label, taskRecovery.error, taskRecovery.loading, taskRecovery.settled, pendingMessage, isThinking, dataScope.owner, onTaskStatusChange]);
  const [contextPanel, setContextPanel] = useState<{ scope: string; panel: "project" | "memory" | null }>({ scope: "", panel: null });
  const [projectCaption, setProjectCaption] = useState({ id: "", name: "" });
  const contextId = useId();
  const projectTrigger = useRef<HTMLButtonElement>(null);
  const memoryTrigger = useRef<HTMLButtonElement>(null);
  const openContextPanel = contextPanel.scope === exclusionScope ? contextPanel.panel : null;
  useEffect(() => {
    onDialogueStateChange?.({
      scope: dialogueScope,
      ready: dataReady && hydrated && !!sessionId && (!user || messages.length > 0 || (recoveryState.scope === dialogueScope && !recoveryState.pending)),
      hasMessages: dataReady && messages.length > 0,
      firstSubmission: firstSubmission.scope === dialogueScope ? firstSubmission.revision : 0,
      panelOpen: dataReady && !!openContextPanel,
    });
  }, [dialogueScope, dataReady, hydrated, sessionId, user, messages.length, recoveryState, firstSubmission, openContextPanel, onDialogueStateChange]);
  const handleProjectNameChange = useCallback((name: string) => {
    setProjectCaption(previous => previous.id === projectId && previous.name === name ? previous : { id: projectId, name });
  }, [projectId]);
  const resetPendingRequest = useCallback(() => {
    submissionRevision.current += 1;
    submittingRef.current = false;
    setPendingMessage(null);
    setIsThinking(false);
    globalEnergyStore.clearSource("coze-task");
    onThinkingChange?.(false);
    onTaskStatusChange?.(null);
  }, [onThinkingChange, onTaskStatusChange]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sidebarFiles, setSidebarFiles] = useState<File[] | undefined>();
  const [inputMode, setInputMode] = useState<"chat" | "collab">("chat");
  const [inputDir, setInputDir] = useState<1 | -1>(1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const { reducedMotion } = useCreativeMotion();

  useEffect(() => {
    const currentScope = readConversationDataScope();
    dataScopeRef.current = currentScope;
    setDataScope(currentScope);
    const id = getActiveId() || createId();
    setSessionId(id);
    setMessages(loadMessages(id));
    setSessions(loadSessions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const reloadOwnerData = () => {
      const currentScope = readConversationDataScope();
      // A same-account background refresh must not discard an in-flight request.
      if (currentScope.owner === dataScopeRef.current.owner && currentScope.token === dataScopeRef.current.token && submittingRef.current) return;
      if (currentScope.owner !== dataScopeRef.current.owner) {
        setStagedFiles([]);
        setSidebarFiles(undefined);
        setSuggestions([]);
        setFirstSubmission({ scope: "", revision: 0 });
      }
      dataScopeRef.current = currentScope;
      setDataScope(currentScope);
      submissionRevision.current += 1;
      submittingRef.current = false;
      setPendingMessage(null);
      setContextPanel({ scope: "", panel: null });
      setProjectCaption({ id: "", name: "" });
      setIsThinking(false);
      globalEnergyStore.clearSource("coze-task");
      onThinkingChange?.(false);
      onTaskStatusChange?.(null);
      invalidateHistoryRecovery();
      const id = getActiveId() || createId();
      setSessionId(id);
      setMessages(loadMessages(id));
      setSessions(loadSessions());
    };
    window.addEventListener("tszh_data_owner_changed", reloadOwnerData);
    return () => window.removeEventListener("tszh_data_owner_changed", reloadOwnerData);
  }, [invalidateHistoryRecovery, onThinkingChange, onTaskStatusChange]);

  // 同步 messages/sessions 到 ref，避免闭包 stale 问题
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  useEffect(() => { if (hydrated && dataReady) setActiveId(sessionId); }, [sessionId, hydrated, dataReady]);

  const handledFocusRevision = useRef(0);
  useEffect(() => {
    if (!user || !focusConversation || focusConversation.owner !== user.id) {
      handledFocusRevision.current = 0;
      return;
    }
    if (!hydrated || !dataReady || handledFocusRevision.current === focusConversation.revision) return;
    handledFocusRevision.current = focusConversation.revision;
    if (sessionId === focusConversation.id) return;
    resetPendingRequest();
    invalidateHistoryRecovery();
    setSessionId(focusConversation.id);
    setMessages(loadMessages(focusConversation.id));
    setActiveId(focusConversation.id);
    onReset?.();
  }, [focusConversation, hydrated, dataReady, invalidateHistoryRecovery, onReset, resetPendingRequest, sessionId, user]);

  // 暴露 submitPrompt 给父组件（用于开场白快捷入口）
  useEffect(() => {
    if (onSubmitRef) onSubmitRef.current = (prompt: string, files: File[] = []) => requestPrompt(prompt, files);
  });

  // 登录后从服务端拉取会话列表
  useEffect(() => {
    if (!user || !hydrated || !dataReady) return;
    let cancelled = false;
    const capturedScope = dataScope;
    fetchServerSessions().then((serverSessions) => {
      const current = readConversationDataScope();
      if (cancelled || current.owner !== capturedScope.owner || current.token !== capturedScope.token) return;
      if (serverSessions.length > 0) {
        setSessions(serverSessions);
        saveSessions(serverSessions, { localOnly: true });
      }
    });
    return () => { cancelled = true; };
  }, [user?.id, hydrated, dataReady, dataScope]);

  const setThinking = useCallback((v: boolean) => {
    setIsThinking(v);
  }, []);

  // 能谱：coze 思考/任务信号汇入共享 store
  useEffect(() => {
    const releaseThinking = isBusy ? "thinking" : "idle";
    globalEnergyStore.setSource("coze-thinking", releaseThinking);
    return () => globalEnergyStore.clearSource("coze-thinking");
  }, [isBusy]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // scrollIntoView also scrolls overflow:hidden ancestors and clips the workspace.
    viewport.scrollTo({
      top: messages.length || isThinking ? viewport.scrollHeight : 0,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  }, [messages, isThinking, reducedMotion]);

  // Persist current session (debounced, only after hydration, respects autoSave pref)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated || !dataReady || messages.length === 0) return;
    if (!prefs.autoSave) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    const capturedScope = dataScope;
    persistTimer.current = setTimeout(() => {
      const current = readConversationDataScope();
      if (current.owner !== capturedScope.owner || current.token !== capturedScope.token) return;
      const existing = sessionsRef.current.find((s) => s.id === sessionId);
      // Opening cached history is not a new conversation activity.
      if (existing && JSON.stringify(loadMessages(sessionId)) === JSON.stringify(messages)) return;
      saveMessages(sessionId, messages);
      const title = messages.find((m) => m.role === "user")?.text?.slice(0, 40) || "新对话";
      const updated: HistorySession = {
        id: sessionId, title, timestamp: Date.now(),
        messageCount: messages.length,
      };
      const next = existing
        ? sessionsRef.current.map((s) => (s.id === sessionId ? updated : s))
        : [updated, ...sessionsRef.current];
      setSessions(next);
      saveSessions(next);
    }, 300);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [messages, sessionId, hydrated, prefs.autoSave, dataReady, dataScope]);

  // Enforce maxMessages limit
  useEffect(() => {
    if (!hydrated || messages.length <= prefs.maxMessages) return;
    const trimmed = messages.slice(messages.length - prefs.maxMessages);
    setMessages(trimmed);
  }, [messages, hydrated, prefs.maxMessages]);

  async function submitPrompt(prompt: string, files: File[], revision: number) {
    let submittedTaskId: string | null = null;
    const submissionToken = getToken();
    const isCurrentSubmission = () => getToken() === submissionToken && submissionRevision.current === revision;
    const currentConstraints = creativeConstraints(creativeContext);
    invalidateHistoryRecovery();
    const excludedMemoryIds = [...memoryExclusions.ids];
    prompt = prompt.trim() || "请基于我上传的参考文件生成一条短视频。";
    setSuggestions([]);
    const userMsg: ChatMessage = { id: createId(), role: "user", text: prompt };
    const thinkingMsg: ChatMessage = { id: createId(), role: "agent", isError: false, text: "正在提交任务…" };
    setPendingMessage({ id: thinkingMsg.id, sessionId, owner: user?.id });
    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setThinking(true);
    globalEnergyStore.setSource("coze-task", "running");

    const { history, historyOmitted } = prepareCozeHistory(messagesRef.current);

    try {
      const existingTitle = sessionsRef.current.find((session) => session.id === sessionId)?.title;
      await createConversation(sessionId, existingTitle || prompt.slice(0, 40));
      if (!isCurrentSubmission()) return;
      if (prefs.autoSave) {
        await syncSaveMessages(sessionId, [...messagesRef.current, userMsg]);
        if (!isCurrentSubmission()) return;
      }
      if (files.length > 0) {
        setMessages((prev) => prev.map((message) => (
          message.id === thinkingMsg.id ? { ...message, text: `正在安全上传 ${files.length} 个参考文件…` } : message
        )));
      }
      const attachments = files.length > 0 ? await uploadAttachments(files) : [];
      if (!isCurrentSubmission()) return;
      const attachmentIds = attachments.map((attachment) => attachment.id);
      const created = await createTask({
        kind: "video.generate",
        title: prompt.slice(0, 120),
        origin: "desktop",
        input: {
          prompt,
          history,
          historyOmitted,
          currentConstraints,
          conversationId: sessionId,
          excludedMemoryIds,
          projectId: projectId || undefined,
          attachmentIds,
        },
        attachmentIds,
        idempotencyKey: `chat_${sessionId}_${thinkingMsg.id}`,
      });
      if (!isCurrentSubmission()) return;
      const taskId = created.task.id;
      submittedTaskId = taskId;
      setTaskRecoveryRevision(value => value + 1);
      memoryExclusions.consumed(excludedMemoryIds);
      const task = await waitForTask(() => isCurrentSubmission()
        ? getTask(taskId).then((result) => result.task)
        : Promise.reject(new Error("账户已切换")), {
        onUpdate(task) {
          if (!isCurrentSubmission()) return;
          setPendingMessage(current => current?.id === thinkingMsg.id && current.sessionId === sessionId && current.taskStatus !== task.status ? { ...current, taskStatus: task.status } : current);
          const label = task.status === "queued" ? "已排队，等待服务器调度"
            : task.status === "paused" ? "任务已暂停，可在任务中心继续" : task.stage || "正在生成";
          onTaskStatusChange?.({ owner: dataScope.owner, active: true, label });
          setMessages((prev) => prev.some(message => message.id === thinkingMsg.id && message.text !== label)
            ? prev.map(message => message.id === thinkingMsg.id ? { ...message, text: label } : message)
            : prev);
        },
      });
      if (!isCurrentSubmission()) return;
      const output = task.output && typeof task.output === "object"
        ? task.output as Record<string, unknown>
        : {};
      const resultText = typeof output.text === "string" ? output.text : "任务已完成";
      const warningText = Array.isArray(output.warnings)
        ? output.warnings.map((value) => value && typeof value === "object" && typeof value.message === "string" ? value.message : "").filter(Boolean).join("；")
        : "";
      const text = warningText ? `${resultText}\n\n> 部分能力未完成：${warningText}` : resultText;
      const videoUrl = typeof output.videoUrl === "string" ? output.videoUrl : undefined;
      const imageUrls = Array.isArray(output.imageUrls)
        ? output.imageUrls.filter((value): value is string => typeof value === "string")
        : [];
      const followUps = Array.isArray(output.followUps)
        ? output.followUps.filter((value): value is string => typeof value === "string")
        : [];
      if (followUps.length) setSuggestions(followUps);
      setThinking(false);
      setPendingMessage(null);
      globalEnergyStore.clearSource("coze-task");
      setMessages((prev) => prev.map((message) => {
        if (message.id !== thinkingMsg.id) return message;
        if (videoUrl || imageUrls.length > 0) {
          const payload: AgentPayload = {
            requestId: task.id,
            createdAt: task.completedAt || undefined,
            videoUrl,
            imageUrls,
          };
          return { ...message, text, payload, textIsPayload: false, contextTrace: output.contextTrace };
        }
        return { ...message, text, contextTrace: output.contextTrace };
      }));
      if (videoUrl || imageUrls.length > 0) {
        notify("腾昇智和", videoUrl ? "视频已生成完成" : "图片已生成完成");
        logGeneration(videoUrl ? "video" : "image", prompt);
      }
      logCall(prompt);
      onMessageSent?.();
      onTaskStatusChange?.(null);
      return;
    } catch (err) {
      if (!isCurrentSubmission()) return;
      if (submittedTaskId && !(err instanceof TaskTerminalError)) {
        // Observation failure is not execution failure. Reconnect to the same task.
        setMessages(prev => prev.map(message => message.id === thinkingMsg.id
          ? { ...message, isError: false, errorText: undefined, text: "任务仍在后台执行，正在重新连接进度…" } : message));
        setTaskRecoveryRevision(value => value + 1);
        return;
      }
      setThinking(false);
      setPendingMessage(null);
      globalEnergyStore.clearSource("coze-task");
      setMessages((prev) => prev.map((m) => m.id === thinkingMsg.id
        ? { ...m, isError: true, errorText: err instanceof Error ? err.message : "请求失败" }
        : m));
      onTaskStatusChange?.(null);
    } finally {
      if (submissionRevision.current === revision) submittingRef.current = false;
    }
  }

  function requestPrompt(prompt: string, files: File[]) {
    if (!isCurrentDataScope()) return false;
    if (!prompt.trim() && !files.length) return false;
    if (submittingRef.current || isBusy || taskRecovery.loading) return false;
    if (taskRecovery.error) { notify("任务进度尚未确认", "请等待进度连接恢复，避免重复提交"); return false; }
    if (!sessionProject.ready) { notify("项目上下文未就绪", "请先恢复或重新选择此会话的项目"); return false; }
    if (!canUseWorkspaceCapability(accessMode, "generate")) {
      onDraftChange(prompt);
      onAuthRequired(prompt);
      return false;
    }
    submittingRef.current = true;
    if (messages.length === 0) {
      setContextPanel({ scope: exclusionScope, panel: null });
      setFirstSubmission(previous => ({ scope: dialogueScope, revision: previous.revision + 1 }));
    }
    void submitPrompt(prompt, files, ++submissionRevision.current);
    return true;
  }

  const retry = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser?.text) requestPrompt(lastUser.text, []);
  };

  const loadSession = (id: string) => {
    if (!isCurrentDataScope()) return;
    if (id === sessionId) return;
    resetPendingRequest();
    invalidateHistoryRecovery();
    setSessionId(id);
    const msgs = loadMessages(id);
    setMessages(msgs);
    setActiveId(id);
    onReset?.();
  };

  const newChat = () => {
    if (!isCurrentDataScope()) return sessionId;
    resetPendingRequest();
    invalidateHistoryRecovery();
    const id = createId();
    setSessionId(id);
    setMessages([]);
    setActiveId(id);
    onReset?.();
    onNewChat?.();
    return id;
  };

  const deleteSession = (id: string) => {
    if (!isCurrentDataScope()) return;
    deleteMessages(id);
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    saveSessions(next);
    if (id === sessionId) newChat();
  };

  useEffect(() => {
    const refresh = () => { if (isCurrentDataScope()) setSessions(loadSessions()); };
    window.addEventListener("tszh_history_retention_changed", refresh);
    return () => window.removeEventListener("tszh_history_retention_changed", refresh);
  }, [isCurrentDataScope]);

  const exportConversation = () => {
    if (!isCurrentDataScope()) return;
    try {
      const format = prefs.exportFormat;
      const includeTs = prefs.includeTimestamp;
      const timestamp = includeTs ? new Date().toLocaleString("zh-CN") : "";
      const fileId = `tszh-${sessionId.slice(0, 8)}`;

      const file = exportCozeConversation(messages, { format, sessionId, timestamp, exportedAt: new Date().toISOString() });
      saveFileDownload({ blob: new Blob([file.content], { type: file.type }), filename: `${fileId}.${file.extension}` });
      setExportFeedback({ scope: dialogueScope, error: false, message: "对话记录已交给浏览器保存，请在下载列表核对。" });
    } catch (cause) {
      setExportFeedback({ scope: dialogueScope, error: true, message: cause instanceof Error ? `导出未完成：${cause.message}。当前对话仍保留，可重试。` : "导出未完成，当前对话仍保留，可重试。" });
    }
  };

  // 会话坞状态上提（sessions/stagedFiles/activeSessionId 变化时同步给 Workspace）
  useEffect(() => {
    onDockStateChange?.({
      owner: dataScope.owner,
      sessions,
      files: stagedFiles,
      activeSessionId: sessionId,
      onSessionClick: loadSession,
      onSessionDelete: deleteSession,
      onNewChat: newChat,
      onFileClick: (file) => {
        if (!isCurrentDataScope()) return;
        setSidebarFiles([file.file]);
        setTimeout(() => { if (isCurrentDataScope()) setSidebarFiles(undefined); }, 100);
      },
      onClearFiles: () => { if (isCurrentDataScope()) setStagedFiles([]); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, stagedFiles, sessionId, dataScope, viewerOwner, onDockStateChange]);

  // insertFragment 注入（revision 去重）
  useEffect(() => {
    if (!insertFragment || typeof insertRevision !== "number") return;
    if (typeof lastInsertedRevision === "number" && insertRevision <= lastInsertedRevision) return;
    onDraftChange(draft ? `${draft} ${insertFragment}` : insertFragment);
    onInserted?.(insertRevision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertFragment, insertRevision]);

  const showContext = showMemoryExclusions && user && accessMode === "authenticated";
  const projectLabel = projectId ? (projectCaption.id === projectId && projectCaption.name ? projectCaption.name : "已关联项目") : "未关联";
  const toggleContextPanel = (panel: "project" | "memory") => setContextPanel({ scope: exclusionScope, panel: openContextPanel === panel ? null : panel });

  if (!dataReady) return <div className="coze-dialogue"><DialogueLatticeLoader label="正在切换对话账户…" /></div>;

  return (
    <div className="coze-dialogue" onKeyDown={event => {
      if (event.key !== "Escape" || event.defaultPrevented || !openContextPanel) return;
      event.preventDefault();
      const trigger = openContextPanel === "project" ? projectTrigger : memoryTrigger;
      setContextPanel({ scope: exclusionScope, panel: null });
      trigger.current?.focus();
    }}>
      {!showWelcome && <div className="coze-dialogue-intro" data-phase={dialoguePhase}>
        <span className="chat-welcome-eyebrow" aria-hidden={messages.length > 0}><span className="chat-welcome-dot" aria-hidden="true" /> {dialoguePhase === "loading" ? "正在恢复对话…" : "观测窗口 · 已就绪"}</span>
        <motion.h2 layout="position" initial={false} transition={{ layout: { duration: reducedMotion ? 0 : .36, ease: [.22, 1, .36, 1] } }} className="welcome-title page-title coze-welcome-title">
          <span className="coze-welcome-title__silver">腾昇智和 · AI 短视频导演</span>
          {!messages.length && <span className="coze-welcome-title__shine" aria-hidden="true">腾昇智和 · AI 短视频导演</span>}
        </motion.h2>
        <p aria-hidden={messages.length > 0}>告诉我你的想法，我们一起把它<span className="coze-welcome-emphasis">变成画面</span>。</p>
      </div>}
      {(showContext || messages.length > 0) && <div className="coze-context-header">
        <div className="coze-context-toolbar" role="group" aria-label="对话上下文与导出">
          {showContext && <>
            <button ref={projectTrigger} id={`${contextId}-project-trigger`} type="button" className="coze-context-trigger coze-context-trigger--project" aria-expanded={openContextPanel === "project"} aria-controls={`${contextId}-project-panel`} title={`项目：${projectLabel}`} onClick={() => toggleContextPanel("project")}>
              <span>项目：{projectLabel}</span><ChevronDown size={14} aria-hidden="true" />
            </button>
            <button ref={memoryTrigger} id={`${contextId}-memory-trigger`} type="button" className="coze-context-trigger" aria-expanded={openContextPanel === "memory"} aria-controls={`${contextId}-memory-panel`} onClick={() => toggleContextPanel("memory")}>
              <span>记忆{memoryExclusions.ids.length > 0 ? ` · 排除 ${memoryExclusions.ids.length}` : ""}</span><ChevronDown size={14} aria-hidden="true" />
            </button>
          </>}
          {messages.length > 0 && <button type="button" className="coze-context-export" onClick={exportConversation} aria-label="导出对话" title={`导出 ${prefs.exportFormat.toUpperCase()}`}><Download size={16} aria-hidden="true" /></button>}
        </div>
        {exportFeedback?.scope === dialogueScope && <p className="coze-context-feedback" role={exportFeedback.error ? "alert" : "status"} style={{ overflowWrap: "anywhere" }}>{exportFeedback.message}</p>}
        {showContext && <div className="coze-context-panel" hidden={!openContextPanel}>
          <div id={`${contextId}-project-panel`} role="region" aria-labelledby={`${contextId}-project-trigger`} hidden={openContextPanel !== "project"}>
            <fieldset disabled={isBusy}><ResearchProjectSelect key={`${user.id}:${sessionId}`} id={`${contextId}-project`} disabled={isBusy} onProjectNameChange={handleProjectNameChange} label="Coze 创作项目" description="切换项目会新建会话，保留原历史，避免带入旧项目对话。选择按账户和会话保存在本机，重新打开时恢复。" value={projectId} onChange={id=>{if(id===projectId&&sessionProject.ready)return;const nextSession=newChat();sessionProject.select(id,nextSession);}} /></fieldset>
            {sessionProject.error && <p role="alert">{sessionProject.error} {!sessionProject.ready && <button type="button" className="studio-context-action" disabled={isThinking} onClick={()=>{const nextSession=newChat();sessionProject.select("",nextSession);}}>新建不关联项目的会话</button>}</p>}
            {projectId && <StudioProjectNotes key={`notes:${exclusionScope}`} projectId={projectId} disabled={isThinking} />}
          </div>
          <div id={`${contextId}-memory-panel`} role="region" aria-labelledby={`${contextId}-memory-trigger`} hidden={openContextPanel !== "memory"}>
            {openContextPanel === "memory" && <RequestMemoryExclusions key={exclusionScope} presentation="panel" mode="coze" sessionId={sessionId} projectId={projectId || undefined} value={memoryExclusions.ids} onChange={memoryExclusions.setIds} disabled={isThinking} />}
          </div>
        </div>}
      </div>}
      <div ref={viewportRef} className="chat-viewport" role="region" aria-label="Coze 对话消息" tabIndex={0}>
      {showWelcome && onWelcomeStart && (
        <WelcomeScreen onStart={onWelcomeStart} />
      )}

      {taskRecovery.error && <p className="coze-task-status" role="status">任务进度暂时不可用：{taskRecovery.error}。系统会尝试重新连接，不会重新提交生成。</p>}
      <div className="chat-messages">
        <PluginSlot slot="chat.message.after" contributions={[]} projectId="project-a" />

        {messages.map((msg, idx) => {
          const recoveredTask = msg.role === "agent" ? taskRecovery.tasks[msg.id] : undefined;
          if (recoveredTask) return <div key={msg.id} className="chat-message-group coze-message-group--agent">
            <DialogueLatticeLoader className="coze-task-status" label={cozeTaskLabel(recoveredTask)}
              animate={["queued", "running"].includes(recoveredTask.status)} />
          </div>;
          if (msg.isError) {
            return (
              <div key={msg.id} className="chat-message-group coze-message-group--agent">
                <div className="coze-message-error" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <div><strong>请求失败</strong><p>{msg.errorText}</p></div>
                  <button type="button" onClick={retry} disabled={isBusy || taskRecovery.loading || !!taskRecovery.error} className="settings-chip active">重试</button>
                </div>
              </div>
            );
          }
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="chat-message-group coze-message-group--user">
                <div className="msg-user">{msg.text}</div>
              </div>
            );
          }
          if (pendingMessage && isPendingDialogueReply(pendingMessage, msg.id, sessionId, isThinking) && pendingMessage.owner === user?.id) {
            return <div key={msg.id} className="chat-message-group coze-message-group--agent">
              <DialogueLatticeLoader className="coze-task-status" label={msg.text || "正在提交任务…"}
                animate={!pendingMessage.taskStatus || ["queued", "running"].includes(pendingMessage.taskStatus)} />
            </div>;
          }
          const precedingUserMsg = messages.slice(0, idx).reverse().find((m) => m.role === "user");
          const originalPrompt = precedingUserMsg?.text || "";
          return (
            <div key={msg.id} className="chat-message-group coze-message-group--agent">
              <StudioContextTrace trace={msg.contextTrace} />
              {msg.payload ? (
                <>
                  {msg.text && !msg.textIsPayload && (
                    <div className="msg-agent">
                      <MarkdownRenderer content={msg.text} />
                    </div>
                  )}
                  <ResultCard
                    payload={msg.payload}
                    originalPrompt={originalPrompt}
                    onRegenerate={(prompt) => { requestPrompt(prompt, []); }}
                    onModify={(prompt) => { onDraftChange(prompt); }}
                  />
                </>
              ) : msg.text ? (
                <div className="msg-agent">
                  <MarkdownRenderer content={msg.text} />
                </div>
              ) : null}
            </div>
          );
        })}

      </div>

      {suggestions.length > 0 && !isBusy && (
        <div className="suggestions-bar">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="suggestion-btn"
              onClick={() => { setSuggestions([]); requestPrompt(s, []); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {collabPanel && (
        <div className="chat-composer">
          <AnimatePresence mode="wait" custom={inputDir} initial={false}>
            <motion.div key="collab" custom={inputDir} variants={inputTabVariants} initial="enter" animate="center" exit="exit">
              {collabPanel}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      </div>
    </div>
  );
}
