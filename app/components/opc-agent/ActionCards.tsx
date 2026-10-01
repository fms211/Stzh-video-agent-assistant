"use client";

import { FileText, MessageSquare, Bookmark, Send } from "lucide-react";
import type { ActionCard } from "./types";

type Props = {
  cards: ActionCard[];
  onAction: (card: ActionCard) => void;
};

const ICONS: Record<string, typeof FileText> = {
  "save-report": FileText,
  "continue": MessageSquare,
  "save-template": Bookmark,
  "send-to-workspace": Send,
};

export default function ActionCards({ cards, onAction }: Props) {
  return (
    <div className="action-cards">
      {cards.map((card) => {
        const Icon = ICONS[card.type] || FileText;
        return (
          <button
            key={card.id}
            type="button"
            className="action-card"
            onClick={() => onAction(card)}
          >
            <div className="action-card-icon">
              <Icon size={18} strokeWidth={1.5} />
            </div>
            <div className="action-card-text">
              <span className="action-card-title">{card.title}</span>
              <span className="action-card-desc">{card.desc}</span>
            </div>
          </button>
        );
      })}

      <style>{`
        .action-cards {
          display: flex; gap: 8px; flex-wrap: wrap;
          padding: 4px 0; max-width: 100%;
        }
        .action-card {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: var(--shape-control);
          border: 1px solid var(--border-subtle);
          background: var(--space-surface);
          cursor: pointer; transition: all 0.2s;
          min-width: 140px; flex: 1; min-height: 48px;
          outline: none; text-align: left;
        }
        .action-card:hover {
          border-color: color-mix(in srgb, var(--glow-warm) 30%, transparent);
          background: color-mix(in srgb, var(--glow-warm) 6%, var(--space-surface));
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .action-card:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent);
        }
        .action-card-icon {
          width: 32px; height: 32px; border-radius: var(--shape-control);
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--glow-warm) 10%, transparent);
          color: var(--glow-warm); flex-shrink: 0;
        }
        .action-card-text {
          display: flex; flex-direction: column; gap: 1px; min-width: 0;
        }
        .action-card-title {
          font-family: var(--font-ui);
          font-size: var(--text-caption-size); color: var(--foreground); line-height: var(--text-caption-line); }
        .action-card-desc {
          font-size: var(--text-caption-size); color: var(--text-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: var(--text-caption-line); }

        @media (max-width: 640px) {
          .action-cards { flex-direction: column; }
          .action-card { min-width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .action-card { transition: none !important; }
          .action-card:hover { transform: none !important; }
        }
      `}</style>
    </div>
  );
}
