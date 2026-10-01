"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Mounted only while open; native modality also isolates plugin iframes behind it. */
export function PluginDialog({ label, busy = false, onClose, children }: {
  label: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={ref} className="pc-stepper" aria-label={label} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]',
      )).filter(node => node.getClientRects().length > 0 && !node.closest("[inert]"));
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} tabIndex={-1}>
    {children}
  </dialog>;
}
