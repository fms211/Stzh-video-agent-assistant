"use client";

import { useAuth } from "./AuthProvider";

export default function AuthSessionNotice() {
  const { notice, syncing, refreshUser } = useAuth();
  if (!notice) return null;
  return <div className="auth-session-notice" role="status">
    <p>{notice}</p>
    <button type="button" className="entry-secondary-action" disabled={syncing} onClick={() => void refreshUser()}>
      {syncing ? "正在检查…" : "重新检查账户与同步"}
    </button>
  </div>;
}
