"use client";

import { type ReactNode } from "react";
import { ModalDialog } from "../ModalDialog";

/** Mounted only while open; native modality also isolates plugin iframes behind it. */
export function PluginDialog({ label, busy = false, onClose, children }: {
  label: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return <ModalDialog className="pc-stepper" label={label} busy={busy} onClose={onClose}>
    {children}
  </ModalDialog>;
}
