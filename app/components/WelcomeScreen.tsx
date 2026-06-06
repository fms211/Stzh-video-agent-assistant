"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { Video, ScrollText, Sparkles, Lightbulb } from "lucide-react";

type Props = {
  onStart: (initialPrompt?: string) => void;
};

const QUICK_ACTIONS = [
  { icon: <Video size={18} strokeWidth={1.8} />, label: "生成短视频", prompt: "帮我生成一个短视频" },
  { icon: <ScrollText size={18} strokeWidth={1.8} />, label: "写分镜脚本", prompt: "帮我写一个分镜脚本" },
  { icon: <Sparkles size={18} strokeWidth={1.8} />, label: "优化提示词", prompt: "帮我优化AI生图提示词" },
  { icon: <Lightbulb size={18} strokeWidth={1.8} />, label: "创意灵感", prompt: "给我一些短视频创意灵感" },
];

export default function WelcomeScreen({ onStart }: Props) {
  const { user } = useAuth();
  const [displayText, setDisplayText] = useState("");
  const [showActions, setShowActions] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const fullText = `你好，${user?.displayName || user?.username || "创作者"}！`;
  const subText = "今天想创作什么？";

  // 打字机效果
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i <= fullText.length) {
        setDisplayText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
        setTimeout(() => setShowActions(true), 300);
        setTimeout(() => setShowHint(true), 800);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [fullText]);

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-greeting">
          <h1 className="welcome-title">{displayText}<span className="welcome-cursor">|</span></h1>
          <p className={`welcome-subtitle ${showActions ? "visible" : ""}`}>{subText}</p>
        </div>

        <div className={`welcome-actions ${showActions ? "visible" : ""}`}>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="welcome-action-btn"
              onClick={() => onStart(action.prompt)}
            >
              <span className="welcome-action-icon">{action.icon}</span>
              <span className="welcome-action-label">{action.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`welcome-skip ${showHint ? "visible" : ""}`}
          onClick={() => onStart()}
        >
          跳过，直接开始对话
        </button>
      </div>

      <style>{`
        .welcome-screen {
          position: absolute; inset: 0; z-index: 10;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; user-select: none;
          animation: welcome-fade-in 0.6s ease-out;
        }
        @keyframes welcome-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .welcome-content {
          display: flex; flex-direction: column; align-items: center; gap: 32px;
          max-width: 600px; text-align: center; padding: 20px;
          pointer-events: auto;
        }
        .welcome-greeting { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .welcome-title {
          font-family: "ZCOOL QingKe HuangYou", "GeistPixel-Line", var(--font-display), sans-serif;
          font-size: 36px; font-weight: 400; line-height: 1.3;
          background: linear-gradient(135deg, var(--glow-warm) 0%, var(--glow-warm-soft) 40%, var(--glow-aurora) 70%, var(--glow-cool) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: text-shimmer 4s linear infinite;
          filter: drop-shadow(0 0 20px color-mix(in srgb, var(--glow-warm) 30%, transparent));
          min-height: 1.3em;
        }
        .welcome-cursor {
          -webkit-text-fill-color: var(--glow-warm);
          animation: cursor-blink 1s step-end infinite;
          font-weight: 100;
        }
        @keyframes cursor-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        .welcome-subtitle {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 16px; color: var(--foreground-muted);
          letter-spacing: 0.08em; opacity: 0; transform: translateY(8px);
          transition: all 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        .welcome-subtitle.visible { opacity: 1; transform: translateY(0); }

        .welcome-actions {
          display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
          opacity: 0; transform: translateY(16px);
          transition: all 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        .welcome-actions.visible { opacity: 1; transform: translateY(0); }
        .welcome-action-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 12px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
          color: var(--foreground); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px;
          transition: all 0.2s var(--ease-out-quart);
          letter-spacing: 0.03em;
        }
        .welcome-action-btn:hover {
          border-color: var(--glow-warm);
          background: color-mix(in srgb, var(--space-panel) 80%, var(--glow-warm) 8%);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 0 16px color-mix(in srgb, var(--glow-warm) 10%, transparent);
        }
        .welcome-action-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--glow-warm);
        }
        .welcome-action-label { font-size: 13px; }

        .welcome-skip {
          background: none; border: 1px solid var(--border-subtle); border-radius: 8px;
          padding: 8px 20px; color: var(--foreground-muted); cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px;
          opacity: 0; transition: all 0.5s ease; letter-spacing: 0.04em;
        }
        .welcome-skip.visible { opacity: 0.6; }
        .welcome-skip:hover { opacity: 1; border-color: var(--glow-warm); color: var(--glow-warm); }
      `}</style>
    </div>
  );
}
