"use client";

// 创意工坊统一工作区 — WorkspaceSessionDock（规划 §1.2 左侧会话/文件坞）
// 参与 .cws-body flex 布局（不 portal、不 fixed 悬浮——fixed 会遮挡中央内容）；
// docked（280px）/ rail（56px）双形态；拖拽调宽由 layout store 驱动；
// Liquid Glass panel 表面。children 由 CreativeWorkspace 注入 LeftSidebar。

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion } from "motion/react";
import { GripVertical, Menu, Settings2, X } from "lucide-react";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { CREATIVE_MOTION } from "@/app/lib/creative-motion";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";

export type DockLayoutMode = "docked" | "rail" | "overlay";

type Props = {
  layoutMode: DockLayoutMode;
  width: number;
  onModeChange: (mode: DockLayoutMode) => void;
  onWidthChange: (width: number) => void;
  onOpenSettings?: () => void;
  settingsTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
  expandMode?: DockLayoutMode;
  backgroundInert?: boolean;
  children?: React.ReactNode;
};

const LEFT_MIN = 240;
const LEFT_MAX = 360;

export function WorkspaceSessionDock({
  layoutMode,
  width,
  onModeChange,
  onWidthChange,
  onOpenSettings,
  settingsTriggerRef,
  returnFocusRef,
  expandMode = "docked",
  backgroundInert = false,
  children,
}: Props) {
  const dragState = useRef<{ startX: number; startWidth: number; latestWidth: number } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const railTriggerRef = useRef<HTMLButtonElement>(null);
  const panelFocusRef = useRef<HTMLButtonElement>(null);
  const previousModeRef = useRef(layoutMode);
  const [resizing, setResizing] = useState(false);
  const { reducedMotion } = useCreativeMotion();
  const railActive = layoutMode === "rail";
  const panelActive = !railActive;

  const applyInlineWidth = (nextWidth: number) => {
    if (!asideRef.current) return;
    const value = `${nextWidth}px`;
    asideRef.current.style.width = value;
    asideRef.current.style.minWidth = value;
  };

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    dragState.current = { startX: event.clientX, startWidth: width, latestWidth: width };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    dragState.current.latestWidth = Math.max(
      LEFT_MIN,
      Math.min(LEFT_MAX, dragState.current.startWidth + event.clientX - dragState.current.startX),
    );
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      if (dragState.current) applyInlineWidth(dragState.current.latestWidth);
    });
  };

  const stopResize = (event: PointerEvent<HTMLButtonElement>) => {
    const nextWidth = Math.max(LEFT_MIN, Math.min(LEFT_MAX, dragState.current?.latestWidth ?? width));
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
    applyInlineWidth(nextWidth);
    dragState.current = null;
    setResizing(false);
    onWidthChange(nextWidth);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") onWidthChange(width - 16);
    else if (event.key === "ArrowRight") onWidthChange(width + 16);
    else if (event.key === "Home") onWidthChange(LEFT_MIN);
    else if (event.key === "End") onWidthChange(LEFT_MAX);
    else return;
    event.preventDefault();
  };

  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = layoutMode;
    if (layoutMode === "overlay" && previous !== "overlay") {
      const timer = window.setTimeout(() => panelFocusRef.current?.focus(), reducedMotion ? 0 : 150);
      return () => window.clearTimeout(timer);
    }
    if (previous === "rail" || layoutMode !== "rail") return;
    const timer = window.setTimeout(() => (returnFocusRef?.current ?? railTriggerRef.current)?.focus(), reducedMotion ? 0 : 150);
    return () => window.clearTimeout(timer);
  }, [layoutMode, reducedMotion, returnFocusRef]);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
  }, []);

  const panelTransition = reducedMotion
    ? { duration: CREATIVE_MOTION.reducedMotionDuration }
    : CREATIVE_MOTION.panelSpring;
  const layoutTransition = { duration: reducedMotion ? CREATIVE_MOTION.reducedMotionDuration : 0.16, ease: "easeOut" as const };
  const railAnimation = reducedMotion
    ? { opacity: railActive ? 1 : 0 }
    : railActive ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -8, scale: 0.985 };
  const panelAnimation = reducedMotion
    ? { opacity: panelActive ? 1 : 0 }
    : panelActive ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -16, scale: 0.985 };
  const occupiedWidth = railActive ? 56 : width;

  return (
    <motion.aside
      ref={asideRef}
      layout={resizing ? false : "size"}
      transition={{ layout: layoutTransition }}
      className={`wsd-dock${railActive ? " wsd-dock--rail" : ""}${layoutMode === "overlay" ? " wsd-dock--overlay" : ""}${resizing ? " is-resizing" : ""}`}
      aria-label={railActive ? "会话坞（收起）" : "会话坞"}
      data-mode={layoutMode}
      style={{ width: occupiedWidth, minWidth: occupiedWidth }}
      inert={backgroundInert ? true : undefined}
    >
      <motion.div
        className="wsd-dock__rail-layer"
        initial={false}
        animate={railAnimation}
        transition={panelTransition}
        aria-hidden={!railActive}
        inert={railActive ? undefined : true}
      >
        <LiquidGlassSurface variant="panel" className="wsd-dock__rail">
          <button
            ref={railTriggerRef}
            type="button"
            className="wsd-rail__toggle"
            aria-label="展开会话坞"
            aria-expanded={false}
            onClick={() => onModeChange(expandMode)}
          >
            <Menu size={16} />
          </button>
          {onOpenSettings && (
            <button
              ref={railActive ? settingsTriggerRef : undefined}
              type="button"
              className="wsd-rail__settings"
              aria-label="打开个性化设置"
              onClick={onOpenSettings}
            >
              <Settings2 size={16} />
            </button>
          )}
        </LiquidGlassSurface>
      </motion.div>

      <motion.div
        className="wsd-dock__panel-layer"
        initial={false}
        animate={panelAnimation}
        transition={panelTransition}
        aria-hidden={!panelActive}
        inert={panelActive ? undefined : true}
      >
        <LiquidGlassSurface variant="panel" className="wsd-dock__panel">
          <div className="wsd-dock__head">
            {onOpenSettings && (
              <button
                ref={panelActive ? settingsTriggerRef : undefined}
                type="button"
                className="wsd-dock__settings"
                aria-label="打开个性化设置"
                onClick={onOpenSettings}
              >
                <Settings2 size={15} />
                <span>个性化</span>
              </button>
            )}
            <button
              ref={panelFocusRef}
              type="button"
              className="wsd-dock__collapse"
              aria-label="收起会话坞"
              onClick={() => onModeChange("rail")}
            >
              <X size={15} />
            </button>
          </div>
          <div className="wsd-dock__content">{children}</div>
        </LiquidGlassSurface>
      </motion.div>

      {layoutMode === "docked" && (
        <button
          type="button"
          className="wsd-dock__separator"
          role="separator"
          aria-label="调整会话坞宽度"
          aria-orientation="vertical"
          aria-valuemin={LEFT_MIN}
          aria-valuemax={LEFT_MAX}
          aria-valuenow={Math.round(width)}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onKeyDown={resizeWithKeyboard}
        >
          <GripVertical aria-hidden="true" size={14} />
        </button>
      )}
    </motion.aside>
  );
}
