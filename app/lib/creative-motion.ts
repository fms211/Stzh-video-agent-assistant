import type { Transition, Variants } from "motion/react";

export type MotionDirection = -1 | 0 | 1;

export const CREATIVE_MOTION = {
  panelSpring: { type: "spring", stiffness: 320, damping: 30, mass: 0.8 },
  indicatorSpring: { type: "spring", stiffness: 360, damping: 32, mass: 0.75 },
  exitDuration: 0.14,
  hoverDuration: 0.14,
  pressDuration: 0.09,
  reducedMotionDuration: 0.08,
  pressScale: 0.97,
} as const;

export function motionDirection<T>(order: readonly T[], from: T, to: T): MotionDirection {
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return 0;
  return toIndex > fromIndex ? 1 : -1;
}

type DirectionalVariantOptions = {
  offset: number;
  reducedMotion: boolean;
  enterTransition?: Transition;
  exitDuration?: number;
  scale?: number;
};

export function createDirectionalVariants({
  offset,
  reducedMotion,
  enterTransition = CREATIVE_MOTION.panelSpring,
  exitDuration = CREATIVE_MOTION.exitDuration,
  scale = 0.985,
}: DirectionalVariantOptions): Variants {
  if (reducedMotion) {
    const opacityTransition = { duration: Math.min(exitDuration, CREATIVE_MOTION.reducedMotionDuration) };
    return {
      enter: () => ({ opacity: 0, transition: opacityTransition }),
      active: { opacity: 1, transition: opacityTransition },
      exit: () => ({ opacity: 0, transition: opacityTransition }),
      inactive: () => ({ opacity: 0, transition: opacityTransition }),
    };
  }

  return {
    enter: (direction: MotionDirection) => ({ opacity: 0, x: direction * offset, scale }),
    active: { opacity: 1, x: 0, scale: 1, transition: enterTransition },
    exit: (direction: MotionDirection) => ({
      opacity: 0,
      x: direction * -offset,
      scale,
      transition: { duration: exitDuration },
    }),
    inactive: (direction: MotionDirection) => ({
      opacity: 0,
      x: direction * -offset,
      scale,
      transition: { duration: exitDuration },
    }),
  };
}
