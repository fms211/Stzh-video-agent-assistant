"use client";

import { useEffect, useRef } from "react";

/**
 * BFECC 半影平流星云雾化拖尾（Canvas 2D 简化版）
 * ─────────────────────────────────────────────────────────
 * 使用 Canvas 2D 实现流体拖尾效果
 * 通过多层叠加和模糊来模拟星云雾化
 */

// 配置常量
const CONFIG = {
  // 流体参数
  VELOCITY_DECAY: 0.94,      // 速度消散率
  DENSITY_DECAY: 0.97,       // 密度消散率（更慢消散）
  VISCOSITY: 0.02,           // 粘度
  GRID_SIZE: 10,             // 网格精度（更精细）
  INJECT_RADIUS: 3,          // 注入半径（更大）
  INJECT_DENSITY: 0.25,      // 注入密度强度

  // 星云色彩
  WARM: { r: 232, g: 152, b: 64 },   // #e89840
  COOL: { r: 96, g: 136, b: 216 },   // #6088d8
  AURORA: { r: 152, g: 128, b: 208 }, // #9880d0

  // 粒子参数
  PARTICLE_COUNT: 80,
  PARTICLE_SIZE: 2.5,
  TRAIL_LENGTH: 12,

  // 停留渐隐 / 移动渐显
  FADE_SPEED_IDLE: 0.02,     // 停留时渐隐速度
  FADE_SPEED_MOVE: 0.06,     // 移动时渐显速度
  FADE_MIN: 0.15,            // 最低可见度
  IDLE_THRESHOLD: 0.5,       // 判定停留的阈值（像素/帧）
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  color: { r: number; g: number; b: number };
  size: number;
};

type FluidCell = {
  vx: number;
  vy: number;
  density: number;
};

export default function NebulaCursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 减少动画偏好：星云拖尾不渲染
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;

    // 流体网格（简化版，双缓冲复用避免每帧分配）
    const gridW = Math.ceil(w / CONFIG.GRID_SIZE);
    const gridH = Math.ceil(h / CONFIG.GRID_SIZE);
    let fluidGrid: FluidCell[][] = [];
    let bufferGrid: FluidCell[][] = [];
    for (let y = 0; y < gridH; y++) {
      fluidGrid[y] = [];
      bufferGrid[y] = [];
      for (let x = 0; x < gridW; x++) {
        fluidGrid[y][x] = { vx: 0, vy: 0, density: 0 };
        bufferGrid[y][x] = { vx: 0, vy: 0, density: 0 };
      }
    }

    // 粒子系统
    const particles: Particle[] = [];

    // 鼠标状态
    let mouseX = 0, mouseY = 0;
    let prevMouseX = 0, prevMouseY = 0;
    let mouseVelX = 0, mouseVelY = 0;
    let mouseActive = false;
    let mouseIdleTimer = 0;    // 停留计时
    let globalAlpha = 1;       // 全局透明度（渐隐/渐显）

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // 主题颜色更新
    let warm = CONFIG.WARM;
    let cool = CONFIG.COOL;
    let aurora = CONFIG.AURORA;

    const updateColors = () => {
      const style = getComputedStyle(document.documentElement);
      const warmHex = style.getPropertyValue("--glow-warm").trim() || "#e89840";
      const coolHex = style.getPropertyValue("--glow-cool").trim() || "#6088d8";
      const auroraHex = style.getPropertyValue("--glow-aurora").trim() || "#9880d0";
      const parseHex = (hex: string) => {
        const h = hex.replace("#", "");
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
      };
      warm = parseHex(warmHex);
      cool = parseHex(coolHex);
      aurora = parseHex(auroraHex);
    };
    updateColors();
    const themeObserver = new MutationObserver(updateColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // 注入动量到流体网格
    const injectMomentum = (x: number, y: number, vx: number, vy: number) => {
      const gx = Math.floor(x / CONFIG.GRID_SIZE);
      const gy = Math.floor(y / CONFIG.GRID_SIZE);
      const radius = CONFIG.INJECT_RADIUS;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
              const factor = 1 - dist / radius;
              fluidGrid[ny][nx].vx += vx * factor * 0.35;
              fluidGrid[ny][nx].vy += vy * factor * 0.35;
              fluidGrid[ny][nx].density = Math.min(1, fluidGrid[ny][nx].density + factor * CONFIG.INJECT_DENSITY);
            }
          }
        }
      }
    };

    // BFECC 简化版平流
    const advectFluid = () => {
      for (let y = 1; y < gridH - 1; y++) {
        for (let x = 1; x < gridW - 1; x++) {
          const cell = fluidGrid[y][x];

          // 前向平流
          let srcX = x - cell.vx * 0.1;
          let srcY = y - cell.vy * 0.1;

          // BFECC 误差补偿
          const srcCell = fluidGrid[Math.floor(srcY)]?.[Math.floor(srcX)];
          if (srcCell) {
            const backX = srcX + srcCell.vx * 0.1;
            const backY = srcY + srcCell.vy * 0.1;
            const errorX = (x - backX) * 0.5;
            const errorY = (y - backY) * 0.5;
            srcX += errorX;
            srcY += errorY;
          }

          // 边界钳制
          srcX = Math.max(0, Math.min(gridW - 1, srcX));
          srcY = Math.max(0, Math.min(gridH - 1, srcY));

          const ix = Math.floor(srcX);
          const iy = Math.floor(srcY);
          const fx = srcX - ix;
          const fy = srcY - iy;

          // 双线性插值
          const c00 = fluidGrid[iy]?.[ix] || { vx: 0, vy: 0, density: 0 };
          const c10 = fluidGrid[iy]?.[ix + 1] || { vx: 0, vy: 0, density: 0 };
          const c01 = fluidGrid[iy + 1]?.[ix] || { vx: 0, vy: 0, density: 0 };
          const c11 = fluidGrid[iy + 1]?.[ix + 1] || { vx: 0, vy: 0, density: 0 };

          bufferGrid[y][x].vx = (c00.vx * (1 - fx) + c10.vx * fx) * (1 - fy) + (c01.vx * (1 - fx) + c11.vx * fx) * fy;
          bufferGrid[y][x].vy = (c00.vy * (1 - fx) + c10.vy * fx) * (1 - fy) + (c01.vy * (1 - fx) + c11.vy * fx) * fy;
          bufferGrid[y][x].density = (c00.density * (1 - fx) + c10.density * fx) * (1 - fy) + (c01.density * (1 - fx) + c11.density * fx) * fy;

          // 消散
          bufferGrid[y][x].vx *= CONFIG.VELOCITY_DECAY;
          bufferGrid[y][x].vy *= CONFIG.VELOCITY_DECAY;
          bufferGrid[y][x].density *= CONFIG.DENSITY_DECAY;
        }
      }

      // 交换缓冲（复用对象，避免每帧 new 整个网格）
      const tmp = fluidGrid;
      fluidGrid = bufferGrid;
      bufferGrid = tmp;
    };

    // 生成粒子
    const spawnParticles = (x: number, y: number, vx: number, vy: number) => {
      const count = Math.min(3, CONFIG.PARTICLE_COUNT - particles.length);
      for (let i = 0; i < count; i++) {
        const angle = Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.4;
        const speed = Math.sqrt(vx * vx + vy * vy) * 0.2;
        const t = Math.random();
        const color = {
          r: Math.round(warm.r * (1 - t) + aurora.r * t),
          g: Math.round(warm.g * (1 - t) + aurora.g * t),
          b: Math.round(warm.b * (1 - t) + aurora.b * t),
        };

        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.3,
          vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 0.3,
          age: 0,
          color,
          size: CONFIG.PARTICLE_SIZE + Math.random() * 1.5,
        });
      }

      // 限制粒子数量
      while (particles.length > CONFIG.PARTICLE_COUNT) {
        particles.shift();
      }
    };

    // 事件处理
    const onMove = (e: PointerEvent) => {
      prevMouseX = mouseX;
      prevMouseY = mouseY;
      mouseX = e.clientX;
      mouseY = e.clientY;
      mouseVelX = mouseX - prevMouseX;
      mouseVelY = mouseY - prevMouseY;
      mouseActive = true;
      mouseIdleTimer = 0; // 重置停留计时

      // 注入流体动量
      injectMomentum(mouseX, mouseY, mouseVelX, mouseVelY);

      // 生成粒子（速度阈值降低）
      if (Math.abs(mouseVelX) > 0.5 || Math.abs(mouseVelY) > 0.5) {
        spawnParticles(mouseX, mouseY, mouseVelX, mouseVelY);
      }
    };

    const onLeave = () => { mouseActive = false; };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    // FBM 噪声函数
    const fbm = (x: number, y: number): number => {
      let value = 0;
      let amplitude = 0.5;
      let frequency = 1;
      for (let i = 0; i < 4; i++) {
        value += amplitude * (Math.sin(x * frequency * 1.7 + y * frequency * 2.3) * 0.5 + 0.5);
        frequency *= 2;
        amplitude *= 0.5;
      }
      return value;
    };

    // 渲染循环
    let running = true;
    let time = 0;
    let animationFrame = 0;

    const draw = () => {
      if (!running) return;
      time += 0.016;

      // 停留/移动渐隐逻辑
      const speed = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY);
      if (speed < CONFIG.IDLE_THRESHOLD) {
        mouseIdleTimer += 0.016;
        // 停留时缓慢渐隐
        globalAlpha = Math.max(CONFIG.FADE_MIN, globalAlpha - CONFIG.FADE_SPEED_IDLE);
      } else {
        mouseIdleTimer = 0;
        // 移动时快速渐显
        globalAlpha = Math.min(1, globalAlpha + CONFIG.FADE_SPEED_MOVE);
      }

      // 完全清除画布
      ctx.clearRect(0, 0, w, h);

      // 平流流体网格
      advectFluid();

      // 绘制流体密度场（星云效果）
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
          const cell = fluidGrid[y][x];
          if (cell.density > 0.03) {
            const speed = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
            const noise = fbm(x * 0.12 + time * 0.35, y * 0.12 + time * 0.2);
            const intensity = cell.density * (0.6 + noise * 0.4) * globalAlpha;

            // 颜色混合
            const t = Math.min(1, speed * 0.35);
            const color = {
              r: Math.round(warm.r * (1 - t) + cool.r * t),
              g: Math.round(warm.g * (1 - t) + cool.g * t),
              b: Math.round(warm.b * (1 - t) + cool.b * t),
            };

            // 网格仅用于模拟；以连续圆形柔光绘制，避免把网格显示成像素方块。
            const centerX = (x + 0.5) * CONFIG.GRID_SIZE;
            const centerY = (y + 0.5) * CONFIG.GRID_SIZE;
            const radius = CONFIG.GRID_SIZE * 1.6;
            const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            glow.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${intensity * 0.35})`);
            glow.addColorStop(0.45, `rgba(${color.r},${color.g},${color.b},${intensity * 0.14})`);
            glow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 更新和绘制粒子
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.age += 0.016;

        const life = 1 - p.age / 1.4;
        if (life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        // FBM 扰动
        const noiseX = fbm(p.x * 0.006 + time, p.y * 0.006) * 2 - 1;
        const noiseY = fbm(p.x * 0.006, p.y * 0.006 + time) * 2 - 1;
        p.vx += noiseX * 0.04;
        p.vy += noiseY * 0.04;

        // 绘制粒子（应用全局透明度）
        const alpha = life * 0.6 * globalAlpha;
        const size = p.size * life;

        // 粒子使用真实坐标和径向光晕，不再吸附像素格或绘制方形光块。
        const radius = size * 3;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        glow.addColorStop(0, `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha})`);
        glow.addColorStop(0.25, `rgba(${p.color.r},${p.color.g},${p.color.b},${alpha * 0.45})`);
        glow.addColorStop(1, `rgba(${p.color.r},${p.color.g},${p.color.b},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-25"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
