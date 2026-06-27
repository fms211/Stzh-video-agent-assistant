"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import ChatInput from "./ChatInput";
import ResultCard from "./ResultCard";
import LeftSidebar, { type StagedFile, type HistorySession } from "./LeftSidebar";
import PixelTitle from "./PixelTitle";
import MarkdownRenderer from "./MarkdownRenderer";
import WelcomeScreen from "./WelcomeScreen";
import { notify } from "@/app/lib/notify";
import { logCall, logGeneration } from "@/app/lib/tracker";
import { useAuth } from "./AuthProvider";
import { getToken } from "@/app/lib/auth";
import { usePreferences } from "@/app/hooks/usePreferences";

type AgentPayload = {
  requestId: string; createdAt?: string;
  videoUrl?: string; imageUrls?: string[]; raw?: unknown;
};

type ChatMessage = {
  id: string; role: "user" | "agent";
  text?: string; payload?: AgentPayload;
  textIsPayload?: boolean;
  isError?: boolean; errorText?: string;
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SESSIONS_KEY = "tszh_sessions";
const ACTIVE_KEY = "tszh_active";

const isBrowser = typeof window !== "undefined";

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
  fetchServerMessages,
} from "@/app/lib/sync";

function loadSessions(): HistorySession[] { return syncLoadSessions(); }
function saveSessions(s: HistorySession[]) { syncSaveSessions(s); }
function loadMessages(id: string): ChatMessage[] { return syncLoadMessages(id); }
function saveMessages(id: string, msgs: ChatMessage[]) { syncSaveMessages(id, msgs); }
function deleteMessages(id: string) { syncRemoveMessages(id); }
function getActiveId(): string | null { return getActiveSessionId(); }
function setActiveId(id: string | null) { setActiveSessionId(id); }

function normalizePayload(data: unknown): { payload: AgentPayload; text?: string } {
  const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const requestId = typeof obj.requestId === "string" ? obj.requestId : createId();
  const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : undefined;
  const videoUrl = typeof obj.videoUrl === "string" ? obj.videoUrl : undefined;
  const imageUrlsRaw = Array.isArray(obj.imageUrls) ? obj.imageUrls : undefined;
  const imageUrls = imageUrlsRaw ? imageUrlsRaw.filter((i): i is string => typeof i === "string") : undefined;

  if (videoUrl || (imageUrls && imageUrls.length > 0)) {
    return { payload: { requestId, createdAt, videoUrl, imageUrls } };
  }

  // 纯文本回复（raw.text）→ 显示为聊天气话
  const rawObj = obj.raw as Record<string, unknown> | undefined;
  if (rawObj && typeof rawObj.text === "string" && rawObj.text) {
    return { payload: { requestId, createdAt }, text: rawObj.text };
  }

  return { payload: { requestId, createdAt, raw: data } };
}

export default function ChatFlow({ onThinkingChange, onReset, onMessageSent, templateFill: fillText, onGoHome, onSubmitRef, onNewChat, showWelcome, onWelcomeStart }: { onThinkingChange?: (v: boolean) => void; onReset?: () => void; onMessageSent?: () => void; templateFill?: string; onGoHome?: () => void; onSubmitRef?: React.MutableRefObject<((prompt: string) => void) | null>; onNewChat?: () => void; showWelcome?: boolean; onWelcomeStart?: (prompt?: string) => void }) {
  const { user } = useAuth();
  const { prefs } = usePreferences();
  const API_BASE = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin)
    : "";
  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const sessionsRef = useRef<HistorySession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = getActiveId() || createId();
    setSessionId(id);
    setMessages(loadMessages(id));
    setSessions(loadSessions());
    setHydrated(true);
  }, []);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const thinkingStages = ["正在理解需求…", "检索知识库…", "构建分镜脚本…", "生成画面中…"];
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sidebarFiles, setSidebarFiles] = useState<File[] | undefined>();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 同步 messages/sessions 到 ref，避免闭包 stale 问题
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  useEffect(() => { if (hydrated) setActiveId(sessionId); }, [sessionId, hydrated]);

  // 暴露 submitPrompt 给父组件（用于开场白快捷入口）
  useEffect(() => {
    if (onSubmitRef) onSubmitRef.current = (prompt: string) => submitPrompt(prompt, []);
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

  // Cycle thinking stages
  useEffect(() => {
    if (!isThinking) { setThinkingStage(0); return; }
    const interval = setInterval(() => {
      setThinkingStage((s) => (s + 1) % thinkingStages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isThinking]);

  const setThinking = useCallback((v: boolean) => {
    setIsThinking(v); onThinkingChange?.(v);
    if (v) setThinkingStage(0);
  }, [onThinkingChange]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isThinking]);

  // Persist current session (debounced, only after hydration, respects autoSave pref)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (!prefs.autoSave) return; // 用户关闭了自动保存则跳过
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

  // Enforce maxMessages limit — trim oldest messages when exceeding
  useEffect(() => {
    if (!hydrated || messages.length <= prefs.maxMessages) return;
    const trimmed = messages.slice(messages.length - prefs.maxMessages);
    setMessages(trimmed);
  }, [messages, hydrated, prefs.maxMessages]);

  const submitPrompt = async (prompt: string, files: File[]) => {
    setSuggestions([]);
    const userMsg: ChatMessage = { id: createId(), role: "user", text: prompt };
    const thinkingMsg: ChatMessage = { id: createId(), role: "agent", isError: false };
    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setThinking(true);

    const history = messagesRef.current
      .filter((m) => m.role === "user" || (m.role === "agent" && (m.text || m.payload)))
      .slice(-20)
      .map((m) => ({ role: m.role, text: m.text, payload: m.payload }));

    try {
      // 优先使用 SSE 流式端点（无文件时）
      if (files.length === 0) {
        const res = await fetch(`${API_BASE}/api/agent/stream`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ prompt, history, conversation_id: sessionId }),
        });

        if (res.ok && res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
          // SSE 流式模式
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullText = "";
          let buffer = "";
          let done = false;

          try {
            while (!done) {
              const { done: streamDone, value } = await reader.read();
              if (streamDone) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              let eventType = "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith("event:")) {
                  eventType = trimmed.slice(6).trim();
                } else if (trimmed.startsWith("data:")) {
                  try {
                    const data = JSON.parse(trimmed.slice(5).trim());
                    if (eventType === "delta" && data.content) {
                      fullText += data.content;
                      setMessages((prev) => prev.map((m) =>
                        m.id === thinkingMsg.id ? { ...m, text: fullText } : m
                      ));
                    }
                    if (eventType === "done") {
                      done = true;
                      setThinking(false);
                      // 优先使用 done 事件中的 text（已解析的卡片内容）
                      const finalText = data.text || fullText || "已生成结果";
                      // 有媒体 URL → 显示 ResultCard
                      if (data.videoUrl || (data.imageUrls && data.imageUrls.length > 0)) {
                        const payload: AgentPayload = { requestId: thinkingMsg.id, createdAt: new Date().toISOString(), videoUrl: data.videoUrl, imageUrls: data.imageUrls };
                        setMessages((prev) => prev.map((m) => m.id === thinkingMsg.id
                          ? { ...m, text: "已生成结果", payload, textIsPayload: false }
                          : m));
                        logGeneration(data.videoUrl ? "video" : "image", prompt);
                        notify("腾昇智和", data.videoUrl ? "视频已生成完成" : "图片已生成完成");
                      } else {
                        // 纯文本 → 显示聊天气话
                        setMessages((prev) => prev.map((m) => m.id === thinkingMsg.id
                          ? { ...m, text: finalText }
                          : m));
                      }
                      logCall(prompt);
                      onMessageSent?.();
                    }
                    // follow_up 事件：收集后续问题建议
                    if (eventType === "follow_up" && data.suggestions) {
                      setSuggestions((prev) => [...prev, ...data.suggestions]);
                    }
                  } catch (e) { console.warn("SSE delta 解析失败:", e); }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
          return;
        }
      }

      // 回退到非流式端点
      let res: Response;
      if (files.length > 0) {
        const fd = new FormData();
        fd.append("prompt", prompt);
        fd.append("history", JSON.stringify(history));
        fd.append("conversation_id", sessionId);
        for (const f of files) fd.append("files", f);
        res = await fetch(`${API_BASE}/api/agent`, { method: "POST", body: fd, headers: authHeaders() });
      } else {
        res = await fetch(`${API_BASE}/api/agent`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ prompt, history, conversation_id: sessionId }),
        });
      }
      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();

      if (!res.ok) {
        const message = typeof (data as any)?.error?.message === "string"
          ? (data as any).error.message
          : typeof (data as any)?.message === "string" ? (data as any).message
          : `请求失败（${res.status}）`;
        setThinking(false);
        setMessages((prev) => prev.map((m) => m.id === thinkingMsg.id ? { ...m, isError: true, errorText: message } : m));
        return;
      }

      const { payload, text: responseText } = normalizePayload(data);
      setThinking(false);
      const displayText = responseText || "已生成结果";
      setMessages((prev) => prev.map((m) => m.id === thinkingMsg.id
        ? { ...m, text: displayText, payload: responseText ? undefined : payload, textIsPayload: !responseText }
        : m));
      if (!responseText) {
        notify("腾昇智和", "视频/图片已生成完成");
        logGeneration(payload?.videoUrl ? "video" : "image", prompt);
      }
      logCall(prompt);
      onMessageSent?.();
    } catch (err) {
      setThinking(false);
      setMessages((prev) => prev.map((m) => m.id === thinkingMsg.id
        ? { ...m, isError: true, errorText: err instanceof Error ? err.message : "请求失败" }
        : m));
    }
  };

  const retry = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser?.text) await submitPrompt(lastUser.text, []);
  };

  const loadSession = (id: string) => {
    setSessionId(id);
    const msgs = loadMessages(id);
    setMessages(msgs);
    setActiveId(id);
    onReset?.();
    // 如果有登录用户且本地无消息，从服务端拉取
    if (user && msgs.length === 0) {
      fetchServerMessages(id).then((serverMsgs) => {
        if (serverMsgs.length > 0) setMessages(serverMsgs);
      });
    }
  };

  const newChat = () => {
    const id = createId();
    setSessionId(id);
    setMessages([]);
    setActiveId(id);
    onReset?.();
    onNewChat?.();
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
          isError: m.isError,
          errorText: m.errorText,
        })),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileId}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Default: markdown
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileId}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="chat-viewport">
      {/* Welcome Screen - only in chat area */}
      {showWelcome && onWelcomeStart && (
        <WelcomeScreen onStart={onWelcomeStart} />
      )}

      {/* Export button */}
      {messages.length > 0 && (
        <button type="button" className="export-btn" onClick={exportConversation} aria-label="导出对话" title={`导出 ${prefs.exportFormat.toUpperCase()}`}>
          ↓
        </button>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !showWelcome && (
          <div className="chat-welcome">
            <PixelTitle />
            <p>告诉我你的想法，我们一起把它变成画面。</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          if (msg.isError) {
            return (
              <div key={msg.id} className="chat-message-group">
                <div className="msg-agent edge-glow edge-glow-subtle" style={{ borderColor: "rgba(220,80,80,0.3)" }}>
                  <div style={{ color: "var(--foreground)", marginBottom: 8, fontWeight: 500 }}>请求失败</div>
                  <div style={{ color: "var(--foreground-muted)", fontSize: 14, marginBottom: 12 }}>{msg.errorText}</div>
                  <button type="button" onClick={retry} className="settings-chip active">重试</button>
                </div>
              </div>
            );
          }
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="chat-message-group">
                <div className="msg-user">{msg.text}</div>
              </div>
            );
          }
          // 找到此 agent 消息前最近的用户消息作为原始 prompt
          const precedingUserMsg = messages.slice(0, idx).reverse().find((m) => m.role === "user");
          const originalPrompt = precedingUserMsg?.text || "";
          return (
            <div key={msg.id} className="chat-message-group">
              {msg.payload ? (
                <>
                  {msg.text && !msg.textIsPayload && (
                    <div className="msg-agent edge-glow edge-glow-subtle">
                      <MarkdownRenderer content={msg.text} />
                    </div>
                  )}
                  <ResultCard
                    payload={msg.payload}
                    originalPrompt={originalPrompt}
                    onRegenerate={(prompt) => submitPrompt(prompt, [])}
                  />
                </>
              ) : msg.text ? (
                <div className="msg-agent edge-glow edge-glow-subtle">
                  <MarkdownRenderer content={msg.text} />
                </div>
              ) : null}
            </div>
          );
        })}

        {isThinking && (
          <div className="chat-message-group">
            <div className="thinking-indicator">
              <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
              {thinkingStages[thinkingStage]}
            </div>
          </div>
        )}
      </div>

      {/* 后续问题建议 */}
      {suggestions.length > 0 && !isThinking && (
        <div className="suggestions-bar">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="suggestion-btn"
              onClick={() => { setSuggestions([]); submitPrompt(s, []); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div ref={bottomRef} />
      <ChatInput
        onSubmit={submitPrompt} disabled={isThinking}
        onFilesAdded={(files) => setStagedFiles((prev) => [...prev, ...files.map((f) => ({ id: createId(), name: f.name, file: f }))])}
        externalFiles={sidebarFiles}
        fillText={fillText}
      />
      {typeof document !== "undefined" && createPortal(
        <LeftSidebar
          files={stagedFiles}
          onFileClick={(f) => { setSidebarFiles([f.file]); setTimeout(() => setSidebarFiles(undefined), 100); }}
          onClear={() => setStagedFiles([])}
          sessions={sessions}
          activeSessionId={sessionId}
          onSessionClick={loadSession}
          onSessionDelete={deleteSession}
          onGoHome={onGoHome}
          onNewChat={newChat}
        />,
        document.body
      )}
    </div>
  );
}
