"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../AuthProvider";
import { creativeApi } from "@/app/lib/creative-agent-api";
import type { PluginManifestV1, PluginPermissionTier } from "@/app/lib/plugin-center/types";

export type ActivePluginContribution = { pluginId: string; version: string; contentHash: string; generationId: string; manifest: PluginManifestV1; permissionTier?: PluginPermissionTier };
const Context = createContext<{ projectId: string; contributions: ActivePluginContribution[]; selectProject: (id: string) => void }>({ projectId: "", contributions: [], selectProject: () => {} });

export function PluginRuntimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const owner = user ? `user:${user.id}` : "guest";
  const [state, setState] = useState<{ owner: string; projectId: string; contributions: ActivePluginContribution[] }>({ owner: "", projectId: "", contributions: [] });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    window.addEventListener("tszh_plugin_runtime_changed", update);
    window.addEventListener("storage", update);
    const timer = window.setInterval(update, 15000);
    return () => { window.removeEventListener("tszh_plugin_runtime_changed", update); window.removeEventListener("storage", update); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { projects } = await creativeApi<{ projects: Array<{ id: string }> }>("/api/creative-projects");
      const saved = localStorage.getItem(`tszh:v2:${owner}:plugin-project`);
      const projectId = projects.find((project) => project.id === saved)?.id || projects[0]?.id || "";
      const contributions = projectId ? await creativeApi<ActivePluginContribution[]>(`/api/plugins/projects/${encodeURIComponent(projectId)}/contributions`) : [];
      if (!cancelled) setState({ owner, projectId, contributions });
    })().catch(() => { if (!cancelled) setState({ owner, projectId: "", contributions: [] }); });
    return () => { cancelled = true; };
  }, [user, owner, revision]);
  const value = useMemo(() => ({
    projectId: state.owner === owner ? state.projectId : "",
    contributions: state.owner === owner ? state.contributions : [],
    selectProject(id: string) {
      setState({ owner, projectId: id, contributions: [] });
      localStorage.setItem(`tszh:v2:${owner}:plugin-project`, id);
      window.dispatchEvent(new Event("tszh_plugin_runtime_changed"));
    },
  }), [owner, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePluginRuntime() { return useContext(Context); }
