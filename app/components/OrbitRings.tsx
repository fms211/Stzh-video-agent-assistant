"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

function rng(min: number, max: number) { return min + Math.random() * (max - min); }

type Ring = { size: number; color: string; speed: number; rx: number; ry: number;
  breathe: number; breathePhase: boolean; borderW: number;
  glow1: number; glow2: number; glowIn: number; glowA1: number; glowA2: number; glowAI: number; };

function genRings(): Ring[] {
  const colors = ["--glow-warm", "--glow-cool", "--glow-aurora", "--glow-warm", "--glow-cool"] as const;
  return Array.from({ length: 5 }, (_, i) => ({
    size: rng(i === 0 ? 600 : i === 1 ? 480 : i === 2 ? 360 : i === 3 ? 260 : 160, i === 0 ? 800 : i === 1 ? 620 : i === 2 ? 500 : i === 3 ? 380 : 260),
    color: colors[i],
    speed: rng(i === 0 ? 28 : i === 1 ? 22 : i === 2 ? 16 : i === 3 ? 12 : 10, i === 0 ? 42 : i === 1 ? 32 : i === 2 ? 26 : i === 3 ? 22 : 18),
    rx: rng(42, 68),
    ry: rng(-32, 32),
    breathe: rng(2.5, 4),
    breathePhase: Math.random() < 0.5,
    borderW: rng(3, 5.5),
    glow1: rng(14, 30), glow2: rng(30, 65), glowIn: rng(8, 16),
    glowA1: rng(50, 75), glowA2: rng(20, 40), glowAI: rng(25, 45),
  }));
}

export default function OrbitRings({
  resetKey = 0, burstKey = 0, reducedMotion = false, phase = "splash", morphKey = 0,
}: {
  resetKey?: number; burstKey?: number; reducedMotion?: boolean; phase?: string; morphKey?: number;
}) {
  const [rings, setRings] = useState<Ring[]>([]);
  const [mounted, setMounted] = useState(false);
  const prevKey = useRef(resetKey);
  const ringsRef = useRef<HTMLDivElement[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isWorkspace = phase === "workspace";

  useEffect(() => {
    setRings(genRings());
    setMounted(true);
    return () => { tlRef.current?.kill(); };
  }, []);

  useEffect(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      setRings(genRings());
    }
  }, [resetKey]);

  // GSAP burst on message sent（reduced motion 时跳过，只保留静态环）
  useEffect(() => {
    if (burstKey === 0 || !mounted || reducedMotion || !isWorkspace) return;
    const els = ringsRef.current.filter(Boolean);
    if (els.length === 0) return;

    const tl = gsap.timeline();
    tlRef.current = tl;
    tl.to(els, {
      scaleX: 1.25, scaleY: 1.25,
      duration: 0.35, ease: "power2.out",
      stagger: 0.04,
    });
    tl.to(els, {
      scaleX: 1, scaleY: 1,
      duration: 0.7, ease: "elastic.out(1, 0.5)",
      stagger: 0.04,
    });
  }, [burstKey, mounted, reducedMotion, isWorkspace]);

  // 幻变绽放：进入工作区时尘埃先退让（0.15s），星环放大淡入
  useEffect(() => {
    if (morphKey === 0 || !mounted) return;
    const els = ringsRef.current.filter(Boolean);
    if (els.length === 0) return;
    const root = wrapRef.current;

    if (reducedMotion) {
      gsap.set(root, { opacity: 1, scale: 1 });
      gsap.set(els, { opacity: 1, scale: 1 });
      return;
    }

    const tl = gsap.timeline();
    tlRef.current = tl;
    tl.set(root, { opacity: 1, scale: 1 })
      .fromTo(els, { opacity: 0, scale: 0.6 }, {
        opacity: 1, scale: 1,
        duration: 0.4, ease: "power2.out",
        stagger: 0.05,
      }, 0.15);
  }, [morphKey, mounted, reducedMotion]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[15] orbit-rings"
      data-bg-phase={phase}
      style={{ ...(isWorkspace ? undefined : { opacity: 0, transform: "scale(0.6)" }), opacity: "var(--orbit-opacity, 1)" } as React.CSSProperties}
    >
      <style>{`
        @keyframes star-pulse {
          0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 0.55; }
          50% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; }
        }
        @keyframes star-enter {
          from { transform: translate(-50%,-50%) scale(0); opacity: 0; }
          to { transform: translate(-50%,-50%) scale(1); opacity: 1; }
        }
        @keyframes ring-appear {
          from { opacity: 0; filter: blur(6px); }
          to { opacity: 1; filter: blur(0); }
        }
        ${rings.length > 0 ? rings.map((r, i) => `
          @keyframes breathe-${i}-${resetKey} {
            0%,100% { opacity: ${r.breathePhase ? 1 : 0.2}; }
            50% { opacity: ${r.breathePhase ? 0.2 : 1}; }
          }
        `).join("") : ""}
        /* 入口阶段：环隐藏且动画暂停，省 GPU；工作区恢复 */
        .orbit-rings[data-bg-phase="splash"] .orbit-ring-inner,
        .orbit-rings[data-bg-phase="gateway"] .orbit-ring-inner {
          animation-play-state: paused !important;
        }
        .orbit-rings[data-bg-phase="splash"] .orbit-star,
        .orbit-rings[data-bg-phase="gateway"] .orbit-star {
          animation: none !important;
        }
      `}</style>

      {/* Central star */}
      <div
        className="orbit-star"
        style={{
          position: "absolute", left: "50%", top: "50%",
          width: 90, height: 90, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, var(--glow-warm-soft) 0%, var(--glow-warm) 30%, transparent 70%)",
          boxShadow:
            "0 0 40px var(--glow-warm), 0 0 80px color-mix(in srgb, var(--glow-warm) 60%, transparent), 0 0 150px color-mix(in srgb, var(--glow-warm) 35%, transparent), 0 0 250px color-mix(in srgb, var(--glow-warm) 15%, transparent)",
          animation: mounted && isWorkspace ? "star-enter 0.7s cubic-bezier(0.16,1,0.3,1) forwards, star-pulse 4s ease-in-out 0.7s infinite" : "none",
          transition: "box-shadow 1.2s cubic-bezier(0.16,1,0.3,1)",
        }} />

      {rings.map((r, i) => (
        <div
          key={i}
          ref={(el) => { ringsRef.current[i] = el as HTMLDivElement; }}
          style={{
            position: "absolute", left: "50%", top: "50%",
            width: r.size, height: r.size,
            transform: `translate(-50%,-50%) rotateX(${r.rx}deg) rotateY(${r.ry}deg)`,
            transition: `
              width 1.2s cubic-bezier(0.16,1,0.3,1),
              height 1.2s cubic-bezier(0.16,1,0.3,1),
              transform 1.2s cubic-bezier(0.16,1,0.3,1)
            `,
          }}
        >
          <div
            className="orbit-ring-inner"
            style={{
              width: "100%", height: "100%", borderRadius: "50%",
              border: `${r.borderW.toFixed(1)}px solid color-mix(in srgb, var(${r.color}) ${rng(70, 88).toFixed(0)}%, transparent)`,
              boxShadow: `
                0 0 ${r.glow1.toFixed(0)}px color-mix(in srgb, var(${r.color}) ${r.glowA1.toFixed(0)}%, transparent),
                0 0 ${r.glow2.toFixed(0)}px color-mix(in srgb, var(${r.color}) ${r.glowA2.toFixed(0)}%, transparent),
                inset 0 0 ${r.glowIn.toFixed(0)}px color-mix(in srgb, var(${r.color}) ${r.glowAI.toFixed(0)}%, transparent)
              `,
              transition: `
                border 1.2s cubic-bezier(0.16,1,0.3,1),
                box-shadow 1.2s cubic-bezier(0.16,1,0.3,1)
              `,
              animation: `
                ${mounted && isWorkspace ? `ring-appear 0.5s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.1}s both,` : ""}
                ${reducedMotion ? "" : `rotate-orbit ${r.speed}s linear infinite,`}
                breathe-${i}-${resetKey} ${r.breathe}s ease-in-out infinite
              `,
            }}
          />
        </div>
      ))}

      <style>{`
        @keyframes rotate-orbit {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
