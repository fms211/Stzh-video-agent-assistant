"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, Info } from "lucide-react";

type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
};

let toastId = 0;
let listeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

function notify(message: string, type: ToastItem["type"] = "info") {
  const id = ++toastId;
  toasts = [...toasts, { id, message, type }];
  listeners.forEach((fn) => fn(toasts));

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    listeners.forEach((fn) => fn(toasts));
  }, 3500);
}

export const toast = {
  success: (msg: string) => notify(msg, "success"),
  error: (msg: string) => notify(msg, "error"),
  info: (msg: string) => notify(msg, "info"),
};

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setItems);
    return () => { listeners = listeners.filter((fn) => fn !== setItems); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-container">
      {items.map((t) => (
        <div key={t.id} className={`toast-item toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === "success" ? <Check size={11} strokeWidth={2.5} /> : t.type === "error" ? <X size={11} strokeWidth={2.5} /> : <Info size={11} strokeWidth={2.5} />}
          </span>
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
      <style>{`
        .toast-container {
          position: fixed; top: 20px; right: 20px; z-index: var(--z-max);
          display: flex; flex-direction: column; gap: 8px;
          pointer-events: none;
        }
        .toast-item {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 18px; border-radius: var(--shape-control);
          background: var(--space-panel); border: 1px solid var(--border-subtle);
          box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 1px var(--border-subtle);
          font-family: var(--font-ui); font-size: var(--text-label-size);
          color: var(--foreground); letter-spacing: 0.03em;
          animation: toast-in 0.3s cubic-bezier(0.16,1,0.3,1);
          pointer-events: auto;
          backdrop-filter: blur(12px); line-height: var(--text-label-line); }
        .toast-icon {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          color: var(--primary-foreground);
        }
        .toast-success .toast-icon { background: var(--glow-success); color: var(--on-warm); }
        .toast-error .toast-icon { background: var(--error); color: var(--primary-foreground); }
        .toast-info .toast-icon { background: var(--glow-cool); color: var(--on-warm); }
        .toast-message { flex: 1; }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
