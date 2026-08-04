"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AccessMode, EntryPhase } from "@/app/lib/entry-flow";
import StarfieldBackground from "./StarfieldBackground";
import OrbitRings from "./OrbitRings";
import CursorTrail from "./CursorTrail";
import NebulaCursorTrail from "./NebulaCursorTrail";
import NavigationBar, { type WorkspacePage } from "./NavigationBar";

type Props = {
  phase: EntryPhase;
  accessMode: AccessMode | null;
  page: WorkspacePage;
  onPageChange: (page: WorkspacePage) => void;
  onAuthOpen?: () => void;
  reducedMotion?: boolean;
  particleEffects?: boolean;
  cursorTrail?: boolean;
  thinkingMode?: boolean;
  resetKey?: number;
  burstKey?: number;
  children: ReactNode;
};

export default function ProductShell({
  phase,
  accessMode,
  page,
  onPageChange,
  onAuthOpen,
  reducedMotion = false,
  particleEffects = true,
  cursorTrail = false,
  thinkingMode = false,
  resetKey = 0,
  burstKey = 0,
  children,
}: Props) {
  const workspaceActive = phase === "workspace";

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
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <LayoutGroup id="tszh-product-shell">
        <div className="product-shell" data-entry-phase={phase} data-access-mode={accessMode || "none"}>
          {particleEffects && (
            <div className="product-shell__scene" aria-hidden="true">
              <StarfieldBackground phase={phase} morphKey={morphKey} thinkingMode={thinkingMode} />
              <OrbitRings phase={phase} morphKey={morphKey} resetKey={resetKey} burstKey={burstKey} reducedMotion={reducedMotion} />
            </div>
          )}

          {workspaceActive && cursorTrail && (
            <>
              <NebulaCursorTrail />
              <CursorTrail />
            </>
          )}

          <NavigationBar
            page={page}
            onPageChange={onPageChange}
            locked={!workspaceActive}
            accessMode={accessMode}
            showBrandCore={phase !== "splash"}
            onAuthOpen={onAuthOpen}
          />

          <AnimatePresence mode="sync" initial={false}>
            <motion.main
              key={phase}
              className="product-shell__content"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
              transition={{ duration: reducedMotion ? 0.16 : 0.24 }}
            >
              {children}
            </motion.main>
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
