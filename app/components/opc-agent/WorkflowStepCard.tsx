"use client";

import { useState } from "react";
import { Check, Loader2, AlertCircle, Circle, ChevronDown } from "lucide-react";
import MarkdownRenderer from "../MarkdownRenderer";
import { normalizeReferenceNotes } from "@/app/lib/reference-retrieval";

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
  referenceNotes?: string[];
};

export default function WorkflowStepCard({
  workflowName, workflowIcon, stepName, stepIndex, totalSteps,
  content, isRunning, isDone, isError, referenceNotes,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const StatusIcon = isDone ? Check : isRunning ? Loader2 : isError ? AlertCircle : Circle;
  const statusClass = isDone ? "done" : isRunning ? "running" : isError ? "error" : "pending";
  const notes = normalizeReferenceNotes(referenceNotes);

  return (
    <div className={`wf-card ${statusClass}`}>
      <button
        type="button"
        className="wf-card-header"
        onClick={isDone ? () => setCollapsed(!collapsed) : undefined}
        aria-expanded={isDone ? !collapsed : undefined}
        disabled={!isDone}
      >
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
      </button>
      {!!notes.length && <div className="wf-card-references" role="status" aria-label="本步骤资料状态">
        <span>资料状态</span>
        <ul>{notes.map(note => <li key={note}>{note}</li>)}</ul>
      </div>}
      {content && !collapsed && (
        <div className={`wf-card-content ${isDone ? "done" : ""}`}>
          <MarkdownRenderer content={content} />
        </div>
      )}

      <style>{`
        .wf-card {
          border-radius: var(--shape-control);
          border: 1px solid var(--border-subtle);
          background: var(--space-surface);
          overflow: hidden;
          max-width: 100%;
          min-width: 0;
          flex-shrink: 0;
        }
        .wf-card.running { border-color: color-mix(in srgb, var(--glow-warm) 25%, transparent); }
        .wf-card.done { border-color: color-mix(in srgb, var(--glow-success) 20%, transparent); }
        .wf-card.error { border-color: color-mix(in srgb, var(--error) 25%, transparent); }

        .wf-card-header {
          display: flex; align-items: center; gap: 6px;
          width: 100%;
          padding: 8px 12px;
          border: none;
          border-bottom: 1px solid var(--border-subtle);
          background: transparent;
          font-family: inherit;
          font-size: var(--text-caption-size); color: var(--text-muted);
          text-align: left;
          user-select: none;
          cursor: default; line-height: var(--text-caption-line); }
        .wf-card.done .wf-card-header { cursor: pointer; }
        .wf-card.done .wf-card-header:hover { background: color-mix(in srgb, var(--glow-warm) 3%, transparent); }
        .wf-card-header:focus-visible { outline: 2px solid var(--glow-warm); outline-offset: -2px; }
        .wf-card-icon { font-size: var(--text-body-size); line-height: var(--text-body-line); }
        .wf-card-name { font-family: var(--font-ui); color: var(--foreground); font-size: var(--text-caption-size); min-width:0; overflow-wrap:anywhere; line-height: var(--text-caption-line); }
        .wf-card-step { display: flex; align-items: center; gap: 4px; margin-left: auto; font-size: var(--text-caption-size); min-width:0; overflow-wrap:anywhere; line-height: var(--text-caption-line); }
        .wf-card-step svg, .wf-card-icon { flex-shrink:0; }
        .wf-card-references { padding:10px 12px; font-size: var(--text-caption-size); line-height: var(--text-caption-line); color:var(--foreground); background:color-mix(in srgb, var(--glow-warm) 7%, var(--space-surface)); overflow-wrap:anywhere; }
        .wf-card-references > span { font-weight: var(--weight-semibold); }
        .wf-card-references ul { margin:4px 0 0; padding-left:18px; }
        .wf-card-references li + li { margin-top:4px; }
        .wf-card.running .wf-card-step { color: var(--glow-warm); }
        .wf-card.done .wf-card-step { color: var(--glow-success); }
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
          font-size: var(--text-caption-size); line-height: var(--text-caption-line);
          color: var(--foreground);
          overflow-y: auto;
          overflow-wrap: anywhere;
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
