"use client";

import { useEffect, useRef } from "react";
import OpcAgentMessage from "./OpcAgentMessage";
import OpcAgentInput from "./OpcAgentInput";
import WorkflowStepCard from "./WorkflowStepCard";
import ActionCards from "./ActionCards";
import type { LLMProvider } from "@/app/lib/llm-providers";
import type { OpcAgentMessage as MessageType, OpcAgentContext, ActionCard } from "./types";

type Props = {
  messages: MessageType[];
  isLoading: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  onRetry: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onActionCard: (card: ActionCard, content: string) => void;
  opcContext: OpcAgentContext;
  provider: LLMProvider | null;
};

export default function OpcAgentChat({
  messages, isLoading, onSend, onStop, onRetry, onDelete, onActionCard, opcContext, provider,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="opc-chat">
      <div className="opc-chat-messages">
        {messages.length === 0 ? (
          <div className="opc-chat-empty">
            <div className="opc-chat-empty-icon">✦</div>
            <div className="opc-chat-empty-title">OPC 创作助手</div>
            <div className="opc-chat-empty-desc">
              {provider
                ? "在左侧工作流中选择工作流，或直接输入消息开始对话。"
                : "请先在设置中配置模型，然后开始对话。"
              }
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              // 工作流进度消息
              if (msg.role === "workflow") {
                return (
                  <WorkflowStepCard
                    key={msg.id}
                    workflowName={msg.workflowName || ""}
                    workflowIcon={msg.workflowIcon || "🎬"}
                    stepName={msg.stepName}
                    stepIndex={msg.stepIndex || 0}
                    totalSteps={msg.totalSteps || 0}
                    content=""
                    isRunning={isLoading && msg.stepIndex !== msg.totalSteps}
                    isDone={!isLoading && msg.stepIndex === msg.totalSteps}
                  />
                );
              }
              // 工作流步骤消息
              if (msg.role === "workflow-step") {
                return (
                  <WorkflowStepCard
                    key={msg.id}
                    workflowName={msg.workflowName || ""}
                    workflowIcon={msg.workflowIcon || "🎬"}
                    stepName={msg.stepName}
                    stepIndex={msg.stepIndex || 0}
                    totalSteps={msg.totalSteps || 0}
                    content={msg.content}
                    isDone={!!msg.content && !msg.isError}
                    isError={msg.isError}
                  />
                );
              }
              // 动作卡片消息
              if (msg.role === "action-cards" && msg.cards) {
                return (
                  <div key={msg.id} className="opc-action-cards-wrapper">
                    <ActionCards cards={msg.cards} onAction={(card) => onActionCard(card, msg.content)} />
                  </div>
                );
              }
              // 普通用户/助手消息
              return (
                <OpcAgentMessage
                  key={msg.id}
                  message={msg}
                  onRetry={msg.isError ? () => onRetry(msg.id) : undefined}
                  onDelete={() => onDelete(msg.id)}
                />
              );
            })}
            {isLoading && !messages.some((m) => m.role === "workflow") && (
              <div className="opc-chat-thinking">
                <span className="opc-chat-dot" /><span className="opc-chat-dot" /><span className="opc-chat-dot" />
                <span className="opc-chat-thinking-text">思考中…</span>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <OpcAgentInput
        onSend={onSend} onStop={onStop} isLoading={isLoading}
        disabled={!provider} placeholder={provider ? "输入消息…" : "请先配置模型…"}
      />

      <style>{`
        .opc-chat { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .opc-chat-messages { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
        .opc-chat-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 20px; }
        .opc-chat-empty-icon { font-size: 28px; color: var(--glow-warm); text-shadow: 0 0 16px color-mix(in srgb, var(--glow-warm) 50%, transparent); margin-bottom: 4px; }
        .opc-chat-empty-title { font-family: "GeistPixel-Line", var(--font-sans); font-size: 15px; color: var(--foreground); letter-spacing: 0.04em; }
        .opc-chat-empty-desc { font-size: 12px; color: var(--foreground-muted); line-height: 1.6; max-width: 320px; }
        .opc-chat-thinking { display: flex; align-items: center; gap: 4px; padding: 8px 12px; align-self: flex-start; flex-shrink: 0; }
        .opc-chat-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--glow-warm); opacity: 0.4; animation: opc-dot-pulse 1.4s ease-in-out infinite; }
        .opc-chat-dot:nth-child(2) { animation-delay: 0.2s; }
        .opc-chat-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes opc-dot-pulse { 0%, 80%, 100% { opacity: 0.4; transform: scale(1); } 40% { opacity: 1; transform: scale(1.2); } }
        .opc-chat-thinking-text { font-size: 11px; color: var(--foreground-muted); margin-left: 4px; }
        .opc-action-cards-wrapper { padding: 4px 0; flex-shrink: 0; }
        @media (prefers-reduced-motion: reduce) { .opc-chat-dot { animation: none !important; } }
      `}</style>
    </div>
  );
}
