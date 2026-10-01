"use client";

// 检查器「轨迹」标签：按步骤分组的事件流 + metrics 汇总
// 默认渲染最新 200 条；存在更早事件时显示「加载更早记录」（规划 §2.5）

import { useMemo, useState } from "react";
import type { ResearchRunSnapshot, RunEvent } from "@/app/lib/research-runtime/types";

type Props = {
  events: RunEvent[];
  snapshot: ResearchRunSnapshot;
};

const RENDER_LIMIT = 200;

export function TrajectoryTab({ events, snapshot }: Props) {
  const [limit, setLimit] = useState(RENDER_LIMIT);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  // 按 stepId 分组
  const groups = useMemo(() => {
    const map = new Map<string, RunEvent[]>();
    for (const event of events) {
      const stepId = typeof event.payload.stepId === "string" ? event.payload.stepId : "run";
      const list = map.get(stepId) ?? [];
      list.push(event);
      map.set(stepId, list);
    }
    return [...map.entries()];
  }, [events]);

  const hasMore = events.length > limit;
  const visible = events.slice(Math.max(0, events.length - limit));
  const visibleSeqs = new Set(visible.map((e) => e.seq));
  const m = snapshot.metrics;

  return (
    <div className="rtab-trajectory">
      {/* 顶部汇总（Token、TTFT、调用数与估算成本只在轨迹展示，规划 §2.4） */}
      <dl className="rtab-traj-metrics">
        <div>
          <dt>模型调用</dt>
          <dd>{m.modelCalls}</dd>
        </div>
        <div>
          <dt>工具调用</dt>
          <dd>{m.toolCalls}</dd>
        </div>
        <div>
          <dt>输入 Token</dt>
          <dd>{m.inputTokens}</dd>
        </div>
        <div>
          <dt>输出 Token</dt>
          <dd>{m.outputTokens}</dd>
        </div>
        <div>
          <dt>TTFT</dt>
          <dd>{m.ttftMs !== null ? `${m.ttftMs}ms` : "—"}</dd>
        </div>
        <div>
          <dt>估算成本</dt>
          <dd>{m.estimatedCostCny !== null ? `¥${m.estimatedCostCny.toFixed(2)}` : "—"}</dd>
        </div>
      </dl>

      {hasMore && (
        <button type="button" className="rins-btn rtab-traj-more" onClick={() => setLimit((prev) => prev + RENDER_LIMIT)}>
          加载更早记录（还有 {events.length - limit} 条）
        </button>
      )}

      <ol className="rtab-traj-groups">
        {groups.map(([stepId, stepEvents]) => {
          const visibleEvents = stepEvents.filter((e) => visibleSeqs.has(e.seq));
          if (!visibleEvents.length) return null;
          return (
            <li key={stepId} className="rtab-traj-group">
              <p className="rtab-traj-group-title">{stepId === "run" ? "运行级事件" : `步骤 ${stepId}`}</p>
              <ul className="rtab-traj-events">
                {visibleEvents.map((event) => (
                  <li key={event.seq} className={`rtab-traj-event rtab-traj-${event.type.split(".")[0]}`}>
                    <button
                      type="button"
                      className="rtab-traj-row"
                      aria-expanded={expandedSeq === event.seq}
                      onClick={() => setExpandedSeq(expandedSeq === event.seq ? null : event.seq)}
                    >
                      <span className="rtab-traj-seq">#{event.seq}</span>
                      <span className="rtab-traj-type">{event.type}</span>
                      <span className="rtab-traj-time">{formatClock(event.occurredAt)}</span>
                    </button>
                    {expandedSeq === event.seq && (
                      <pre className="rtab-traj-payload">{JSON.stringify(event.payload, null, 2)}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}
