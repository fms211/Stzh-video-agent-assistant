"use client";

// 创意工坊统一工作区 — LiquidGlassSurface（规划 §2.2）
// 三级渐进增强（渲染分级）：
//   tier 0：无 backdrop-filter → 近不透明深色背景 + 边框 + 阴影
//   tier 1：支持 backdrop-filter → blur + saturate + brightness + 主题 tint
//   tier 2：Chromium 增强 → 附加共享 SVG 折射滤镜（LiquidGlassFilters 定义）+ 边缘色散
// 仅功能层使用（bar/panel/capsule/popover）；正文消息/长报告/表格/产物正文禁止嵌套玻璃。
// reduceTransparency → 强制 tier 0；reduced-motion → 关折射（保留模糊+静态辉光）。

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { LiquidGlassVariant, ThemeEnergyState } from "@/app/lib/appearance-types";
import { detectGlassTier, isChromiumRefractionCapable } from "@/app/lib/glass-detect";

type Props = {
  variant: LiquidGlassVariant;
  interactive?: boolean;
  energyState?: ThemeEnergyState;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
};

export function LiquidGlassSurface({ variant, interactive = false, energyState, className, children, style }: Props) {
  const [tier, setTier] = useState<0 | 1 | 2>(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [refractionEnabled, setRefractionEnabled] = useState(true);

  // 渲染分级检测：仅 mount 时判定（设计约束，避免轮询）
  useEffect(() => {
    const test = document.createElement("div");
    test.style.backdropFilter = "blur(1px)";
    test.style.setProperty("-webkit-backdrop-filter", "blur(1px)");
    document.body.appendChild(test);
    const supported = detectGlassTier(test.style as unknown as { backdropFilter?: string; webkitBackdropFilter?: string });
    document.body.removeChild(test);

    const uaTier: 0 | 1 | 2 = supported === 1 && isChromiumRefractionCapable(navigator.userAgent) ? 2 : supported;
    setTier(uaTier);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches || document.documentElement.dataset.reducedMotion === "true");
    onChange();
    mq.addEventListener("change", onChange);
    window.addEventListener("tszh_preferences_changed", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("tszh_preferences_changed", onChange);
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      setReduceTransparency(document.documentElement.dataset.reduceTransparency === "true");
      setRefractionEnabled(document.documentElement.dataset.refractionEnabled !== "false");
    };
    apply();
    window.addEventListener("tszh_preferences_changed", apply);
    return () => window.removeEventListener("tszh_preferences_changed", apply);
  }, []);

  const effectiveTier: 0 | 1 | 2 = reduceTransparency ? 0 : tier;

  const energyVar = useMemo(() => {
    if (!energyState) return undefined;
    return {
      "--energy-color": `var(--theme-energy-${energyState})`,
    } as CSSProperties;
  }, [energyState]);

  const refractive = effectiveTier === 2 && !reducedMotion && refractionEnabled;

  const classNameJoined = [
    "cws-glass",
    variant === "capsule" ? "cws-glass--capsule" : `cws-glass--${variant}`,
    interactive ? "cws-glass--interactive" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classNameJoined}
      data-glass-tier={effectiveTier}
      data-energy-state={energyState ?? "idle"}
      data-interactive={interactive ? "true" : "false"}
      style={{ ...(energyVar ?? {}), ...style } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="cws-glass__refraction-edge"
        style={refractive ? { filter: `url(#cws-refract-${variant})` } : undefined}
      />
      {children}
    </div>
  );
}
