"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in development; in production this could go to an error service
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      {/* Glowing error icon */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-[var(--glow-warm,#e89840)] opacity-20 blur-xl animate-pulse" />
        <svg
          className="relative w-12 h-12 text-[var(--glow-warm,#e89840)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx={12} cy={12} r={10} />
          <line x1={12} y1={8} x2={12} y2={12} />
          <line x1={12} y1={16} x2={12.01} y2={16} />
        </svg>
      </div>

      {/* Title */}
      <h2 className="text-xl font-display text-[var(--glow-warm,#e89840)]">
        控制室异常
      </h2>

      {/* Message */}
      <p className="text-sm text-[var(--text-secondary,#8899bb)] max-w-md">
        天文台的一个模块发生了异常，观测暂时中断。
        <br />
        点击下方按钮重新连接。
      </p>

      {/* Error detail (dev only) */}
      {process.env.NODE_ENV === "development" && (
        <pre className="text-xs text-[var(--glow-cool,#6088d8)] bg-[var(--space-panel,#0a1228)] border border-[var(--glow-cool,#6088d8)]/20 rounded-lg p-3 max-w-lg overflow-auto">
          {error.message}
          {error.digest && `\ndigest: ${error.digest}`}
        </pre>
      )}

      {/* Retry button */}
      <button
        onClick={reset}
        className="relative px-6 py-2.5 text-sm font-medium text-[var(--space-deep,#050a14)] bg-[var(--glow-warm,#e89840)] rounded-lg transition-all hover:brightness-110 active:scale-95 edge-glow"
      >
        重新连接
      </button>
    </div>
  );
}
