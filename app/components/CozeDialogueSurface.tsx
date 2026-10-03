"use client";

import { createContext, useContext, useLayoutEffect, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { usePreferences } from "@/app/hooks/usePreferences";
import { cozeDialoguePhase, cozeIdleFrame, type CozeDialoguePhase, type CozeDialogueState, type CozeGlowSettings } from "@/app/lib/coze-dialogue-settings";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { useLiquidGlassSettings } from "./LiquidGlassProvider";
import { normalizeGlassSurface } from "@/app/lib/glass-surface-settings";
import { DEFAULT_COZE_GLOW } from "@/app/lib/coze-dialogue-settings";

// Border proximity / angle interaction adapted from React Bits BorderGlow.
// https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Components/BorderGlow
// Copyright (c) 2026 David Haz. License: /licenses/react-bits-galaxy.txt.
// Keep the glow inside the surface: the workspace intentionally clips overflow.
const DialoguePhase = createContext<CozeDialoguePhase>("active");
export const useCozeDialoguePhase = () => useContext(DialoguePhase);

export function CozeDialogueSurface({ active, conversation, settings, children }: { active: boolean; conversation?: CozeDialogueState; settings?: CozeGlowSettings; children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useCreativeMotion();
  const { prefs } = usePreferences();
  const glass = normalizeGlassSurface(useLiquidGlassSettings().settings.surface);
  const glow = settings ?? prefs.cozeGlow;
  const [openingScope, setOpeningScope] = useState<string | null>(null);
  const lastSubmission = useRef("");
  const [area, setArea] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [star, setStar] = useState({ x: 0, y: 0 });
  const [panelHeight, setPanelHeight] = useState(0);
  const phase = conversation ? cozeDialoguePhase(conversation, active ? openingScope : null) : "active";
  const instant = reducedMotion || (!!conversation && area.height < 240) || !active;

  useLayoutEffect(() => {
    if (!conversation?.firstSubmission || !active || instant) { setOpeningScope(null); return; }
    const key = `${conversation.scope}:${conversation.firstSubmission}`;
    if (key === lastSubmission.current) return;
    lastSubmission.current = key;
    if (instant) return;
    setOpeningScope(key);
    const timer = window.setTimeout(() => setOpeningScope(current => current === key ? null : current), 520);
    return () => window.clearTimeout(timer);
  }, [conversation?.scope, conversation?.firstSubmission, active, instant]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !active) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const box = stage.getBoundingClientRect();
      const anchor = document.querySelector(".orbit-star")?.getBoundingClientRect();
      const next = { left: box.left, top: box.top, width: box.width, height: box.height };
      setArea(previous => Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof next]) ? previous : next);
      setStar({ x: anchor ? anchor.left + anchor.width / 2 : window.innerWidth / 2, y: anchor ? anchor.top + anchor.height / 2 : window.innerHeight / 2 });
      const panel = stage.querySelector<HTMLElement>(".coze-context-panel:not([hidden])");
      setPanelHeight(panel ? Math.min(panel.scrollHeight, window.innerHeight * .35, 280) : 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read); };
    const observer = new ResizeObserver(schedule); observer.observe(stage); read();
    window.addEventListener("resize", schedule); window.visualViewport?.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); };
  }, [active, conversation?.panelOpen, conversation?.scope]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !active || instant || phase === "opening") return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let introFrame = 0;
    let bounds: DOMRect | null = null;
    let pointer: { x: number; y: number } | null = null;

    const reset = () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(introFrame);
      introFrame = 0;
      frame = 0;
      pointer = null;
      surface.dataset.tracking = "false";
      // Preserve angle during the exit fade; resetting it would sweep the light.
      surface.style.setProperty("--coze-edge-opacity", "0");
    };
    const paint = () => {
      frame = 0;
      if (!pointer || !finePointer.matches || document.hidden) return;
      bounds ??= surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dx = pointer.x - bounds.left - bounds.width / 2;
      const dy = pointer.y - bounds.top - bounds.height / 2;
      const proximity = Math.min(1, Math.max(Math.abs(dx) / (bounds.width / 2), Math.abs(dy) / (bounds.height / 2)));
      const opacity = Math.max(0, (proximity * 100 - glow.edgeSensitivity) / (100 - glow.edgeSensitivity));
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
      surface.style.setProperty("--coze-cursor-angle", `${angle}deg`);
      surface.style.setProperty("--coze-edge-opacity", String(opacity));
      surface.dataset.tracking = "true";
    };
    const schedule = () => {
      if (pointer && !frame) frame = requestAnimationFrame(paint);
    };
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(introFrame);
      if (event.pointerType !== "mouse" || !finePointer.matches || document.hidden) {
        reset();
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const invalidateBounds = () => { bounds = null; schedule(); };
    const onEnter = (event: PointerEvent) => { bounds = null; move(event); };
    const onVisibility = () => { if (document.hidden) reset(); };
    const resizeObserver = new ResizeObserver(invalidateBounds);
    resizeObserver.observe(surface);
    surface.addEventListener("pointerenter", onEnter);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerleave", reset);
    surface.addEventListener("pointercancel", reset);
    window.addEventListener("resize", invalidateBounds);
    window.addEventListener("scroll", invalidateBounds, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onVisibility);
    finePointer.addEventListener("change", reset);
    if (glow.animated && finePointer.matches && !document.hidden) {
      const start = performance.now();
      const sweep = (now: number) => {
        const progress = Math.min(1, (now - start) / 1800);
        surface.style.setProperty("--coze-cursor-angle", `${110 + progress * 355}deg`);
        surface.style.setProperty("--coze-edge-opacity", String(Math.sin(Math.PI * progress)));
        if (progress < 1) introFrame = requestAnimationFrame(sweep); else reset();
      };
      introFrame = requestAnimationFrame(sweep);
    }
    return () => {
      reset();
      resizeObserver.disconnect();
      surface.removeEventListener("pointerenter", onEnter);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", reset);
      surface.removeEventListener("pointercancel", reset);
      window.removeEventListener("resize", invalidateBounds);
      window.removeEventListener("scroll", invalidateBounds, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibility);
      finePointer.removeEventListener("change", reset);
    };
  }, [active, instant, phase, glow.edgeSensitivity, glow.animated]);

  const idle = conversation && (phase === "idle" || phase === "loading");
  const rect = idle ? cozeIdleFrame(area, star, panelHeight) : { x: 0, y: 0, width: area.width, height: area.height };
  const style = {
    "--coze-radius": `${Math.min(glow.borderRadius === DEFAULT_COZE_GLOW.borderRadius ? glass.borderRadius : glow.borderRadius, area.width < 720 ? 24 : 60)}px`,
    "--coze-background": glow.backgroundColor, "--coze-glow-intensity": glow.glowIntensity,
    "--coze-cone-spread": glow.coneSpread, "--coze-glow-radius": `${glow.glowRadius}px`,
    "--coze-border-width": `${glow.borderWidth}px`, "--coze-fill-opacity": glow.fillOpacity,
    "--coze-color-one": glow.useThemeColors ? "var(--glow-cool)" : glow.colors[0],
    "--coze-color-two": glow.useThemeColors ? "var(--glow-warm)" : glow.colors[1],
    "--coze-color-three": glow.useThemeColors ? "var(--glow-aurora)" : glow.colors[2],
  } as CSSProperties;

  return (
    <div ref={stageRef} className={`coze-dialogue-stage${conversation ? "" : " coze-dialogue-stage--preview"}`}>
    <motion.div ref={surfaceRef} className="coze-dialogue-surface" data-phase={phase} data-reduced-motion={reducedMotion}
      initial={false} animate={conversation && area.width > 0 ? rect : undefined} transition={{ duration: instant || phase === "loading" ? 0 : .52, ease: [.22, 1, .36, 1] }}
      style={{ ...style, ...(!conversation ? { width: "100%", height: "100%" } : area.width === 0 ? { inset: 0 } : {}) }}>
      <div className="coze-dialogue-surface__backdrop" aria-hidden="true">
        <LiquidGlassSurface variant="panel" materialRole="dialogue" className="coze-dialogue-glass">{null}</LiquidGlassSurface>
      </div>
      <DialoguePhase.Provider value={phase}>{children}</DialoguePhase.Provider>
      <span className="coze-dialogue-surface__glow" aria-hidden="true" />
    </motion.div></div>
  );
}
