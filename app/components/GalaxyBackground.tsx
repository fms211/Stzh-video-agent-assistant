"use client";

import { Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GALAXY_FRAGMENT_SHADER, GALAXY_VERTEX_SHADER } from "@/app/lib/galaxy-shaders";
import { normalizeGalaxySettings, galaxyHueFromHex, type GalaxySettings } from "@/app/lib/galaxy-settings";

type Props = {
  reducedMotion?: boolean;
  staticPreview?: boolean;
  visible?: boolean;
  mouseInteraction?: boolean;
  settings?: GalaxySettings;
};
type RenderMode = "initializing" | "running" | "static" | "paused" | "disabled" | "fallback";

const FALLBACK_STARS = [
  [7, 14, 2], [16, 62, 1], [24, 31, 1], [32, 83, 2], [41, 11, 1],
  [47, 55, 1], [56, 25, 2], [63, 74, 1], [72, 43, 1], [81, 18, 2],
  [88, 65, 1], [94, 37, 1], [12, 88, 1], [37, 46, 1], [76, 91, 2],
];

function readThemeHue() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--glow-cool").trim();
  return galaxyHueFromHex(color);
}

/** Configurable React Bits Galaxy; no cursor trail or click effect. */
export default function GalaxyBackground({ reducedMotion = false, staticPreview = false, visible = true, mouseInteraction = true, settings }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<{ sync: () => void } | null>(null);
  const optionsRef = useRef({ reducedMotion, staticPreview, visible, mouseInteraction, settings: normalizeGalaxySettings(settings) });
  const [mode, setMode] = useState<RenderMode>("initializing");
  const [pointerEnabled, setPointerEnabled] = useState(false);

  useEffect(() => {
    optionsRef.current = { reducedMotion, staticPreview, visible, mouseInteraction, settings: normalizeGalaxySettings(settings) };
    controlsRef.current?.sync();
  }, [reducedMotion, staticPreview, visible, mouseInteraction, settings]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let disposed = false;
    let failed = false;
    let renderer: Renderer | null = null;
    let geometry: Triangle | null = null;
    let program: Program | null = null;
    let mesh: Mesh | null = null;
    let frame = 0;
    let elapsed = 0;
    let previousTime: number | null = null;
    let lastPaint = -Infinity;
    let width = 0;
    let height = 0;
    let focused = document.hasFocus();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrowQuery = window.matchMedia("(max-width: 720px)");
    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const pointerScope = host.closest<HTMLElement>(".product-shell");
    const mouse = new Float32Array([0.5, 0.5]);
    const targetMouse = new Float32Array([0.5, 0.5]);
    let targetMouseActive = 0;
    let pointerBound = false;
    let bounds = { left: 0, top: 0, width: 1, height: 1 };

    const signal = (next: RenderMode) => { if (!disposed) setMode(next); };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = null;
    };
    const fallback = () => {
      failed = true;
      stop();
      bindPointer(false);
      signal("fallback");
    };
    const wantsStatic = () => optionsRef.current.staticPreview || optionsRef.current.reducedMotion || motionQuery.matches || optionsRef.current.settings.disableAnimation;
    const canAnimate = () => optionsRef.current.visible && !wantsStatic() && focused && !document.hidden;
    const resetMouse = () => {
      targetMouse.set([0.5, 0.5]);
      mouse.set([0.5, 0.5]);
      targetMouseActive = 0;
      if (program) program.uniforms.uMouseActiveFactor.value = 0;
    };
    const inputFocused = () => document.activeElement?.matches("input, textarea, select, [contenteditable=true]");
    const onPointerMove = (event: PointerEvent) => {
      if (inputFocused() || event.pointerType === "touch") {
        targetMouse.set([0.5, 0.5]);
        targetMouseActive = 0;
        return;
      }
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
      const gain = optionsRef.current.settings.mouseRepulsion ? 1 : 0.2;
      targetMouse[0] = 0.5 + (x - 0.5) * gain;
      targetMouse[1] = 0.5 + (y - 0.5) * gain;
      targetMouseActive = 1;
    };
    const onPointerLeave = () => { targetMouse.set([0.5, 0.5]); targetMouseActive = 0; };
    const onInputFocus = () => { if (inputFocused()) onPointerLeave(); };
    function bindPointer(enabled: boolean) {
      if (!pointerScope || pointerBound === enabled) return;
      pointerBound = enabled;
      if (enabled) {
        pointerScope.addEventListener("pointermove", onPointerMove, { passive: true });
        pointerScope.addEventListener("pointerleave", onPointerLeave);
        document.addEventListener("focusin", onInputFocus);
      } else {
        pointerScope.removeEventListener("pointermove", onPointerMove);
        pointerScope.removeEventListener("pointerleave", onPointerLeave);
        document.removeEventListener("focusin", onInputFocus);
        resetMouse();
      }
      if (!disposed) setPointerEnabled(enabled);
    }

    const updateUniforms = () => {
      if (!program) return;
      const config = optionsRef.current.settings;
      if (program.uniforms.uMouseRepulsion.value !== config.mouseRepulsion) resetMouse();
      program.uniforms.uDensity.value = config.density;
      program.uniforms.uSpeed.value = config.speed;
      program.uniforms.uGlowIntensity.value = config.glowIntensity;
      program.uniforms.uTwinkleIntensity.value = wantsStatic() ? 0 : config.twinkleIntensity;
      program.uniforms.uRotationSpeed.value = wantsStatic() ? 0 : config.rotationSpeed;
      program.uniforms.uSaturation.value = config.saturation;
      program.uniforms.uHueShift.value = config.useThemeHue ? readThemeHue() : config.hueShift;
      program.uniforms.uMouseRepulsion.value = config.mouseRepulsion;
      program.uniforms.uRepulsionStrength.value = config.repulsionStrength;
      program.uniforms.uAutoCenterRepulsion.value = config.autoCenterRepulsion;
      program.uniforms.uTransparent.value = config.transparent;
      program.uniforms.uFocal.value.set(config.focal);
      program.uniforms.uRotation.value.set(config.rotation);
    };
    const paint = () => {
      if (!renderer || !program || !mesh || failed || disposed) return;
      program.uniforms.uTime.value = elapsed;
      program.uniforms.uStarSpeed.value = elapsed * optionsRef.current.settings.starSpeed / 10;
      try {
        renderer.render({ scene: mesh });
      } catch {
        fallback();
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (disposed || failed || !canAnimate()) return;
      const delta = previousTime === null ? 1 / 60 : Math.min((now - previousTime) / 1000, 0.1);
      elapsed += delta;
      previousTime = now;
      if (program) {
        const blend = 1 - Math.exp(-delta / 0.22);
        mouse[0] += (targetMouse[0] - mouse[0]) * blend;
        mouse[1] += (targetMouse[1] - mouse[1]) * blend;
        program.uniforms.uMouseActiveFactor.value += (targetMouseActive - program.uniforms.uMouseActiveFactor.value) * blend;
      }
      const interval = 1000 / (narrowQuery.matches ? 24 : 30);
      if (now - lastPaint >= interval - 0.5) {
        paint();
        lastPaint = now;
      }
      if (!failed) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (disposed || failed || !renderer || !program) return;
      updateUniforms();
      bindPointer(canAnimate() && optionsRef.current.mouseInteraction && optionsRef.current.settings.mouseInteraction && finePointerQuery.matches && !narrowQuery.matches);
      if (!optionsRef.current.visible) {
        stop();
        signal("disabled");
        return;
      }
      if (document.hidden) {
        stop();
        signal("paused");
        return;
      }
      if (wantsStatic()) {
        stop();
        elapsed = 0;
        paint();
        if (!failed) signal("static");
        return;
      }
      paint();
      if (failed) return;
      if (canAnimate()) {
        if (!frame) {
          lastPaint = -Infinity;
          frame = requestAnimationFrame(tick);
        }
        signal("running");
      } else {
        stop();
        signal("paused");
      }
    };
    const resize = () => {
      if (!renderer || !program || failed || disposed) return;
      const nextWidth = Math.max(1, host.clientWidth);
      const nextHeight = Math.max(1, host.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, narrowQuery.matches ? 1 : 1.25);
      if (width !== nextWidth || height !== nextHeight || renderer.dpr !== dpr) {
        width = nextWidth;
        height = nextHeight;
        renderer.dpr = dpr;
        renderer.setSize(width, height);
        program.uniforms.uResolution.value.set([canvas.width, canvas.height, canvas.width / canvas.height]);
      }
      const rect = host.getBoundingClientRect();
      bounds = { left: rect.left, top: rect.top, width: nextWidth, height: nextHeight };
      sync();
    };
    const onFocus = () => { focused = true; sync(); };
    const onBlur = () => { focused = false; sync(); };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      fallback();
    };

    try {
      renderer = new Renderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: false,
        depth: false, stencil: false, powerPreference: "low-power", webgl: 1 });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      geometry = new Triangle(gl);
      program = new Program(gl, {
        vertex: GALAXY_VERTEX_SHADER,
        fragment: GALAXY_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Float32Array([1, 1, 1]) },
          uFocal: { value: new Float32Array([0.5, 0.5]) },
          uRotation: { value: new Float32Array([1, 0]) },
          uStarSpeed: { value: 0 },
          uDensity: { value: 0.65 },
          uHueShift: { value: 0 },
          uSpeed: { value: 0.35 },
          uMouse: { value: mouse },
          uMouseActiveFactor: { value: 0 },
          uMouseRepulsion: { value: false },
          uRepulsionStrength: { value: 2 },
          uAutoCenterRepulsion: { value: 0 },
          uTransparent: { value: true },
          uGlowIntensity: { value: 0.12 },
          uSaturation: { value: 0.10 },
          uTwinkleIntensity: { value: 0.08 },
          uRotationSpeed: { value: 0.01 },
        },
      });
      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error("Galaxy shader unavailable");
      mesh = new Mesh(gl, { geometry, program });
      controlsRef.current = { sync };
      resize();
    } catch {
      fallback();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const themeObserver = new MutationObserver(sync);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", resize);
    motionQuery.addEventListener("change", sync);
    narrowQuery.addEventListener("change", resize);
    finePointerQuery.addEventListener("change", sync);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
      stop();
      bindPointer(false);
      controlsRef.current = null;
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", resize);
      motionQuery.removeEventListener("change", sync);
      narrowQuery.removeEventListener("change", resize);
      finePointerQuery.removeEventListener("change", sync);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (renderer) {
        const gl = renderer.gl;
        geometry?.remove();
        if (program) {
          gl.deleteShader(program.vertexShader);
          gl.deleteShader(program.fragmentShader);
          program.remove();
        }
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    };
  }, []);

  const showFallback = mode === "fallback" || mode === "initializing";
  return (
    <div ref={hostRef} className={`galaxy-background${staticPreview ? " galaxy-background--preview" : ""}`}
      aria-hidden="true" data-background="galaxy" data-motion-state={mode} data-visible={visible}
      data-pointer-interaction={pointerEnabled ? "subtle" : "off"}>
      <canvas ref={canvasRef} className="galaxy-background__canvas" hidden={showFallback} />
      {showFallback && <div className="galaxy-background__fallback">
        {FALLBACK_STARS.map(([x, y, size], index) => <i key={index} style={{
          "--star-x": `${x}%`, "--star-y": `${y}%`, "--star-size": `${size}px`,
        } as CSSProperties} />)}
      </div>}
    </div>
  );
}
