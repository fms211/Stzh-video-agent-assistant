"use client";

// 插件中心 — 恢复与诊断（规划 §8.1 / Task 14 Step 3/5）
// 四区块固定：当前故障 / 疑似插件 / 健康快照 / 诊断日志。
// 回滚、禁用、退出安全模式均通过 Adapter；隔离数据 30 天保留可恢复/永久删除（二次确认 + 记录）。

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, History, RotateCcw, Trash2, ShieldCheck } from "lucide-react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import type { PluginEvent, PluginGeneration, QuarantineEntry, PluginBuildRecord } from "@/app/lib/plugin-center/types";

type Props = {
  adapter: PluginCenterAdapter;
  projectId: string;
};

export function PluginRecovery({ adapter, projectId }: Props) {
  const [generation, setGeneration] = useState<PluginGeneration | null>(null);
  const [history, setHistory] = useState<PluginGeneration[]>([]);
  const [builds, setBuilds] = useState<PluginBuildRecord[]>([]);
  const [events, setEvents] = useState<PluginEvent[]>([]);
  const [quarantine, setQuarantine] = useState<QuarantineEntry[]>([]);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const runAction = (operation: Promise<void>) => { void operation.catch((error) => setMessage(error instanceof Error ? error.message : "恢复操作失败")); };

  const reload = useCallback(async () => {
    try {
    const [gen, q, snapshots, buildRecords] = await Promise.all([adapter.getProjectGeneration(projectId), adapter.listQuarantined(), adapter.getGenerationHistory?.(projectId) || Promise.resolve([]), adapter.listBuilds?.() || Promise.resolve([])]);
    setGeneration(gen);
    setQuarantine(q);
    setHistory(snapshots);
    setBuilds(buildRecords);
    } catch (error) { setMessage(error instanceof Error ? error.message : "读取恢复记录失败"); }
  }, [adapter, projectId]);

  useEffect(() => {
    void reload();
    // 诊断日志：订阅项目事件回放 + 增量
    const sub = adapter.subscribe(projectId, 0, {
      onEvent(event) {
        setEvents((prev) => [...prev.slice(-199), event]);
      },
      onError(error) { setMessage(error.message); },
    });
    return () => sub.close();
  }, [adapter, projectId, reload]);

  const disableSuspected = useCallback(
    async (pluginId: string) => {
      setMessage("");
      await adapter.disableProjectPlugin(projectId, pluginId);
      setTimeout(() => void reload(), 250);
      setMessage(`已禁用疑似插件 ${pluginId} 并触发重建。`);
    },
    [adapter, projectId, reload],
  );

  const exitSafeMode = useCallback(async () => {
    setMessage("");
    // 退出安全模式：优先回滚 last-known-good；无快照时重建 Generation。
    // enterSafeMode 入口在「项目插件」页的 Generation 面板。
    const target = generation?.lastKnownGoodId;
    if (target) {
      await adapter.rollbackGeneration(projectId, target);
      setMessage("已退出安全模式并回滚到健康快照。");
    } else {
      await adapter.restartGeneration(projectId);
      setMessage("已退出安全模式并重建 Generation。");
    }
    setTimeout(() => void reload(), 250);
  }, [adapter, projectId, generation, reload]);

  const rollbackTo = useCallback(
    async (generationId: string) => {
      setMessage("");
      await adapter.rollbackGeneration(projectId, generationId);
      setTimeout(() => void reload(), 100);
      setMessage("已回滚到所选健康快照。");
    },
    [adapter, projectId, reload],
  );

  const restore = useCallback(
    async (entry: QuarantineEntry) => {
      setMessage("");
      await adapter.restoreQuarantined(entry.quarantineId);
      await reload();
      setMessage(`已恢复 ${entry.pluginId}@${entry.version} 到账户插件库（需重新在项目中启用）。`);
    },
    [adapter, reload],
  );

  const purge = useCallback(
    async (entry: QuarantineEntry) => {
      setMessage("");
      await adapter.purgeQuarantined(entry.quarantineId);
      setConfirmPurgeId(null);
      await reload();
      setMessage(`已永久删除 ${entry.pluginId}@${entry.version} 的隔离数据。`);
    },
    [adapter, reload],
  );

  const isFailed = generation?.status === "failed";
  const isSafeMode = Boolean(generation?.id.startsWith("gen-safe-"));
  const suspected = generation?.suspectedPluginIds ?? [];

  function remainingDays(expiresAt: string): number {
    return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  return (
    <div className="pc-recovery">
      <section className="pc-card pc-recovery__block">
        <h4>安装与构建记录</h4>
        {!builds.length && <p className="pc-empty">当前账户还没有依赖解析或脚本构建记录。</p>}
        {builds.slice(0, 10).map((build) => <details key={build.id} className="pc-build-record">
          <summary>{build.phase === "resolve" ? "依赖锁定" : "插件构建"} · {build.status === "completed" ? "完成" : build.status === "failed" ? "失败" : "执行中"} · {new Date(build.createdAt).toLocaleString("zh-CN")}</summary>
          {build.error && <p role="alert">{build.error}</p>}
          {build.records.map((record, index) => <pre key={index}>{record.command.join(" ")} · {record.elapsedMs}ms · 退出码 {record.exitCode ?? "—"}{"\n"}{record.output}</pre>)}
        </details>)}
      </section>
      {/* 当前故障 + 疑似插件 */}
      <section className="pc-card pc-recovery__block">
        <h4>当前故障</h4>
        {generation?.error && <p role="alert" className="pc-risk-row">{generation.error.message}</p>}
        {!isFailed && !isSafeMode && (
          <p className="pc-note pc-risk-row--safe" style={{ borderColor: undefined }}>
            <ShieldCheck aria-hidden="true" size={13} />
            <span>{generation?.status === "healthy" ? "当前插件组合运行正常。" : "当前项目插件尚未运行，可在项目插件页重建。"}</span>
          </p>
        )}
        {isFailed && (
          <div className="pc-risk-row" role="alert">
            <AlertTriangle aria-hidden="true" size={14} />
            <span>
              Generation <code>{generation?.id}</code> 启动失败。健康组合（若有）继续服务；核心会话与产物不受影响。
            </span>
          </div>
        )}
        {isSafeMode && (
          <div className="pc-risk-row" role="alert">
            <AlertTriangle aria-hidden="true" size={14} />
            <span>
              项目正处于<b>安全模式</b>：所有第三方插件已停用，核心功能可用。last-known-good：
              <code>{generation?.lastKnownGoodId ?? "—"}</code>
            </span>
          </div>
        )}

        <h4 style={{ marginTop: 12 }}>疑似插件</h4>
        {suspected.length === 0 ? (
          <p className="pc-empty">无疑似插件。</p>
        ) : (
          suspected.map((pluginId) => (
            <div key={pluginId} className="pc-quarantine-row">
              <b>{pluginId}</b>
              <button type="button" className="pc-btn pc-btn--danger" onClick={() => runAction(disableSuspected(pluginId))}>
                <Trash2 aria-hidden="true" size={12} /> 禁用并重建
              </button>
            </div>
          ))
        )}
        {(isFailed || isSafeMode) && (
          <div className="pc-binding__tools" style={{ marginTop: 10 }}>
            {isSafeMode && (
              <button type="button" className="pc-btn pc-btn--primary" disabled={!generation?.lastKnownGoodId} onClick={() => runAction(exitSafeMode())}>
                <RotateCcw aria-hidden="true" size={12} /> 退出安全模式（回滚健康快照）
              </button>
            )}
          </div>
        )}
      </section>

      {/* 健康快照 + 诊断日志 */}
      <section className="pc-card pc-recovery__block">
        <h4>健康快照（last-known-good 与历史）</h4>
        {generation?.lastKnownGoodId && (
          <div className="pc-quarantine-row">
            <History aria-hidden="true" size={13} />
            <b>{generation.lastKnownGoodId}</b>
            <span className="pc-binding__meta">当前 last-known-good</span>
          </div>
        )}
        {(history.length ? history : generation ? [generation] : []).slice(0, 5).map((gen) => (
          <div key={gen.id} className="pc-quarantine-row">
            <code style={{ fontSize: "var(--text-caption-size)" }}>{gen.id}</code>
            <span className={`pc-badge ${gen.status === "healthy" ? "pc-badge--healthy" : gen.status === "failed" ? "pc-badge--failed" : "pc-badge--starting"}`}>{gen.status}</span>
            <span className="pc-binding__meta">{gen.bindings.length} 插件</span>
            {gen.status === "healthy" && gen.id !== generation?.id && (
              <button type="button" className="pc-btn" onClick={() => runAction(rollbackTo(gen.id))}>
                回滚到此快照
              </button>
            )}
          </div>
        ))}

        <h4 style={{ marginTop: 12 }}>诊断日志（项目事件，最新 200 条）</h4>
        <ul className="pc-log-list" aria-label="项目事件日志">
          {events.slice(-30).reverse().map((event) => (
            <li key={event.seq}>
              #{event.seq} [{new Date(event.occurredAt).toLocaleTimeString("zh-CN", { hour12: false })}] {event.type}{" "}
              {event.payload.pluginId ? String(event.payload.pluginId) : ""}
            </li>
          ))}
          {events.length === 0 && <li>暂无项目事件。</li>}
        </ul>
      </section>

      {/* 隔离数据（30 天保留） */}
      <section className="pc-card pc-recovery__block" style={{ gridColumn: "1 / -1" }}>
        <h4>隔离数据（卸载后保留 30 天）</h4>
        {message && (
          <p className="pc-note" role="status">
            {message}
          </p>
        )}
        {quarantine.length === 0 ? (
          <p className="pc-empty">隔离区为空。卸载未引用的插件版本后，其配置与项目数据会进入此处。</p>
        ) : (
          quarantine.map((entry) => (
            <div key={entry.quarantineId} className="pc-quarantine-row">
              <b>{entry.manifestName}</b>
              <span className="pc-badge">v{entry.version}</span>
              <small>删除于 {new Date(entry.deletedAt).toLocaleDateString("zh-CN")}</small>
              <small>剩余 {remainingDays(entry.expiresAt)} 天</small>
              <button type="button" className="pc-btn" onClick={() => runAction(restore(entry))}>
                <RotateCcw aria-hidden="true" size={12} /> 恢复（需重装启用）
              </button>
              {confirmPurgeId === entry.quarantineId ? (
                <>
                  <button type="button" className="pc-btn pc-btn--danger" onClick={() => runAction(purge(entry))}>
                    确认永久删除
                  </button>
                  <button type="button" className="pc-btn" onClick={() => setConfirmPurgeId(null)}>
                    取消
                  </button>
                </>
              ) : (
                <button type="button" className="pc-btn pc-btn--danger" onClick={() => setConfirmPurgeId(entry.quarantineId)}>
                  <Trash2 aria-hidden="true" size={12} /> 永久删除
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
