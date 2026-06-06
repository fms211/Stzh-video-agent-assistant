"use client";

import { Zap } from "lucide-react";

type Props = {
  actions: string[];
  onSelect: (action: string) => void;
};

export default function QuickActions({ actions, onSelect }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className="opc-quick-actions">
      <div className="opc-quick-label">
        <Zap size={11} /> 快捷提问
      </div>
      <div className="opc-quick-grid">
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            className="opc-quick-btn"
            onClick={() => onSelect(action)}
          >
            {action}
          </button>
        ))}
      </div>

      <style>{`
        .opc-quick-actions {
          margin-top: 16px;
          width: 100%;
          max-width: 380px;
        }
        .opc-quick-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: var(--foreground-muted);
          margin-bottom: 8px;
          letter-spacing: 0.04em;
        }
        .opc-quick-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .opc-quick-btn {
          padding: 5px 10px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--glow-warm) 4%, transparent);
          color: var(--foreground-muted);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          outline: none;
        }
        .opc-quick-btn:hover {
          border-color: color-mix(in srgb, var(--glow-warm) 30%, transparent);
          color: var(--foreground);
          background: color-mix(in srgb, var(--glow-warm) 8%, transparent);
          transform: translateY(-1px);
        }
        .opc-quick-btn:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .opc-quick-btn { transition: none !important; }
          .opc-quick-btn:hover { transform: none !important; }
        }
      `}</style>
    </div>
  );
}
