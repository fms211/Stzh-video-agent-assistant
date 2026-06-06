"use client";

import { useEffect, useRef } from "react";

const TRAIL_LEN = 20;
const PIXEL_SIZE = 6;
const RIPPLE_MAX = 4;        // 更多涟漪
const RIPPLE_SPEED = 3.5;    // 涟漪扩展速度（下降25%）
const RIPPLE_DECAY = 0.018;  // 涟漪消失速度（更快消失）

type TrailPt = { x: number; y: number; age: number };
type Ripple = { x: number; y: number; radius: number; alpha: number };

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let running = true;
    let raf = 0;
    let w = 0; let h = 0;
    const trail: TrailPt[] = [];
    const ripples: Ripple[] = [];
    let mouseX = 0; let mouseY = 0;
    let mouseActive = false;

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX; mouseY = e.clientY;
      mouseActive = true;
    };
    const onLeave = () => { mouseActive = false; };
    const onClick = (e: PointerEvent) => {
      ripples.push({ x: e.clientX, y: e.clientY, radius: 0, alpha: 1 });
      if (ripples.length > RIPPLE_MAX) ripples.shift();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("click", onClick);

    // Theme color cache — only re-read on theme change
    let warm = { r: 232, g: 152, b: 64 };
    let cool = { r: 96, g: 136, b: 216 };
    let aurora = { r: 152, g: 128, b: 208 };
    const updateColors = () => {
      const style = getComputedStyle(document.documentElement);
      const warmHex = style.getPropertyValue("--glow-warm").trim() || "#e89840";
      const coolHex = style.getPropertyValue("--glow-cool").trim() || "#6088d8";
      const auroraHex = style.getPropertyValue("--glow-aurora").trim() || "#9880d0";
      const parseHex = (h: string) => {
        const hex = h.replace("#", "");
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
      };
      warm = parseHex(warmHex);
      cool = parseHex(coolHex);
      aurora = parseHex(auroraHex);
    };
    updateColors();
    const themeObserver = new MutationObserver(updateColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      // Update trail
      if (mouseActive) {
        trail.push({ x: mouseX, y: mouseY, age: 0 });
        if (trail.length > TRAIL_LEN) trail.shift();
      }
      for (const pt of trail) pt.age += 0.016;

      // Draw trail: pixel squares fading with age
      for (const pt of trail) {
        const life = 1 - pt.age / 1.2;
        if (life <= 0) continue;
        const alpha = life * 0.55;
        const size = PIXEL_SIZE + (1 - life) * 3;

        // Pixel block — theme warm color
        ctx.fillStyle = `rgba(${warm.r},${warm.g},${warm.b},${alpha})`;
        const bx = Math.floor(pt.x / size) * size;
        const by = Math.floor(pt.y / size) * size;
        ctx.fillRect(bx, by, size, size);

        // Wider glow
        const glowR = Math.round(warm.r + (cool.r - warm.r) * 0.3);
        const glowG = Math.round(warm.g + (cool.g - warm.g) * 0.3);
        const glowB = Math.round(warm.b + (cool.b - warm.b) * 0.3);
        ctx.fillStyle = `rgba(${glowR},${glowG},${glowB},${alpha * 0.25})`;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            ctx.fillRect(bx + dx * size, by + dy * size, size, size);
          }
        }
      }

      // Clean old trail points
      while (trail.length > 0 && trail[0].age > 1.5) trail.shift();

      // Draw ripples
      for (const r of ripples) {
        r.radius += RIPPLE_SPEED;
        r.alpha -= RIPPLE_DECAY;
        if (r.alpha <= 0) continue;

        // Main expanding ring — theme warm glow
        ctx.strokeStyle = `rgba(${warm.r},${warm.g},${warm.b},${r.alpha})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `rgba(${warm.r},${warm.g},${warm.b},${r.alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner ring — cool color
        ctx.strokeStyle = `rgba(${cool.r},${cool.g},${cool.b},${r.alpha * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        // Pixel blocks along edge — warm color（更密集）
        const count = Math.floor(r.radius / 3);
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + (r.radius * 0.012);
          const rx = r.x + Math.cos(angle) * r.radius;
          const ry = r.y + Math.sin(angle) * r.radius;
          const px = Math.floor(rx / PIXEL_SIZE) * PIXEL_SIZE;
          const py = Math.floor(ry / PIXEL_SIZE) * PIXEL_SIZE;
          ctx.fillStyle = `rgba(${warm.r},${warm.g},${warm.b},${r.alpha * 0.65})`;
          ctx.fillRect(px, py, PIXEL_SIZE, PIXEL_SIZE);
        }

        // Inner pixel blocks — mixed warm/cool（更密集）
        const innerCount = Math.floor(r.radius / 5);
        const mixR = Math.round((warm.r + cool.r) / 2);
        const mixG = Math.round((warm.g + cool.g) / 2);
        const mixB = Math.round((warm.b + cool.b) / 2);
        for (let i = 0; i < innerCount; i++) {
          const angle = (i / innerCount) * Math.PI * 2 - (r.radius * 0.008);
          const rx = r.x + Math.cos(angle) * r.radius * 0.5;
          const ry = r.y + Math.sin(angle) * r.radius * 0.5;
          const px = Math.floor(rx / (PIXEL_SIZE * 1.5)) * (PIXEL_SIZE * 1.5);
          const py = Math.floor(ry / (PIXEL_SIZE * 1.5)) * (PIXEL_SIZE * 1.5);
          ctx.fillStyle = `rgba(${mixR},${mixG},${mixB},${r.alpha * 0.45})`;
          ctx.fillRect(px, py, PIXEL_SIZE * 1.5, PIXEL_SIZE * 1.5);
        }

        // Core glow — aurora color（新增中心辉光）
        const coreAlpha = r.alpha * 0.3 * (1 - r.radius / 150);
        if (coreAlpha > 0) {
          ctx.fillStyle = `rgba(${aurora.r},${aurora.g},${aurora.b},${coreAlpha})`;
          const coreSize = Math.max(2, 8 - r.radius / 10);
          ctx.fillRect(
            Math.floor(r.x / coreSize) * coreSize,
            Math.floor(r.y / coreSize) * coreSize,
            coreSize,
            coreSize
          );
        }
      }

      // Clean dead ripples
      while (ripples.length > 0 && ripples[0].alpha <= 0) ripples.shift();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("click", onClick);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-25"
    />
  );
}
