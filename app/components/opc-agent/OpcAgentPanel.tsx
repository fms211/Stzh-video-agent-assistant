"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, X, Settings } from "lucide-react";
import OpcAgentSidebar from "./OpcAgentSidebar";
import OpcAgentChat from "./OpcAgentChat";
import ModelSwitcher from "./ModelSwitcher";
import ModelConfigPanel from "./ModelConfigPanel";
import ActionCards from "./ActionCards";
import { getActiveProvider } from "@/app/lib/llm-config";
import { streamChat, getThinkingSuffix } from "@/app/lib/llm-client";
import { buildOpcSystemPrompt } from "@/app/lib/opc-agent-context";
import { ragRetrieve, formatRagContext } from "@/app/lib/rag-client";
import { shouldSearch, searchAndFormat } from "@/app/lib/web-search";
import { getWorkflowById } from "@/app/lib/opc-workflows";
import {
  loadMessages, saveMessages, upsertSession,
  getActiveSessionId, setActiveSessionId,
  createSessionId, clearSessionMessages,
} from "@/app/lib/opc-agent-persist";
import { apiCompressSession, apiSetMemory } from "@/app/lib/opc-agent-api";
import type { LLMProvider } from "@/app/lib/llm-providers";
import type { OpcAgentMessage, OpcAgentContext, ActionCard } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  opcContext: OpcAgentContext;
};

function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "请求失败，请重试";
  const msg = err.message;
  if (err.name === "AbortError") return "__ABORTED__";
  if (msg.includes("401") || msg.includes("Unauthorized")) return "API Key 无效或已过期，请在设置中检查";
  if (msg.includes("403") || msg.includes("Forbidden")) return "API 访问被拒绝，请检查 API Key 权限";
  if (msg.includes("429") || msg.includes("rate")) return "请求过于频繁，请稍后再试";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) return "服务商暂时不可用，请稍后重试";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "网络连接失败，请检查网络";
  if (msg.includes("timeout")) return "请求超时，请重试";
  return msg.slice(0, 100);
}

export default function OpcAgentPanel({ open, onClose, opcContext }: Props) {
  const [messages, setMessages] = useState<OpcAgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"workflow" | "history" | "model">("workflow");
  const [sessionId, setSessionId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<OpcAgentMessage[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const p = getActiveProvider();
    setProvider(p);
    if (!p) setShowConfig(true);

    const init = async () => {
      const existingId = getActiveSessionId();
      if (existingId) {
        setSessionId(existingId);
        const msgs = await loadMessages(existingId);
        setMessages(msgs);
      } else {
        const newId = createSessionId();
        setSessionId(newId);
        setActiveSessionId(newId);
        setMessages([]);
      }
    };
    init();
  }, [open]);

  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const timer = setTimeout(() => {
      saveMessages(sessionId, messages);
      upsertSession(sessionId, messages);
    }, 500);
    return () => clearTimeout(timer);
  }, [messages, sessionId]);

  // 自动压缩：消息超过 40 条时，后台摘要旧消息
  useEffect(() => {
    if (!sessionId || messages.length <= 40 || !provider) return;
    const compress = async () => {
      try {
        const oldMessages = messages.slice(0, -20); // 保留最近 20 条
        const summaryPrompt = `请用 3-5 句话总结以下对话的关键信息（用户需求、已生成的内容、重要决策）：\n\n${oldMessages.map((m) => `${m.role}: ${m.content?.slice(0, 200)}`).join("\n")}`;

        const { streamChat } = await import("@/app/lib/llm-client");
        let summary = "";
        for await (const delta of streamChat(provider, [{ role: "user", content: summaryPrompt }])) {
          summary += delta;
        }

        if (summary) {
          await apiCompressSession(sessionId, summary, 20);
          // 保存关键偏好到跨会话记忆
          const userPrefs = oldMessages
            .filter((m) => m.role === "user")
            .map((m) => m.content?.slice(0, 100))
            .filter(Boolean);
          if (userPrefs.length > 0) {
            await apiSetMemory(`session_prefs_${sessionId}`, JSON.stringify(userPrefs), "preferences");
          }
        }
      } catch { /* 压缩失败不影响正常使用 */ }
    };
    compress();
  }, [messages.length > 40, sessionId, provider]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    });
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      triggerRef.current instanceof HTMLElement && triggerRef.current.focus();
    };
  }, [open, onClose]);

  // ── 普通对话发送 ──
  const handleSend = useCallback(async (content: string) => {
    if (!content.trim() || !provider) return;
    const userMsg: OpcAgentMessage = { id: `msg_${Date.now()}`, role: "user", content: content.trim(), timestamp: Date.now() };
    const assistantMsg: OpcAgentMessage = { id: `msg_${Date.now()}_ai`, role: "assistant", content: "", timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);
    try {
      // 并行：RAG 检索 + 条件性网络搜索
      const [ragResults, webResults] = await Promise.all([
        ragRetrieve(content.trim()),
        shouldSearch(content.trim()) ? searchAndFormat(content.trim()) : Promise.resolve(""),
      ]);
      const ragContext = formatRagContext(ragResults);
      // 合并 RAG + 网络搜索结果作为上下文
      const extraContext = [ragContext, webResults].filter(Boolean).join("\n\n");
      const systemPrompt = buildOpcSystemPrompt(opcContext, extraContext || undefined);
      const finalPrompt = systemPrompt + getThinkingSuffix(provider.thinkingLevel);
      const ctx = provider.contextWindow || 8192;
      const historyLimit = ctx <= 8192 ? 6 : ctx <= 32768 ? 20 : ctx <= 128000 ? 50 : ctx <= 200000 ? 80 : 200;
      const chatMessages = [
        { role: "system" as const, content: finalPrompt },
        // 保留所有有内容的消息（包括工作流步骤结果），过滤掉进度卡片和动作卡片
        ...messagesRef.current
          .filter((m) => m.content && m.role !== "workflow" && m.role !== "action-cards")
          .slice(-historyLimit)
          .map((m) => ({
            role: (m.role === "workflow-step" ? "assistant" : m.role) as "user" | "assistant",
            content: m.role === "workflow-step" ? `[工作流步骤·${m.stepName}]\n${m.content}` : m.content,
          })),
        { role: "user" as const, content: content.trim() },
      ];
      abortRef.current = new AbortController();
      let fullText = ""; let lastUpdate = 0;
      for await (const delta of streamChat(provider, chatMessages, abortRef.current.signal)) {
        fullText += delta;
        const now = Date.now();
        if (now - lastUpdate > 60) { lastUpdate = now; const s = fullText; setMessages((p) => p.map((m) => (m.id === assistantMsg.id ? { ...m, content: s } : m))); }
      }
      const finalText = fullText || "未收到回复，请重试";
      const ragSources = ragResults.map((r) => ({ name: r.metadata.name_cn || r.metadata.source, score: r.score, kb_type: r.metadata.kb_type }));
      setMessages((p) => p.map((m) => (m.id === assistantMsg.id ? { ...m, content: finalText, ragSources } : m)));
    } catch (err) {
      const friendly = friendlyError(err);
      if (friendly === "__ABORTED__") setMessages((p) => p.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + "\n\n*[已停止]*" } : m)));
      else setMessages((p) => p.map((m) => (m.id === assistantMsg.id ? { ...m, content: `❌ ${friendly}`, isError: true } : m)));
    } finally { setIsLoading(false); abortRef.current = null; }
  }, [provider, opcContext]);

  // ── 工作流在对话区内执行 ──
  const handleRunWorkflow = useCallback(async (workflowId: string, input: Record<string, string>) => {
    if (!provider) return;
    const wf = getWorkflowById(workflowId);
    if (!wf) return;

    setIsLoading(true);

    // 添加工作流开始消息
    const wfMsg: OpcAgentMessage = {
      id: `wf_${Date.now()}`, role: "workflow", content: "",
      timestamp: Date.now(), workflowId: wf.id, workflowName: wf.name, workflowIcon: wf.icon,
      totalSteps: wf.steps.length, stepIndex: 0,
    };
    setMessages((prev) => [...prev, wfMsg]);

    let prevOutput = "";
    for (let i = 0; i < wf.steps.length; i++) {
      const step = wf.steps[i];

      // 更新工作流消息进度
      setMessages((prev) => prev.map((m) => m.id === wfMsg.id ? { ...m, stepName: step.name, stepIndex: i } : m));

      // 添加步骤消息（初始为空，流式填充）
      const stepMsg: OpcAgentMessage = {
        id: `wf_step_${Date.now()}_${i}`, role: "workflow-step", content: "",
        timestamp: Date.now(), workflowName: wf.name, workflowIcon: wf.icon,
        stepName: step.name, stepIndex: i, totalSteps: wf.steps.length,
      };
      setMessages((prev) => [...prev, stepMsg]);

      try {
        let prompt = step.buildPrompt(input, prevOutput);

        // 所有工作流：每步自动搜索补充上下文（搜索词根据步骤+用户输入动态生成）
        const baseQuery = input.topic || input.style_name || input.product || input.style_a || input.raw_prompt || Object.values(input).find(v => v?.trim()) || "";
        if (baseQuery) {
          const stepQuery = `${baseQuery} ${step.name}`;
          const webResults = await searchAndFormat(stepQuery);
          if (webResults) {
            prompt = `${prompt}\n\n---\n以下是网络搜索获取的参考资料，请结合这些最新信息回答：\n\n${webResults}`;
          }
        }

        abortRef.current = new AbortController();
        let fullText = ""; let lastUpdate = 0;

        // 工作流步骤也带上对话历史和系统提示（注入 RAG 知识，force=true 跳过意图判断）
        const ragResults = await ragRetrieve(prompt, 5, 0.45, true);
        const ragContext = formatRagContext(ragResults);
        const systemPrompt = buildOpcSystemPrompt(opcContext, ragContext || undefined);
        const recentHistory = messagesRef.current
          .filter((m) => m.content && (m.role === "user" || m.role === "assistant" || m.role === "workflow-step"))
          .slice(-6)
          .map((m) => ({
            role: (m.role === "workflow-step" ? "assistant" : m.role) as "user" | "assistant",
            content: m.role === "workflow-step" ? `[${m.stepName}]\n${m.content}` : m.content,
          }));
        const stepMessages = [
          { role: "system" as const, content: systemPrompt },
          ...recentHistory,
          { role: "user" as const, content: prompt },
        ];

        for await (const delta of streamChat(provider, stepMessages, abortRef.current.signal)) {
          fullText += delta;
          const now = Date.now();
          if (now - lastUpdate > 80) { lastUpdate = now; const s = fullText; setMessages((p) => p.map((m) => (m.id === stepMsg.id ? { ...m, content: s } : m))); }
        }
        prevOutput = fullText || "（无输出）";
        setMessages((prev) => prev.map((m) => (m.id === stepMsg.id ? { ...m, content: prevOutput } : m)));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) => prev.map((m) => (m.id === stepMsg.id ? { ...m, content: m.content + "\n\n*[已停止]*", isError: true } : m)));
          setIsLoading(false); return;
        }
        setMessages((prev) => prev.map((m) => (m.id === stepMsg.id ? { ...m, content: `❌ ${friendlyError(err)}`, isError: true } : m)));
        setIsLoading(false); return;
      }
    }

    // 工作流完成 — 更新状态并添加动作卡片
    setMessages((prev) => prev.map((m) => m.id === wfMsg.id ? { ...m, stepIndex: wf.steps.length } : m));

    const cards: ActionCard[] = [
      { id: "save-report", type: "save-report", title: "保存报告", desc: "生成 .md 报告保存到文件", icon: "📄" },
      { id: "continue", type: "continue", title: "继续讨论", desc: "基于结果继续对话", icon: "💬" },
      { id: "send-to-workspace", type: "send-to-workspace", title: "传递到工作区", desc: "将提示词传递到 OPC", icon: "↗️" },
    ];
    const cardsMsg: OpcAgentMessage = {
      id: `wf_cards_${Date.now()}`, role: "action-cards", content: prevOutput,
      timestamp: Date.now(), workflowName: wf.name, cards,
    };
    setMessages((prev) => [...prev, cardsMsg]);
    setIsLoading(false);
  }, [provider]);

  // ── 动作卡片处理 ──
  const handleActionCard = useCallback((card: ActionCard, content: string) => {
    switch (card.type) {
      case "save-report": {
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `opc-workflow-${Date.now()}.md`; a.click(); URL.revokeObjectURL(url);
        break;
      }
      case "continue":
        handleSend("基于以上工作流结果，我想继续讨论。请总结关键发现，然后问我想深入哪个方面。");
        break;
      case "send-to-workspace":
        // 通过自定义事件传递到 OPCPanel
        window.dispatchEvent(new CustomEvent("opc_agent_to_workspace", { detail: { text: content } }));
        break;
    }
  }, [handleSend]);

  const handleRetry = useCallback((messageId: string) => {
    const idx = messagesRef.current.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    for (let i = idx - 1; i >= 0; i--) {
      if (messagesRef.current[i].role === "user") {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        handleSend(messagesRef.current[i].content); return;
      }
    }
  }, [handleSend]);

  const handleDelete = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;
      const msg = prev[idx];
      // 如果是用户消息，也删除紧随其后的助手回复
      if (msg.role === "user" && idx + 1 < prev.length && prev[idx + 1].role === "assistant") {
        return prev.filter((_, i) => i !== idx && i !== idx + 1);
      }
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleStop = useCallback(() => { abortRef.current?.abort(); }, []);
  const handleClear = useCallback(() => {
    if (!confirm("确定要清空当前对话吗？")) return;
    setMessages([]); if (sessionId) clearSessionMessages(sessionId);
  }, [sessionId]);
  const handleNewSession = useCallback(() => {
    const newId = createSessionId(); setSessionId(newId); setActiveSessionId(newId); setMessages([]);
  }, []);
  const handleSwitchSession = useCallback(async (id: string) => {
    setSessionId(id); setActiveSessionId(id);
    const msgs = await loadMessages(id);
    setMessages(msgs);
  }, []);
  const handleProviderChange = useCallback((p: LLMProvider) => {
    setProvider(p); if (showConfig) setShowConfig(false);
  }, [showConfig]);

  if (!open) return null;

  return (
    <>
      <div className="opc-agent-backdrop" onClick={onClose} />
      <div ref={panelRef} className="opc-agent-panel edge-glow edge-glow-strong" role="dialog" aria-modal="true" aria-labelledby="opc-agent-title">
        <div className="opc-agent-header">
          <div className="opc-agent-header-left">
            <Sparkles size={16} className="opc-agent-header-icon" />
            <span className="opc-agent-header-title" id="opc-agent-title">OPC 创作助手</span>
          </div>
          <div className="opc-agent-header-right">
            <ModelSwitcher provider={provider} onChange={handleProviderChange} onOpenConfig={() => { setSidebarTab("model"); setShowConfig(true); }} />
            <button type="button" className="opc-agent-header-btn" onClick={() => setShowConfig(!showConfig)} aria-label="模型设置"><Settings size={14} /></button>
            <button type="button" className="opc-agent-header-btn" onClick={onClose} aria-label="关闭面板"><X size={14} /></button>
          </div>
        </div>

        <div className="opc-agent-body">
          {showConfig ? (
            <ModelConfigPanel provider={provider} onChange={handleProviderChange} onClose={() => setShowConfig(false)} />
          ) : (
            <>
              <OpcAgentSidebar
                activeTab={sidebarTab} onTabChange={setSidebarTab}
                messages={messages} onClear={handleClear} provider={provider}
                onNewSession={handleNewSession} onSwitchSession={handleSwitchSession}
                onRunWorkflow={handleRunWorkflow}
              />
              <OpcAgentChat
                messages={messages} isLoading={isLoading}
                onSend={handleSend} onStop={handleStop}
                onRetry={handleRetry} onDelete={handleDelete}
                onActionCard={handleActionCard}
                opcContext={opcContext} provider={provider}
              />
            </>
          )}
        </div>
      </div>

      <style>{`
        .opc-agent-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: var(--z-max); animation: opc-backdrop-in 0.25s ease-out both; }
        @keyframes opc-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        .opc-agent-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 960px; height: 680px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); z-index: calc(var(--z-max) + 1); border-radius: 16px; background: var(--space-panel); border: 1px solid var(--border-subtle); box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 40px color-mix(in srgb, var(--glow-warm) 8%, transparent); display: flex; flex-direction: column; overflow: hidden; animation: opc-panel-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes opc-panel-in { from { opacity: 0; transform: translate(-50%,-50%) scale(0.95) translateY(8px); } to { opacity: 1; transform: translate(-50%,-50%) scale(1) translateY(0); } }
        .opc-agent-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; min-height: 44px; }
        .opc-agent-header-left { display: flex; align-items: center; gap: 8px; }
        .opc-agent-header-icon { color: var(--glow-warm); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--glow-warm) 50%, transparent)); }
        .opc-agent-header-title { font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; color: var(--foreground); letter-spacing: 0.04em; }
        .opc-agent-header-right { display: flex; align-items: center; gap: 6px; }
        .opc-agent-header-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--foreground-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; outline: none; }
        .opc-agent-header-btn:hover { color: var(--foreground); background: color-mix(in srgb, var(--glow-warm) 8%, transparent); border-color: color-mix(in srgb, var(--glow-warm) 20%, transparent); }
        .opc-agent-header-btn:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent); }
        .opc-agent-body { display: flex; flex: 1; overflow: hidden; }
        @media (prefers-reduced-motion: reduce) { .opc-agent-backdrop, .opc-agent-panel { animation: none !important; } }
        @media (max-width: 640px) { .opc-agent-panel { width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; border-radius: 0; } .opc-agent-header-btn { width: 44px; height: 44px; } }
      `}</style>
    </>
  );
}
