"use client";

// 创意工坊统一工作区 — LiquidGlassFilters（规划 §2.2 · Chromium 折射增强）
// 唯一挂载点：CreativeWorkspace 根部。定义 4 个复用 geometry（bar/panel/capsule/popover），
// 每个含位移折射 + RGB 色散；不生成独立 per-control 滤镜。

export function LiquidGlassFilters() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <filter id="cws-refract-bar" filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%">
          <feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G" in2="cws-noise-bar" />
          <feColorMatrix type="matrix" values="1 0 0 0 0.02  0 1 0 0 0  0 0 1 0 0.02  0 0 0 1 0" />
        </filter>
        <filter id="cws-refract-panel" filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%">
          <feDisplacementMap in="SourceGraphic" scale="10" xChannelSelector="R" yChannelSelector="G" in2="cws-noise-panel" />
          <feColorMatrix type="matrix" values="1 0 0 0 0.01  0 1 0 0 0  0 0 1 0 0.03  0 0 0 1 0" />
        </filter>
        <filter id="cws-refract-capsule" filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%">
          <feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G" in2="cws-noise-capsule" />
          <feColorMatrix type="matrix" values="1 0 0 0 0.03  0 1 0 0 0  0 0 1 0 0.03  0 0 0 1 0" />
        </filter>
        <filter id="cws-refract-popover" filterUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="110%">
          <feDisplacementMap in="SourceGraphic" scale="24" xChannelSelector="R" yChannelSelector="G" in2="cws-noise-popover" />
          <feColorMatrix type="matrix" values="1 0 0 0 0.04  0 1 0 0 0  0 0 1 0 0.04  0 0 0 1 0" />
        </filter>
        {/* 共享 turbulence 噪声源（各滤镜引用，避免重复生成） */}
        <filter id="cws-noise-bar" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise" />
          <feComponentTransfer><feFuncA type="discrete" tableValues="0.4 0.6" /></feComponentTransfer>
        </filter>
        <filter id="cws-noise-panel" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" result="noise" />
          <feComponentTransfer><feFuncA type="discrete" tableValues="0.35 0.55" /></feComponentTransfer>
        </filter>
        <filter id="cws-noise-capsule" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="noise" />
          <feComponentTransfer><feFuncA type="discrete" tableValues="0.3 0.5" /></feComponentTransfer>
        </filter>
        <filter id="cws-noise-popover" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="5" result="noise" />
          <feComponentTransfer><feFuncA type="discrete" tableValues="0.45 0.65" /></feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
