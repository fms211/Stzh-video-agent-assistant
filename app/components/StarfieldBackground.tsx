"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function createGlowTexture(size: number, falloff: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(falloff, "rgba(255,255,255,0.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
let glowTex: THREE.CanvasTexture | null = null;
function getGlowTexture() {
  if (!glowTex) glowTex = createGlowTexture(128, 0.15);
  return glowTex;
}

function readCSSColor(varname: string): THREE.Color {
  if (typeof document === "undefined") return new THREE.Color("#ffffff");
  const val = getComputedStyle(document.documentElement).getPropertyValue(varname).trim();
  return new THREE.Color(val || "#ffffff");
}

// ── Particle Layer with lifecycle + repel/attract ──
function ParticleLayer({
  count, spread, size, colorVar, opacity, depthBias, thinking,
  maxAge, repelStrength, attractStrength,
}: {
  count: number; spread: number; size: number;
  colorVar: string; opacity: number; depthBias: number; thinking: boolean;
  maxAge: number; repelStrength: number; attractStrength: number;
}) {
  const meshRef = useRef<THREE.Points>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, down: false, downUntil: 0 });
  const cachedColor = useRef(readCSSColor(colorVar));
  const stateRef = useRef<Float32Array>(new Float32Array(0));
  const originRef = useRef<Float32Array>(new Float32Array(0));

  const { positions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const orig = new Float32Array(count * 3);
    const st = new Float32Array(count * 6); // age, maxAge, phase, spare, vx, vy
    for (let i = 0; i < count; i++) {
      const px = (Math.random() - 0.5) * spread;
      const py = (Math.random() - 0.5) * spread * 0.6;
      pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = depthBias + Math.random() * 2;
      orig[i * 3] = px; orig[i * 3 + 1] = py; orig[i * 3 + 2] = 0;
      st[i * 6] = Math.random() * maxAge;
      st[i * 6 + 1] = maxAge * (0.5 + Math.random());
      st[i * 6 + 2] = Math.random() * Math.PI * 2;
      st[i * 6 + 4] = 0; st[i * 6 + 5] = 0;
    }
    originRef.current = orig;
    stateRef.current = st;
    return { positions: pos };
  }, [count, spread, depthBias, maxAge]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerRef.current.x = e.clientX / window.innerWidth;
      pointerRef.current.y = 1 - e.clientY / window.innerHeight;
    };
    const onDown = (e: PointerEvent) => {
      pointerRef.current.down = true;
      pointerRef.current.downUntil = performance.now() + 800;
      pointerRef.current.x = e.clientX / window.innerWidth;
      pointerRef.current.y = 1 - e.clientY / window.innerHeight;
    };
    const onUp = () => { pointerRef.current.down = false; };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    // 颜色缓存：每 0.6 秒更新一次
    const t = state.clock.elapsedTime;
    if (Math.floor(t * 10) % 6 === 0) {
      cachedColor.current = readCSSColor(colorVar);
    }
    const mat = meshRef.current.material as THREE.PointsMaterial;
    mat.color.copy(cachedColor.current);

    const posArr = meshRef.current.geometry.attributes.position.array as Float32Array;
    const orig = originRef.current;
    const st = stateRef.current;
    const now = performance.now();
    const ptr = pointerRef.current;
    const mx = ptr.x;
    const my = ptr.y;
    const halfSpread = spread / 2;
    const halfSpreadY = halfSpread * 0.6;
    const isRepel = ptr.down || now < ptr.downUntil;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i6 = i * 6;
      let age = st[i6];
      const maxLife = st[i6 + 1];
      const phase = st[i6 + 2];
      let vx = st[i6 + 4];
      let vy = st[i6 + 5];

      // Lifecycle
      age += 0.016;
      if (age > maxLife) {
        age = 0; vx = 0; vy = 0;
        st[i6 + 1] = maxAge * (0.5 + Math.random());
        const npx = (Math.random() - 0.5) * spread;
        const npy = (Math.random() - 0.5) * spread * 0.6;
        orig[i3] = npx; orig[i3 + 1] = npy;
        posArr[i3] = npx; posArr[i3 + 1] = npy;
      }
      st[i6] = age;

      const lifeProgress = age / maxLife;
      const lifeAlpha = lifeProgress < 0.1 ? lifeProgress / 0.1
        : lifeProgress > 0.75 ? (1 - lifeProgress) / 0.25
        : 1;

      let px = posArr[i3];
      let py = posArr[i3 + 1];
      const ox = orig[i3];
      const oy = orig[i3 + 1];

      // Drift
      vx += Math.sin(t * 0.15 + phase) * 0.003;
      vy += Math.cos(t * 0.18 + phase) * 0.003;

      // Attract / Repel
      const dx = mx * spread - halfSpread - px;
      const dy = my * spread * 0.6 - halfSpreadY - py;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const maxR = isRepel ? spread * 0.35 : spread * 0.5;
      const influence = Math.max(0, 1 - dist / maxR);
      const forceMag = isRepel
        ? -repelStrength * influence * 0.02
        : attractStrength * influence * 0.02;
      vx += (dx / dist) * forceMag;
      vy += (dy / dist) * forceMag;

      // Spring
      vx += (ox - px) * 0.00015;
      vy += (oy - py) * 0.00015;

      // Vortex
      if (thinking) {
        const vdx = halfSpread - px;
        const vdy = halfSpreadY - py;
        const vdist = Math.sqrt(vdx * vdx + vdy * vdy) + 0.01;
        const vforce = 0.001 + 0.0006 * Math.sin(t * 2 + phase);
        vx += (vdx / vdist) * vforce;
        vy += (vdy / vdist) * vforce;
      }

      // Damp
      vx *= 0.94;
      vy *= 0.94;

      px += vx;
      py += vy;

      st[i6 + 4] = vx;
      st[i6 + 5] = vy;

      posArr[i3] = px;
      posArr[i3 + 1] = py;
      posArr[i3 + 2] = depthBias + 0.3 + lifeAlpha * 1.4;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef} geometry={geom}>
      <pointsMaterial
        map={getGlowTexture()}
        color="#ffffff"
        size={size}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ── Constellation Lines ──
function ConstellationLines({ count, spread, threshold, colorVar }: {
  count: number; spread: number; threshold: number; colorVar: string;
}) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const cachedColor = useRef(readCSSColor(colorVar));

  const geom = useMemo(() => {
    const pos: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      pos.push([(Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.6]);
    }
    const verts: number[] = [];
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = pos[i][0] - pos[j][0];
        const dy = pos[i][1] - pos[j][1];
        if (dx * dx + dy * dy < threshold * threshold) {
          verts.push(pos[i][0], pos[i][1], 0, pos[j][0], pos[j][1], 0);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    return g;
  }, [count, spread, threshold]);

  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    if (Math.floor(clock.elapsedTime * 10) % 6 === 0) {
      cachedColor.current = readCSSColor(colorVar);
    }
    mat.color.copy(cachedColor.current);
    mat.opacity = 0.04 + Math.sin(clock.elapsedTime * 0.3) * 0.015;
  });

  return (
    <lineSegments ref={lineRef} geometry={geom}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.04}
        blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

// ── Scene ──
function Scene({ thinkingMode }: { thinkingMode: boolean }) {
  return (
    <>
      <ParticleLayer count={150} spread={30} size={0.07}
        colorVar="--glow-cool" opacity={0.3} depthBias={-2} maxAge={30}
        repelStrength={1.2} attractStrength={0.012} thinking={thinkingMode} />
      <ConstellationLines count={25} spread={26} threshold={5} colorVar="--glow-warm" />
      <ParticleLayer count={100} spread={22} size={0.12}
        colorVar="--foreground" opacity={0.35} depthBias={0} maxAge={24}
        repelStrength={1.4} attractStrength={0.015} thinking={thinkingMode} />
      <ParticleLayer count={50} spread={16} size={0.18}
        colorVar="--glow-warm" opacity={0.3} depthBias={1} maxAge={18}
        repelStrength={1.6} attractStrength={0.018} thinking={thinkingMode} />
    </>
  );
}

export default function StarfieldBackground({ thinkingMode = false }: { thinkingMode?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const cb = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, []);

  if (reducedMotion) {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 overflow-hidden"
        style={{ background: "radial-gradient(ellipse at center, #0a1228 0%, #050a14 70%)" }} />
    );
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20">
      <Canvas camera={{ position: [0, 0, 5], fov: 70 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
        <Scene thinkingMode={thinkingMode} />
      </Canvas>
    </div>
  );
}
