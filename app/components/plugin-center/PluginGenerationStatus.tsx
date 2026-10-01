"use client";

// 插件中心 — 项目 Generation 状态（规划 Task 13 Step 4）
// UI 链路：stopping → disposing → starting → health-check → healthy/failed；
// Mock 简化为 starting → healthy/failed，健康前保留旧组合；失败进入恢复状态条。

import { RefreshCw, ShieldCheck, AlertTriangle, History } from "lucide-react";
import { useState } from "react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import type { PluginGeneration } from "@/app/lib/plugin-center/types";

type Props = {
  adapter: PluginCenterAdapter;
  projectId: string;
  generation: PluginGeneration | null;
  onRebuilt: (generation: PluginGeneration) => void;
};

export function PluginGenerationStatus({ adapter, projectId, generation, onRebuilt }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const status = generation?.status ?? "stopped";
  const isFailed = status === "failed";
  const isSafeMode = Boolean(generation?.id.startsWith("gen-safe-"));

  const rebuild = async () => {
    const next = await adapter.restartGeneration(projectId);
    onRebuilt(next);
    // 轮询直到 healthy/failed（Mock 120ms，简单等待）
    if (next.status === "starting") setTimeout(async () => {
      try {
      const latest = await adapter.getProjectGeneration(next.projectId);
      if (latest) onRebuilt(latest);
      } catch (error) { setError(error instanceof Error ? error.message : "读取运行状态失败"); }
    }, 250);
  };

  const enterSafe = async () => {
    const safe = await adapter.enterSafeMode(projectId);
    onRebuilt(safe);
  };

  const rollback = async () => {
    const target = generation?.lastKnownGoodId;
    if (!target) return;
    const rolled = await adapter.rollbackGeneration(projectId, target);
    onRebuilt(rolled);
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "插件运行操作失败"); }
    finally { setBusy(false); }
  };

  return (
    <section className="pc-card pc-gen-panel" aria-label="项目 Generation 状态">
      {error && <p role="alert" className="pc-risk-row">{error}</p>}
      {generation?.error && <p role="alert" className="pc-risk-row">{generation.error.message}</p>}
      <div className="pc-lib-group__head">
        <h4 style={{ margin: 0 }}>插件组合 Generation</h4>
        <span className={`pc-badge ${status === "healthy" ? "pc-badge--healthy" : status === "failed" ? "pc-badge--failed" : "pc-badge--starting"}`}>
          {status === "healthy" && <ShieldCheck aria-hidden="true" size={11} />}
          {status === "failed" && <AlertTriangle aria-hidden="true" size={11} />}
          {status === "starting" && <RefreshCw aria-hidden="true" size={11} />}
          {isSafeMode ? "安全模式" : status === "healthy" ? "健康" : status === "failed" ? "失败" : status === "starting" ? "重建中" : "已停止"}
        </span>
      </div>
      {isSafeMode && <p className="pc-note">已保存的绑定保留，当前不加载第三方插件。可回滚健康快照恢复运行。</p>}
      <dl className="pc-kv" style={{ marginTop: 10 }}>
        <dt>Generation</dt>
        <dd>
          <code>{generation?.id ?? "—"}</code>
        </dd>
        <dt>组合哈希</dt>
        <dd>
          <code>{generation ? generation.packageSetHash.slice(0, 16) + "…" : "—"}</code>
        </dd>
        <dt>启用插件</dt>
        <dd>{generation?.bindings.length ?? 0}</dd>
        <dt>健康快照</dt>
        <dd>
          <code>{generation?.lastKnownGoodId ?? "—"}</code>
        </dd>
      </dl>
      <div className="pc-binding__tools" style={{ marginTop: 12 }}>
        <button type="button" className="pc-btn" disabled={busy} onClick={() => void run(rebuild)}>
          <RefreshCw aria-hidden="true" size={12} /> 重建 Generation
        </button>
        <button type="button" className="pc-btn" disabled={busy} onClick={() => void run(enterSafe)}>
          进入安全模式
        </button>
        <button type="button" className="pc-btn" disabled={busy || !generation?.lastKnownGoodId} onClick={() => void run(rollback)}>
          <History aria-hidden="true" size={12} /> 回滚健康快照
        </button>
      </div>
      {isFailed && generation && generation.suspectedPluginIds.length > 0 && (
        <div className="pc-risk-row" role="alert" style={{ marginTop: 10 }}>
          <AlertTriangle aria-hidden="true" size={13} />
          <span>
            Generation 启动失败，疑似插件：{generation.suspectedPluginIds.join("、")}
            。失败组合未生效；可在「恢复与诊断」中禁用疑似插件后重建或回滚。
          </span>
        </div>
      )}
      {status === "starting" && <p className="pc-rebuild-hint" style={{ marginTop: 8 }}>正在重建 Generation：stopping → starting → health-check…</p>}
    </section>
  );
}
