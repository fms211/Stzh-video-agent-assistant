"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getGenerationStats } from "@/app/lib/tracker";
import { useAuth } from "./AuthProvider";
import { getGenerationStats as getServerStats } from "@/app/lib/auth";
import ActivityCalendar from "./ActivityCalendar";

type Period = "day" | "week" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "每日" },
  { key: "week", label: "每周" },
  { key: "month", label: "每月" },
];

export default function StatsDashboard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("day");
  const [page, setPage] = useState(0); // 0=生成频率, 1=活动日历
  const [stats, setStats] = useState(() => getGenerationStats());
  const [serverStats, setServerStats] = useState<{ total: number; today: number; totalVideos: number } | null>(null);
  const [fadeDir, setFadeDir] = useState<"in" | "out" | null>(null);
  const [themeKey, setThemeKey] = useState(0); // 用于触发主题变化时重新绘制

  // 登录后从服务端拉取统计，退出后清空
  useEffect(() => {
    if (!user) {
      setServerStats(null);
      setStats(getGenerationStats());
      return;
    }
    getServerStats().then(setServerStats).catch(() => {});
  }, [user]);

  const colorsRef = useRef({ warm: "#e89840", warmSoft: "#f8c878", cool: "#6088d8", aurora: "#9880d0", bg: "#0a1228", fg: "#d8dce8", muted: "#8890a8" });

  useEffect(() => { setStats(getGenerationStats()); }, []);

  useEffect(() => {
    const readColors = () => {
      if (typeof document === "undefined") return;
      const style = getComputedStyle(document.documentElement);
      const g = (v: string, fallback: string) => (style.getPropertyValue(v).trim() || fallback);
      colorsRef.current = {
        warm: g("--glow-warm", "#e89840"), warmSoft: g("--glow-warm-soft", "#f8c878"),
        cool: g("--glow-cool", "#6088d8"), aurora: g("--glow-aurora", "#9880d0"),
        bg: g("--space-panel", "#0a1228"), fg: g("--foreground", "#d8dce8"), muted: g("--foreground-muted", "#8890a8"),
      };
      // 触发重新绘制
      setThemeKey((k) => k + 1);
    };
    readColors();
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const switchPage = (newPage: number) => {
    if (newPage === page) return;
    setFadeDir("out");
    setTimeout(() => {
      setPage(newPage);
      setFadeDir("in");
      setTimeout(() => setFadeDir(null), 300);
    }, 200);
  };

  // Canvas 生成频率图表
  useEffect(() => {
    if (page !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.parentElement!.clientWidth;
    const h = 350; // 加高 Y 轴
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = colorsRef.current;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    const labels = period === "day" ? stats.dayLabels : period === "week" ? stats.weekLabels : stats.monthLabels;
    const data = period === "day" ? stats.daily : period === "week" ? stats.weekly : stats.monthly;
    const values = labels.map((l) => {
      const key = period === "day" ? `2026-${l.replace("/", "-")}` : period === "week" ? `2026-${l}` : `2026/${l.split("/")[1]}`;
      return data[key] || 0;
    });

    const maxVal = Math.max(1, ...values);
    // Y 轴：取整到最近的 5 的倍数，至少 5 格
    const yMax = Math.ceil(maxVal / 5) * 5 || 5;
    const ySteps = Math.max(5, Math.ceil(yMax / 5));
    const yStepVal = yMax / ySteps;

    const padL = 50; const padR = 20; const padT = 30; const padB = 40;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const barW = Math.max(4, (chartW / labels.length) * 0.6);
    const gap = chartW / labels.length;

    // 网格线 + Y 轴标签（整数）
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.fillStyle = c.muted;
    ctx.font = "9px Geist Mono, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= ySteps; i++) {
      const y = padT + (chartH / ySteps) * i;
      const val = Math.round(yStepVal * (ySteps - i));
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(String(val), padL - 8, y + 3);
    }

    // 数据柱
    for (let i = 0; i < labels.length; i++) {
      const x = padL + i * gap + (gap - barW) / 2;
      const barH = (values[i] / yMax) * chartH;
      const y = padT + chartH - barH;

      // 光晕
      const glow = ctx.createLinearGradient(x, y, x, padT + chartH);
      glow.addColorStop(0, c.warm);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);

      // 柱体渐变
      const barGrad = ctx.createLinearGradient(x, y, x, padT + chartH);
      barGrad.addColorStop(0, c.warmSoft);
      barGrad.addColorStop(0.6, c.warm);
      barGrad.addColorStop(1, c.cool);
      ctx.fillStyle = barGrad;
      ctx.fillRect(x, y, barW, barH);

      // 顶部高光
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(x, y, barW, 2);

      // X 轴标签
      ctx.fillStyle = c.muted;
      ctx.font = "9px GeistPixel-Line, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], padL + i * gap + gap / 2, h - 8);

      // 数值（整数）
      if (values[i] > 0) {
        ctx.fillStyle = c.fg;
        ctx.font = "9px Geist Mono, monospace";
        ctx.fillText(String(Math.round(values[i])), padL + i * gap + gap / 2, y - 6);
      }
    }

    // 坐标轴
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH); ctx.stroke();
  }, [period, stats, page, themeKey]);

  // 优先使用服务端数据，否则用 localStorage
  const genTotal = serverStats ? serverStats.total : stats.total;
  const videoTotal = serverStats ? serverStats.totalVideos : stats.videoCount;
  const imageTotal = serverStats ? Math.max(0, genTotal - videoTotal) : stats.imageCount;

  return (
    <div className="stats-dashboard">
      {/* 头部 */}
      <div className="stats-header">
        <div>
          <h2 className="stats-title">工作统计</h2>
          <p className="stats-sub">
            {page === 0 ? "生成频率可视化 · 视频/图片成功次数" : "API 调用活动日历"}
          </p>
        </div>
        <div className="stats-total-group">
          <div className="stats-total pixel-corners">
            <span className="stats-total-num" style={{ fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{genTotal}</span>
            <span className="stats-total-label">总生成次数</span>
          </div>
          <div className="stats-total stats-total-sub pixel-corners">
            <span className="stats-total-num-sm" style={{ color: "var(--glow-warm)", fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{videoTotal}</span>
            <span className="stats-total-label">视频</span>
          </div>
          <div className="stats-total stats-total-sub pixel-corners">
            <span className="stats-total-num-sm" style={{ color: "var(--glow-cool)", fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{imageTotal}</span>
            <span className="stats-total-label">图片</span>
          </div>
        </div>
      </div>

      {/* 内容区域（带翻页箭头） */}
      <div className="stats-content-wrap">
        {/* 左箭头 */}
        {page > 0 && (
          <button type="button" className="stats-nav-arrow stats-nav-left" onClick={() => switchPage(0)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}

        <div className={`stats-content ${fadeDir === "out" ? "stats-fade-out" : fadeDir === "in" ? "stats-fade-in" : ""}`}>
          {page === 0 ? (
            <>
              {/* Period tabs */}
              <div className="stats-tabs">
                {PERIODS.map((p) => (
                  <button key={p.key} type="button"
                    className={`stats-tab ${period === p.key ? "active" : ""}`}
                    onClick={() => setPeriod(p.key)}>{p.label}</button>
                ))}
              </div>

              {/* 生成频率图表 */}
              <div className="stats-chart-wrap edge-glow edge-glow-subtle">
                <canvas ref={canvasRef} />
              </div>

              {/* 洞察卡片 */}
              <div className="stats-insight-grid">
                <div className="stats-insight">
                  <span className="stats-insight-val">
                    {stats.hourly.indexOf(Math.max(...stats.hourly))}:00
                  </span>
                  <span className="stats-insight-label">高峰时段</span>
                </div>
                <div className="stats-insight">
                  <span className="stats-insight-val">
                    {genTotal > 0 ? (genTotal / Math.max(1, Object.keys(stats.daily).length)).toFixed(1) : "0"}
                  </span>
                  <span className="stats-insight-label">日均生成</span>
                </div>
                <div className="stats-insight">
                  <span className="stats-insight-val">
                    {genTotal > 0 && Object.keys(stats.weekly).length > 0
                      ? Math.max(...Object.values(stats.weekly))
                      : "0"}
                  </span>
                  <span className="stats-insight-label">周最高</span>
                </div>
              </div>
            </>
          ) : (
            <ActivityCalendar />
          )}
        </div>

        {/* 右箭头 */}
        {page < 1 && (
          <button type="button" className="stats-nav-arrow stats-nav-right" onClick={() => switchPage(1)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* 页码指示器 */}
      <div className="stats-page-dots">
        <div className={`stats-dot ${page === 0 ? "active" : ""}`} onClick={() => switchPage(0)} />
        <div className={`stats-dot ${page === 1 ? "active" : ""}`} onClick={() => switchPage(1)} />
      </div>

      <style>{`
        .stats-dashboard {
          width: 100%; max-width: 960px; margin: 0 auto; padding: 0 0 60px;
        }
        .stats-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 24px; flex-wrap: wrap; gap: 16px;
        }
        .stats-title {
          font-family: "GeistPixel-Line", var(--font-display), var(--font-sans);
          font-size: 28px; font-weight: 400; letter-spacing: 0.06em; margin: 0 0 4px;
          background: linear-gradient(90deg, var(--glow-warm-soft), var(--glow-aurora), var(--glow-cool), var(--glow-warm-soft));
          background-size: 300% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: text-shimmer 4s linear infinite;
        }
        .stats-sub { font-size: 13px; color: var(--foreground-muted); margin: 0; }
        .stats-total-group { display: flex; gap: 10px; align-items: flex-end; }
        .stats-total {
          display: flex; flex-direction: column; align-items: flex-end;
          padding: 12px 20px; border-radius: 16px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
        }
        .stats-total-sub { padding: 8px 14px; }
        .stats-total-num {
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 36px;
          color: var(--glow-warm-soft); line-height: 1;
        }
        .stats-total-num-sm {
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 24px;
          line-height: 1;
        }
        .stats-total-label { font-size: 11px; color: var(--foreground-muted); margin-top: 4px; }

        .stats-content-wrap {
          position: relative; display: flex; align-items: center; gap: 8px;
        }
        .stats-content {
          flex: 1; transition: opacity 0.2s ease;
        }
        .stats-fade-out { opacity: 0; }
        .stats-fade-in { animation: fadeIn 0.3s ease; }

        .stats-nav-arrow {
          flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%;
          border: 1px solid var(--border-subtle); background: var(--space-panel);
          color: var(--foreground-muted); cursor: pointer; display: flex;
          align-items: center; justify-content: center; transition: all 0.2s;
        }
        .stats-nav-arrow:hover {
          border-color: var(--glow-warm); color: var(--glow-warm);
          background: rgba(232,152,64,0.08);
        }

        .stats-page-dots {
          display: flex; justify-content: center; gap: 8px; margin-top: 16px;
        }
        .stats-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--border-subtle); cursor: pointer; transition: all 0.2s;
        }
        .stats-dot.active {
          background: var(--glow-warm); box-shadow: 0 0 8px rgba(232,152,64,0.4);
        }

        .stats-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
        .stats-tab {
          padding: 7px 18px; border-radius: 999px;
          border: 1px solid var(--border-subtle); background: transparent;
          color: var(--foreground-muted); font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 13px; cursor: pointer; transition: all 0.2s;
        }
        .stats-tab:hover { border-color: var(--glow-warm); color: var(--foreground); }
        .stats-tab.active { background: var(--glow-warm); color: #0a0812; border-color: var(--glow-warm); }
        .stats-chart-wrap {
          border-radius: 18px; overflow: hidden; margin-bottom: 20px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
          padding: 8px;
        }
        .stats-chart-wrap canvas { display: block; width: 100%; }
        .stats-insight-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .stats-insight {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 18px; border-radius: 16px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
        }
        .stats-insight-val {
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 24px;
          color: var(--glow-warm-soft);
        }
        .stats-insight-label { font-size: 11px; color: var(--foreground-muted); }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
