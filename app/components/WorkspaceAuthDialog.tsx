"use client";
import { LiquidMaterialBackdrop } from "@/app/components/LiquidMaterialBackdrop";
import { type ReactNode } from "react";
import { ModalDialog } from "./ModalDialog";

export default function WorkspaceAuthDialog({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return <ModalDialog className="workspace-auth-overlay" label={label} onClose={onClose}>
    <div className="workspace-auth-overlay__panel liquid-material-host"><LiquidMaterialBackdrop />
      <button type="button" autoFocus className="workspace-auth-overlay__close" onClick={onClose} aria-label="关闭账户面板">关闭</button>
      {children}
    </div>
  </ModalDialog>;
}
