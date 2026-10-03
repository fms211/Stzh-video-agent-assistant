"use client";

// Approved layered glass: role-scaled, continuous edge refraction, no content filter.
// Unsupported browsers / reduced transparency keep a solid theme surface.
// Reduced motion disables refraction; text, lists and tables never get nested glass.

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode, type HTMLAttributes } from "react";
import type { GlassSettings, LiquidGlassVariant, ThemeEnergyState } from "@/app/lib/appearance-types";
import { detectGlassTier, isChromiumRefractionCapable } from "@/app/lib/glass-detect";

import { useLiquidGlassSettings } from "./LiquidGlassProvider";
import { LiquidGlassRefraction } from "./LiquidGlassRefraction";
import { normalizeGlassSurface } from "@/app/lib/glass-surface-settings";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  settings?: GlassSettings;
  materialRole?: "dialogue" | "bar" | "panel" | "composer" | "popover";
  variant: LiquidGlassVariant;
  interactive?: boolean;
  energyState?: ThemeEnergyState;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
};

export function LiquidGlassSurface({ variant, interactive = false, energyState, className, children, style, settings: override, materialRole, ...attributes }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [available, setAvailable] = useState(false);
  const controller = useLiquidGlassSettings();
  const settings = override ?? controller.settings;
  const surface = useMemo(() => normalizeGlassSurface(settings.surface), [settings.surface]);
  const role = materialRole ?? (variant === "capsule" ? "composer" : variant);
  const strength = { dialogue: 1, bar: .45, panel: .36, composer: .5, popover: .7 }[role];
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

  const effectiveTier: 0 | 1 | 2 = settings.reduceTransparency || reduceTransparency ? 0 : tier;

  const energyVar = useMemo(() => {
    if (!energyState) return undefined;
    return {
      "--energy-color": `var(--theme-energy-${energyState})`,
    } as CSSProperties;
  }, [energyState]);

  const refractive = effectiveTier === 2 && !reducedMotion && refractionEnabled && settings.refractionEnabled && surface.borderWidth > 0;

  const classNameJoined = [
    "cws-glass",
    variant === "capsule" ? "cws-glass--capsule" : `cws-glass--${variant}`,
    interactive ? "cws-glass--interactive" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div
      {...attributes}
      ref={host}
      data-liquid-material="layered"
      data-liquid-role={role}
      data-liquid-refractive={refractive && available}
      className={classNameJoined}
      data-glass-tier={effectiveTier}
      data-energy-state={energyState ?? "idle"}
      data-interactive={interactive ? "true" : "false"}
      style={{ ...(energyVar ?? {}), "--liquid-radius": `${surface.borderRadius}px`, "--liquid-background-opacity": surface.backgroundOpacity, "--liquid-saturation": surface.saturation, ...style } as CSSProperties}
    >
      <span aria-hidden="true" className="cws-glass__material" />
      {refractive && <LiquidGlassRefraction host={host} settings={surface} filterId={`liquid-${id}`} strength={strength} onAvailable={setAvailable} />}
      <span aria-hidden="true" className="cws-glass__refraction-edge" />
      {children}
    </div>
  );
}
