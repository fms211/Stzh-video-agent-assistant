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
import ResultCard from "./ResultCard";
import MarkdownRenderer from "./MarkdownRenderer";
import WelcomeScreen from "./WelcomeScreen";
import { PluginSlot } from "./plugin-slots/PluginSlot";
import { notify } from "@/app/lib/notify";
import { logCall, logGeneration } from "@/app/lib/tracker";
import { useAuth } from "./AuthProvider";
import { createConversation, createTask, getTask, getToken, uploadAttachments } from "@/app/lib/auth";
import { RequestMemoryExclusions, useRequestMemoryExclusions } from "./RequestMemoryExclusions";
import { waitForTask } from "@/app/lib/wait-for-task";
import { saveFileDownload } from "@/app/lib/media-download";
import { usePreferences } from "@/app/hooks/usePreferences";
import { useConversationRecovery } from "@/app/hooks/useConversationRecovery";
import { useSessionProject } from "@/app/hooks/useSessionProject";
import { prepareCozeHistory } from "@/shared/coze-history.cjs";
import { creativeConstraints } from "@/app/lib/creative-context";
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
function saveSessions(s: HistorySession[]) { syncSaveSessions(s); }
function loadMessages(id: string): ChatMessage[] { return syncLoadMessages(id); }
function saveMessages(id: string, msgs: ChatMessage[]) { syncSaveMessages(id, msgs); }
function deleteMessages(id: string) { syncRemoveMessages(id); }
function getActiveId(): string | null { return getActiveSessionId(); }
function setActiveId(id: string | null) { setActiveSessionId(id); }

export type ConversationSubmit = (prompt: string, files?: File[]) => boolean | void;

type Props = {
  creativeContext?: CreativeContext;
  accessMode: AccessMode;
  focusConversation?: { id: string; owner: number; revision: number } | null;
  onAuthRequired: (draft?: string) => void;
  onThinkingChange?: (v: boolean) => void;
  onMessageSent?: () => void;
  onReset?: () => void;
  onTaskStatusChange?: (status: { active: boolean; label: string } | null) => void;
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
  const submittingRef = useRef(false);
  const submissionRevision = useRef(0);
  const [pendingMessage, setPendingMessage] = useState<{ id: string; sessionId: string; owner: number | undefined } | null>(null);
  const [contextPanel, setContextPanel] = useState<{ scope: string; panel: "project" | "memory" | null }>({ scope: "", panel: null });
  const [projectCaption, setProjectCaption] = useState({ id: "", name: "" });
  const contextId = useId();
  const projectTrigger = useRef<HTMLButtonElement>(null);
  const memoryTrigger = useRef<HTMLButtonElement>(null);
  const openContextPanel = contextPanel.scope === exclusionScope ? contextPanel.panel : null;
  useEffect(() => {
    onDialogueStateChange?.({
      scope: dialogueScope,
      ready: hydrated && !!sessionId && (!user || messages.length > 0 || (recoveryState.scope === dialogueScope && !recoveryState.pending)),
      hasMessages: messages.length > 0,
      firstSubmission: firstSubmission.scope === dialogueScope ? firstSubmission.revision : 0,
      panelOpen: !!openContextPanel,
    });
  }, [dialogueScope, hydrated, sessionId, user, messages.length, recoveryState, firstSubmission, openContextPanel, onDialogueStateChange]);
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
    const id = getActiveId() || createId();
    setSessionId(id);
    setMessages(loadMessages(id));
    setSessions(loadSessions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const reloadOwnerData = () => {
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

  useEffect(() => { if (hydrated) setActiveId(sessionId); }, [sessionId, hydrated]);

  const handledFocusRevision = useRef(0);
  useEffect(() => {
    if (!user || !focusConversation || focusConversation.owner !== user.id) {
      handledFocusRevision.current = 0;
      return;
    }
    if (!hydrated || handledFocusRevision.current === focusConversation.revision) return;
    handledFocusRevision.current = focusConversation.revision;
    if (sessionId === focusConversation.id) return;
    resetPendingRequest();
    invalidateHistoryRecovery();
    setSessionId(focusConversation.id);
    setMessages(loadMessages(focusConversation.id));
    setActiveId(focusConversation.id);
    onReset?.();
  }, [focusConversation, hydrated, invalidateHistoryRecovery, onReset, resetPendingRequest, sessionId, user]);

  // 暴露 submitPrompt 给父组件（用于开场白快捷入口）
  useEffect(() => {
    if (onSubmitRef) onSubmitRef.current = (prompt: string, files: File[] = []) => requestPrompt(prompt, files);
  });

  // 登录后从服务端拉取会话列表
  useEffect(() => {
    if (!user || !hydrated) return;
    fetchServerSessions().then((serverSessions) => {
      if (serverSessions.length > 0) {
        setSessions(serverSessions);
        saveSessions(serverSessions);
      }
    });
  }, [user, hydrated]);

  const setThinking = useCallback((v: boolean) => {
    setIsThinking(v); onThinkingChange?.(v);
  }, [onThinkingChange]);

  // 能谱：coze 思考/任务信号汇入共享 store
  useEffect(() => {
    const releaseThinking = isThinking ? "thinking" : "idle";
    globalEnergyStore.setSource("coze-thinking", releaseThinking);
    return () => globalEnergyStore.clearSource("coze-thinking");
  }, [isThinking]);

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
    if (!hydrated || messages.length === 0) return;
    if (!prefs.autoSave) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveMessages(sessionId, messages);
      const existing = sessionsRef.current.find((s) => s.id === sessionId);
      const title = messages.find((m) => m.role === "user")?.text?.slice(0, 40) || "新对话";
      const updated: HistorySession = {
        id: sessionId, title, timestamp: Date.now(),
        messageCount: messages.filter((m) => m.role === "user" || m.payload || m.isError).length,
      };
      const next = existing
        ? sessionsRef.current.map((s) => (s.id === sessionId ? updated : s))
        : [updated, ...sessionsRef.current];
      setSessions(next);
      saveSessions(next);
    }, 300);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [messages, sessionId, hydrated, prefs.autoSave]);

  // Enforce maxMessages limit
  useEffect(() => {
    if (!hydrated || messages.length <= prefs.maxMessages) return;
    const trimmed = messages.slice(messages.length - prefs.maxMessages);
    setMessages(trimmed);
  }, [messages, hydrated, prefs.maxMessages]);

  async function submitPrompt(prompt: string, files: File[], revision: number) {
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
      memoryExclusions.consumed(excludedMemoryIds);
      const task = await waitForTask(() => isCurrentSubmission()
        ? getTask(taskId).then((result) => result.task)
        : Promise.reject(new Error("账户已切换")), {
        onUpdate(task) {
          if (!isCurrentSubmission()) return;
          const label = task.status === "queued" ? "已排队，等待服务器调度"
            : task.status === "paused" ? "任务已暂停，可在任务中心继续" : task.stage || "正在生成";
          onTaskStatusChange?.({ active: true, label });
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
    if (!prompt.trim() && !files.length) return false;
    if (submittingRef.current) return false;
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
    deleteMessages(id);
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    saveSessions(next);
    if (id === sessionId) newChat();
  };

  const exportConversation = () => {
    const format = prefs.exportFormat;
    const includeTs = prefs.includeTimestamp;
    const timestamp = includeTs ? new Date().toLocaleString("zh-CN") : "";
    const fileId = `tszh-${sessionId.slice(0, 8)}`;

    if (format === "json") {
      const data = {
        exportedAt: new Date().toISOString(),
        sessionId,
        messages: messages.map((m) => ({
          role: m.role,
          text: m.text,
          payload: m.payload,
          contextTrace: m.contextTrace,
          isError: m.isError,
          errorText: m.errorText,
        })),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      saveFileDownload({ blob, filename: `${fileId}.json` });
    } else if (format === "txt") {
      const lines: string[] = [];
      if (timestamp) lines.push(`腾昇智和 · 对话记录 — ${timestamp}\n`);
      else lines.push("腾昇智和 · 对话记录\n");
      for (const m of messages) {
        if (m.role === "user") lines.push(`[用户] ${m.text}\n`);
        else if (m.isError) lines.push(`[错误] ${m.errorText}\n`);
        else if (m.payload) {
          if (m.payload.videoUrl) lines.push(`[Agent] 视频: ${m.payload.videoUrl}\n`);
          if (m.payload.imageUrls) m.payload.imageUrls.forEach((u) => lines.push(`[Agent] 图片: ${u}\n`));
        } else if (m.text) {
          lines.push(`[Agent] ${m.text}\n`);
        }
      }
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      saveFileDownload({ blob, filename: `${fileId}.txt` });
    } else {
      const lines: string[] = ["# 腾昇智和 · 对话记录\n"];
      if (timestamp) lines.push(`> ${timestamp}\n`);
      for (const m of messages) {
        if (m.role === "user") lines.push(`### 用户\n${m.text}\n`);
        else if (m.isError) lines.push(`### 错误\n${m.errorText}\n`);
        else if (m.payload) {
          lines.push(`### Agent\n`);
          if (m.payload.videoUrl) lines.push(`- 视频: ${m.payload.videoUrl}\n`);
          if (m.payload.imageUrls) m.payload.imageUrls.forEach((u: string) => lines.push(`- 图片: ${u}\n`));
          lines.push(`- requestId: ${m.payload.requestId}\n`);
        } else if (m.text) {
          lines.push(`### Agent\n${m.text}\n`);
        }
      }
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      saveFileDownload({ blob, filename: `${fileId}.md` });
    }
  };

  // 会话坞状态上提（sessions/stagedFiles/activeSessionId 变化时同步给 Workspace）
  useEffect(() => {
    onDockStateChange?.({
      sessions,
      files: stagedFiles,
      activeSessionId: sessionId,
      onSessionClick: loadSession,
      onSessionDelete: deleteSession,
      onNewChat: newChat,
      onFileClick: (file) => {
        setSidebarFiles([file.file]);
        setTimeout(() => setSidebarFiles(undefined), 100);
      },
      onClearFiles: () => setStagedFiles([]),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, stagedFiles, sessionId, onDockStateChange]);

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
        {showContext && <div className="coze-context-panel" hidden={!openContextPanel}>
          <div id={`${contextId}-project-panel`} role="region" aria-labelledby={`${contextId}-project-trigger`} hidden={openContextPanel !== "project"}>
            <fieldset disabled={isThinking}><ResearchProjectSelect key={`${user.id}:${sessionId}`} id={`${contextId}-project`} disabled={isThinking} onProjectNameChange={handleProjectNameChange} label="Coze 创作项目" description="切换项目会新建会话，保留原历史，避免带入旧项目对话。选择按账户和会话保存在本机，重新打开时恢复。" value={projectId} onChange={id=>{if(id===projectId&&sessionProject.ready)return;const nextSession=newChat();sessionProject.select(id,nextSession);}} /></fieldset>
            {sessionProject.error && <p role="alert">{sessionProject.error} {!sessionProject.ready && <button type="button" className="studio-context-action" disabled={isThinking} onClick={()=>{const nextSession=newChat();sessionProject.select("",nextSession);}}>新建不关联项目的会话</button>}</p>}
            {projectId && <StudioProjectNotes key={`notes:${exclusionScope}`} projectId={projectId} disabled={isThinking} />}
          </div>
          <div id={`${contextId}-memory-panel`} role="region" aria-labelledby={`${contextId}-memory-trigger`} hidden={openContextPanel !== "memory"}>
            {openContextPanel === "memory" && <RequestMemoryExclusions key={exclusionScope} presentation="panel" mode="coze" sessionId={sessionId} projectId={projectId || undefined} value={memoryExclusions.ids} onChange={memoryExclusions.setIds} disabled={isThinking} />}
          </div>
        </div>}
      </div>}
      <div ref={viewportRef} className="chat-viewport">
      {showWelcome && onWelcomeStart && (
        <WelcomeScreen onStart={onWelcomeStart} />
      )}

      <div className="chat-messages">
        <PluginSlot slot="chat.message.after" contributions={[]} projectId="project-a" />

        {messages.map((msg, idx) => {
          if (msg.isError) {
            return (
              <div key={msg.id} className="chat-message-group coze-message-group--agent">
                <div className="coze-message-error" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <div><strong>请求失败</strong><p>{msg.errorText}</p></div>
                  <button type="button" onClick={retry} disabled={isThinking} className="settings-chip active">重试</button>
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
          if (isThinking && pendingMessage?.id === msg.id && pendingMessage.sessionId === sessionId && pendingMessage.owner === user?.id) {
            return <div key={msg.id} className="chat-message-group coze-message-group--agent">
              <div className="coze-task-status" role="status" aria-live="polite" aria-atomic="true">
                <span className="coze-task-status__dot" aria-hidden="true" /><span>{msg.text || "正在提交任务…"}</span>
              </div>
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

      {suggestions.length > 0 && !isThinking && (
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
