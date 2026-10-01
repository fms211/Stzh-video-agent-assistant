"use client";

// 研究运行工作台 — 提示词折叠轨
// 三态（规划 Task 6）：rail（收起 56px 功能轨）/ overlay（浮层 320px）/ pinned（固定 300–420px）
// 外部点击与 Escape 只关闭 overlay，不取消 pinned；关闭后焦点返回触发按钮。
// OPCPanel 由 CreativeStudio 持有并作为 children 传入 —— 本组件不复制模板/风格/镜头数据。

import { useEffect, useRef } from "react";
import { PanelLeftOpen, PanelLeftClose, Pin, PinOff } from "lucide-react";

type Props = {
  mode: "rail" | "overlay" | "pinned";
  onModeChange: (mode: "rail" | "overlay" | "pinned") => void;
  width: number;
  children: React.ReactNode;
};

export function PromptRail({ mode, onModeChange, width, children }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape 关闭 overlay（不影响 pinned）
  useEffect(() => {
    if (mode !== "overlay") return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onModeChange("rail");
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mode, onModeChange]);

  // overlay 打开时聚焦内部；外部点击关闭
  useEffect(() => {
    if (mode !== "overlay") return;
    function onPointerDown(event: PointerEvent): void {
      if (overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        onModeChange("rail");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    // 延迟聚焦避免与打开动画冲突
    const timer = setTimeout(() => overlayRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      clearTimeout(timer);
    };
  }, [mode, onModeChange]);

  if (mode === "rail") {
    return (
      <div className="rprompt rprompt-rail" role="complementary" aria-label="提示词轨（收起）">
        <button
          ref={triggerRef}
          type="button"
          className="rprompt-rail-btn"
          aria-label="展开提示词面板"
          aria-expanded="false"
          onClick={() => onModeChange("overlay")}
        >
          <PanelLeftOpen aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (mode === "overlay") {
    return (
      <div
        ref={overlayRef}
        className="rprompt rprompt-overlay"
        role="complementary"
        aria-label="提示词面板（浮层）"
        tabIndex={-1}
        style={{ width }}
      >
        <div className="rprompt-toolbar">
          <button
            ref={triggerRef}
            type="button"
            className="rprompt-tool-btn"
            aria-label="固定提示词面板"
            onClick={() => onModeChange("pinned")}
          >
            <Pin aria-hidden="true" size={14} /> 固定
          </button>
          <button
            type="button"
            className="rprompt-tool-btn"
            aria-label="收起提示词面板"
            onClick={() => {
              onModeChange("rail");
              triggerRef.current?.focus();
            }}
          >
            <PanelLeftClose aria-hidden="true" size={14} /> 收起
          </button>
        </div>
        <div className="rprompt-content">{children}</div>
      </div>
    );
  }

  // pinned
  return (
    <div className="rprompt rprompt-pinned" role="complementary" aria-label="提示词面板（固定）" style={{ width }}>
      <div className="rprompt-toolbar">
        <button
          type="button"
          className="rprompt-tool-btn"
          aria-label="取消固定并收起"
          onClick={() => onModeChange("rail")}
        >
          <PinOff aria-hidden="true" size={14} /> 取消固定
        </button>
      </div>
      <div className="rprompt-content">{children}</div>
    </div>
  );
}
