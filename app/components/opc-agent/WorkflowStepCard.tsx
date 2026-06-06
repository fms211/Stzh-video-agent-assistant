"use client";

import { useState } from "react";
import { Check, Loader2, AlertCircle, Circle, ChevronDown } from "lucide-react";
import MarkdownRenderer from "../MarkdownRenderer";

type Props = {
  workflowName: string;
  workflowIcon: string;
  stepName?: string;
  stepIndex: number;
  totalSteps: number;
  content: string;
  isRunning?: boolean;
  isDone?: boolean;
  isError?: boolean;
};

export default function WorkflowStepCard({
  workflowName, workflowIcon, stepName, stepIndex, totalSteps,
  content, isRunning, isDone, isError,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const StatusIcon = isDone ? Check : isRunning ? Loader2 : isError ? AlertCircle : Circle;
  const statusClass = isDone ? "done" : isRunning ? "running" : isError ? "error" : "pending";

  return (
    <div className={`wf-card ${statusClass}`}>
      <div className="wf-card-header" onClick={isDone ? () => setCollapsed(!collapsed) : undefined}>
        <span className="wf-card-icon">{workflowIcon}</span>
        <span className="wf-card-name">{workflowName}</span>
        {stepName && (
          <span className="wf-card-step">
            <StatusIcon size={11} className={isRunning ? "wf-spin" : ""} />
            {stepName} ({stepIndex + 1}/{totalSteps})
          </span>
        )}
        {isDone && content && (
          <ChevronDown size={12} className={`wf-card-chevron ${collapsed ? "collapsed" : ""}`} />
        )}
      </div>
      {content && !collapsed && (
        <div className={`wf-card-content ${isDone ? "done" : ""}`}>
          <MarkdownRenderer content={content} />
        </div>
      )}

      <style>{`
        .wf-card {
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--space-surface);
          overflow: hidden;
          max-width: 100%;
          flex-shrink: 0;
        }
        .wf-card.running { border-color: color-mix(in srgb, var(--glow-warm) 25%, transparent); }
        .wf-card.done { border-color: color-mix(in srgb, #4ade80 20%, transparent); }
        .wf-card.error { border-color: color-mix(in srgb, var(--error) 25%, transparent); }

        .wf-card-header {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-subtle);
          font-size: 11px; color: var(--foreground-muted);
          user-select: none;
        }
        .wf-card.done .wf-card-header { cursor: pointer; }
        .wf-card.done .wf-card-header:hover { background: color-mix(in srgb, var(--glow-warm) 3%, transparent); }
        .wf-card-icon { font-size: 14px; }
        .wf-card-name { font-family: "GeistPixel-Line", var(--font-sans); color: var(--foreground); font-size: 12px; }
        .wf-card-step { display: flex; align-items: center; gap: 4px; margin-left: auto; font-size: 10px; }
        .wf-card.running .wf-card-step { color: var(--glow-warm); }
        .wf-card.done .wf-card-step { color: #4ade80; }
        .wf-card.error .wf-card-step { color: var(--error); }

        .wf-card-chevron {
          margin-left: 4px; flex-shrink: 0;
          transition: transform 0.2s;
          color: var(--foreground-muted); opacity: 0.5;
        }
        .wf-card-chevron.collapsed { transform: rotate(-90deg); }

        /* 生成中：不限高度，自然滚动 */
        .wf-card-content {
          padding: 10px 12px;
          font-size: 12px; line-height: 1.6;
          color: var(--foreground);
          overflow-y: auto;
          max-height: none;
        }
        /* 完成后：限制高度，可滚动 */
        .wf-card-content.done {
          max-height: 400px;
        }

        .wf-spin { animation: wf-spin 1s linear infinite; }
        @keyframes wf-spin { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
          .wf-spin { animation: none !important; }
          .wf-card-chevron { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
