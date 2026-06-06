"use client";

export default function LayerStack({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 偏心径向渐变 - 模拟远方星云偏振光 */}
      <div className="space-gradient" aria-hidden="true" />
      {/* 噪声纹理 - 胶片颗粒感 */}
      <div className="space-noise" aria-hidden="true" />
      {/* 网格纹理 */}
      <div className="space-texture" aria-hidden="true" />
      <div className="space-grid" aria-hidden="true" />
      <div className="relative z-30 min-h-full">{children}</div>
    </>
  );
}
