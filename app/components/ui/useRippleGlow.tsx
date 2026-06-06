"use client";

import { useCallback } from "react";
import type { PointerEvent } from "react";

type Options = {
  className?: string;
  maxDurationMs?: number;
};

export default function useRippleGlow(options?: Options) {
  const className = options?.className ?? "ui-ripple";
  const maxDurationMs = options?.maxDurationMs ?? 900;

  return useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const diameter = Math.max(1, Math.hypot(rect.width, rect.height) * 1.12);

      const ripple = document.createElement("span");
      ripple.className = className;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.style.width = `${diameter}px`;
      ripple.style.height = `${diameter}px`;

      target.appendChild(ripple);

      const cleanup = () => {
        ripple.removeEventListener("animationend", cleanup);
        ripple.remove();
      };
      ripple.addEventListener("animationend", cleanup);
      window.setTimeout(cleanup, maxDurationMs);
    },
    [className, maxDurationMs],
  );
}

