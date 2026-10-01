"use client";

import { useEffect, useState } from "react";

function readReducedMotionPreference() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.dataset.reducedMotion === "true";
}

export function useCreativeMotion() {
  // SSR and the hydration's first paint must never assume spatial motion is safe.
  // The effect below replaces this conservative value with the real preference.
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(readReducedMotionPreference());
    sync();
    mediaQuery.addEventListener("change", sync);
    window.addEventListener("tszh_preferences_changed", sync);
    // HomeClient 在 React 提交后更新属性；偏好事件可能早于这次 DOM 更新。
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduced-motion"] });
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", sync);
      window.removeEventListener("tszh_preferences_changed", sync);
    };
  }, []);

  return { reducedMotion };
}
