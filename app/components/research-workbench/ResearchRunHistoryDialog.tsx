"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, RefreshCw, X } from "lucide-react";
import type { ResearchRuntimeAdapter, ResearchRunSummary } from "@/app/lib/research-runtime/adapter";
import "./ResearchRunHistoryDialog.css";

type Props = {
  adapter: ResearchRuntimeAdapter;
  onSelect: (run: ResearchRunSummary) => void;
  onClose: () => void;
};

const STATUS_LABELS: Record<ResearchRunSummary["status"], string> = {
  draft: "草稿",
  planning: "正在生成计划",
  awaiting_plan_approval: "等待确认",
  running: "运行中",
  paused: "已暂停",
  recovering: "需要恢复",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN");
}

function describeRun(run: ResearchRunSummary) {
  return [run.input.styleName, run.input.useCase].filter(Boolean).join(" · ") || "未命名研究运行";
}

export function ResearchRunHistoryDialog({ adapter, onSelect, onClose }: Props) {
  const [result, setResult] = useState<{
    adapter: ResearchRuntimeAdapter;
    runs: ResearchRunSummary[];
    error: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingId, setSelectingId] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = result?.adapter === adapter ? result : null;

  useEffect(() => {
    let cancelled = false;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    void adapter.listRuns(50).then((runs) => {
      if (!cancelled) setResult({ adapter, runs, error: "" });
    }).catch((error) => {
      if (!cancelled) setResult({ adapter, runs: [], error: error instanceof Error ? error.message : "读取研究历史失败" });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [adapter, onClose]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const runs = await adapter.listRuns(50);
      setResult({ adapter, runs, error: "" });
    } catch (error) {
      setResult({ adapter, runs: current?.runs || [], error: error instanceof Error ? error.message : "刷新研究历史失败" });
    } finally {
      setRefreshing(false);
    }
  };

  const choose = (run: ResearchRunSummary) => {
    setSelectingId(run.runId);
    onSelect(run);
    onClose();
  };

  return (
    <div className="research-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="research-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-history-title"
        aria-busy={!current || refreshing}
        tabIndex={-1}
      >
        <header className="research-history-header">
          <div>
            <span className="research-history-eyebrow"><Clock3 size={13} aria-hidden="true" /> 账户运行记录</span>
            <h2 id="research-history-title">研究历史</h2>
          </div>
          <div className="research-history-header-actions">
            <button type="button" className="research-history-icon-button" aria-label="刷新研究历史" onClick={() => void refresh()} disabled={!current || refreshing}>
              <RefreshCw size={15} aria-hidden="true" className={refreshing ? "is-spinning" : undefined} />
            </button>
            <button ref={closeRef} type="button" className="research-history-icon-button" aria-label="关闭研究历史" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <p className="research-history-description">选择一条已保存的运行，继续查看计划、资料、产物和执行轨迹。</p>
        <div className="research-history-list" aria-live="polite">
          {!current ? (
            <p className="research-history-empty" role="status">正在读取账户运行记录…</p>
          ) : current.error ? (
            <p className="research-history-error" role="alert">{current.error}</p>
          ) : current.runs.length === 0 ? (
            <p className="research-history-empty" role="status">还没有研究运行记录。开始一次研究后，记录会保存在这里。</p>
          ) : current.runs.map((run) => (
            <button
              type="button"
              className="research-history-run"
              key={run.runId}
              onClick={() => choose(run)}
              disabled={Boolean(selectingId)}
              aria-label={`打开研究运行：${describeRun(run)}，${STATUS_LABELS[run.status]}`}
            >
              <span className="research-history-run-main">
                <strong>{describeRun(run)}</strong>
                <span>{formatDate(run.updatedAt)}</span>
              </span>
              <span className={`research-history-status is-${run.status}`}>
                {selectingId === run.runId ? "正在打开…" : STATUS_LABELS[run.status]}
              </span>
              <span className="research-history-metrics">
                {run.metrics.completedSteps}/{run.metrics.totalSteps} 步
                <span aria-hidden="true">·</span>
                {run.metrics.sourceCount} 条资料
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
