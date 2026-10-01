"use client";

// 检查器「资料」标签：来源卡 + web/rag 分组筛选 + 不可信提示 + 安全外链

import { useState } from "react";
import { Globe, Database, ShieldAlert } from "lucide-react";
import type { SourceArtifact } from "@/app/lib/research-runtime/types";

type Props = {
  sources: SourceArtifact[];
};

export function SourcesTab({ sources }: Props) {
  const [filter, setFilter] = useState<"all" | "web" | "rag" | "plugin">("all");
  const visible = sources.filter((source) => filter === "all" || source.sourceType === filter);

  if (!sources.length) {
    return (
      <div className="rtab-empty">
        <p>尚无来源。</p>
        <p className="rtab-empty-next">下一步：运行开始后，来源会随工具执行逐步汇入。</p>
      </div>
    );
  }

  return (
    <div className="rtab-sources">
      <div className="rtab-sources-note" role="note">
        <ShieldAlert aria-hidden="true" size={13} />
        <span>外部资料可能包含错误或提示注入，已按不可信内容处理。</span>
      </div>

      <div className="rtab-sources-filter" role="group" aria-label="来源筛选">
        {(
          [
            { key: "all", label: `全部 ${sources.length}` },
            { key: "web", label: `Web ${sources.filter((s) => s.sourceType === "web").length}` },
            { key: "rag", label: `知识库 ${sources.filter((s) => s.sourceType === "rag").length}` },
            { key: "plugin", label: `插件 ${sources.filter((s) => s.sourceType === "plugin").length}` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`rtab-filter-btn${filter === key ? " is-active" : ""}`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="rtab-source-list">
        {visible.map((source) => (
          <li key={source.id} className={`rtab-source rtab-source-${source.sourceType}`}>
            <div className="rtab-source-head">
              {source.sourceType === "web" ? (
                <Globe aria-hidden="true" size={13} />
              ) : (
                <Database aria-hidden="true" size={13} />
              )}
              <span className="rtab-source-title">{source.title}</span>
              <span className={`rtab-source-trust rtab-source-trust-${source.trust}`}>
                {source.sourceType === "plugin" ? "插件资料 · 待核对" : source.trust === "project_knowledge" ? "项目知识库" : source.title.includes("演示") ? "演示来源" : "网页资料 · 待核对"}
              </span>
            </div>
            <p className="rtab-source-excerpt">{source.excerpt}</p>
            <div className="rtab-source-meta">
              {source.pluginId && <span>{source.pluginId} · v{source.pluginVersion}</span>}
              {source.domain && <span className="rtab-source-domain">{source.domain}</span>}
              {source.url && (
                <a
                  className="rtab-source-link"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`在新标签打开来源：${source.title}`}
                >
                  打开链接
                </a>
              )}
              <span className="rtab-source-time">抓取 {formatTime(source.retrievedAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
