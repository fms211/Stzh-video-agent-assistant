"use client";

// 插件中心 — 账户插件库（规划 §8.1）
// 按 pluginId 分组版本；显示来源 / resolved ref / SHA-256 / 签名 / 安装时间 / 引用项目数；
// 被引用版本的卸载打开项目清单并禁用确认。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, RefreshCw, Ban } from "lucide-react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import type { PluginPackage, UninstallResult } from "@/app/lib/plugin-center/types";

type Props = {
  adapter: PluginCenterAdapter;
};

export function PluginLibrary({ adapter }: Props) {
  const [packages, setPackages] = useState<PluginPackage[]>([]);
  const [blocked, setBlocked] = useState<UninstallResult | null>(null);
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    try { setPackages(await adapter.listAccountPackages()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "读取插件库失败"); }
  }, [adapter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groups = useMemo(() => {
    const map = new Map<string, PluginPackage[]>();
    for (const pkg of packages) {
      const list = map.get(pkg.pluginId) ?? [];
      list.push(pkg);
      map.set(pkg.pluginId, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.version < b.version ? 1 : -1));
    return [...map.entries()];
  }, [packages]);

  const uninstall = useCallback(
    async (pkg: PluginPackage) => {
      setMessage("");
      try {
      const result = await adapter.uninstallVersion(pkg.pluginId, pkg.version);
      if (result.status === "blocked") {
        setBlocked(result);
        return;
      }
      setBlocked(null);
      setMessage(result.status === "deleted" ? `已卸载 ${pkg.pluginId}@${pkg.version}，配置与项目数据进入 30 天隔离区。` : "已进入隔离区。");
      await reload();
      } catch (error) { setMessage(error instanceof Error ? error.message : "卸载插件失败"); }
    },
    [adapter, reload],
  );

  if (!packages.length) {
    return (
      <div className="pc-lib">
        {message && <p role="alert" className="pc-note">{message}</p>}
        <p className="pc-empty">
          账户插件库为空。
          <span className="pc-empty-next">下一步：在「发现」页安装插件；同一插件可并存多个版本。</span>
        </p>
      </div>
    );
  }

  return (
    <div className="pc-lib">
      {message && (
        <p className="pc-note" role="status">
          {message}
        </p>
      )}
      {blocked && (
        <div className="pc-risk-row" role="alert">
          <Ban aria-hidden="true" size={14} />
          <span>
            无法卸载：该版本仍被 {blocked.projectIds.length} 个项目引用（{blocked.projectIds.join("、")}
            ）。请先在这些项目中解绑或切换到其他版本。
          </span>
        </div>
      )}
      {groups.map(([pluginId, versions]) => (
        <section key={pluginId} className="pc-lib-group">
          <div className="pc-lib-group__head">
            <h4>{versions[0].manifest.name}</h4>
            <code className="pc-lib-version__hash">{pluginId}</code>
          </div>
          <div className="pc-lib-versions">
            {versions.map((pkg) => (
              <article key={pkg.installationId} className="pc-lib-version">
                <div className="pc-lib-version__main">
                  <span className="pc-badge">v{pkg.version}</span>
                  <span className={`pc-badge ${pkg.signatureStatus === "verified" ? "pc-badge--verified" : "pc-badge--unsigned"}`}>
                    {pkg.signatureStatus === "verified" ? "已签名" : "未签名"}
                  </span>
                  <span className="pc-lib-version__hash" title={pkg.contentHash}>
                    SHA-256 {pkg.contentHash.slice(0, 12)}…
                  </span>
                  <span className="pc-lib-version__refs">
                    {pkg.referencedProjectIds.length ? `被 ${pkg.referencedProjectIds.length} 个项目引用` : "未被引用"}
                  </span>
                  <small className="pc-lib-version__hash">安装于 {new Date(pkg.installedAt).toLocaleString("zh-CN")}</small>
                </div>
                <div className="pc-lib-actions">
                  <button
                    type="button"
                    className="pc-btn pc-btn--danger"
                    aria-label={`卸载 ${pkg.pluginId} v${pkg.version}`}
                    onClick={() => void uninstall(pkg)}
                  >
                    <Trash2 aria-hidden="true" size={12} /> 卸载
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <button type="button" className="pc-btn" onClick={() => void reload()} aria-label="刷新账户插件库">
        <RefreshCw aria-hidden="true" size={12} /> 刷新
      </button>
    </div>
  );
}
