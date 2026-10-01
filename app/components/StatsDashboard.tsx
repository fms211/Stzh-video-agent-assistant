"use client";

import { useEffect, useRef, useState } from "react";
import { getGenerationStats } from "@/app/lib/tracker";
import { useAuth } from "./AuthProvider";
import { getTasks } from "@/app/lib/auth";
import { loadGenerationRecords, summarizeGenerations } from "@/app/lib/generation-statistics";
import ActivityCalendar from "./ActivityCalendar";
import { PluginSlot } from "./plugin-slots/PluginSlot";

type Period = "day" | "week" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "每日" },
  { key: "week", label: "每周" },
  { key: "month", label: "每月" },
];

export default function StatsDashboard() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">正在确认统计账户…</p>;
  return <StatsDashboardView key={user?.id ?? "guest"} authenticated={Boolean(user)} />;
}

function StatsDashboardView({ authenticated }: { authenticated: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [page, setPage] = useState(0); // 0=生成频率, 1=活动日历
  const [stats, setStats] = useState<ReturnType<typeof summarizeGenerations> | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    let current = true;
    setPending(true);
    setError("");
    const read = authenticated
      ? loadGenerationRecords(cursor => getTasks({ status: "completed", limit: 100, cursor }), () => current).then(records => summarizeGenerations(records))
      : Promise.resolve(getGenerationStats());
    read.then(value => { if (current) setStats(value); })
      .catch(error => { if (current) setError(error instanceof Error ? error.message : "统计读取失败，请重试"); })
      .finally(() => { if (current) setPending(false); });
    return () => { current = false; };
  }, [authenticated, revision]);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const colorsRef = useRef({ warm: "#e89840", warmSoft: "#f8c878", cool: "#6088d8", aurora: "#9880d0", bg: "#0a1228", fg: "#d8dce8", muted: "#8890a8" });


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

  const switchPage = (newPage: number) => setPage(newPage);

  // Canvas 生成频率图表
  useEffect(() => {
    if (page !== 0 || !stats) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const draw = (contentWidth = canvas.getBoundingClientRect().width) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(contentWidth);
    if (w <= 0) return;
    const h = 350; // 加高 Y 轴
    // CSS owns layout. Updating its pixel width from padded clientWidth would
    // enlarge the flex minimum and trigger ResizeObserver repeatedly.
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = colorsRef.current;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    const labels = period === "day" ? stats.dayLabels : period === "week" ? stats.weekLabels : stats.monthLabels;
    const data = period === "day" ? stats.daily : period === "week" ? stats.weekly : stats.monthly;
    const keys = period === "day" ? stats.dayKeys : period === "week" ? stats.weekKeys : stats.monthKeys;
    const values = keys.map(key => data[key] || 0);

    const maxVal = Math.max(1, ...values);
    // Y 轴：取整到最近的 5 的倍数，至少 5 格
    const yMax = Math.ceil(maxVal / 5) * 5 || 5;
    const ySteps = 5;
    const yStepVal = yMax / ySteps;

    const padL = 50; const padR = 20; const padT = 30; const padB = 40;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const barW = Math.max(4, (chartW / labels.length) * 0.6);
    const gap = chartW / labels.length;

    // 网格线 + Y 轴标签（整数）
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const chartType = getComputedStyle(canvas);
    const chartFont = `${chartType.fontSize} ${chartType.fontFamily}`;
    ctx.fillStyle = chartType.color;
    ctx.font = chartFont;
    // Keep readable type on narrow charts; the adjacent table retains all dates.
    const labelWidth = Math.max(...labels.map(label => ctx.measureText(label).width), 0);
    const labelStride = Math.max(1, Math.ceil((labelWidth + 12) / gap));
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
      ctx.fillStyle = chartType.color;
      ctx.font = chartFont;
      ctx.textAlign = "center";
      if (i % labelStride === 0) ctx.fillText(labels[i], padL + i * gap + gap / 2, h - 8);

      // 数值（整数）
      if (values[i] > 0) {
        ctx.fillStyle = c.fg;
        ctx.font = chartFont;
        ctx.fillText(String(Math.round(values[i])), padL + i * gap + gap / 2, y - 6);
      }
    }

    // 坐标轴
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(w - padR, padT + chartH); ctx.stroke();
    };
    draw();
    const resize = new ResizeObserver(entries => {
      const entry=entries.find(item=>item.target===canvas.parentElement);
      if(entry)draw(entry.contentRect.width);
    });
    resize.observe(canvas.parentElement!);
    return () => resize.disconnect();
  }, [period, stats, page, themeKey]);

  const genTotal = stats?.total ?? "—";
  const videoTotal = stats?.videoCount ?? "—";
  const imageTotal = stats?.imageCount ?? "—";

  return (
    <div className="stats-dashboard">
      {/* 插件槽位：stats.cards（additive，Mock 阶段无贡献时不渲染） */}
      <PluginSlot slot="stats.cards" contributions={[]} projectId="project-a" />
      {/* 头部 */}
      <div className="stats-header">
        <div>
          <h2 className="stats-title page-title">工作统计</h2>
          <p className="stats-sub">
            {authenticated ? "账户内成功媒体任务 · 按本机时区统计" : "本机最近 500 条生成记录"}
          </p>
        </div>
        <div className="stats-total-group">
          <div className="stats-total pixel-corners">
            <span className="stats-total-num" style={{ fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{genTotal}</span>
            <span className="stats-total-label">成功任务</span>
          </div>
          <div className="stats-total stats-total-sub pixel-corners">
            <span className="stats-total-num-sm" style={{ color: "var(--glow-warm)", fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{videoTotal}</span>
            <span className="stats-total-label">含视频</span>
          </div>
          <div className="stats-total stats-total-sub pixel-corners">
            <span className="stats-total-num-sm" style={{ color: "var(--glow-cool)", fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{imageTotal}</span>
            <span className="stats-total-label">仅图片</span>
          </div>
        </div>
      </div>

      <div className="stats-toolbar">
        <p className="stats-sub">每个任务计一次；含视频与图片的任务归入视频。文本任务不计入。</p>
        <button type="button" className="stats-tab" disabled={pending} onClick={() => setRevision(value => value + 1)}>{pending ? "正在读取…" : "刷新统计"}</button>
      </div>
      {error && <p role="alert">{error}{stats ? "（保留上次读取的统计）" : ""}</p>}
      {!stats && !error && <p role="status">正在读取生成记录…</p>}
      {stats?.total === 0 && <p role="status">暂无成功的媒体任务。已有任务完成并返回图片或视频后，将显示在这里。</p>}

      {stats && <>
      {/* 内容区域（带翻页箭头） */}
      <div className="stats-content-wrap">
        {/* 左箭头 */}
        {page > 0 && (
          <button type="button" className="stats-nav-arrow stats-nav-left" aria-label="查看生成频率" onClick={() => switchPage(0)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}

        <div className="stats-content">
          {page === 0 ? (
            <>
              {/* Period tabs */}
              <div className="stats-tabs" role="group" aria-label="统计周期">
                {PERIODS.map((p) => (
                  <button key={p.key} type="button"
                    className={`stats-tab ${period === p.key ? "active" : ""}`}
                    aria-pressed={period === p.key}
                    onClick={() => setPeriod(p.key)}>{p.label}</button>
                ))}
              </div>

              {/* 生成频率图表 */}
              <div className="stats-chart-wrap edge-glow edge-glow-subtle">
                <canvas ref={canvasRef} role="img" aria-label={`${PERIODS.find(item => item.key === period)?.label}成功媒体任务趋势`} />
                <table className="sr-only"><caption>成功媒体任务趋势明细</caption><thead><tr><th>日期</th><th>成功任务数</th></tr></thead><tbody>{(period === "day" ? stats.dayKeys : period === "week" ? stats.weekKeys : stats.monthKeys).map(key => <tr key={key}><th>{key}</th><td>{(period === "day" ? stats.daily : period === "week" ? stats.weekly : stats.monthly)[key] || 0}</td></tr>)}</tbody></table>
              </div>

              {/* 洞察卡片 */}
              <div className="stats-insight-grid">
                <div className="stats-insight">
                  <span className="stats-insight-val">
                    {stats.total ? `${stats.hourly.indexOf(Math.max(...stats.hourly))}:00` : "—"}
                  </span>
                  <span className="stats-insight-label">高峰时段</span>
                </div>
                <div className="stats-insight">
                  <span className="stats-insight-val">
                    {stats.total > 0 ? (stats.total / Math.max(1, Object.keys(stats.daily).length)).toFixed(1) : "0"}
                  </span>
                  <span className="stats-insight-label">活跃日均成功任务</span>
                </div>
                <div className="stats-insight">
                  <span className="stats-insight-val">
                    {stats.total > 0 && Object.keys(stats.weekly).length > 0
                      ? Math.max(...Object.values(stats.weekly))
                      : "0"}
                  </span>
                  <span className="stats-insight-label">周最高</span>
                </div>
              </div>
            </>
          ) : (
            <ActivityCalendar daily={stats.daily} />
          )}
        </div>

        {/* 右箭头 */}
        {page < 1 && (
          <button type="button" className="stats-nav-arrow stats-nav-right" aria-label="查看生成活动日历" onClick={() => switchPage(1)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* 页码指示器 */}
      <div className="stats-page-dots">
        <button type="button" className={`stats-dot ${page === 0 ? "active" : ""}`} onClick={() => switchPage(0)} aria-label="生成频率" aria-current={page === 0 ? "page" : undefined} />
        <button type="button" className={`stats-dot ${page === 1 ? "active" : ""}`} onClick={() => switchPage(1)} aria-label="活动日历" aria-current={page === 1 ? "page" : undefined} />
      </div>

      </>}

      <style>{`
        .stats-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .stats-toolbar button:disabled { opacity: 0.5; cursor: wait; }
        .stats-dashboard {
          width: 100%; max-width: 960px; min-width: 0; margin: 0 auto; padding: 0 0 60px;
        }
        .stats-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 24px; flex-wrap: wrap; gap: 16px;
        }
        .stats-title {
          font-family: var(--font-ui);
          font-size: var(--text-page-size); font-weight: var(--weight-regular); letter-spacing: 0.06em; margin: 0 0 4px;
          color: var(--glow-warm-soft); line-height: var(--text-page-line); }
        .stats-sub { font-size: var(--text-label-size); color: var(--text-muted); margin: 0; line-height: var(--text-label-line); }
        .stats-total-group { display: flex; gap: 10px; align-items: flex-end; }
        .stats-total {
          display: flex; flex-direction: column; align-items: flex-end;
          padding: 12px 20px; border-radius: var(--shape-card);
          background: var(--space-panel); border: 1px solid var(--border-subtle);
        }
        .stats-total-sub { padding: 8px 14px; }
        .stats-total-num {
          font-family: var(--font-ui); font-size: 36px;
          color: var(--glow-warm-soft); line-height: 1;
        }
        .stats-total-num-sm {
          font-family: var(--font-ui); font-size: var(--text-section-size);
          line-height: var(--text-section-line);
        }
        .stats-total-label { font-size: var(--text-caption-size); color: var(--text-muted); margin-top: 4px; line-height: var(--text-caption-line); }

        .stats-content-wrap {
          position: relative; display: flex; align-items: center; gap: 8px; min-width: 0;
        }
        .stats-content {
          flex: 1; min-width: 0; transition: opacity 0.2s ease;
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
          padding: 0; border: none;
          background: var(--border-subtle); cursor: pointer; transition: all 0.2s;
        }
        .stats-dot:focus-visible { outline: 2px solid color-mix(in srgb, var(--glow-warm) 40%, transparent); outline-offset: 2px; }
        .stats-dot.active {
          background: var(--glow-warm); box-shadow: 0 0 8px rgba(232,152,64,0.4);
        }

        .stats-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
        .stats-tab {
          padding: 7px 18px; border-radius: 999px;
          border: 1px solid var(--border-subtle); background: transparent;
          color: var(--text-muted); font-family: var(--font-ui);
          font-size: var(--text-label-size); cursor: pointer; transition: all 0.2s; line-height: var(--text-label-line); }
        .stats-tab:hover { border-color: var(--glow-warm); color: var(--foreground); }
        .stats-tab.active { background: var(--glow-warm); color: var(--on-warm); border-color: var(--glow-warm); }
        .stats-chart-wrap {
          border-radius: var(--shape-card); overflow: hidden; margin-bottom: 20px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
          padding: 8px;
          min-width: 0; height: 368px; box-sizing: border-box; contain: inline-size;
        }
        .stats-chart-wrap canvas { display: block; width: 100%; max-width: 100%; height: 350px; }
        .stats-insight-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .stats-insight {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 18px; border-radius: var(--shape-card);
          background: var(--space-panel); border: 1px solid var(--border-subtle);
        }
        .stats-insight-val {
          font-family: var(--font-ui); font-size: var(--text-section-size);
          color: var(--glow-warm-soft); line-height: var(--text-section-line); }
        .stats-insight-label { font-size: var(--text-caption-size); color: var(--text-muted); line-height: var(--text-caption-line); }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
