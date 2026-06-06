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
          padding: 12px 18px; border-radius: 12px;
          background: var(--space-panel); border: 1px solid var(--border-subtle);
          box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 1px var(--border-subtle);
          font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px;
          color: var(--foreground); letter-spacing: 0.03em;
          animation: toast-in 0.3s cubic-bezier(0.16,1,0.3,1);
          pointer-events: auto;
          backdrop-filter: blur(12px);
        }
        .toast-icon {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          color: #fff;
        }
        .toast-success .toast-icon { background: #2d8a4e; color: #fff; }
        .toast-error .toast-icon { background: #c03030; color: #fff; }
        .toast-info .toast-icon { background: var(--glow-cool); color: #0a0812; }
        .toast-message { flex: 1; }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
