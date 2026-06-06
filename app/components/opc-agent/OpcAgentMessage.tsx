"use client";

import { User, Bot, Copy, Check, RotateCcw, Trash2 } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import MarkdownRenderer from "../MarkdownRenderer";
import type { OpcAgentMessage as MessageType } from "./types";

export default function OpcAgentMessage({ message, onRetry, onDelete }: {
  message: MessageType;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const timeStr = useMemo(() => new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), [message.timestamp]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message.content]);

  return (
    <div className={`opc-msg ${isUser ? "user" : "assistant"} ${message.isError ? "error" : ""}`}>
      <div className="opc-msg-avatar">
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="opc-msg-body">
        <div className="opc-msg-content">
          {isUser ? (
            <p className="opc-msg-text">{message.content}</p>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>
        {!isUser && message.ragSources && message.ragSources.length > 0 && (
          <div className="opc-msg-rag">
            参考了 {message.ragSources.length} 条知识：
            {message.ragSources.map((s, i) => (
              <span key={i} className="opc-msg-rag-tag">
                {s.name} <span className="opc-msg-rag-score">{(s.score * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        )}
        <div className="opc-msg-footer">
          <span className="opc-msg-time">{timeStr}</span>
          {!isUser && message.content && (
            <button type="button" className="opc-msg-action" onClick={handleCopy} aria-label="复制" title="复制">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
          {message.isError && onRetry && (
            <button type="button" className="opc-msg-action retry" onClick={onRetry} aria-label="重试" title="重试">
              <RotateCcw size={12} />
            </button>
          )}
          {onDelete && (
            <button type="button" className="opc-msg-action delete" onClick={onDelete} aria-label="删除" title="删除">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <style>{`
        .opc-msg { display: flex; gap: 8px; max-width: 85%; animation: opc-msg-in 0.25s ease-out; flex-shrink: 0; }
        .opc-msg.user { align-self: flex-end; flex-direction: row-reverse; }
        .opc-msg.assistant { align-self: flex-start; }
        @keyframes opc-msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        .opc-msg-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .opc-msg.user .opc-msg-avatar { background: color-mix(in srgb, var(--glow-warm) 15%, transparent); color: var(--glow-warm); }
        .opc-msg.assistant .opc-msg-avatar { background: color-mix(in srgb, var(--glow-cool) 15%, transparent); color: var(--glow-cool); }
        .opc-msg.error .opc-msg-avatar { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }

        .opc-msg-body { display: flex; flex-direction: column; gap: 4px; }
        .opc-msg-content { padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.6; }
        .opc-msg.user .opc-msg-content { background: color-mix(in srgb, var(--glow-warm) 12%, var(--space-surface)); border: 1px solid color-mix(in srgb, var(--glow-warm) 18%, transparent); color: var(--foreground); }
        .opc-msg.assistant .opc-msg-content { background: var(--space-surface); border: 1px solid var(--border-subtle); color: var(--foreground); }
        .opc-msg.error .opc-msg-content { background: color-mix(in srgb, var(--error) 6%, var(--space-surface)); border: 1px solid color-mix(in srgb, var(--error) 20%, transparent); }
        .opc-msg-text { margin: 0; white-space: pre-wrap; word-break: break-word; }

        .opc-msg-rag { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 4px; font-size: 9px; color: var(--foreground-muted); }
        .opc-msg-rag-tag { padding: 1px 6px; border-radius: 4px; background: color-mix(in srgb, var(--glow-cool) 8%, transparent); }
        .opc-msg-rag-score { color: var(--glow-cool); }

        .opc-msg-footer { display: flex; align-items: center; gap: 6px; padding: 0 4px; }
        .opc-msg.user .opc-msg-footer { justify-content: flex-end; }
        .opc-msg-time { font-size: 9px; color: var(--foreground-muted); opacity: 0.5; }

        .opc-msg-action { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--foreground-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.15s; outline: none; }
        .opc-msg:hover .opc-msg-action { opacity: 0.6; }
        .opc-msg-action:hover { opacity: 1 !important; color: var(--glow-warm); background: color-mix(in srgb, var(--glow-warm) 8%, transparent); }
        .opc-msg-action:focus-visible { opacity: 1; box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent); }
        .opc-msg-action.retry { color: var(--error); }
        .opc-msg-action.retry:hover { color: var(--error); background: color-mix(in srgb, var(--error) 8%, transparent); }
        .opc-msg-action.delete { color: var(--foreground-muted); }
        .opc-msg-action.delete:hover { color: var(--error); background: color-mix(in srgb, var(--error) 8%, transparent); }

        @media (prefers-reduced-motion: reduce) { .opc-msg { animation: none !important; } }
      `}</style>
    </div>
  );
}
