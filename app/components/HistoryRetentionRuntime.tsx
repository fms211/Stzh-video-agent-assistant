"use client";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { sweepHistory } from "../lib/history-retention-client";

export default function HistoryRetentionRuntime() {
  const { user, verification } = useAuth();
  useEffect(() => {
    if (!user || verification !== "verified") return;
    let cancelled = false, running = false;
    const run = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        // Disabled policies still register protection and acknowledge records
        // previously removed on another client. The server alone authorizes deletion.
        await sweepHistory();
      } catch { /* Failed reads never authorize local deletion. Settings expose retry. */ }
      finally { running = false; }
    };
    void run();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void run(); }, 60_000);
    const refresh = () => { void run(); };
    window.addEventListener("tszh_history_retention_policy_changed", refresh);
    window.addEventListener("tszh_active_session_changed", refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("tszh_history_retention_policy_changed", refresh); window.removeEventListener("tszh_active_session_changed", refresh); };
  }, [user?.id, verification]);
  return null;
}
