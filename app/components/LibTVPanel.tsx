"use client";

import { useEffect, useRef } from "react";

/* ── 注入样式 ───────────────────────────────────────── */
const STYLE_ID = "libtv-panel-style";

function injectStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .libtv-panel {
      position: relative;
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    /* ── 头部 ─────────────────────────────────── */
    .libtv-header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .libtv-header h2 {
      font-family: "GeistPixel-Line", monospace;
      font-size: 1.5rem;
      color: var(--glow-warm);
      margin: 0 0 0.5rem;
    }
    .libtv-header p {
      font-size: 0.875rem;
      color: rgba(255,255,255,0.5);
      margin: 0;
    }

    /* ── 状态卡片 ──────────────────────────────── */
    .libtv-status-card {
      background: var(--space-panel);
      border: 1px solid rgba(232,152,64,0.2);
      border-radius: 12px;
      padding: 2rem;
      text-align: center;
      margin-bottom: 2rem;
      position: relative;
      overflow: hidden;
    }
    .libtv-status-card::before {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: 12px;
      padding: 1px;
      background: conic-gradient(
        from 0deg,
        transparent 0%,
        rgba(232,152,64,0.3) 25%,
        transparent 50%,
        rgba(96,136,216,0.3) 75%,
        transparent 100%
      );
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: libtv-glow-spin 8s linear infinite;
      pointer-events: none;
    }
    @keyframes libtv-glow-spin {
      to { transform: rotate(360deg); }
    }

    .libtv-status-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      display: block;
    }
    .libtv-status-title {
      font-family: "GeistPixel-Line", monospace;
      font-size: 1.125rem;
      color: var(--glow-warm);
      margin-bottom: 0.5rem;
    }
    .libtv-status-desc {
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.45);
      line-height: 1.6;
    }

    /* ── 功能预览网格 ──────────────────────────── */
    .libtv-features {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .libtv-feature {
      background: rgba(10,18,40,0.6);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 1.25rem;
      text-align: center;
      transition: border-color 0.3s, transform 0.2s;
      cursor: default;
    }
    .libtv-feature:hover {
      border-color: rgba(232,152,64,0.3);
      transform: translateY(-2px);
    }
    .libtv-feature-icon {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      display: block;
    }
    .libtv-feature-title {
      font-family: "GeistPixel-Line", monospace;
      font-size: 0.875rem;
      color: var(--glow-cool);
      margin-bottom: 0.25rem;
    }
    .libtv-feature-desc {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.35);
    }

    /* ── 即将推出标签 ──────────────────────────── */
    .libtv-badge-coming {
      display: inline-block;
      font-family: "GeistPixel-Square", monospace;
      font-size: 0.6875rem;
      color: var(--glow-aurora);
      background: rgba(152,128,208,0.1);
      border: 1px solid rgba(152,128,208,0.25);
      border-radius: 6px;
      padding: 0.2rem 0.6rem;
      margin-top: 0.75rem;
    }

    /* ── Skills 详情 ────────────────────────────── */
    .libtv-skills {
      margin-top: 2.5rem;
      padding-top: 2rem;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .libtv-skills-title {
      font-family: "GeistPixel-Line", monospace;
      font-size: 1rem;
      color: var(--glow-warm);
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .libtv-skills-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, rgba(232,152,64,0.3), transparent);
    }

    /* 技能脚本列表 */
    .libtv-scripts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .libtv-script {
      background: rgba(10,18,40,0.5);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 8px;
      padding: 0.875rem;
      transition: border-color 0.3s;
    }
    .libtv-script:hover {
      border-color: rgba(96,136,216,0.3);
    }
    .libtv-script-name {
      font-family: "Geist Mono", monospace;
      font-size: 0.8125rem;
      color: var(--glow-cool);
      margin-bottom: 0.375rem;
    }
    .libtv-script-desc {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.4);
      line-height: 1.4;
    }

    /* API 表格 */
    .libtv-api-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5rem;
    }
    .libtv-api-table th,
    .libtv-api-table td {
      text-align: left;
      padding: 0.625rem 0.75rem;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.8125rem;
    }
    .libtv-api-table th {
      font-family: "GeistPixel-Square", monospace;
      font-size: 0.75rem;
      color: var(--glow-warm);
      text-transform: uppercase;
    }
    .libtv-api-table td:first-child {
      font-family: "Geist Mono", monospace;
      color: var(--glow-cool);
      font-size: 0.75rem;
      white-space: nowrap;
    }
    .libtv-api-table td:last-child {
      color: rgba(255,255,255,0.5);
    }

    /* 配置代码块 */
    .libtv-config {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }
    .libtv-config code {
      font-family: "Geist Mono", monospace;
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.7);
      line-height: 1.6;
    }
    .libtv-config .comment {
      color: rgba(255,255,255,0.3);
    }
    .libtv-config .key {
      color: var(--glow-warm);
    }
    .libtv-config .value {
      color: #98d898;
    }

    /* 底部链接 */
    .libtv-footer {
      text-align: center;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255,255,255,0.05);
      display: flex;
      justify-content: center;
      gap: 1.5rem;
    }
    .libtv-footer a {
      font-size: 0.8125rem;
      color: var(--glow-cool);
      text-decoration: none;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    .libtv-footer a:hover {
      opacity: 1;
    }

    @media (max-width: 480px) {
      .libtv-features,
      .libtv-scripts {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(s);
}

/* ── 组件 ───────────────────────────────────────────── */
export default function LibTVPanel() {
  const injected = useRef(false);
  useEffect(() => {
    if (!injected.current) { injectStyle(); injected.current = true; }
  }, []);

  return (
    <div className="libtv-panel">
      {/* 头部 */}
      <div className="libtv-header">
        <h2>🎬 LibTV · AI 生图/生视频</h2>
        <p>接入 LibLib.tv 的 AIGC 能力，用自然语言创作图片和视频</p>
      </div>

      {/* 状态卡片 */}
      <div className="libtv-status-card edge-glow-subtle">
        <span className="libtv-status-icon">🚧</span>
        <div className="libtv-status-title">功能开发中</div>
        <div className="libtv-status-desc">
          正在对接 LibLib.tv OpenAPI，即将支持：<br />
          AI 生图 · AI 生视频 · 会话管理 · 批量下载
        </div>
        <span className="libtv-badge-coming">COMING SOON</span>
      </div>

      {/* 功能预览 */}
      <div className="libtv-features">
        <div className="libtv-feature">
          <span className="libtv-feature-icon">🖼️</span>
          <div className="libtv-feature-title">AI 生图</div>
          <div className="libtv-feature-desc">自然语言描述 → 高质量图片</div>
        </div>
        <div className="libtv-feature">
          <span className="libtv-feature-icon">🎥</span>
          <div className="libtv-feature-title">AI 生视频</div>
          <div className="libtv-feature-desc">一句话生成动漫/实拍视频</div>
        </div>
        <div className="libtv-feature">
          <span className="libtv-feature-icon">📤</span>
          <div className="libtv-feature-title">素材上传</div>
          <div className="libtv-feature-desc">上传参考图/视频辅助生成</div>
        </div>
        <div className="libtv-feature">
          <span className="libtv-feature-icon">📦</span>
          <div className="libtv-feature-title">批量下载</div>
          <div className="libtv-feature-desc">一键下载所有生成结果</div>
        </div>
      </div>

      {/* 底部链接 */}
      <div className="libtv-footer">
        <a href="https://www.liblib.tv" target="_blank" rel="noopener noreferrer">
          了解 LibLib.tv →
        </a>
        <a href="https://github.com/libtv-labs/libtv-skills" target="_blank" rel="noopener noreferrer">
          GitHub Skills 仓库 →
        </a>
      </div>
    </div>
  );
}
