"use client";

// 检查器「产物」标签：三类产物（研究报告 / 风格特征包 / 应用提示词包）复制与下载
// 下载使用 Blob + createObjectURL，完成后 revoke（规划 Task 5 Step 4）

import { useCallback, useState } from "react";
import { FileText, Braces, ClipboardList, Copy, Download } from "lucide-react";
import type { OutputArtifact } from "@/app/lib/research-runtime/types";

type Props = {
  artifacts: OutputArtifact[];
};

const TYPE_META: Record<OutputArtifact["type"], { label: string; icon: typeof FileText }> = {
  "research-report": { label: "研究报告", icon: FileText },
  "style-feature-pack": { label: "风格特征包", icon: Braces },
  "application-prompt-pack": { label: "应用提示词包", icon: ClipboardList },
};

export function ArtifactsTab({ artifacts }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const download = useCallback((artifact: OutputArtifact) => {
    const blob = new Blob([artifact.content], { type: `${artifact.mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  const copy = useCallback(async (artifact: OutputArtifact) => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopiedId(artifact.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // 剪贴板不可用时静默（演示环境）
    }
  }, []);

  if (!artifacts.length) {
    return (
      <div className="rtab-empty">
        <p>尚无产物。</p>
        <p className="rtab-empty-next">下一步：运行完成后，此处提供研究报告、风格特征包与应用提示词包。</p>
      </div>
    );
  }

  return (
    <ul className="rtab-artifacts">
      {artifacts.map((artifact) => {
        const meta = TYPE_META[artifact.type];
        const Icon = meta.icon;
        return (
          <li key={artifact.id} className="rtab-artifact" data-artifact-type={artifact.type}>
            <div className="rtab-artifact-head">
              <Icon aria-hidden="true" size={14} />
              <span className="rtab-artifact-title">{artifact.title}</span>
              <span className="rtab-artifact-type">{meta.label}</span>
            </div>
            <p className="rtab-artifact-evidence">
              {artifact.evidence
                ? "未核验创作草稿；参考资料与适用范围随复制、下载保留。"
                : "历史产物未附核验说明，使用前请核对原始资料。"}
            </p>
            <pre className="rtab-artifact-preview">{artifact.content.slice(0, 240)}{artifact.content.length > 240 ? "…" : ""}</pre>
            <div className="rtab-artifact-actions">
              <button type="button" className="rins-btn" onClick={() => void copy(artifact)}>
                <Copy aria-hidden="true" size={12} />
                {copiedId === artifact.id ? "已复制" : "复制"}
              </button>
              <button type="button" className="rins-btn" onClick={() => download(artifact)} aria-label={`下载 ${artifact.fileName}`}>
                <Download aria-hidden="true" size={12} /> 下载
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
