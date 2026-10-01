"use client";

// 创意工坊统一工作区 — CreativeParameterBar（规划 §1.3：顶部创意参数条）
// 放置在全局导航下方（Liquid Glass bar）；内容：风格/运镜/参数/时长/画幅 +
// CreativeContext 摘要 + "插入到输入"/"重置参数" 动作。
// 参数选择立即更新结构化上下文，但不自动污染文本草稿（仅点击"插入到输入"才写入，
// 且用 revision 去重避免重复标签 —— 见 shouldInsert）。

import { useState, type RefObject } from "react";
import { SlidersHorizontal, Wand2, RotateCcw, CornerDownLeft } from "lucide-react";
import type { CreativeContext } from "@/app/lib/appearance-types";
import { formatContextSummary, reduceCreativeContext } from "@/app/lib/creative-context";
import { ASPECTS, BASIC_MOVES, COMBO_MOVES, DURATIONS, STYLES, STYLE_CATEGORIES } from "@/app/data/opc-knowledge";
import { CreativeSelect } from "./CreativeSelect";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

type Props = {
  context: CreativeContext;
  onContextChange: (ctx: CreativeContext) => void;
  /** 插入到输入：携带 revision（由 Workspace 层去重；fragment 经 context 自动同步） */
  onInsert: (revision: number) => void;
  /** 由上层回传"最近一次已插入的 revision"以禁会重复 */
  lastInsertedRevision: number;
  imageParametersOpen: boolean;
  onImageParametersOpenChange: (open: boolean) => void;
  imageParametersTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenMemory?: () => void;
};

export function CreativeParameterBar({
  context,
  onContextChange,
  onInsert,
  lastInsertedRevision,
  imageParametersOpen,
  onImageParametersOpenChange,
  imageParametersTriggerRef,
  onOpenMemory,
}: Props) {
  const [busy, setBusy] = useState(false);

  const applyPatch = (patch: Partial<CreativeContext>) => {
    setBusy(true);
    try {
      onContextChange(reduceCreativeContext(context, patch));
    } finally {
      // 微任务内释放，保证连续快速操作不卡 UI
      requestAnimationFrame(() => setBusy(false));
    }
  };

  const canInsert = context.revision > lastInsertedRevision && context.promptFragment.length > 0;

  const summary = formatContextSummary(context);
  const allMoves = [...BASIC_MOVES, ...COMBO_MOVES];
  const styleGroups = STYLE_CATEGORIES
    .filter((category) => category.key !== "all")
    .map((category) => ({
      label: category.label,
      options: STYLES
        .filter((style) => style.cat === category.key)
        .map((style) => ({ value: style.label, label: style.label })),
    }))
    .filter((group) => group.options.length > 0);
  const moveGroups = [
    { label: "基础运镜", options: BASIC_MOVES.map((move) => ({ value: move.name, label: move.name, description: move.effect })) },
    { label: "组合运镜", options: COMBO_MOVES.map((move) => ({ value: move.name, label: move.name, description: move.effect })) },
  ];

  return (
    <LiquidGlassSurface variant="bar" className="cws-parameter-bar" data-testid="creative-parameter-bar">
      <div className="cws-parameter-bar__group" role="group" aria-label="风格">
        <Wand2 aria-hidden="true" size={13} className="cws-parameter-bar__icon" />
        <span className="cws-parameter-bar__label">风格</span>
        <CreativeSelect
          aria-label="创作风格"
          value={context.styleId}
          placeholder="未设置"
          groups={styleGroups}
          onChange={(value) => {
            const style = STYLES.find((item) => item.label === value);
            applyPatch({ styleId: style?.label ?? null, styleLabel: style?.label ?? "" });
          }}
        />
      </div>

      <div className="cws-parameter-bar__group" role="group" aria-label="运镜">
        <SlidersHorizontal aria-hidden="true" size={13} className="cws-parameter-bar__icon" />
        <span className="cws-parameter-bar__label">运镜</span>
        <CreativeSelect
          aria-label="镜头运动"
          value={context.cameraMoveId}
          placeholder="未设置"
          groups={moveGroups}
          onChange={(value) => {
            const move = allMoves.find((item) => item.name === value);
            applyPatch({ cameraMoveId: move?.name ?? null, cameraMoveLabel: move?.name ?? "" });
          }}
        />
      </div>

      <button
        ref={imageParametersTriggerRef}
        type="button"
        className="cws-image-parameter-trigger"
        aria-label={`图像参数，已选 ${context.selectedParams.length} 项`}
        aria-controls="creative-image-parameter-drawer"
        aria-expanded={imageParametersOpen}
        onClick={() => onImageParametersOpenChange(!imageParametersOpen)}
      >
        图像参数
        <span>{context.selectedParams.length}</span>
      </button>

      <div className="cws-parameter-bar__group" role="group" aria-label="时长">
        <span className="cws-parameter-bar__label">时长</span>
        <CreativeSelect
          aria-label="视频时长（秒）"
          value={String(context.durationSeconds)}
          placeholder="时长"
          groups={[{ label: "时长", options: DURATIONS.map((duration) => ({ value: String(duration), label: `${duration}s` })) }]}
          onChange={(value) => applyPatch({ durationSeconds: Number(value) })}
        />
      </div>

      <div className="cws-parameter-bar__group" role="group" aria-label="画幅">
        <span className="cws-parameter-bar__label">画幅</span>
        <CreativeSelect
          aria-label="画幅比例"
          value={context.aspect}
          placeholder="画幅"
          groups={[{ label: "画幅", options: ASPECTS.map((aspect) => ({ value: aspect, label: aspect })) }]}
          onChange={(value) => applyPatch({ aspect: value as CreativeContext["aspect"] })}
        />
      </div>

      <div className="cws-parameter-bar__grow" aria-label={`上下文摘要：${summary}`}>{summary || "尚未设置参数"}</div>

      {onOpenMemory && <button type="button" className="cws-parameter-bar__action cws-parameter-bar__action--ghost" onClick={onOpenMemory} aria-label="管理创意记忆">记忆</button>}

      <button
        type="button"
        className="cws-parameter-bar__action"
        disabled={!canInsert}
        onClick={() => onInsert(context.revision)}
        aria-label="插入到输入"
        title={canInsert ? "把当前参数组合写入输入框" : "参数未变化或已插入过"}
      >
        <CornerDownLeft aria-hidden="true" size={13} /> 插入到输入
      </button>
      <button
        type="button"
        className="cws-parameter-bar__action cws-parameter-bar__action--ghost"
        disabled={busy}
        onClick={() => applyPatch({ styleId: null, styleLabel: "", cameraMoveId: null, cameraMoveLabel: "", selectedParams: [], durationSeconds: 8, aspect: "16:9" })}
        aria-label="重置参数"
      >
        <RotateCcw aria-hidden="true" size={13} /> 重置参数
      </button>
    </LiquidGlassSurface>
  );
}
