"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getStats } from "@/app/lib/tracker";

// 颜色混合函数（模拟 color-mix）
function mixColors(color1: string, color2: string, weight: number): string {
  // 解析十六进制颜色
  const hex2rgb = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };

  try {
    const c1 = hex2rgb(color1);
    const c2 = hex2rgb(color2);
    const r = Math.round(c1.r * (1 - weight) + c2.r * weight);
    const g = Math.round(c1.g * (1 - weight) + c2.g * weight);
    const b = Math.round(c1.b * (1 - weight) + c2.b * weight);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return color1;
  }
}

function getGreenLevel(count: number, max: number, colors: string[]): string {
  if (count === 0) return colors[0];
  const ratio = count / max;
  if (ratio < 0.25) return colors[1];
  if (ratio < 0.6) return colors[2];
  return colors[3];
}

export default function ActivityCalendar() {
  const stats = useMemo(() => getStats(), []);
  const [themeKey, setThemeKey] = useState(0);

  // 读取主题颜色
  const colorsRef = useRef(["#0a1228", "#1a3a5a", "#c07830", "#e89840"]);

  useEffect(() => {
    const readColors = () => {
      if (typeof document === "undefined") return;
      const style = getComputedStyle(document.documentElement);
      const warm = style.getPropertyValue("--glow-warm").trim() || "#e89840";
      const cool = style.getPropertyValue("--glow-cool").trim() || "#6088d8";
      const panel = style.getPropertyValue("--space-panel").trim() || "#0a1228";

      // 生成 4 级颜色：从暗到亮（使用纯十六进制）
      colorsRef.current = [
        panel,                              // 无活动
        mixColors(panel, cool, 0.3),        // 低活动
        mixColors(panel, warm, 0.6),        // 中活动
        warm,                               // 高活动
      ];
      setThemeKey((k) => k + 1);
    };
    readColors();
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const calendarData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // 从12个月前开始
    const startDate = new Date(year, month - 11, 1);
    // 到当前月最后一天
    const endDate = new Date(year, month + 1, 0);

    // 按周分组（每列 = 1周）
    const weeks: { date: Date; count: number; isCurrentMonth: boolean }[][] = [];
    let currentWeek: { date: Date; count: number; isCurrentMonth: boolean }[] = [];

    const d = new Date(startDate);
    // 补齐到周日
    d.setDate(d.getDate() - d.getDay());

    while (d <= endDate || currentWeek.length > 0) {
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const count = stats.daily[dateKey] || 0;
      const isCurrentMonth = d.getMonth() === month && d.getFullYear() === year;

      currentWeek.push({ date: new Date(d), count, isCurrentMonth });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      d.setDate(d.getDate() + 1);

      // 超过结束日期且当前周已满
      if (d > endDate && currentWeek.length === 0) break;
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const maxCount = Math.max(1, ...Object.values(stats.daily));

    return { weeks, maxCount };
  }, [stats, themeKey]);

  const monthLabels = useMemo(() => {
    const labels: { month: string; col: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      labels.push({ month: monthNames[d.getMonth()], col: -1 }); // col will be calculated
    }
    return labels;
  }, []);

  // 计算每个月第一周的列位置
  const monthColMap = useMemo(() => {
    const map: Record<string, number> = {};
    calendarData.weeks.forEach((week, col) => {
      const firstDay = week[0]?.date;
      if (firstDay) {
        const key = `${firstDay.getFullYear()}-${firstDay.getMonth()}`;
        if (!(key in map)) map[key] = col;
      }
    });
    return map;
  }, [calendarData]);

  const cellSize = 13;
  const cellGap = 3;
  const labelWidth = 28;
  const topGap = 24;

  return (
    <div className="activity-calendar">
      <div className="ac-header">
        <h2 className="ac-title">Active Days</h2>
      </div>

      <div className="ac-body">
        {/* 月份标签 */}
        <div className="ac-months" style={{ paddingLeft: labelWidth }}>
          {monthLabels.map((ml, i) => {
            const d = new Date(new Date().getFullYear(), new Date().getMonth() - 11 + i, 1);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const col = monthColMap[key];
            if (col === undefined) return null;
            return (
              <span key={i} className="ac-month-label" style={{
                left: col * (cellSize + cellGap),
              }}>{ml.month}</span>
            );
          })}
        </div>

        {/* 网格 */}
        <div className="ac-grid-wrap">
          {/* 星期标签 */}
          <div className="ac-day-labels">
            {["", "M", "", "W", "", "F", ""].map((label, i) => (
              <div key={i} className="ac-day-label" style={{ height: cellSize + cellGap }}>
                {label}
              </div>
            ))}
          </div>

          {/* 热力图网格 */}
          <div className="ac-grid">
            {calendarData.weeks.map((week, wi) => (
              <div key={wi} className="ac-week" style={{ gap: cellGap }}>
                {week.map((day, di) => {
                  const isToday = day.date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={di}
                      className={`ac-cell ${isToday ? "ac-cell-today" : ""} ${!day.isCurrentMonth ? "ac-cell-other-month" : ""}`}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: getGreenLevel(day.count, calendarData.maxCount, colorsRef.current),
                      }}
                      title={`${day.date.toLocaleDateString()}: ${day.count} 次调用`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 图例 */}
        <div className="ac-legend">
          <span className="ac-legend-text">Less</span>
          {colorsRef.current.map((color, i) => (
            <div key={i} className="ac-cell" style={{ width: cellSize, height: cellSize, backgroundColor: color }} />
          ))}
          <span className="ac-legend-text">More</span>
        </div>
      </div>

      <style>{`
        .activity-calendar {
          width: 100%; padding: 0;
        }
        .ac-header {
          margin-bottom: 16px;
        }
        .ac-title {
          font-family: var(--font-display), "GeistPixel-Line", var(--font-sans);
          font-size: 16px; font-weight: 400; color: var(--foreground); margin: 0;
        }
        .ac-body {
          background: var(--space-panel);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 16px 20px 12px;
        }
        .ac-months {
          position: relative;
          height: 20px;
          margin-bottom: 4px;
        }
        .ac-month-label {
          position: absolute;
          font-size: 11px;
          color: var(--foreground-muted);
          font-family: "Geist Mono", monospace;
          transform: translateX(-50%);
        }
        .ac-grid-wrap {
          display: flex;
          gap: 4px;
        }
        .ac-day-labels {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .ac-day-label {
          font-size: 10px;
          color: var(--foreground-muted);
          font-family: "Geist Mono", monospace;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 4px;
        }
        .ac-grid {
          display: flex;
          gap: 3px;
        }
        .ac-week {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .ac-cell {
          border-radius: 2px;
          transition: opacity 0.15s;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .ac-cell:hover {
          opacity: 0.8;
          outline: 1px solid rgba(255,255,255,0.2);
        }
        .ac-cell-today {
          outline: 1px solid var(--glow-warm);
        }
        .ac-cell-other-month {
          opacity: 0.3;
        }
        .ac-legend {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          margin-top: 10px;
        }
        .ac-legend-text {
          font-size: 10px;
          color: var(--foreground-muted);
          font-family: "Geist Mono", monospace;
        }
      `}</style>
    </div>
  );
}
