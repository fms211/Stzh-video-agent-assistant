"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AccessMode, EntryPhase } from "@/app/lib/entry-flow";
import type { WallpaperAppearance, WallpaperAsset } from "@/app/lib/appearance-types";
import type { GalaxySettings } from "@/app/lib/galaxy-settings";
import { WallpaperLayer } from "./WallpaperLayer";
import { clampOklchTint } from "@/app/lib/color-utils";
import dynamic from "next/dynamic";
import StarfieldBackground from "./StarfieldBackground";
import OrbitRings from "./OrbitRings";
import NavigationBar, { type WorkspacePage } from "./NavigationBar";

const GalaxyBackground = dynamic(() => import("./GalaxyBackground"), { ssr: false });

type Props = {
  onOpenTask?: (id: string) => void;
  phase: EntryPhase;
  accessMode: AccessMode | null;
  page: WorkspacePage;
  onPageChange: (page: WorkspacePage) => void;
  onAuthOpen?: () => void;
  reducedMotion?: boolean;
  particleEffects?: boolean;
  galaxySettings?: GalaxySettings;
  thinkingMode?: boolean;
  resetKey?: number;
  burstKey?: number;
  /** 壁纸显示配置与资产（owner-scoped，上层注入） */
  wallpaperAppearance?: WallpaperAppearance;
  wallpaperAsset?: WallpaperAsset | null;
  videoWallpaperActive?: boolean;
  onSmartTintColor?: (color: string | null) => void;
  children: ReactNode;
};

export default function ProductShell({
  onOpenTask,
  phase,
  accessMode,
  page,
  onPageChange,
  onAuthOpen,
  reducedMotion = false,
  particleEffects = true,
  galaxySettings,
  thinkingMode = false,
  resetKey = 0,
  burstKey = 0,
  wallpaperAppearance,
  wallpaperAsset = null,
  videoWallpaperActive = false,
  onSmartTintColor,
  children,
}: Props) {
  const workspaceActive = phase === "workspace";

  // 智能取色闭环：把 WallpaperLayer 提取的主色（经 OKLCH 钳制）写入 glass tint CSS 变量
  const handleSmartTint = (color: string | null) => {
    if (onSmartTintColor) onSmartTintColor(color);
    if (color) {
      const safe = clampOklchTint(color);
      document.documentElement.style.setProperty("--theme-glass-tint", safe);
    } else {
      document.documentElement.style.setProperty("--theme-glass-tint", "transparent");
    }
  };

  // 幻变触发：非 workspace → workspace 边沿自增一次，驱动背景尘埃→星环
  const [morphKey, setMorphKey] = useState(0);
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === "workspace" && prevPhase.current !== "workspace") setMorphKey((k) => k + 1);
    prevPhase.current = phase;
  }, [phase]);

  return (
    <MotionConfig
      reducedMotion={reducedMotion ? "always" : "user"}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <LayoutGroup id="tszh-product-shell">
        <div className="product-shell" data-entry-phase={phase} data-access-mode={accessMode || "none"}>
          {/* 壁纸层：主题色之上、星尘/轨道之下（规划 §2.1 分层顺序） */}
          {wallpaperAppearance && (
            <WallpaperLayer
              appearance={wallpaperAppearance}
              asset={wallpaperAsset}
              onSmartTintColor={handleSmartTint}
            />
          )}
          {particleEffects && (
            <div
              className="product-shell__scene"
              aria-hidden="true"
              style={{
                "--orbit-opacity": (wallpaperAppearance?.orbitOpacity ?? 1) * (workspaceActive ? 0.55 : 1),
                "--starfield-opacity": wallpaperAppearance?.starfieldOpacity ?? 1,
                "--galaxy-layer-strength": videoWallpaperActive ? 0.28 : 0.55,
                "--galaxy-layer-strength-narrow": videoWallpaperActive ? 0.28 : 0.42,
              } as CSSProperties}
            >
              <div className="product-shell__starfield">
                {workspaceActive ? (
                  <GalaxyBackground settings={galaxySettings} reducedMotion={reducedMotion} visible={(wallpaperAppearance?.starfieldOpacity ?? 1) > 0} />
                ) : (
                  <StarfieldBackground phase={phase} morphKey={morphKey} thinkingMode={thinkingMode} densityFactor={videoWallpaperActive ? 0.6 : 1} />
                )}
              </div>
              <OrbitRings phase={phase} morphKey={morphKey} resetKey={resetKey} burstKey={burstKey} reducedMotion={reducedMotion} />
            </div>
          )}

          <NavigationBar
            onOpenTask={onOpenTask}
            page={page}
            onPageChange={onPageChange}
            locked={!workspaceActive}
            accessMode={accessMode}
            showBrandCore={phase !== "splash"}
            onAuthOpen={onAuthOpen}
            reducedMotion={reducedMotion}
          />

          <AnimatePresence mode="sync" initial={false}>
            <motion.main
              key={phase}
              className="product-shell__content"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
              transition={{ duration: reducedMotion ? 0.08 : 0.18 }}
            >
              {children}
            </motion.main>
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
