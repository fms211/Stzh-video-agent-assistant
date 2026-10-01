"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCreativeMotion } from "@/app/hooks/useCreativeMotion";

// Pulse only when an already mounted, real status changes to success.
export function StatusGlow({ value, success, children }: { value: string | number; success: boolean; children: ReactNode }) {
  const previous = useRef(value);
  const [pulse, setPulse] = useState(false);
  const { reducedMotion } = useCreativeMotion();
  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    setPulse(changed && success && !reducedMotion);
    if (!changed || !success || reducedMotion) return;
    const timer = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(timer);
  }, [value, success, reducedMotion]);
  return <span className="status-signal" data-success={success} data-pulse={pulse}>{children}</span>;
}
