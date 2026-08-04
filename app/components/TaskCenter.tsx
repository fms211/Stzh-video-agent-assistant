"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock3,
  Link2,
  LockKeyhole,
  MonitorSmartphone,
  Radio,
  RotateCcw,
  Smartphone,
  Square,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  claimTask,
  executeTask,
  getDesktopDeviceId,
  getTasks,
  getToken,
  startDesktopHeartbeat,
  taskAction,
  type LinkedTask,
} from "@/app/lib/auth";
import QRCodeAccess from "./QRCodeAccess";
import type { AccessMode } from "@/app/lib/entry-flow";

type TaskStatus = LinkedTask["status"];
type TaskFilter = "all" | "active" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "archive";
type ConnectionState = "signed-out" | "connecting" | "live" | "fallback";

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "等待桌面接手",
  running: "正在执行",
  paused: "已暂停",
  completed: "已完成",
  failed: "执行失败",
  cancelled: "已取消",
};

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "活跃" },
  { key: "queued", label: "待接手" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "异常" },
  { key: "archive", label: "历史归档" },
];

function isActiveTask(task: LinkedTask) {
  return task.status === "queued" || task.status === "running" || task.status === "paused";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusIcon(status: TaskStatus) {
  if (status === "running") return <Activity size={16} strokeWidth={1.7} />;
  if (status === "paused") return <CirclePause size={16} strokeWidth={1.7} />;
  if (status === "completed") return <CheckCircle2 size={16} strokeWidth={1.7} />;
  if (status === "failed" || status === "cancelled") {
    return <TriangleAlert size={16} strokeWidth={1.7} />;
  }
  return <Clock3 size={16} strokeWidth={1.7} />;
}

export default function TaskCenter({ accessMode = "authenticated", onAuthRequired }: { accessMode?: AccessMode; onAuthRequired?: () => void }) {
  const authenticated = accessMode === "authenticated" && Boolean(getToken());
  const [tasks, setTasks] = useState<LinkedTask[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [page, setPage] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>(
    authenticated ? "connecting" : "signed-out"
  );
  const [filter, setFilter] = useState<TaskFilter>("all");
  const filterRef = useRef<TaskFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(authenticated);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const controllers = useRef(new Map<string, AbortController>());

  const PAGE_SIZE = 20;

  const loadTasks = useCallback(async (statusFilter?: string, loadMore = false) => {
    if (!authenticated || !getToken()) return;
    try {
      const offset = loadMore ? page * PAGE_SIZE : 0;
      const data = await getTasks({ status: statusFilter, limit: PAGE_SIZE, offset });
      if (loadMore) {
        setTasks((current) => {
          const seen = new Set(current.map((t) => t.id));
          return [...current, ...data.tasks.filter((t) => !seen.has(t.id))];
        });
      } else {
        setTasks(data.tasks);
      }
      setTotalTasks(data.total);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务加载失败");
    } finally {
      setLoading(false);
    }
  }, [authenticated, page]);

  useEffect(() => {
    if (!authenticated) return;
    const token = getToken();
    if (!token) return;

    const archiveStatus = filterRef.current === "archive" ? "completed,failed,cancelled" : undefined;
    const initialLoad = window.setTimeout(() => void loadTasks(archiveStatus), 0);
    const fallback = window.setInterval(() => void loadTasks(archiveStatus), 15000);
    const stopHeartbeat = startDesktopHeartbeat(20);
    const backendUrl = new URL(
      process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin
    );
    const protocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${backendUrl.host}/ws/desktop?token=${encodeURIComponent(token)}`
    );

    ws.onopen = () => setConnection("live");
    ws.onerror = () => setConnection("fallback");
    ws.onclose = () => setConnection("fallback");
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          payload?: { task?: LinkedTask };
        };
        if (message.type !== "task.updated" || !message.payload?.task) return;
        const task = message.payload.task;
        setTasks((current) => {
          const exists = current.some((item) => item.id === task.id);
          return exists
            ? current.map((item) => (item.id === task.id ? task : item))
            : [task, ...current];
        });
      } catch {
        setConnection("fallback");
      }
    };

    const activeControllers = controllers.current;
    // 页面关闭/隐藏时：停止心跳（服务端 reaper 60s 内回收僵尸任务）
    const onPageHide = () => {
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(fallback);
      stopHeartbeat();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      ws.close();
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
  }, [authenticated, loadTasks]);

  const counts = useMemo(() => ({
    active: tasks.filter(isActiveTask).length,
    queued: tasks.filter((task) => task.status === "queued").length,
    mobile: tasks.filter((task) => task.origin === "mobile").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  }), [tasks]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "active") return isActiveTask(task);
    if (filter === "failed") return task.status === "failed" || task.status === "cancelled";
    if (filter === "archive") return ["completed", "failed", "cancelled"].includes(task.status);
    return task.status === filter;
  }), [filter, tasks]);

  const selectedTask = tasks.find((task) => task.id === selectedId)
    || filteredTasks[0]
    || null;

  const updateTask = useCallback((next: LinkedTask) => {
    setTasks((current) => current.map((item) => (item.id === next.id ? next : item)));
  }, []);

  async function run(id: string, action: "claim" | "pause" | "resume" | "cancel" | "retry") {
    setBusyId(id);
    setError("");
    try {
      if (action === "claim") {
        const claimed = await claimTask(id, getDesktopDeviceId());
        updateTask(claimed.task);
        const controller = new AbortController();
        controllers.current.set(id, controller);
        const completed = await executeTask(claimed.task, controller.signal);
        controllers.current.delete(id);
        if (completed) updateTask(completed);
        return;
      }

      const result = await taskAction(id, action);
      if (action === "pause" || action === "cancel") {
        controllers.current.get(id)?.abort();
        controllers.current.delete(id);
      }
      updateTask(result.task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusyId("");
    }
  }

  const connectionLabel = connection === "live"
    ? "实时联动"
    : connection === "connecting"
      ? "正在握手"
      : connection === "fallback"
        ? "轮询保障"
        : "等待登录";

  return (
    <section className="task-center">
      <header className="task-center__header">
        <div className="task-center__title-block">
          <div className="task-center__eyebrow"><Radio size={13} strokeWidth={1.7} /> 任务联动</div>
          <h2>任务中心</h2>
          <p>桌面负责创作执行，手机负责远程发起与控制，所有状态保持实时一致。</p>
        </div>
        <div className="task-center__header-actions">
          <span className={`task-center__live is-${connection}`}>
            {connection === "live" ? <Wifi size={14} strokeWidth={1.7} /> : <WifiOff size={14} strokeWidth={1.7} />}
            <span>{connectionLabel}</span>
          </span>
          <QRCodeAccess disabled={!authenticated} />
        </div>
      </header>

      <div className="task-center__telemetry" aria-label="任务状态概览">
        <div><span>活跃</span><strong>{counts.active}</strong></div>
        <i />
        <div><span>待接手</span><strong>{counts.queued}</strong></div>
        <i />
        <div><span>手机发起</span><strong>{counts.mobile}</strong></div>
        <i />
        <div><span>已完成</span><strong>{counts.completed}</strong></div>
        <span className="task-center__sync"><Link2 size={13} strokeWidth={1.7} /> 15 秒自动校准</span>
      </div>

      {!authenticated ? (
        <div className="task-center__auth-gate">
          <div className="task-center__auth-icon"><LockKeyhole size={24} strokeWidth={1.6} /></div>
          <div>
            <strong>登录后启用双端联动</strong>
            <p>登录桌面创作中心后，才能生成一次性配对码并同步你的任务。</p>
          </div>
          {onAuthRequired && <button type="button" className="task-center__signin" onClick={onAuthRequired}>登录并连接</button>}
        </div>
      ) : (
        <>
          <div className="task-center__toolbar">
            <div className="task-center__filters" aria-label="筛选任务">
              {FILTERS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={filter === item.key ? "is-active" : ""}
                  aria-pressed={filter === item.key}
                  onClick={() => {
                    filterRef.current = item.key;
                    setFilter(item.key);
                    setPage(0);
                    void loadTasks(item.key === "archive" ? "completed,failed,cancelled" : undefined);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="task-center__refresh" onClick={() => void loadTasks()}>
              <RotateCcw size={13} strokeWidth={1.7} /> 校准状态
            </button>
          </div>

          {error && (
            <div className="task-center__error" role="status">
              <TriangleAlert size={15} strokeWidth={1.7} />
              <span>{error}</span>
              <button type="button" onClick={() => void loadTasks()}>重试</button>
            </div>
          )}

          <div className="task-center__workspace">
            <div className="task-center__list" aria-busy={loading}>
              {loading && Array.from({ length: 3 }, (_, index) => (
                <div className="task-card task-card--skeleton" key={index}>
                  <span /><span /><span />
                </div>
              ))}

              {!loading && filteredTasks.length === 0 && (
                <div className="task-center__empty">
                  <MonitorSmartphone size={27} strokeWidth={1.5} />
                  <strong>{tasks.length ? "当前筛选下没有任务" : "等待第一条联动任务"}</strong>
                  <span>{tasks.length ? "切换筛选条件查看其他任务。" : "手机提交创作请求后，会立即出现在这里。"}</span>
                </div>
              )}

              {!loading && filteredTasks.map((task) => (
                <button
                  type="button"
                  className={`task-card status-${task.status} ${selectedTask?.id === task.id ? "is-selected" : ""}`}
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                >
                  <span className="task-card__icon">{statusIcon(task.status)}</span>
                  <span className="task-card__body">
                    <span className="task-card__meta">
                      <span>{task.origin === "mobile" ? "手机远程" : task.origin === "migration" ? "历史迁移" : "桌面"}</span>
                      <span>{formatTime(task.updatedAt)}</span>
                    </span>
                    <strong>{task.title}</strong>
                    <span className="task-card__stage">{task.stage || String(task.input?.prompt || "等待补充执行信息")}</span>
                    <span className="task-card__progress" aria-label={`进度 ${task.progress}%`}>
                      <i style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }} />
                    </span>
                  </span>
                  <span className="task-card__status">{STATUS_LABEL[task.status]}<b>{task.progress}%</b></span>
                </button>
              ))}

              {!loading && tasks.length < totalTasks && (
                <button
                  type="button"
                  className="task-center__loadmore"
                  onClick={() => { setPage((p) => p + 1); void loadTasks(filterRef.current === "archive" ? "completed,failed,cancelled" : undefined, true); }}
                >
                  加载更多（{tasks.length}/{totalTasks}）
                </button>
              )}
            </div>

            <aside className="task-detail" aria-live="polite">
              {selectedTask ? (
                <>
                  <div className="task-detail__head">
                    <span className={`task-detail__signal status-${selectedTask.status}`}>
                      {statusIcon(selectedTask.status)} {STATUS_LABEL[selectedTask.status]}
                    </span>
                    <span>{selectedTask.id.slice(-8).toUpperCase()}</span>
                  </div>
                  <h3>{selectedTask.title}</h3>
                  <p className="task-detail__stage">{selectedTask.stage || "等待桌面创作中心处理"}</p>

                  <div className="task-detail__progress">
                    <div><span>执行进度</span><strong>{selectedTask.progress}%</strong></div>
                    <span><i style={{ width: `${selectedTask.progress}%` }} /></span>
                  </div>

                  <dl>
                    <div><dt>来源</dt><dd>{selectedTask.origin === "mobile" ? <><Smartphone size={13} /> 手机远程</> : "桌面创作中心"}</dd></div>
                    <div><dt>更新时间</dt><dd>{formatTime(selectedTask.updatedAt)}</dd></div>
                    <div><dt>任务类型</dt><dd>{selectedTask.kind}</dd></div>
                  </dl>

                  <div className="task-detail__prompt">
                    <span>创作指令</span>
                    <p>{String(selectedTask.input?.prompt || "暂无创作指令")}</p>
                  </div>

                  {selectedTask.error && (
                    <div className="task-detail__failure">
                      <TriangleAlert size={14} strokeWidth={1.7} /> {selectedTask.error}
                    </div>
                  )}

                  <div className="task-detail__actions">
                    {selectedTask.status === "queued" && (
                      <button disabled={busyId === selectedTask.id} onClick={() => void run(selectedTask.id, "claim")}>
                        <CirclePlay size={15} /> 接手执行
                      </button>
                    )}
                    {selectedTask.status === "running" && (
                      <button disabled={busyId === selectedTask.id} onClick={() => void run(selectedTask.id, "pause")}>
                        <CirclePause size={15} /> 暂停
                      </button>
                    )}
                    {selectedTask.status === "paused" && (
                      <button disabled={busyId === selectedTask.id} onClick={() => void run(selectedTask.id, "resume")}>
                        <CirclePlay size={15} /> 继续
                      </button>
                    )}
                    {isActiveTask(selectedTask) && (
                      <button className="danger" disabled={busyId === selectedTask.id} onClick={() => void run(selectedTask.id, "cancel")}>
                        <Square size={14} /> 取消任务
                      </button>
                    )}
                    {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && (
                      <button disabled={busyId === selectedTask.id} onClick={() => void run(selectedTask.id, "retry")}>
                        <RotateCcw size={14} /> 重新排队
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="task-detail__empty">
                  <MonitorSmartphone size={25} strokeWidth={1.5} />
                  <strong>任务详情</strong>
                  <span>选择左侧任务查看完整状态与控制项。</span>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      <style>{`
        .task-center { min-height:100svh; padding:116px clamp(24px,7vw,108px) 80px; color:var(--foreground); }
        .task-center__header { display:flex; justify-content:space-between; gap:32px; align-items:flex-end; max-width:1180px; margin:0 auto 24px; }
        .task-center__title-block { max-width:680px; }
        .task-center__eyebrow { display:flex; align-items:center; gap:7px; color:var(--glow-cool); font:600 11px/1.4 var(--font-display), var(--font-geist-mono), monospace; letter-spacing:.1em; }
        .task-center h2 { margin:8px 0 6px; font:480 clamp(30px,3.4vw,42px)/1.15 var(--font-display), var(--font-geist-sans), sans-serif; letter-spacing:-.04em; }
        .task-center__header p { margin:0; color:var(--foreground-muted); font-size:13px; line-height:1.7; }
        .task-center__header-actions { display:flex; align-items:center; gap:9px; }
        .task-center__live { display:flex; align-items:center; gap:7px; min-height:38px; padding:0 12px; border:1px solid var(--border-subtle); border-radius:10px; background:color-mix(in srgb,var(--space-panel) 92%,transparent); color:var(--foreground-muted); font-size:11px; white-space:nowrap; }
        .task-center__live.is-live { color:#7cc79a; border-color:color-mix(in srgb,#7cc79a 30%,transparent); }
        .task-center__live.is-connecting { color:var(--glow-warm); }
        .task-center__telemetry { max-width:1180px; min-height:52px; margin:0 auto 16px; padding:0 16px; display:flex; align-items:center; gap:18px; border:1px solid var(--border-subtle); border-radius:12px; background:color-mix(in srgb,var(--space-panel) 92%,transparent); }
        .task-center__telemetry > div { display:flex; align-items:baseline; gap:8px; }
        .task-center__telemetry span { color:var(--foreground-muted); font-size:10px; letter-spacing:.04em; }
        .task-center__telemetry strong { color:var(--foreground); font:600 18px "Geist Mono",monospace; }
        .task-center__telemetry > i { width:1px; height:18px; background:var(--border-subtle); }
        .task-center__sync { margin-left:auto; display:flex; align-items:center; gap:6px; }
        .task-center__toolbar { max-width:1180px; margin:0 auto 14px; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .task-center__filters { display:flex; flex-wrap:wrap; gap:6px; }
        .task-center__filters button,.task-center__refresh { min-height:34px; padding:0 12px; display:inline-flex; align-items:center; gap:6px; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--foreground-muted); font-size:11px; cursor:pointer; transition:color 160ms cubic-bezier(.16,1,.3,1),border-color 160ms cubic-bezier(.16,1,.3,1),background 160ms cubic-bezier(.16,1,.3,1); }
        .task-center__loadmore { min-height:38px; margin-top:10px; display:flex; align-items:center; justify-content:center; border:1px dashed var(--border-subtle); border-radius:10px; background:transparent; color:var(--foreground-muted); font-size:11px; cursor:pointer; transition:color 160ms cubic-bezier(.16,1,.3,1),border-color 160ms cubic-bezier(.16,1,.3,1); }
        .task-center__loadmore:hover { color:var(--foreground); border-color:color-mix(in srgb,var(--glow-cool) 35%,transparent); }
        .task-center__filters button:hover,.task-center__refresh:hover { color:var(--foreground); border-color:var(--border-subtle); }
        .task-center__filters button.is-active { color:var(--glow-warm); border-color:color-mix(in srgb,var(--glow-warm) 30%,transparent); background:color-mix(in srgb,var(--glow-warm) 8%,transparent); }
        .task-center__workspace { max-width:1180px; margin:0 auto; display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:14px; align-items:start; }
        .task-center__list { display:flex; flex-direction:column; gap:9px; min-width:0; }
        .task-card { position:relative; width:100%; min-height:112px; padding:16px; display:grid; grid-template-columns:38px minmax(0,1fr) auto; gap:12px; align-items:start; overflow:hidden; text-align:left; border:1px solid var(--border-subtle); border-radius:13px; background:color-mix(in srgb,var(--space-panel) 92%,transparent); color:var(--foreground); cursor:pointer; transition:transform 180ms cubic-bezier(.16,1,.3,1),border-color 180ms cubic-bezier(.16,1,.3,1),background 180ms cubic-bezier(.16,1,.3,1); animation:task-card-enter 220ms cubic-bezier(.16,1,.3,1) both; }
        .task-card:hover { transform:translateY(-1px); border-color:color-mix(in srgb,var(--glow-cool) 30%,transparent); }
        .task-card.is-selected { border-color:color-mix(in srgb,var(--glow-warm) 35%,transparent); background:color-mix(in srgb,var(--glow-warm) 8%,var(--space-panel)); }
        .task-card__icon { width:38px; height:38px; display:grid; place-items:center; border:1px solid var(--border-subtle); border-radius:10px; color:var(--glow-cool); background:color-mix(in srgb,var(--space-surface) 92%,transparent); }
        .task-card.status-running .task-card__icon { color:#7cc79a; }
        .task-card.status-completed .task-card__icon { color:var(--glow-warm); }
        .task-card.status-failed .task-card__icon,.task-card.status-cancelled .task-card__icon { color:var(--error); }
        .task-card__body { min-width:0; display:flex; flex-direction:column; }
        .task-card__meta { display:flex; gap:14px; color:var(--foreground-muted); font:9px "Geist Mono",monospace; }
        .task-card__body > strong { margin-top:7px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:560; }
        .task-card__stage { margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--foreground-muted); font-size:11px; }
        .task-card__progress { height:3px; margin-top:12px; overflow:hidden; border-radius:3px; background:rgba(255,255,255,.05); }
        .task-card__progress i { display:block; height:100%; border-radius:inherit; background:var(--glow-cool); transition:width 220ms cubic-bezier(.16,1,.3,1); }
        .task-card.status-running .task-card__progress i { background:#7cc79a; }
        .task-card.status-completed .task-card__progress i { background:var(--glow-warm); }
        .task-card__status { display:flex; flex-direction:column; align-items:flex-end; gap:8px; color:var(--foreground-muted); font-size:10px; white-space:nowrap; }
        .task-card__status b { color:var(--foreground); font:500 15px "Geist Mono",monospace; }
        .task-detail { position:sticky; top:96px; min-height:364px; padding:18px; border:1px solid var(--border-subtle); border-radius:14px; background:color-mix(in srgb,var(--space-panel) 96%,transparent); }
        .task-detail__head { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--foreground-muted); font:9px "Geist Mono",monospace; }
        .task-detail__signal { display:flex; align-items:center; gap:6px; color:var(--glow-cool); }
        .task-detail__signal.status-running { color:#7cc79a; }
        .task-detail__signal.status-failed,.task-detail__signal.status-cancelled { color:var(--error); }
        .task-detail h3 { margin:18px 0 7px; font-size:18px; font-weight:560; line-height:1.35; }
        .task-detail__stage { min-height:34px; margin:0; color:var(--foreground-muted); font-size:11px; line-height:1.55; }
        .task-detail__progress { margin:18px 0; }
        .task-detail__progress > div { display:flex; justify-content:space-between; color:var(--foreground-muted); font-size:10px; }
        .task-detail__progress strong { color:var(--foreground); font:500 13px "Geist Mono",monospace; }
        .task-detail__progress > span { display:block; height:4px; margin-top:8px; overflow:hidden; border-radius:4px; background:rgba(255,255,255,.05); }
        .task-detail__progress i { display:block; height:100%; background:var(--glow-warm); }
        .task-detail dl { margin:0; padding:12px 0; border-block:1px solid var(--border-subtle); }
        .task-detail dl div { display:flex; justify-content:space-between; gap:18px; padding:5px 0; }
        .task-detail dt { color:var(--foreground-muted); font-size:10px; }
        .task-detail dd { margin:0; display:flex; align-items:center; gap:5px; color:var(--foreground); font-size:10px; text-align:right; }
        .task-detail__prompt { margin-top:14px; }
        .task-detail__prompt > span { color:var(--foreground-muted); font-size:10px; }
        .task-detail__prompt p { max-height:84px; margin:6px 0 0; overflow:auto; color:var(--foreground); font-size:11px; line-height:1.65; }
        .task-detail__failure { margin-top:12px; padding:9px; display:flex; gap:7px; border:1px solid color-mix(in srgb,var(--error) 30%,transparent); border-radius:8px; color:var(--error); font-size:10px; }
        .task-detail__actions { margin-top:18px; display:flex; flex-wrap:wrap; gap:7px; }
        .task-detail__actions button { min-height:34px; padding:0 11px; display:flex; align-items:center; gap:6px; border:1px solid var(--border-subtle); border-radius:8px; background:transparent; color:var(--foreground); font-size:10px; cursor:pointer; transition:border-color 150ms cubic-bezier(.16,1,.3,1),color 150ms cubic-bezier(.16,1,.3,1),transform 150ms cubic-bezier(.16,1,.3,1); }
        .task-detail__actions button:hover { transform:translateY(-1px); border-color:var(--glow-warm); color:var(--glow-warm); }
        .task-detail__actions button.danger:hover { border-color:var(--error); color:var(--error); }
        .task-detail__actions button:disabled { opacity:.45; cursor:wait; transform:none; }
        .task-center__empty,.task-detail__empty { min-height:260px; padding:42px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:1px dashed var(--border-subtle); border-radius:14px; color:var(--foreground-muted); text-align:center; }
        .task-center__empty strong,.task-detail__empty strong { color:var(--foreground); font-size:13px; }
        .task-center__empty span,.task-detail__empty span { max-width:320px; font-size:11px; line-height:1.6; }
        .task-detail__empty { min-height:326px; padding:20px; border:0; }
        .task-center__auth-gate { max-width:1180px; min-height:260px; margin:0 auto; padding:36px; display:flex; align-items:center; justify-content:center; gap:18px; border:1px dashed var(--border-subtle); border-radius:14px; background:color-mix(in srgb,var(--space-panel) 88%,transparent); }
        .task-center__auth-icon { width:48px; height:48px; display:grid; place-items:center; border:1px solid color-mix(in srgb,var(--glow-warm) 20%,transparent); border-radius:12px; color:var(--glow-warm); }
        .task-center__auth-gate strong { font-size:15px; }
        .task-center__auth-gate p { margin:6px 0 0; color:var(--foreground-muted); font-size:11px; }
        .task-center__error { max-width:1180px; margin:0 auto 12px; padding:10px 12px; display:flex; align-items:center; gap:8px; border:1px solid color-mix(in srgb,var(--error) 35%,transparent); color:var(--error); border-radius:9px; font-size:11px; }
        .task-center__error button { margin-left:auto; border:0; background:transparent; color:inherit; cursor:pointer; text-decoration:underline; }
        .task-card--skeleton { display:flex; flex-direction:column; gap:10px; pointer-events:none; }
        .task-card--skeleton span { display:block; height:10px; border-radius:6px; background:rgba(255,255,255,.05); animation:skeleton-breathe 1.4s cubic-bezier(.16,1,.3,1) infinite alternate; }
        .task-card--skeleton span:nth-child(1) { width:28%; }.task-card--skeleton span:nth-child(2) { width:72%; }.task-card--skeleton span:nth-child(3) { width:100%; height:3px; margin-top:18px; }
        @keyframes task-card-enter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes skeleton-breathe { from { opacity:.45; } to { opacity:1; } }
        @media(max-width:900px){.task-center__workspace{grid-template-columns:1fr}.task-detail{position:relative;top:auto}.task-center__telemetry{overflow:auto}.task-center__sync{display:none}}
        @media(max-width:680px){.task-center{padding:92px 18px 60px}.task-center__header{align-items:flex-start;flex-direction:column}.task-center__header-actions{width:100%;justify-content:space-between}.task-center__telemetry{gap:12px}.task-center__telemetry>div{flex-direction:column;gap:2px}.task-center__toolbar{align-items:flex-start;flex-direction:column}.task-card{grid-template-columns:34px minmax(0,1fr)}.task-card__status{grid-column:2;flex-direction:row;justify-content:space-between}.task-center__auth-gate{padding:24px;align-items:flex-start}}
        @media(prefers-reduced-motion:reduce){.task-card,.task-card--skeleton span{animation:none}.task-card,.task-card__progress i,.task-detail__actions button{transition:none}}
        :root[data-reduced-motion="true"] .task-card,:root[data-reduced-motion="true"] .task-card--skeleton span{animation:none}
      `}</style>
    </section>
  );
}
