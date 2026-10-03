"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getToken } from "@/app/lib/auth";
import { currentDataOwner, ownerScope } from "@/app/lib/data-owner";
import { fetchServerSettings, saveServerSettings } from "@/app/lib/sync";
import { createWorkspaceThemeStore } from "@/app/lib/workspace-theme-store";

export function useWorkspaceTheme(scope: string) {
  let token: string | null = null;
  try { token = getToken(); } catch { /* Store reports unavailable local persistence. */ }
  const store = useMemo(() => createWorkspaceThemeStore({
    scope,
    storage: { getItem: key => typeof window !== "undefined" ? localStorage.getItem(key) : null, setItem: (key, value) => localStorage.setItem(key, value) },
    current: () => typeof window !== "undefined" && getToken() === token && ownerScope(currentDataOwner(localStorage)) === scope,
    readRemote: () => fetchServerSettings({ strict: true }),
    writeRemote: theme => saveServerSettings({ theme }),
  }), [scope, token]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); void store.load(); return () => store.dispose(); }, [store]);
  return { ...snapshot, choose: store.choose, retrySync: store.retry };
}
