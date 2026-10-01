"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type InputHTMLAttributes, type PointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from "motion/react";

// Inspired by https://reactbits.dev/micro/squish-switch. Keep a native checkbox
// so existing labels, change events, form values and keyboard semantics survive.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
type Grip = { id: number; start: number; position: number; moved: boolean; slop: number };
const MIN = 3;
const MAX = 27;
const MID = (MIN + MAX) / 2;
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));
const listeners = new Set<() => void>();
let preferenceObserver: MutationObserver | undefined;
function subscribePreference(listener: () => void) {
  listeners.add(listener);
  if (!preferenceObserver) {
    preferenceObserver = new MutationObserver(() => listeners.forEach(notify => notify()));
    preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduced-motion"] });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { preferenceObserver?.disconnect(); preferenceObserver = undefined; }
  };
}
const readPreference = () => document.documentElement.dataset.reducedMotion === "true";

export default function SquishSwitch({ checked, defaultChecked, disabled, className, onChange, onClick, onKeyDown, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const grip = useRef<Grip | null>(null);
  const dragChoice = useRef<boolean | null>(null);
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const [dragging, setDragging] = useState(false);
  const on = checked ?? inner;
  const onRef = useRef(on);
  onRef.current = on;
  const systemReduce = useReducedMotion();
  const userReduce = useSyncExternalStore(subscribePreference, readPreference, () => false);
  const reduce = systemReduce || userReduce;
  const x = useMotionValue(on ? MAX : MIN);
  const flow = useSpring(useVelocity(x), { stiffness: 320, damping: 40, mass: .6 });
  const swell = useSpring(1, { stiffness: 520, damping: 34, mass: .6 });
  const scaleX = useTransform([flow, swell], ([velocity, hover]) => reduce ? 1 : Number(hover) * (1 + Math.min(.4, Math.abs(Number(velocity)) / 600) * .36));
  const scaleY = useTransform([flow, swell], ([velocity, hover]) => reduce ? 1 : Number(hover) / (1 + Math.min(.4, Math.abs(Number(velocity)) / 600) * .36));

  useEffect(() => {
    if (dragging) return;
    const target = on ? MAX : MIN;
    if (reduce) { x.jump(target); return; }
    const controls = animate(x, target, { type: "spring", stiffness: 170, damping: 21.5, mass: .9 });
    return () => controls.stop();
  }, [on, dragging, reduce, x]);

  const finish = (event: PointerEvent<HTMLInputElement>, cancelled = false) => {
    const current = grip.current;
    if (!current || current.id !== event.pointerId) return;
    grip.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Taps use native checkbox events. A drag supplies the desired value to
    // that same change event; do not cancel click (React still emits change).
    dragChoice.current = cancelled ? on : current.moved ? x.get() > MID : null;
    const next = dragChoice.current;
    if (next !== null) {
      // Some browsers omit click after a drag. Commit only if its native
      // change event has not already applied the desired value.
      setTimeout(() => {
        dragChoice.current = null;
        if (input.current && !input.current.disabled && onRef.current !== next) {
          input.current.checked = onRef.current;
          input.current.click();
        }
      }, 0);
    }
    x.set(on ? MAX : MIN);
    setDragging(false);
  };

  return <span className="squish-control" data-checked={on} data-disabled={Boolean(disabled)} data-dragging={dragging} data-reduced={Boolean(reduce)}>
    <input {...props} ref={input} type="checkbox" checked={on} disabled={disabled} className={`squish-control__input${className ? ` ${className}` : ""}`}
      onChange={event => {
        const next = dragChoice.current ?? event.target.checked;
        dragChoice.current = null;
        event.target.checked = next;
        if (next === onRef.current) return;
        onRef.current = next;
        setInner(next); onChange?.(event);
      }}
      onClick={onClick}
      onPointerDown={event => {
        if (disabled || grip.current || event.button !== 0) return;
        input.current?.focus({ preventScroll: true });
        dragChoice.current = null;
        grip.current = { id: event.pointerId, start: event.clientX, position: x.get(), moved: false, slop: event.pointerType === "touch" ? 8 : 4 };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={event => {
        const current = grip.current;
        if (!current || current.id !== event.pointerId) return;
        const delta = event.clientX - current.start;
        if (Math.abs(delta) > current.slop) current.moved = true;
        if (current.moved) x.set(clamp(current.position + delta));
      }}
      onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
      onPointerEnter={event => { if (!disabled && !reduce && event.pointerType === "mouse") swell.set(1.035); }}
      onPointerLeave={() => swell.set(1)}
      onKeyDown={event => {
        dragChoice.current = null;
        if (event.key === "Escape" && grip.current) {
          const id = grip.current.id;
          grip.current = null;
          if (event.currentTarget.hasPointerCapture(id)) event.currentTarget.releasePointerCapture(id);
          x.set(on ? MAX : MIN); setDragging(false);
        }
        onKeyDown?.(event);
      }} />
    <span className="squish-control__track" aria-hidden="true"><motion.span className="squish-control__thumb" style={{ x, scaleX, scaleY }} /></span>
  </span>;
}
