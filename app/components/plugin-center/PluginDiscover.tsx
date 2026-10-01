"use client";

// 插件中心 — 发现页（规划 §8.1）
// 搜索、分类、签名、权限筛选均由 Adapter query 驱动；卡片显示发布者/版本/tier/贡献数；
// 选中打开 420px 右侧详情抽屉；安装入口进入四步向导（PluginInstallFlow）。

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldCheck, ShieldAlert, X, Layers, User } from "lucide-react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import type { CatalogPage, InstallPreview, PluginPermissionTier, PluginSource } from "@/app/lib/plugin-center/types";
import { PluginInstallFlow } from "./PluginInstallFlow";

type Props = {
  adapter: PluginCenterAdapter;
  authenticated: boolean;
  onAuthRequired: () => void;
};

const TIER_LABEL: Record<PluginPermissionTier, string> = { safe: "安全", standard: "标准", full: "完全" };

export function PluginDiscover({ adapter, authenticated, onAuthRequired }: Props) {
  const [text, setText] = useState("");
  const [signature, setSignature] = useState<"all" | "verified" | "unsigned">("all");
  const [permissionTier, setPermissionTier] = useState<PluginPermissionTier | null>(null);
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [selected, setSelected] = useState<CatalogPage["items"][number] | null>(null);
  const [installSource, setInstallSource] = useState<PluginSource | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
    const result = await adapter.searchCatalog({ text, category: null, signature, permissionTier, cursor: null, limit: 50 });
    setPage(result);
    setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "读取插件目录失败"); }
  }, [adapter, text, signature, permissionTier]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const startInstall = useCallback(
    (source: PluginSource) => {
      if (!authenticated) {
        onAuthRequired();
        return;
      }
      setInstallSource(source);
    },
    [authenticated, onAuthRequired],
  );

  return (
    <div className="pc-discover">
      {error && <p role="alert" className="pc-note">{error}</p>}
      <div className="pc-discover__filters">
        <input
          type="search"
          placeholder="搜索插件名称或描述…"
          aria-label="搜索插件"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <select value={signature} onChange={(event) => setSignature(event.target.value as typeof signature)} aria-label="签名筛选">
          <option value="all">全部签名</option>
          <option value="verified">已签名</option>
          <option value="unsigned">未签名</option>
        </select>
        <select
          value={permissionTier ?? ""}
          onChange={(event) => setPermissionTier((event.target.value || null) as PluginPermissionTier | null)}
          aria-label="权限档筛选"
        >
          <option value="">全部权限</option>
          <option value="safe">安全</option>
          <option value="standard">标准</option>
          <option value="full">完全</option>
        </select>
      </div>

      <div className="pc-discover__grid">
        {(page?.items ?? []).map((item) => {
          const toolCount = item.manifest.contributes.tools?.length ?? 0;
          const workflowCount = item.manifest.contributes.workflows?.length ?? 0;
          const slotCount = item.manifest.contributes.slots?.length ?? 0;
          const pageCount = item.manifest.contributes.pages?.length ?? 0;
          return (
            <button key={`${item.manifest.id}@${item.manifest.version}`} type="button" className="pc-card pc-card-btn" onClick={() => setSelected(item)}>
              <div className="pc-discover-card__head">
                <h4 className="pc-discover-card__title">{item.manifest.name}</h4>
                {item.source.type === "catalog" ? (
                  <span className="pc-badge pc-badge--verified">
                    <ShieldCheck aria-hidden="true" size={11} /> 签名待校验
                  </span>
                ) : (
                  <span className="pc-badge pc-badge--unsigned">
                    <ShieldAlert aria-hidden="true" size={11} /> 未签名
                  </span>
                )}
              </div>
              <p className="pc-discover-card__desc">{item.manifest.description}</p>
              <div className="pc-discover-card__meta">
                <span className="pc-badge">
                  <User aria-hidden="true" size={10} /> {item.publisher}
                </span>
                <span className="pc-badge">v{item.manifest.version}</span>
                <span className={`pc-badge${item.manifest.requestedPermissionTier === "full" ? " pc-badge--full" : ""}`}>
                  {TIER_LABEL[item.manifest.requestedPermissionTier]}权限
                </span>
                <span className="pc-badge">
                  <Layers aria-hidden="true" size={10} /> {toolCount + workflowCount + slotCount + pageCount} 贡献
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {page && page.items.length === 0 && (
        <p className="pc-empty">
          没有匹配的插件。
          <span className="pc-empty-next">下一步：调整搜索词或筛选条件。</span>
        </p>
      )}

      {/* 详情抽屉（420px，规划 §8.1） */}
      {selected && (
        <>
          <button type="button" className="pc-drawer-backdrop" aria-label="关闭详情" onClick={() => setSelected(null)} />
          <aside className="pc-drawer" role="dialog" aria-modal="true" aria-label={`插件详情：${selected.manifest.name}`}>
            <div className="pc-drawer__head">
              <h3>{selected.manifest.name}</h3>
              <button type="button" className="pc-btn" aria-label="关闭详情抽屉" onClick={() => setSelected(null)}>
                <X aria-hidden="true" size={13} />
              </button>
            </div>
            <div className="pc-drawer__body">
              <div className="pc-drawer__section">
                <p>{selected.manifest.description}</p>
              </div>
              <dl className="pc-kv">
                <dt>版本</dt>
                <dd>v{selected.manifest.version}</dd>
                <dt>发布者</dt>
                <dd>{selected.publisher}</dd>
                <dt>插件 ID</dt>
                <dd>{selected.manifest.id}</dd>
                <dt>引擎要求</dt>
                <dd>stzh {selected.manifest.engine.stzh}</dd>
                <dt>签名</dt>
                <dd>解析来源后校验，以安装预览结果为准</dd>
                <dt>权限请求</dt>
                <dd>{TIER_LABEL[selected.manifest.requestedPermissionTier]}</dd>
                <dt>来源类型</dt>
                <dd>
                  {selected.source.type === "catalog"
                    ? "市场目录"
                    : selected.source.type === "npm"
                      ? selected.source.spec
                      : selected.source.type === "git"
                        ? selected.source.url
                        : "本地包"}
                </dd>
              </dl>
              <div className="pc-drawer__section">
                <h4>贡献（contributions）</h4>
                <p>
                  工具 {selected.manifest.contributes.tools?.length ?? 0} · 工作流{" "}
                  {selected.manifest.contributes.workflows?.length ?? 0} · 槽位 {selected.manifest.contributes.slots?.length ?? 0} · 页面{" "}
                  {selected.manifest.contributes.pages?.length ?? 0}
                </p>
              </div>
              <div className="pc-note">安装预览会展示依赖、构建脚本与完整权限清单；未签名插件需单独确认风险。</div>
            </div>
            <div className="pc-drawer__foot">
              <button
                type="button"
                className="pc-btn pc-btn--primary"
                onClick={() => {
                  const source = selected.source;
                  setSelected(null);
                  startInstall(source);
                }}
              >
                安装 v{selected.manifest.version}
              </button>
            </div>
          </aside>
        </>
      )}

      {/* 四步安装向导 */}
      {installSource && (
        <PluginInstallFlow
          adapter={adapter}
          source={installSource}
          onClose={() => setInstallSource(null)}
          onInstalled={(preview: InstallPreview) => {
            setInstallSource(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
