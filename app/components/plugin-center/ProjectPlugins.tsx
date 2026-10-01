"use client";

// 插件中心 — 项目插件（规划 §8.1 项目插件区 / Task 13）
// 列表 + 详情双栏语义（窄屏堆叠）；绑定编辑后显示「等待重建 Generation」；
// 保存保存后不伪装成已生效——实际生效以 Generation healthy 为准。

import { useCallback, useEffect, useState } from "react";
import { Power, RefreshCw } from "lucide-react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import type { PluginGeneration, PluginPackage, PluginPermissionTier, ProjectPluginBinding } from "@/app/lib/plugin-center/types";
import { PluginPermissionPicker } from "./PluginPermissionPicker";
import { PluginGenerationStatus } from "./PluginGenerationStatus";

type Props = {
  adapter: PluginCenterAdapter;
  projectId: string;
  authenticated: boolean;
  onAuthRequired: () => void;
};

export function ProjectPlugins({ adapter, projectId, authenticated, onAuthRequired }: Props) {
  const [bindings, setBindings] = useState<ProjectPluginBinding[]>([]);
  const [packages, setPackages] = useState<PluginPackage[]>([]);
  const [generation, setGeneration] = useState<PluginGeneration | null>(null);
  const [editing, setEditing] = useState<ProjectPluginBinding | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    try {
    const [b, p, g] = await Promise.all([
      adapter.listProjectBindings(projectId),
      adapter.listAccountPackages(),
      adapter.getProjectGeneration(projectId),
    ]);
    setBindings(b);
    setPackages(p);
    setGeneration(g);
    setEditing((prev) => (prev ? (b.find((x) => x.pluginId === prev.pluginId) ?? null) : null));
    setDirty(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "读取项目插件失败"); }
  }, [adapter, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const availablePackages = packages.filter((pkg) => !bindings.some((b) => b.pluginId === pkg.pluginId && b.version === pkg.version));

  const enablePlugin = useCallback(
    async (pkg: PluginPackage) => {
      if (!authenticated) {
        onAuthRequired();
        return;
      }
      setMessage("");
      try {
        await adapter.bindProjectPlugin(projectId, {
          pluginId: pkg.pluginId,
          version: pkg.version,
          installationId: pkg.installationId,
          permissionTier: pkg.manifest.requestedPermissionTier,
          enabled: true,
          config: {},
        });
        await reload();
        setMessage("已启用并触发 Generation 重建。");
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "启用失败");
      }
    },
    [adapter, projectId, authenticated, onAuthRequired, reload],
  );

  const toggleEnabled = useCallback(
    async (binding: ProjectPluginBinding) => {
      setMessage("");
      try {
      if (binding.enabled) {
        await adapter.disableProjectPlugin(projectId, binding.pluginId);
      } else {
        await adapter.bindProjectPlugin(projectId, {
          pluginId: binding.pluginId,
          version: binding.version,
          installationId: binding.installationId,
          permissionTier: binding.permissionTier,
          enabled: true,
          config: binding.config,
        });
      }
      await reload();
      } catch (error) { setMessage(error instanceof Error ? error.message : "更新项目插件失败"); }
    },
    [adapter, projectId, reload],
  );

  const saveEditing = useCallback(async () => {
    if (!editing) return;
    setMessage("");
    try {
      await adapter.changeProjectVersion(projectId, editing.pluginId, editing.version, {
        acceptedPermissionTier: editing.permissionTier,
      });
      await reload();
      setMessage("绑定已保存；Generation 正在重建，生效以健康状态为准。");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "保存失败");
    }
  }, [adapter, projectId, editing, reload]);

  return (
    <div className="pc-project">
      <div className="pc-project__list">
        {message && (
          <p className="pc-note" role="status">
            {message}
          </p>
        )}

        {bindings.length === 0 && (
          <p className="pc-empty">
            项目「{projectId}」尚未启用任何插件。
            <span className="pc-empty-next">下一步：从右侧账户插件库选择插件启用。</span>
          </p>
        )}

        {bindings.map((binding) => {
          const pkg = packages.find((p) => p.pluginId === binding.pluginId && p.version === binding.version);
          const isEditing = editing?.pluginId === binding.pluginId;
          const versionOptions = packages.filter((p) => p.pluginId === binding.pluginId);
          return (
            <article key={binding.pluginId} className="pc-binding">
              <div className="pc-binding__head">
                <b>{pkg?.manifest.name ?? binding.pluginId}</b>
                <span className="pc-badge">v{binding.version}</span>
                <span className={`pc-badge ${binding.enabled ? "pc-badge--healthy" : ""}`}>{binding.enabled ? "已启用" : "已禁用"}</span>
                {isEditing && dirty && <span className="pc-rebuild-hint">等待重建 Generation…</span>}
              </div>
              <div className="pc-binding__meta">
                <span>权限：{binding.permissionTier}</span>
                {pkg?.manifest.contributes.tools?.length ? <span>工具 {pkg.manifest.contributes.tools.length}</span> : null}
                {pkg?.manifest.contributes.workflows?.length ? <span>工作流 {pkg.manifest.contributes.workflows.length}</span> : null}
                {pkg?.manifest.contributes.slots?.length ? <span>槽位 {pkg.manifest.contributes.slots.length}</span> : null}
              </div>
              {isEditing && pkg && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label className="pc-binding__meta" style={{ gap: 8 }}>
                    版本
                    <select
                      value={editing.version}
                      aria-label={`选择 ${binding.pluginId} 版本`}
                      onChange={(event) => {
                        setEditing({ ...editing, version: event.target.value });
                        setDirty(true);
                      }}
                    >
                      {versionOptions.map((option) => (
                        <option key={option.version} value={option.version}>
                          v{option.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PluginPermissionPicker
                    requestedPermissionTier={pkg.manifest.requestedPermissionTier}
                    value={editing.permissionTier}
                    onChange={(tier: PluginPermissionTier) => {
                      setEditing({ ...editing, permissionTier: tier });
                      setDirty(true);
                    }}
                  />
                </div>
              )}
              <div className="pc-binding__tools">
                {adapter.unbindProjectPlugin && <button type="button" className="pc-btn" onClick={() => {
                  void adapter.unbindProjectPlugin!(projectId, binding.pluginId).then(reload).catch((error) => setMessage(error instanceof Error ? error.message : "解除绑定失败"));
                }}>解除项目绑定</button>}
                <button type="button" className="pc-btn" onClick={() => (isEditing && !dirty ? setEditing(null) : setEditing(isEditing ? editing : { ...binding }))}>
                  {isEditing ? (dirty ? "编辑中" : "收起编辑") : "编辑固定版本 / 权限"}
                </button>
                {isEditing && dirty && (
                  <button type="button" className="pc-btn pc-btn--primary" onClick={() => void saveEditing()}>
                    <RefreshCw aria-hidden="true" size={12} /> 保存并重建
                  </button>
                )}
                <button type="button" className="pc-btn" onClick={() => void toggleEnabled(binding)}>
                  <Power aria-hidden="true" size={12} /> {binding.enabled ? "禁用" : "启用"}
                </button>
              </div>
            </article>
          );
        })}

        {availablePackages.length > 0 && (
          <section className="pc-card">
            <h4 style={{ margin: "0 0 8px", fontSize: "var(--text-label-size)" }}>账户库中未启用的插件</h4>
            {availablePackages.map((pkg) => (
              <div key={pkg.installationId} className="pc-quarantine-row">
                <b>{pkg.manifest.name}</b>
                <span className="pc-badge">v{pkg.version}</span>
                <span className="pc-binding__meta">
                  {pkg.manifest.contributes.tools?.length ?? 0} 工具 · {pkg.manifest.contributes.slots?.length ?? 0} 槽位
                </span>
                <button type="button" className="pc-btn pc-btn--primary" onClick={() => void enablePlugin(pkg)}>
                  在本项目启用
                </button>
              </div>
            ))}
          </section>
        )}
      </div>

      <PluginGenerationStatus adapter={adapter} projectId={projectId} generation={generation} onRebuilt={setGeneration} />
    </div>
  );
}
