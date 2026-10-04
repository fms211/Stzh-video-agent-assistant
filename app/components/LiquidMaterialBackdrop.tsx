"use client";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
/** Decorative only: the existing host retains its layout, focus and scroll ownership. */
export function LiquidMaterialBackdrop() {
  return <LiquidGlassSurface variant="popover" className="liquid-material-backdrop" aria-hidden="true">{null}</LiquidGlassSurface>;
}
