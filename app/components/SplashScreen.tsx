"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import QRCodeAccess from "./QRCodeAccess";

const PX = 6;
const STARTS = ["腾", "昇", "智", "和"];
const CHAR_CANVAS = 200;
const CHAR_HALF = CHAR_CANVAS / 2;

type Props = { onEnter: () => void };

// Pre-render pixel font atlas
const charCache = new Map<string, ImageData>();
function getPixelChar(ch: string): ImageData {
  if (charCache.has(ch)) return charCache.get(ch)!;
  const c = document.createElement("canvas");
  c.width = c.height = CHAR_CANVAS;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${CHAR_CANVAS * 0.78}px "SimSun","Microsoft YaHei",serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, CHAR_HALF, CHAR_HALF);
  const img = ctx.getImageData(0, 0, CHAR_CANVAS, CHAR_CANVAS);
  for (let y = 0; y < CHAR_CANVAS; y += PX) {
    for (let x = 0; x < CHAR_CANVAS; x += PX) {
      let sum = 0;
      for (let dy = 0; dy < PX && y + dy < CHAR_CANVAS; dy++)
        for (let dx = 0; dx < PX && x + dx < CHAR_CANVAS; dx++)
          sum += img.data[((y + dy) * CHAR_CANVAS + (x + dx)) * 4 + 3];
      const v = sum / (PX * PX) > 18 ? 255 : 0;
      for (let dy = 0; dy < PX && y + dy < CHAR_CANVAS; dy++)
        for (let dx = 0; dx < PX && x + dx < CHAR_CANVAS; dx++) {
          const i = ((y + dy) * CHAR_CANVAS + (x + dx)) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = v;
        }
    }
  }
  charCache.set(ch, img);
  return img;
}


export default function SplashScreen({ onEnter }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const [fading, setFading] = useState(false);
  const animData = useRef({
    starR: 200, starAlpha: 1, c0: 0, c1: 0, c2: 0, c3: 0,
    ringData: [{ r: 0, a: 0 }, { r: 0, a: 0 }, { r: 0, a: 0 }, { r: 0, a: 0 }, { r: 0, a: 0 }],
    flash: 0, shockwaveR: 0, shockwaveA: 0,
    t: 0,
  });

  const burstRef = useRef<Array<{ angle: number; speed: number; dist: number; a: number; hue: number }>>([]);
  const debrisRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; hue: number }>>([]);

  // 清理 GSAP timeline
  useEffect(() => {
    return () => { tlRef.current?.kill(); };
  }, []);

  const startEnter = () => {
    const d = animData.current;
    d.starAlpha = 1; d.starR = 200; d.flash = 0; d.shockwaveR = 0; d.shockwaveA = 0;
    d.c0 = d.c1 = d.c2 = d.c3 = 0;

    // Generate burst particles
    burstRef.current = Array.from({ length: 160 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 200 + Math.random() * 600,
      dist: 0, a: 1, hue: Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2,
    }));

    // Generate pixel debris from title
    debrisRef.current = Array.from({ length: 200 }, () => ({
      x: 0, y: 160,
      vx: (Math.random() - 0.5) * 800,
      vy: (Math.random() - 0.5) * 500 - 200,
      life: 1, hue: Math.random() < 0.5 ? 0 : 1,
    }));

    const tl = gsap.timeline({
      onComplete: () => {
        setFading(true);
        setTimeout(onEnter, 500);
      },
    });
    tlRef.current = tl;

    // 0.0s: Flash + star begins collapsing fast
    tl.to(d, { flash: 1, duration: 0.08, ease: "power2.in" }, 0);
    tl.to(d, { flash: 0, duration: 0.7, ease: "power2.out" }, 0.08);
    tl.to(d, { starR: 4, starAlpha: 0, duration: 0.45, ease: "power4.in" }, 0.03);

    // 0.05s: Shockwave blasts out
    tl.to(d, { shockwaveR: 1200, shockwaveA: 0, duration: 0.8, ease: "power3.out" }, 0.05);
    tl.set(d, { shockwaveR: 10, shockwaveA: 1 }, 0.04);

    // 0.08s: Burst particles start flying
    tl.to({}, { duration: 0.01, onStart: () => {
      for (const bp of burstRef.current) bp.dist = 0;
    }}, 0.08);

    // 0.1s: Characters blast apart
    for (let i = 0; i < 4; i++) {
      tl.to(d, { [`c${i}`]: (i - 1.5) * 350, duration: 0.4, ease: "power3.in" }, 0.1);
    }

    // 0.4s: Rings materialize from shockwave
    for (let i = 0; i < 5; i++) {
      const ring = d.ringData[i];
      tl.set(ring, { r: 5, a: 0.9 }, 0.38);
      tl.to(ring, { r: 700 + i * 180, a: 0, duration: 1.0, ease: "power2.out" }, 0.4 + i * 0.04);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, running = true;

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Nebula blobs
    const nebulae = Array.from({ length: 6 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      rx: 200 + Math.random() * 400, ry: 150 + Math.random() * 300,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2,
      hue: Math.random() < 0.33 ? 0 : Math.random() < 0.5 ? 1 : 2,
      ph: Math.random() * Math.PI * 2,
    }));

    // Dense starfield
    const stars: Array<{ x: number; y: number; s: number; a: number; ph: number; tw: number }> = [];
    for (let i = 0; i < 500; i++) {
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        s: 0.3 + Math.random() * 1.2,
        a: 0.08 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2,
        tw: Math.random() * 2000,
      });
    }

    const draw = () => {
      if (!running) return;
      const d = animData.current;
      const t = performance.now() / 1000;
      d.t = t;
      const cx = w / 2, cy = h / 2;

      // Space bg
      ctx.fillStyle = "#050a14";
      ctx.fillRect(0, 0, w, h);

      // Nebulae
      for (const neb of nebulae) {
        neb.x += neb.vx; neb.y += neb.vy;
        if (neb.x < -500) neb.x = w + 500;
        if (neb.x > w + 500) neb.x = -500;
        if (neb.y < -400) neb.y = h + 400;
        if (neb.y > h + 400) neb.y = -400;

        const colors = [
          ["rgba(232,152,64,0.03)", "rgba(255,180,100,0.015)"],
          ["rgba(96,136,216,0.025)", "rgba(130,170,240,0.01)"],
          ["rgba(152,128,208,0.025)", "rgba(180,160,230,0.01)"],
        ][neb.hue];

        const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.rx);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(0.6, colors[1]);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(neb.x - neb.rx, neb.y - neb.ry, neb.rx * 2, neb.ry * 2);
      }

      // Stars
      for (const star of stars) {
        const sx = star.x + Math.sin(t * 0.2 + star.ph) * 3;
        const sy = star.y + Math.cos(t * 0.25 + star.ph) * 3;
        const bx = Math.floor(sx / PX) * PX;
        const by = Math.floor(sy / PX) * PX;
        const flicker = 0.6 + 0.4 * Math.sin(t * 2.5 + star.tw);
        const a = star.a * flicker;
        if (a < 0.03) continue;
        // Mix warm/cool
        const warm = star.tw % 3 < 1;
        ctx.fillStyle = warm
          ? `rgba(232,152,64,${a})`
          : `rgba(180,200,240,${a})`;
        ctx.fillRect(bx, by, Math.ceil(PX * star.s), Math.ceil(PX * star.s));
      }

      // Screen flash
      if (d.flash > 0.01) {
        ctx.fillStyle = `rgba(255,220,160,${d.flash * 0.6})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Shockwave ring
      if (d.shockwaveR > 2 && d.shockwaveA > 0.01) {
        const sw = d.shockwaveR;
        const swSteps = Math.floor((2 * Math.PI * sw) / PX);
        for (let a = 0; a < swSteps; a++) {
          const angle = (a / swSteps) * Math.PI * 2;
          const sx = cx + Math.cos(angle) * sw;
          const sy = cy + Math.sin(angle) * sw * 0.6;
          ctx.fillStyle = `rgba(255,240,210,${d.shockwaveA * 0.7})`;
          ctx.fillRect(Math.floor(sx / PX) * PX, Math.floor(sy / PX) * PX, PX, PX);
          // Outer glow
          ctx.fillStyle = `rgba(255,200,120,${d.shockwaveA * 0.3})`;
          ctx.fillRect(Math.floor((sx + 8) / PX) * PX, Math.floor(sy / PX) * PX, PX, PX);
          ctx.fillRect(Math.floor((sx - 8) / PX) * PX, Math.floor(sy / PX) * PX, PX, PX);
        }
      }

      // Burst particles
      const elapsed = d.starR < 100 ? (200 - d.starR) / 200 : 0;
      for (const bp of burstRef.current) {
        bp.dist += bp.speed * 0.025;
        bp.a = Math.max(0, 1 - bp.dist / 800);
        if (bp.a <= 0.01) continue;
        const bx = cx + Math.cos(bp.angle) * bp.dist;
        const by = cy + Math.sin(bp.angle) * bp.dist * 0.6;
        const colors = ["255,190,100", "150,200,255", "200,160,240"];
        ctx.fillStyle = `rgba(${colors[bp.hue]},${bp.a})`;
        ctx.fillRect(Math.floor(bx / PX) * PX, Math.floor(by / PX) * PX, PX, PX);
      }

      // Pixel debris from title
      for (const db of debrisRef.current) {
        if (d.starR > 150) {
          // Track title position when idle
          db.x = cx + (Math.random() - 0.5) * 400;
          db.y = 160;
          db.life = 1;
          continue;
        }
        db.x += db.vx * 0.02;
        db.y += db.vy * 0.02;
        db.life -= 0.02;
        if (db.life <= 0) continue;
        const colors = ["232,152,64", "150,200,255"];
        ctx.fillStyle = `rgba(${colors[db.hue]},${db.life})`;
        ctx.fillRect(Math.floor(db.x / PX) * PX, Math.floor(db.y / PX) * PX, PX, PX);
      }

      // Star
      const sr = d.starR;
      if (sr > 2 && d.starAlpha > 0.01) {
        for (let l = 5; l >= 0; l--) {
          const lr = sr + l * 35;
          const la = (0.1 - l * 0.015) * d.starAlpha;
          if (la <= 0) continue;
          const grad = ctx.createRadialGradient(cx, cy, sr * 0.2, cx, cy, lr);
          grad.addColorStop(0, `rgba(255,220,160,${la * 3})`);
          grad.addColorStop(0.4, `rgba(232,152,64,${la})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(cx - lr, cy - lr, lr * 2, lr * 2);
        }
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 0.5);
        cg.addColorStop(0, `rgba(255,245,230,${d.starAlpha})`);
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(cx - sr, cy - sr, sr * 2, sr * 2);
      }

      // Title rendered as DOM overlay (GeistPixel font)

      // Burst rings
      for (const ring of d.ringData) {
        if (ring.a <= 0.01 || ring.r < 3) continue;
        const ri = d.ringData.indexOf(ring);
        const colors = ["#e89840", "#6088d8", "#9880d0", "#e89840", "#6088d8"];
        const col = colors[ri % 5];
        const steps = Math.floor((2 * Math.PI * ring.r) / PX);
        for (let a = 0; a < steps; a++) {
          const angle = (a / steps) * Math.PI * 2;
          const rx = cx + Math.cos(angle) * ring.r;
          const ry = cy + Math.sin(angle) * ring.r * 0.35;
          ctx.fillStyle = col.replace(")", `,${ring.a})`).replace("rgb", "rgba");
          ctx.fillRect(Math.floor(rx / PX) * PX, Math.floor(ry / PX) * PX, PX, PX);
        }
      }

      // Scanlines
      for (let sy = 0; sy < h; sy += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.035)";
        ctx.fillRect(0, sy, w, 1);
      }


      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-100 cursor-pointer ${fading ? "opacity-0 transition-opacity duration-400" : ""}`}
      onClick={startEnter}
      style={{ background: "#050a14" }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="splash-title-row">
        {["腾", "昇", "智", "和"].map((ch, i) => (
          <span key={i} className="splash-title-char" style={{ animationDelay: `${i * 0.12}s` }}>{ch}</span>
        ))}
      </div>
      <div className="splash-bottom">
        <p className="splash-subtitle">准备好进入您的工作区了嘛，尊敬的用户 :)</p>
        <p className="splash-hint-text">点击任意位置进入观测台</p>
      </div>
      <div className="splash-qr-corner">
        <QRCodeAccess compact />
      </div>
      <style>{`
        .splash-title-row {
          position: absolute; top: 120px; left: 0; right: 0;
          display: flex; justify-content: center; gap: 36px;
          z-index: 10; pointer-events: none;
        }
        .splash-title-char {
          font-family: "GeistPixel-Line", var(--font-display), sans-serif;
          font-size: 88px; font-weight: 400; line-height: 1;
          background: linear-gradient(135deg, var(--glow-warm-soft) 0%, var(--glow-aurora) 50%, var(--glow-cool) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: pixel-float-in 0.5s cubic-bezier(0.16,1,0.3,1) both,
                     title-breathe 3s ease-in-out infinite,
                     text-shimmer 4s linear infinite;
          filter: drop-shadow(0 0 18px color-mix(in srgb, var(--glow-warm) 40%, transparent))
                   drop-shadow(2px 2px 0 rgba(0,0,0,0.7));
          text-rendering: optimizeSpeed;
          -webkit-font-smoothing: none;
          -moz-osx-font-smoothing: unset;
        }
        @keyframes pixel-float-in {
          from { opacity: 0; transform: translateY(16px); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes title-breathe {
          0%,100% { opacity: 0.85; }
          50% { opacity: 1; }
        }

        .splash-bottom {
          position: absolute; bottom: 60px; left: 0; right: 0;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          z-index: 10; pointer-events: none;
        }
        .splash-subtitle {
          font-family: var(--font-display), "Microsoft YaHei", sans-serif;
          font-size: 18px; font-weight: 400; margin: 0;
          letter-spacing: 0.06em;
          background: linear-gradient(90deg, var(--glow-warm-soft), var(--glow-aurora), var(--glow-cool), var(--glow-warm-soft));
          background-size: 300% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: subtitle-breathe 3s ease-in-out infinite, text-shimmer 4s linear infinite;
          filter: drop-shadow(0 0 12px color-mix(in srgb, var(--glow-warm) 30%, transparent));
          text-align: center; padding: 0 20px;
        }
        @keyframes subtitle-breathe {
          0%,100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        .splash-hint-text {
          font-size: 13px; letter-spacing: 0.1em;
          color: var(--foreground-muted); margin: 0;
          animation: hint-breathe 2.5s ease-in-out infinite;
        }
        @keyframes hint-breathe {
          0%,100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        .splash-qr-corner {
          position: absolute; bottom: 20px; right: 20px;
          z-index: 20; opacity: 0.6; transition: opacity 0.3s;
        }
        .splash-qr-corner:hover { opacity: 1; }
      `}</style>
    </div>
  );
}
