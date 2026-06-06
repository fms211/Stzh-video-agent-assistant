"use client";

import { useEffect, useRef } from "react";

export default function PixelTitle() {
  const elRef = useRef<HTMLHeadingElement | null>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef({
    x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
    dragging: false, released: 0,
  });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      s.dragging = true; s.tx = e.clientX; s.ty = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      const s = stateRef.current;
      if (s.dragging) { s.tx = e.clientX; s.ty = e.clientY; }
    };
    const onUp = () => {
      const s = stateRef.current;
      s.dragging = false; s.released = performance.now();
      el.style.cursor = "grab";
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.style.cursor = "grab";
    el.style.userSelect = "none";
    el.style.touchAction = "none";

    const animate = () => {
      const s = stateRef.current;
      if (s.dragging) {
        s.vx = (s.tx - s.x) * 0.25;
        s.vy = (s.ty - s.y) * 0.25;
      } else {
        const elapsed = performance.now() - s.released;
        if (elapsed > 2000) { s.vx += -s.x * 0.0004; s.vy += -s.y * 0.0004; }
        s.vx *= 0.95; s.vy *= 0.95;
      }
      s.x += s.vx; s.y += s.vy;
      if (Math.abs(s.vx) > 0.01 || Math.abs(s.vy) > 0.01 || s.dragging) {
        el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <h2 ref={elRef} className="pixel-title">
      腾昇智和 &middot; AI 短视频导演
    </h2>
  );
}
