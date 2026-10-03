"use client";

// 检查器「产物」标签：三类产物（研究报告 / 风格特征包 / 应用提示词包）复制与下载
// 下载使用 Blob + createObjectURL，完成后 revoke（规划 Task 5 Step 4）

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { FileText, Braces, ClipboardList, Copy, Download } from "lucide-react";
import { saveFileDownload } from "@/app/lib/media-download";
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
  const [copied, setCopied] = useState<{ id: string; content: string } | null>(null);
  const [copyPending, setCopyPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; content: string; error: boolean; message: string } | null>(null);
  const latestArtifacts = useRef(artifacts);
  const alive = useRef(true);
  const copySequence = useRef(0);
  const feedbackSequence = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => { latestArtifacts.current = artifacts; }, [artifacts]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      copySequence.current++;
      feedbackSequence.current++;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  const isCurrentArtifact = useCallback((artifact: OutputArtifact) => alive.current && latestArtifacts.current.some(item => item.id === artifact.id && item.content === artifact.content), []);

  const download = useCallback((artifact: OutputArtifact) => {
    if (!isCurrentArtifact(artifact)) return;
    feedbackSequence.current++;
    try {
      const blob = new Blob([artifact.content], { type: `${artifact.mimeType};charset=utf-8` });
      saveFileDownload({ blob, filename: artifact.fileName });
      setFeedback({ id: artifact.id, content: artifact.content, error: false, message: "产物已交给浏览器保存，请在下载列表核对。" });
    } catch {
      setFeedback({ id: artifact.id, content: artifact.content, error: true, message: "下载未完成，原产物仍保留，请重试或复制正文。" });
    }
  }, [isCurrentArtifact]);

  const copy = useCallback(async (artifact: OutputArtifact) => {
    if (!isCurrentArtifact(artifact)) return;
    const request = ++copySequence.current;
    const notice = ++feedbackSequence.current;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(null);
    setCopyPending(artifact.id);
    try {
      await navigator.clipboard.writeText(artifact.content);
      if (!isCurrentArtifact(artifact) || request !== copySequence.current || notice !== feedbackSequence.current) return;
      setCopied({ id: artifact.id, content: artifact.content });
      setFeedback({ id: artifact.id, content: artifact.content, error: false, message: "产物正文已复制。" });
      copyTimer.current = setTimeout(() => { if (alive.current) setCopied(null); }, 1500);
    } catch {
      if (isCurrentArtifact(artifact) && request === copySequence.current && notice === feedbackSequence.current) {
        setFeedback({ id: artifact.id, content: artifact.content, error: true, message: "剪贴板不可用，请下载文件保存产物。" });
      }
    } finally {
      if (alive.current && request === copySequence.current) setCopyPending(null);
    }
  }, [isCurrentArtifact]);

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
              <button type="button" className="rins-btn" disabled={Boolean(copyPending)} onClick={() => void copy(artifact)}>
                <Copy aria-hidden="true" size={12} />
                {copyPending === artifact.id ? "正在复制…" : copied?.id === artifact.id && copied.content === artifact.content ? "已复制" : "复制"}
              </button>
              <button type="button" className="rins-btn" onClick={() => download(artifact)} aria-label={`下载 ${artifact.fileName}`}>
                <Download aria-hidden="true" size={12} /> 下载
              </button>
            </div>
            {feedback?.id === artifact.id && feedback.content === artifact.content && <p className="rtab-artifact-evidence" role={feedback.error ? "alert" : "status"} style={{ overflowWrap: "anywhere" }}>{feedback.message}</p>}
          </li>
        );
      })}
    </ul>
  );
}
