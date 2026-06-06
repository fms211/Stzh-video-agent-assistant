"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";

type Props = {
  onSend: (content: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export default function OpcAgentInput({ onSend, onStop, isLoading, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  };

  return (
    <div className="opc-input-wrap">
      <div className="opc-input-capsule">
        <textarea
          ref={textareaRef}
          className="opc-input-textarea"
          rows={1}
          value={value}
          onChange={(e) => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "输入消息…"}
          disabled={disabled}
        />
        {isLoading ? (
          <button
            type="button"
            className="opc-input-btn stop"
            onClick={onStop}
            aria-label="停止生成"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            className={`opc-input-btn send ${canSend ? "active" : ""}`}
            onClick={handleSend}
            disabled={!canSend}
            aria-label="发送"
          >
            <ArrowUp size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>

      <style>{`
        .opc-input-wrap {
          padding: 8px 12px 12px;
          border-top: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }

        .opc-input-capsule {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          padding: 6px 6px 6px 12px;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--space-surface);
          transition: border-color 0.2s;
        }
        .opc-input-capsule:focus-within {
          border-color: color-mix(in srgb, var(--glow-warm) 35%, transparent);
        }

        .opc-input-textarea {
          flex: 1;
          border: none;
          background: transparent;
          color: var(--foreground);
          font-family: var(--font-geist-sans), sans-serif;
          font-size: 13px;
          line-height: 1.5;
          resize: none;
          outline: none;
          min-height: 20px;
          max-height: 100px;
        }
        .opc-input-textarea::placeholder {
          color: var(--foreground-muted);
          opacity: 0.5;
        }
        .opc-input-textarea:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .opc-input-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
          outline: none;
        }
        .opc-input-btn.send {
          background: color-mix(in srgb, var(--glow-warm) 20%, transparent);
          color: var(--foreground-muted);
        }
        .opc-input-btn.send.active {
          background: var(--glow-warm);
          color: var(--space-deep);
        }
        .opc-input-btn.send.active:hover {
          transform: scale(1.08);
          box-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }
        .opc-input-btn.send:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .opc-input-btn.stop {
          background: color-mix(in srgb, var(--error) 15%, transparent);
          color: var(--error);
        }
        .opc-input-btn.stop:hover {
          background: color-mix(in srgb, var(--error) 25%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .opc-input-btn { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
