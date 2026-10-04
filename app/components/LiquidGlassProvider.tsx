"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { defaultGlassSettings, normalizeGlassSettings, type GlassSettings } from "@/app/lib/appearance-types";
import { normalizeGlassSurface } from "@/app/lib/glass-surface-settings";
import { useAuth } from "./AuthProvider";

const GlassContext = createContext({
  settings: defaultGlassSettings(),
  preview: (_next: GlassSettings) => {},
  save: (_next: GlassSettings) => {},
  cancel: () => {},
});

export const useLiquidGlassSettings = () => useContext(GlassContext);

export function LiquidGlassProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const owner = user?.id ? `user:${user.id}` : "guest";
  const storageKey = `tszh:v2:${owner}:glass-settings`;
  const [owned, setOwned] = useState<{ owner: string; saved: GlassSettings; draft: GlassSettings | null }>({ owner, saved: defaultGlassSettings(), draft: null });
  // Never display the previous account's draft while the new scope hydrates.
  const settings = owned.owner === owner ? owned.draft ?? owned.saved : defaultGlassSettings();

  useEffect(() => {
    let saved = defaultGlassSettings();
    try { const raw = localStorage.getItem(storageKey); if (raw) saved = normalizeGlassSettings(JSON.parse(raw)); } catch { /* A malformed record falls back without rewriting it. */ }
    setOwned({ owner, saved, draft: null });
  }, [owner, storageKey]);

  const preview = useCallback((next: GlassSettings) => {
    setOwned(current => current.owner === owner ? { ...current, draft: normalizeGlassSettings(next) } : current);
  }, [owner]);
  const save = useCallback((next: GlassSettings) => {
    const normalized = normalizeGlassSettings(next);
    // If the browser refuses storage, keep the draft and let the dialog report failure.
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    setOwned({ owner, saved: normalized, draft: null });
  }, [owner, storageKey]);
  const cancel = useCallback(() => {
    setOwned(current => current.owner === owner ? { ...current, draft: null } : current);
  }, [owner]);
  const surface = normalizeGlassSurface(settings.surface);
  const variables = {
    "--glass-blur": `${settings.blurPx}px`, "--glass-opacity": settings.opacity,
    "--glass-panel-strength": `${Math.round((.66 + settings.opacity * .7) * 100)}%`,
    "--glass-refraction": settings.refraction,
    "--glass-edge-glow": settings.edgeGlow, "--liquid-radius": `${surface.borderRadius}px`,
    "--liquid-smart-tint": `${settings.smartTint * 100}%`,
    "--liquid-background-opacity": surface.backgroundOpacity, "--liquid-saturation": surface.saturation,
  } as CSSProperties;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceTransparency = settings.reduceTransparency ? "true" : "false";
    root.dataset.refractionEnabled = settings.refractionEnabled ? "true" : "false";
    root.dataset.videoAutoplay = settings.videoAutoplay ? "true" : "false";
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, String(value));
    window.dispatchEvent(new CustomEvent("tszh_preferences_changed"));
  // All variables derive from the account's active settings, including drafts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const value = useMemo(() => ({ settings, preview, save, cancel }), [settings, preview, save, cancel]);
  return <GlassContext.Provider value={value}><div className="liquid-glass-scope" style={variables} data-glass-reduce-transparency={settings.reduceTransparency}>{children}</div></GlassContext.Provider>;
}
