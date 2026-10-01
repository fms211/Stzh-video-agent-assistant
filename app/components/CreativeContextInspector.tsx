"use client";

// 创意工坊统一工作区 — CreativeContextInspector（规划 §1.5：上下文感知检查器）
// 四种模式固定 inspector model：Coze（任务/参数/附件/作品/建议）、单助手
// （CreativeContext/引用/模型信息/输出动作）、工作流（计划/资料/产物/轨迹）、
// 协作编排（项目/角色/阶段/审校/风险/最终指令）。
// 空状态提供有明确下一步的指引，不保留无意义空面板。
// 数据全部经 Workspace 注入（不自行拉取任务）。

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { CreativeContext, CreativeWorkspaceMode } from "@/app/lib/appearance-types";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { CREATIVE_MOTION, createDirectionalVariants, motionDirection, type MotionDirection } from "@/app/lib/creative-motion";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";
import type { AssistantInspectorState, WorkflowInspectorState, CollaborationInspectorState } from "@/app/lib/studio-inspector-state";

type InspectorStatus = { label: string; active: boolean };

type Props = {
  mode: CreativeWorkspaceMode;
  context: CreativeContext;
  cozeTaskStatus: InspectorStatus | null;
  assistantMeta: AssistantInspectorState;
  workflowState: WorkflowInspectorState;
  collabState: CollaborationInspectorState;
  onClose?: () => void;
  className?: string;
};

type Section = "coze" | "assistant" | "workflow" | "collaboration";

const SECTION_ORDER: Section[] = ["coze", "assistant", "workflow", "collaboration"];

export function CreativeContextInspector({ mode, context, cozeTaskStatus, assistantMeta, workflowState, collabState, onClose, className }: Props) {
  const [activeSection, setActiveSection] = useState<Section>(mode === "coze" ? "coze" : mode);
  const [sectionDirection, setSectionDirection] = useState<MotionDirection>(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { reducedMotion } = useCreativeMotion();
  const sectionVariants = useMemo(
    () => createDirectionalVariants({ offset: 8, reducedMotion, exitDuration: 0.14 }),
    [reducedMotion],
  );

  const selectSection = (next: Section) => {
    setSectionDirection(motionDirection(SECTION_ORDER, activeSection, next));
    setActiveSection(next);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + SECTION_ORDER.length) % SECTION_ORDER.length;
    else if (event.key === "ArrowRight") nextIndex = (index + 1) % SECTION_ORDER.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SECTION_ORDER.length - 1;
    else return;
    event.preventDefault();
    selectSection(SECTION_ORDER[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  // 模式变化的默认段（用户手动切换后不强制跳段）
  const effectiveSection = activeSection;

  // 模式变化时默认跟随（未手动切换由 Workspace 层用 defaultSectionForMode 处理）
  useEffect(() => {
    selectSection(defaultSectionForMode(mode));
  }, [mode]);

  return (
    <div className={className ? `cws-inspector-wrap ${className}` : "cws-inspector-wrap"} role="complementary" aria-label="上下文检查器">
      <LiquidGlassSurface variant="panel" className="cws-inspector">
        <div className="cws-inspector__head">
        <span className="cws-inspector__title">上下文检查器</span>
        {onClose && (
          <button type="button" className="cws-inspector__close" aria-label="关闭检查器" onClick={onClose}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="cws-inspector__tabs" role="tablist" aria-label="检查器内容">
        {SECTION_ORDER.map((section, index) => (
          <motion.button
            ref={(node) => { tabRefs.current[index] = node; }}
            key={section}
            type="button"
            role="tab"
            aria-selected={effectiveSection === section}
            tabIndex={effectiveSection === section ? 0 : -1}
            className={`cws-inspector__tab${effectiveSection === section ? " is-active" : ""}`}
            onClick={() => selectSection(section)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            whileHover={reducedMotion ? { opacity: 0.96 } : { y: -1 }}
            whileTap={reducedMotion
              ? { opacity: 0.9, transition: { duration: CREATIVE_MOTION.pressDuration } }
              : { scale: CREATIVE_MOTION.pressScale, transition: { duration: CREATIVE_MOTION.pressDuration } }}
            transition={{ duration: CREATIVE_MOTION.hoverDuration }}
          >
            {effectiveSection === section && (
              <motion.span aria-hidden="true" className="cws-inspector__active-pill" layoutId="creative-inspector-active-pill" transition={CREATIVE_MOTION.indicatorSpring} />
            )}
            {section === "coze" ? "Coze 任务" : section === "assistant" ? "单助手" : section === "workflow" ? "工作流" : "协作编排"}
          </motion.button>
        ))}
      </div>

      <div className="cws-inspector__body" style={{ display: "grid" }}>
        {effectiveSection !== mode && <p className="cws-inspector__note">显示该模式最近的页面状态；切回对应创作模式可更新。</p>}
        <AnimatePresence initial={false} mode="sync" custom={sectionDirection}>
          <motion.div key={effectiveSection} custom={sectionDirection} variants={sectionVariants} initial="enter" animate="active" exit="exit" style={{ gridArea: "1 / 1" }}>
        {/* Coze：任务状态 / 参数 / 附件 / 作品 / 建议 */}
        {effectiveSection === "coze" && (
          <>
            <section aria-label="Coze 任务">
              {cozeTaskStatus ? (
                <div className={`cws-inspector__status${cozeTaskStatus.active ? " is-active" : ""}`} aria-live="polite">
                  {cozeTaskStatus.label}
                </div>
              ) : (
                <div className="cws-inspector__empty">
                  <p>尚无运行中的生成任务。</p>
                  <p className="cws-inspector__next">下一步：在底部输入主题描述开始生成，或从左侧风格库挑选风格。</p>
                </div>
              )}
            </section>
            <section aria-label="生成参数">
              <dl className="cws-inspector__kv">
                <dt>风格</dt><dd>{context.styleLabel || "未设置"}</dd>
                <dt>运镜</dt><dd>{context.cameraMoveLabel || "未设置"}</dd>
                <dt>时长</dt><dd>{context.durationSeconds}s</dd>
                <dt>画幅</dt><dd>{context.aspect}</dd>
                <dt>参数</dt><dd>{context.selectedParams.length ? context.selectedParams.join("、") : "无"}</dd>
              </dl>
            </section>
          </>
        )}

        {/* 单助手：CreativeContext 摘要 / 引用 / 模型信息 / 输出动作 */}
        {effectiveSection === "assistant" && (
          <>
            <section aria-label="助手状态">
              {assistantMeta.sending ? (
                <div className="cws-inspector__status is-active" aria-live="polite">模型请求进行中…</div>
              ) : (
                <div className="cws-inspector__empty">
                  <p>单助手空闲。</p>
                  <p className="cws-inspector__next">下一步：切换到「单助手」模式输入创作问题；参数摘要会随顶部参数条同步。</p>
                </div>
              )}
              <dl className="cws-inspector__kv">
                <dt>模型</dt><dd>{assistantMeta.providerName ? `${assistantMeta.providerName} · ${assistantMeta.model}` : "未配置（模型与角色中心）"}</dd>
                <dt>会话主题</dt><dd>{assistantMeta.sessionSummary || "新会话"}</dd>
              </dl>
            </section>
          </>
        )}

        {/* 工作流：计划 / 资料 / 产物 / 轨迹 */}
        {effectiveSection === "workflow" && (
          <section aria-label="工作流状态">
            {workflowState.runId || workflowState.planTitle ? (
              <>
                <div className={`cws-inspector__status${workflowState.isRunning ? " is-active" : ""}`} aria-live="polite">
                  {workflowState.status}
                </div>
                <dl className="cws-inspector__kv">
                  <dt>计划</dt><dd>{workflowState.planTitle || "待生成"}</dd>
                  <dt>完成步骤</dt><dd>{workflowState.completedSteps}/{workflowState.stepCount}</dd>
                  {workflowState.runId && <><dt>本地记录</dt><dd><code>{workflowState.runId}</code></dd></>}
                </dl>
                <p className="cws-inspector__note">步骤结果可在工作流会话中查看；研究运行使用独立工作台。</p>
              </>
            ) : (
              <div className="cws-inspector__empty">
                <p>未启动工作流。</p>
                <p className="cws-inspector__next">下一步：选择「风格研究与应用」等工作流并填写参数后运行。</p>
              </div>
            )}
          </section>
        )}

        {/* 协作编排：项目 / 角色 / 阶段 / 审校 / 风险 / 最终指令 */}
        {effectiveSection === "collaboration" && (
          <section aria-label="协作编排状态">
            {collabState.runId ? (
              <>
                <div className={`cws-inspector__status${collabState.active ? " is-active" : ""}`} aria-live="polite">{collabState.stage}</div>
                <dl className="cws-inspector__kv">
                  <dt>项目</dt><dd>{collabState.projectName}</dd>
                  <dt>角色</dt><dd>{collabState.roleCount} 个</dd>
                  <dt>Run</dt><dd><code>{collabState.runId}</code></dd>
                </dl>
                {collabState.risks && (
                  <div className="cws-inspector__risk" role="note">风险：{collabState.risks}</div>
                )}
              </>
            ) : (
              <div className="cws-inspector__empty">
                <p>暂无协作 Run。</p>
                <p className="cws-inspector__next">下一步：切换到「协作编排」模式，选择项目、角色编队后发起协作。</p>
              </div>
            )}
          </section>
        )}
          </motion.div>
        </AnimatePresence>
      </div>
      </LiquidGlassSurface>
    </div>
  );
}

// 供 Workspace 层做模式→段默认映射（未手动切换时跟随模式）
export function defaultSectionForMode(mode: CreativeWorkspaceMode): Section {
  return mode === "collaboration" ? "collaboration" : mode === "assistant" ? "assistant" : mode === "workflow" ? "workflow" : "coze";
}
