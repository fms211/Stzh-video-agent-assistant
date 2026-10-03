"use client";
import { MaterialSelect } from "@/app/components/MaterialSelect";

// 插件中心 — 四区域路由（发现 / 账户插件库 / 项目插件 / 恢复与诊断）
// 规划 §8.1：subnav 四段；右侧固定项目选择器与「从来源安装」按钮；
// 全部数据经 PluginCenterAdapter（Mock），组件不直接改状态数组。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Compass, LibraryBig, FolderKanban, LifeBuoy } from "lucide-react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import { PluginDiscover } from "./PluginDiscover";
import { PluginLibrary } from "./PluginLibrary";
import { ProjectPlugins } from "./ProjectPlugins";
import { PluginRecovery } from "./PluginRecovery";
import { PluginInstallFlow } from "./PluginInstallFlow";
import { PluginDialog } from "./PluginDialog";
import type { PluginSource } from "@/app/lib/plugin-center/types";
import { usePluginRuntime } from "../plugin-slots/PluginRuntimeProvider";
import "./PluginCenter.css";

export type PluginView = "discover" | "library" | "project" | "recovery";

type Props = {
  adapter: PluginCenterAdapter;
  projects: string[];
  projectLabels?: Record<string, string>;
  onCreateProject?: (name: string) => Promise<{ id: string; name: string }>;
  onAuthRequired: () => void;
  authenticated: boolean;
};

const VIEWS: Array<{ key: PluginView; label: string; icon: typeof Compass }> = [
  { key: "discover", label: "发现", icon: Compass },
  { key: "library", label: "账户插件库", icon: LibraryBig },
  { key: "project", label: "项目插件", icon: FolderKanban },
  { key: "recovery", label: "恢复与诊断", icon: LifeBuoy },
];

export default function PluginCenter({ adapter, projects, projectLabels = {}, onCreateProject, onAuthRequired, authenticated }: Props) {
  const pluginRuntime = usePluginRuntime();
  const [view, setView] = useState<PluginView>("discover");
  const [activeProjectId, setActiveProjectId] = useState<string>(projects[0] ?? "");
  const [installSourceOpen, setInstallSourceOpen] = useState(false);
  const [source, setSource] = useState<PluginSource | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const effectiveProjects = useMemo(() => projects, [projects]);

  useEffect(() => {
    if (!effectiveProjects.includes(activeProjectId)) setActiveProjectId(effectiveProjects[0] || "");
  }, [effectiveProjects, activeProjectId]);

  useEffect(() => {
    if (pluginRuntime.projectId && projects.includes(pluginRuntime.projectId)) setActiveProjectId(pluginRuntime.projectId);
  }, [pluginRuntime.projectId, projects]);

  const openInstallFlow = useCallback(() => {
    if (!authenticated) {
      onAuthRequired();
      return;
    }
    setInstallSourceOpen(true);
  }, [authenticated, onAuthRequired]);

  return (
    <div className="pc" data-testid="plugin-center">
      {message && <p role="status" className="pc-note">{message}</p>}
      <div className="pc__subnav" role="tablist" aria-label="插件中心区域">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`pc__subnav-btn${view === key ? " is-active" : ""}`}
            onClick={() => setView(key)}
          >
            <Icon aria-hidden="true" size={14} /> {label}
          </button>
        ))}
        <div className="pc__subnav-spacer" />
        <label className="pc__project-picker">
          <span className="pc__project-label">项目</span>
          <MaterialSelect value={activeProjectId} onValueChange={selectedValue => { setActiveProjectId(selectedValue); pluginRuntime.selectProject(selectedValue); }} aria-label="选择项目">
            {!effectiveProjects.length && <option value="">请先创建项目</option>}
            {effectiveProjects.map((project) => (
              <option key={project} value={project}>
                {projectLabels[project] || project}
              </option>
            ))}
          </MaterialSelect>
        </label>
        <button type="button" className="pc__install-btn edge-glow--interactive" onClick={openInstallFlow}>
          从来源安装
        </button>
      </div>

      {onCreateProject && <form className="pc-project-create" onSubmit={(event) => {
        event.preventDefault(); if (!projectName.trim() || busy) return;
        setBusy(true); setMessage("");
        void onCreateProject(projectName.trim()).then((project) => { setActiveProjectId(project.id); pluginRuntime.selectProject(project.id); setProjectName(""); setView("project"); })
          .catch((error) => setMessage(error instanceof Error ? error.message : "创建项目失败")).finally(() => setBusy(false));
      }}>
        <input aria-label="新项目名称" placeholder="新项目名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={100} />
        <button type="submit" className="pc-btn" disabled={busy || !projectName.trim()}>新建项目</button>
      </form>}

      {installSourceOpen && <PluginDialog label="选择插件来源" busy={busy} onClose={() => setInstallSourceOpen(false)}>
        <div className="pc-stepper__panel">
          <div className="pc-stepper__head"><h3>选择插件来源</h3><button type="button" className="pc-btn" onClick={() => setInstallSourceOpen(false)} disabled={busy}>关闭</button></div>
          <div className="pc-stepper__body">
            <button type="button" className="pc-btn" onClick={() => { setSource({ type: "npm", spec: "" }); setInstallSourceOpen(false); }}>npm 包</button>
            <button type="button" className="pc-btn" onClick={() => { setSource({ type: "git", url: "", ref: null }); setInstallSourceOpen(false); }}>GitHub 仓库</button>
            <label className="pc-local-upload">本地插件包（.zip / .stzhplugin）
              <input type="file" aria-label="上传本地插件包" accept=".zip,.stzhplugin" disabled={busy} onChange={(event) => {
                const file = event.target.files?.[0]; if (!file) return;
                if (!adapter.uploadLocalPackage) { setMessage("当前连接未提供本地上传能力"); return; }
                setBusy(true); setMessage("");
                void adapter.uploadLocalPackage(file).then((source) => { setSource(source); setInstallSourceOpen(false); })
                  .catch((error) => setMessage(error instanceof Error ? error.message : "上传失败")).finally(() => setBusy(false));
              }} />
            </label>
            {busy && <p role="status">正在上传插件包…</p>}
          </div>
        </div>
      </PluginDialog>}
      {source && <PluginInstallFlow adapter={adapter} source={source} onClose={() => setSource(null)} onInstalled={() => { setSource(null); setView("library"); setRefreshKey((key) => key + 1); setMessage("插件已安装到账户库，可在项目中启用。"); }} />}

      {view === "discover" && <PluginDiscover adapter={adapter} authenticated={authenticated} onAuthRequired={onAuthRequired} />}
      {view === "library" && <PluginLibrary key={refreshKey} adapter={adapter} />}
      {view === "project" && (activeProjectId ? <ProjectPlugins key={activeProjectId} adapter={adapter} projectId={activeProjectId} authenticated={authenticated} onAuthRequired={onAuthRequired} /> : <p className="pc-empty">创建项目后，可选择插件及版本。</p>)}
      {view === "recovery" && (activeProjectId ? <PluginRecovery key={activeProjectId} adapter={adapter} projectId={activeProjectId} /> : <p className="pc-empty">请选择或创建项目后查看运行恢复。</p>)}
    </div>
  );
}
