"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Zap, Cpu, Brain, Settings } from "lucide-react";
import { getProviders, setActiveProviderId } from "@/app/lib/llm-config";
import { THINKING_LEVELS, type ThinkingLevel } from "@/app/lib/llm-providers";
import type { LLMProvider } from "@/app/lib/llm-providers";

type Props = {
  provider: LLMProvider | null;
  onChange: (provider: LLMProvider) => void;
  onOpenConfig: () => void;
};

const LEVEL_ICONS: Record<ThinkingLevel, typeof Zap> = {
  quick: Zap,
  standard: Cpu,
  deep: Brain,
};

export default function ModelSwitcher({ provider, onChange, onOpenConfig }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 只在下拉打开时读取 localStorage
  const providers = open ? getProviders() : [];

  const handleSelect = (p: LLMProvider) => {
    setActiveProviderId(p.id);
    onChange(p);
    setOpen(false);
  };

  return (
    <div className="opc-model-switcher" ref={ref}>
      <button
        type="button"
        className="opc-model-trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="opc-model-trigger-name">{provider?.name || "选择模型"}</span>
        <ChevronDown size={12} className={`opc-model-trigger-arrow ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="opc-model-dropdown edge-glow edge-glow-subtle">
          {providers.length === 0 ? (
            <div className="opc-model-empty">
              未配置模型
              <button type="button" className="opc-model-config-btn" onClick={() => { onOpenConfig(); setOpen(false); }}>
                <Settings size={11} /> 去配置
              </button>
            </div>
          ) : (
            <>
              {THINKING_LEVELS.map((lvl) => {
                const levelProviders = providers.filter((p) => (p.thinkingLevel || "standard") === lvl.key);
                if (levelProviders.length === 0) return null;
                const Icon = LEVEL_ICONS[lvl.key];
                return (
                  <div key={lvl.key} className="opc-model-group">
                    <div className="opc-model-group-label">
                      <Icon size={10} /> {lvl.label}
                    </div>
                    {levelProviders.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`opc-model-option ${p.id === provider?.id ? "active" : ""}`}
                        onClick={() => handleSelect(p)}
                      >
                        <span className="opc-model-option-name">{p.name}</span>
                        <span className="opc-model-option-id">{p.model}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <style>{`
        .opc-model-switcher {
          position: relative;
        }

        .opc-model-trigger {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--glow-warm) 5%, transparent);
          color: var(--foreground-muted);
          cursor: pointer;
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 10px;
          transition: all 0.15s;
          outline: none;
        }
        .opc-model-trigger:hover {
          border-color: color-mix(in srgb, var(--glow-warm) 25%, transparent);
          color: var(--foreground);
        }
        .opc-model-trigger-name {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .opc-model-trigger-arrow {
          transition: transform 0.2s;
          flex-shrink: 0;
        }
        .opc-model-trigger-arrow.open {
          transform: rotate(180deg);
        }

        .opc-model-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          width: 200px;
          border-radius: 10px;
          background: var(--space-panel);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          z-index: 100;
          overflow: hidden;
          animation: opc-dropdown-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes opc-dropdown-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .opc-model-empty {
          padding: 16px;
          text-align: center;
          color: var(--foreground-muted);
          font-size: 11px;
        }
        .opc-model-config-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--glow-warm);
          font-size: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .opc-model-config-btn:hover {
          background: color-mix(in srgb, var(--glow-warm) 8%, transparent);
        }

        .opc-model-group {
          padding: 4px 0;
        }
        .opc-model-group-label {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          font-size: 9px;
          color: var(--foreground-muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .opc-model-option {
          display: flex;
          flex-direction: column;
          gap: 1px;
          width: 100%;
          padding: 6px 10px;
          border: none;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
          outline: none;
        }
        .opc-model-option:hover {
          background: color-mix(in srgb, var(--glow-warm) 6%, transparent);
        }
        .opc-model-option.active {
          background: color-mix(in srgb, var(--glow-warm) 10%, transparent);
        }
        .opc-model-option-name {
          font-size: 11px;
          font-family: "GeistPixel-Line", var(--font-sans);
        }
        .opc-model-option-id {
          font-family: var(--font-geist-mono), monospace;
          font-size: 9px;
          color: var(--foreground-muted);
        }

        @media (prefers-reduced-motion: reduce) {
          .opc-model-dropdown { animation: none !important; }
          .opc-model-trigger-arrow { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
