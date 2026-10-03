"use client";

import { useEffect, useId, useState, type RefObject, type CSSProperties } from "react";
import type { GlassSurfaceSettings } from "@/app/lib/glass-surface-settings";
import { glassDisplacementMap } from "@/app/lib/glass-displacement-map";

export function LiquidGlassRefraction({ host, settings, filterId, onAvailable, strength = 1 }: {
  host: RefObject<HTMLDivElement | null>; strength?: number; settings: GlassSurfaceSettings; filterId: string; onAvailable: (available: boolean) => void;
}) {
  const [map, setMap] = useState<ReturnType<typeof glassDisplacementMap> | null>(null);
  const stableId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let frame = 0, timer = 0, stopped = false, visible = false, last = "", lastPaint = 0;
    const update = () => {
      frame = 0;
      // Modes remain mounted. Hidden or offscreen panels do not regenerate maps.
      // aria-hidden also marks the visible decorative Coze backdrop; it is not a visibility test.
      if (stopped || !visible || document.hidden || element.closest('[inert], [hidden]')) return;
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || settings.borderRadius, width / 2, height / 2);
      const key = `${width}:${height}:${radius}`;
      if (key === last) return;
      lastPaint = performance.now();
      try {
        const next = glassDisplacementMap(width, height, radius, settings);
        if (!stopped) { setMap(next); onAvailable(true); last = key; }
      } catch { if (!stopped) onAvailable(false); }
    };
    const schedule = () => {
      if (frame || timer || stopped || document.hidden) return;
      const delay = Math.max(0, 80 - (performance.now() - lastPaint));
      if (delay) timer = window.setTimeout(() => { timer = 0; frame = requestAnimationFrame(update); }, delay);
      else frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    const visibility = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) schedule();
      else { cancelAnimationFrame(frame); clearTimeout(timer); frame = 0; timer = 0; }
    }); visibility.observe(element);
    const onVisibility = () => { if (!document.hidden) schedule(); else { cancelAnimationFrame(frame); clearTimeout(timer); frame = 0; timer = 0; } };
    document.addEventListener("visibilitychange", onVisibility); schedule();
    return () => { stopped = true; cancelAnimationFrame(frame); clearTimeout(timer); observer.disconnect(); visibility.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [host, settings, onAvailable]);

  const channel = "B";
  return <><span aria-hidden="true" className="cws-glass__curve-edge" style={{ maskImage: map ? `url(${map.mask})` : "none", WebkitMaskImage: map ? `url(${map.mask})` : "none", visibility: map ? "visible" : "hidden", "--liquid-filter": `url(#${filterId})` } as CSSProperties} /><svg className="cws-glass__filters" aria-hidden="true" focusable="false"><defs>
    <filter id={filterId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={map?.width ?? 1} height={map?.height ?? 1} colorInterpolationFilters="sRGB">
      <feImage href={map?.image} x="0" y="0" width={map?.width ?? 1} height={map?.height ?? 1} preserveAspectRatio="none" result={`map-${stableId}`} />
      <feGaussianBlur in={`map-${stableId}`} stdDeviation={settings.blur} result="smoothMap" />
      <feDisplacementMap in="SourceGraphic" in2="smoothMap" scale={(settings.distortionScale + settings.redOffset) * strength} xChannelSelector="R" yChannelSelector={channel} result="dr" />
      <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
      <feDisplacementMap in="SourceGraphic" in2="smoothMap" scale={(settings.distortionScale + settings.greenOffset) * strength} xChannelSelector="R" yChannelSelector={channel} result="dg" />
      <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
      <feDisplacementMap in="SourceGraphic" in2="smoothMap" scale={(settings.distortionScale + settings.blueOffset) * strength} xChannelSelector="R" yChannelSelector={channel} result="db" />
      <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
      <feBlend in="red" in2="green" mode="screen" result="rg" /><feBlend in="rg" in2="blue" mode="screen" result="out" />
      <feGaussianBlur in="out" stdDeviation={settings.displace} />
    </filter>
  </defs></svg></>;
}
