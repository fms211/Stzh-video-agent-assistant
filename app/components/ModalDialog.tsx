"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className: string;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
};

/** Native modality isolates the page and owns nested-menu focus without restyling it. */
export function ModalDialog({ children, className, label, labelledBy, describedBy, busy = false, role = "dialog", onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const outsidePress = useRef(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={ref} className={className} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy}
    role={role} aria-modal="true" aria-busy={busy || undefined} tabIndex={-1}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}
    onPointerDown={event => { outsidePress.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (!busy && outsidePress.current && event.target === event.currentTarget) onClose();
      outsidePress.current = false;
    }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      // A nested native dialog must not enter its parent's custom Tab handler.
      event.stopPropagation();
      if (event.defaultPrevented) return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button, input:not([type="hidden"]), select, textarea, a[href], summary, [contenteditable="true"], [tabindex]',
      )).filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0 && !node.closest('[inert], [aria-hidden="true"]'));
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}>
    {children}
  </dialog>;
}
