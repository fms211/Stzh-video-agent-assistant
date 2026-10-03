"use client";

import type { CSSProperties } from "react";
import { usePreferences } from "@/app/hooks/usePreferences";
import { dialogueLatticeCells, normalizeDialogueLoader, type DialogueLoaderSettings } from "@/app/lib/dialogue-loader-settings";
import "./DialogueLatticeLoader.css";

type Props = { label?: string; animate?: boolean; decorative?: boolean; live?: boolean; compact?: boolean; settings?: DialogueLoaderSettings; className?: string };
export function DialogueLatticeLoader({ label, animate = true, decorative = false, live = true, compact = false, settings, className = "" }: Props) {
  const { prefs } = usePreferences();
  const config = normalizeDialogueLoader(settings ?? prefs.dialogueLoader);
  const style = {
    "--dll-color": config.useThemeColor ? "var(--glow-cool)" : config.color,
    "--dll-cell": `${compact ? 4 : config.cellSize}px`, "--dll-gap": `${compact ? 1 : config.gap}px`,
    "--dll-cycle": `${Math.round(config.step * 1.2 * 8)}ms`, "--dll-idle": config.idleOpacity,
  } as CSSProperties;
  return <span className={`dialogue-lattice-loader ${compact ? "dialogue-lattice-loader--compact" : ""} ${className}`}
    style={style} data-animated={animate} data-glow={config.glow} aria-hidden={decorative || undefined}
    role={decorative || !live ? undefined : "status"} aria-live={decorative || !live ? undefined : "polite"} aria-atomic={decorative || !live ? undefined : true}>
    <span className="dialogue-lattice-loader__grid" aria-hidden="true">
      {dialogueLatticeCells(config.step).map((cell, i) => <span key={i} className="dialogue-lattice-loader__cell" data-hole={cell.hole || undefined}
        style={{ animationDelay: `${cell.delay}ms` }} />)}
    </span>
    {label && <span className="dialogue-lattice-loader__label">{label}</span>}
  </span>;
}
