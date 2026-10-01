"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
  ensureDesktopDevice,
  getConversation,
  getTasks,
  getTask,
  getToken,
  startDesktopHeartbeat,
  taskAction,
  resolveApiBase,
  type LinkedTask,
  ApiRequestError,
} from "@/app/lib/auth";
import { loadMessages } from "@/app/lib/sync";
import QRCodeAccess from "./QRCodeAccess";
import { PluginSlot } from "./plugin-slots/PluginSlot";
import type { AccessMode } from "@/app/lib/entry-flow";
import { createTaskList, type TaskFilter } from "@/app/lib/task-list";
import { useAuth } from "./AuthProvider";
import { StatusGlow } from "./StatusGlow";
import { connectAccountEvents } from "@/app/lib/account-realtime";

type TaskStatus = LinkedTask["status"];
type ConnectionState = "signed-out" | "connecting" | "live" | "fallback";

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "等待服务器调度",
  running: "正在执行",
  paused: "已暂停",
  completed: "已完成",
  failed: "执行失败",
  cancelled: "已取消",
};

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "活跃" },
  { key: "queued", label: "待调度" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "异常" },
  { key: "archive", label: "历史归档" },
];

function isActiveTask(task: LinkedTask) {
  return task.status === "queued" || task.status === "running" || task.status === "paused";
}

function displayStage(task: LinkedTask) {
  return task.status === "completed" ? "执行流程已结束" : task.stage || String(task.input?.prompt || "等待补充执行信息");
}

function linkedConversationId(task: LinkedTask) {
  const value = task.input?.conversationId;
  return task.kind === "video.generate" && typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : null;
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

type Props = { accessMode?: AccessMode; onAuthRequired?: () => void; focusTask?: { id: string; revision: number } | null; onOpenConversation?: (id: string) => void };
export default function TaskCenter(props: Props) {
  const { user } = useAuth();
  return <TaskCenterView key={`${user?.id ?? "guest"}:${props.accessMode}`} {...props} />;
}

function TaskCenterView({ accessMode = "authenticated", onAuthRequired, focusTask, onOpenConversation }: Props) {
  const authenticated = accessMode === "authenticated" && Boolean(getToken());
  const list = useMemo(() => createTaskList(getTasks), []);
  const { tasks, total: totalTasks, filter, nextCursor, loading: listBusy, error: loadError } = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
  const loading = listBusy && tasks.length === 0;
  const [connection, setConnection] = useState<ConnectionState>(
    authenticated ? "connecting" : "signed-out"
  );
  const [selectedId, setSelectedId] = useState("");
  const [focusedRecord, setFocusedRecord] = useState<LinkedTask | null>(null);
  const [actionError, setActionError] = useState("");
  const error = actionError || loadError;
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!authenticated || !focusTask) return;
    let cancelled = false;
    const token = getToken();
    setActionError(""); setSelectedId(focusTask.id); setFocusedRecord(null);
    void list.setFilter("all");
    void getTask(focusTask.id).then(({ task }) => {
      if (!cancelled && getToken() === token) { setFocusedRecord(task); list.applyTask(task); }
    }).catch(error => { if (!cancelled && getToken() === token) setActionError(error instanceof Error ? error.message : "无法读取通知关联任务"); });
    return () => { cancelled = true; };
  }, [authenticated, focusTask, list]);

  useEffect(() => {
    if (!authenticated) return;
    const token = getToken();
    if (!token) return;

    void list.connect();
    const fallback = window.setInterval(() => void list.refresh(), 15000);
    const stopHeartbeat = startDesktopHeartbeat(20);
    let disposed = false;
    const stopRealtime = connectAccountEvents({
      url: async () => {
        const backendUrl = new URL(resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location));
        const protocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
        const { device } = await ensureDesktopDevice();
        return `${protocol}//${backendUrl.host}/ws/desktop?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(device.id)}`;
      },
      current: () => !disposed && getToken() === token,
      retryOnError: error => !(error instanceof ApiRequestError && [401, 403].includes(error.status)),
      onStatus: live => setConnection(live ? "live" : "fallback"),
      onMessage: message => {
        if (message.type === "connection.ready") void list.refresh();
        const payload = message.payload as { task?: LinkedTask } | undefined;
        if (message.type === "task.updated" && payload?.task) list.applyTask(payload.task);
      },
    });

    return () => {
      list.close();
      window.clearInterval(fallback);
      stopHeartbeat();
      disposed = true;
      stopRealtime();
    };
  }, [authenticated, list]);

  const counts = useMemo(() => ({
    active: tasks.filter(isActiveTask).length,
    queued: tasks.filter((task) => task.status === "queued").length,
    mobile: tasks.filter((task) => task.origin === "mobile").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  }), [tasks]);

  const filteredTasks = tasks;
  const selectedTask = filteredTasks.find((task) => task.id === selectedId)
    || (focusedRecord?.id === selectedId ? focusedRecord : null)
    || (selectedId === focusTask?.id ? null : filteredTasks[0])
    || null;

  async function run(id: string, action: "pause" | "resume" | "cancel" | "retry") {
    setBusyId(id);
    setActionError("");
    try {
      const result = await taskAction(id, action);
      list.applyTask(result.task);
      setFocusedRecord(previous => previous?.id === id ? result.task : previous);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusyId("");
    }
  }

  async function openConversation(task: LinkedTask) {
    const id = linkedConversationId(task);
    const token = getToken();
    if (!id || !token || !onOpenConversation) return;
    setBusyId(task.id);
    setActionError("");
    try {
      const result = await getConversation(id);
      if (getToken() !== token) return;
      if (result.conversation?.mode !== "coze") {
        setActionError("关联会话不是 Coze 创作对话，已保留当前任务记录。");
        return;
      }
      onOpenConversation(id);
    } catch (cause) {
      if (getToken() !== token) return;
      if (cause instanceof ApiRequestError && cause.status === 404 && loadMessages(id).length) {
        onOpenConversation(id);
      } else {
        setActionError(cause instanceof ApiRequestError && cause.status === 404
          ? "关联对话已删除或尚未同步；任务记录仍可查看。"
          : cause instanceof Error ? cause.message : "暂时无法核对关联对话，请稍后重试。");
      }
    } finally {
      if (getToken() === token) setBusyId("");
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
      {/* 插件槽位：taskCenter.detailActions（additive，Mock 阶段无贡献时不渲染） */}
      <PluginSlot slot="taskCenter.detailActions" contributions={[]} projectId="project-a" />
      <header className="task-center__header">
        <div className="task-center__title-block">
          <div className="task-center__eyebrow"><Radio size={13} strokeWidth={1.7} /> 任务联动</div>
          <h2 className="page-title">任务中心</h2>
          <p>服务器负责可靠执行，桌面与手机都可实时观察、暂停、取消或重新排队。</p>
        </div>
        <div className="task-center__header-actions">
          <span className={`task-center__live is-${connection}`}>
            {connection === "live" ? <Wifi size={14} strokeWidth={1.7} /> : <WifiOff size={14} strokeWidth={1.7} />}
            <span>{connectionLabel}</span>
          </span>
          <QRCodeAccess disabled={!authenticated} />
        </div>
      </header>

      <div className="task-center__telemetry" aria-label="当前已加载任务状态概览">
        <div><span>活跃</span><strong>{counts.active}</strong></div>
        <i />
        <div><span>待调度</span><strong>{counts.queued}</strong></div>
        <i />
        <div><span>手机发起</span><strong>{counts.mobile}</strong></div>
        <i />
        <div><span>已完成</span><strong>{counts.completed}</strong></div>
        <span className="task-center__sync"><Link2 size={13} strokeWidth={1.7} /> 当前已加载 · 15 秒自动校准</span>
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
                    setSelectedId("");
                    setActionError("");
                    void list.setFilter(item.key);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" disabled={listBusy} className="task-center__refresh" onClick={() => void list.refresh()}>
              <RotateCcw size={13} strokeWidth={1.7} /> 校准状态
            </button>
          </div>

          {error && (
            <div className="task-center__error" role="status">
              <TriangleAlert size={15} strokeWidth={1.7} />
              <span>{error}</span>
              <button type="button" disabled={!actionError && listBusy} onClick={() => {
                if (actionError) setActionError("");
                else void list.refresh();
              }}>{actionError ? "关闭提示" : "刷新列表"}</button>
            </div>
          )}

          <div className="task-center__workspace">
            <div className="task-center__list" aria-busy={listBusy}>
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
                  onClick={() => { setSelectedId(task.id); setActionError(""); }}
                >
                  <span className="task-card__icon"><StatusGlow value={task.status} success={task.status === "completed"}>{statusIcon(task.status)}</StatusGlow></span>
                  <span className="task-card__body">
                    <span className="task-card__meta">
                      <span>{task.origin === "mobile" ? "手机远程" : task.origin === "migration" ? "历史迁移" : "桌面"}</span>
                      <span>{formatTime(task.updatedAt)}</span>
                    </span>
                    <strong>{task.title}</strong>
                    <span className="task-card__stage">{displayStage(task)}</span>
                    <span className="task-card__progress" aria-label={`进度 ${task.progress}%`}>
                      <i style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }} />
                    </span>
                  </span>
                  <span className="task-card__status">{STATUS_LABEL[task.status]}<b>{task.progress}%</b></span>
                </button>
              ))}

              {!loading && nextCursor && (
                <button
                  type="button"
                  className="task-center__loadmore"
                  disabled={listBusy}
                  onClick={() => void list.loadMore()}
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
                  <p className="task-detail__stage">{displayStage(selectedTask)}</p>

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
                    {linkedConversationId(selectedTask) && onOpenConversation && (
                      <button type="button" disabled={Boolean(busyId)} onClick={() => void openConversation(selectedTask)}>
                        返回创作对话
                      </button>
                    )}
                    {selectedTask.status === "queued" && (
                      <span className="task-detail__auto-run">服务器自动执行</span>
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
        .task-center__eyebrow { display:flex; align-items:center; gap:7px; color:var(--glow-cool); font: var(--weight-semibold) var(--text-caption-size)/var(--text-caption-line) var(--font-ui); letter-spacing:.1em; }
        .task-center h2 { margin:8px 0 6px; font:480 clamp(30px,3.4vw,42px)/1.15 var(--font-display), var(--font-geist-sans), sans-serif; letter-spacing:-.04em; }
        .task-center__header p { margin:0; color: var(--text-muted); font-size: var(--text-label-size); line-height: var(--text-label-line); }
        .task-center__header-actions { display:flex; align-items:center; gap:9px; }
        .task-center__live { display:flex; align-items:center; gap:7px; min-height:38px; padding:0 12px; border:1px solid var(--border-subtle); border-radius: var(--shape-control); background:color-mix(in srgb,var(--space-panel) 92%,transparent); color: var(--text-muted); font-size: var(--text-caption-size); white-space:nowrap; line-height: var(--text-caption-line); }
        .task-center__live.is-live { color:var(--glow-success); border-color:color-mix(in srgb,var(--glow-success) 30%,transparent); }
        .task-center__live.is-connecting { color:var(--glow-warm); }
        .task-center__telemetry { max-width:1180px; min-height:52px; margin:0 auto 16px; padding:0 16px; display:flex; align-items:center; gap:18px; border:1px solid var(--border-subtle); border-radius: var(--shape-control); background:color-mix(in srgb,var(--space-panel) 92%,transparent); }
        .task-center__telemetry > div { display:flex; align-items:baseline; gap:8px; }
        .task-center__telemetry span { color: var(--text-muted); font-size: var(--text-caption-size); letter-spacing:.04em; line-height: var(--text-caption-line); }
        .task-center__telemetry strong { color:var(--foreground); font: var(--weight-semibold) var(--text-heading-size)/var(--text-heading-line) var(--font-code); }
        .task-center__telemetry > i { width:1px; height:18px; background:var(--border-subtle); }
        .task-center__sync { margin-left:auto; display:flex; align-items:center; gap:6px; }
        .task-center__toolbar { max-width:1180px; margin:0 auto 14px; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .task-center__filters { display:flex; flex-wrap:wrap; gap:6px; }
        .task-center__filters button,.task-center__refresh { min-height:34px; padding:0 12px; display:inline-flex; align-items:center; gap:6px; border:1px solid transparent; border-radius: var(--shape-control); background:transparent; color: var(--text-muted); font-size: var(--text-label-size); cursor:pointer; transition:color 160ms cubic-bezier(.16,1,.3,1),border-color 160ms cubic-bezier(.16,1,.3,1),background 160ms cubic-bezier(.16,1,.3,1); line-height: var(--text-label-line); }
        .task-center__loadmore { min-height:38px; margin-top:10px; display:flex; align-items:center; justify-content:center; border:1px dashed var(--border-subtle); border-radius: var(--shape-control); background:transparent; color: var(--text-muted); font-size: var(--text-caption-size); cursor:pointer; transition:color 160ms cubic-bezier(.16,1,.3,1),border-color 160ms cubic-bezier(.16,1,.3,1); line-height: var(--text-caption-line); }
        .task-center__loadmore:hover { color:var(--foreground); border-color:color-mix(in srgb,var(--glow-cool) 35%,transparent); }
        .task-center__filters button:hover,.task-center__refresh:hover { color:var(--foreground); border-color:var(--border-subtle); }
        .task-center__filters button.is-active { color:var(--glow-warm); border-color:color-mix(in srgb,var(--glow-warm) 30%,transparent); background:color-mix(in srgb,var(--glow-warm) 8%,transparent); }
        .task-center__workspace { max-width:1180px; margin:0 auto; display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:14px; align-items:start; }
        .task-center__list { display:flex; flex-direction:column; gap:9px; min-width:0; }
        .task-card { position:relative; width:100%; min-height:112px; padding:16px; display:grid; grid-template-columns:38px minmax(0,1fr) auto; gap:12px; align-items:start; overflow:hidden; text-align:left; border:1px solid var(--border-subtle); border-radius: var(--shape-control); background:color-mix(in srgb,var(--space-panel) 92%,transparent); color:var(--foreground); cursor:pointer; transition:transform 180ms cubic-bezier(.16,1,.3,1),border-color 180ms cubic-bezier(.16,1,.3,1),background 180ms cubic-bezier(.16,1,.3,1); animation:task-card-enter 220ms cubic-bezier(.16,1,.3,1) both; }
        .task-card:hover { transform:translateY(-1px); border-color:color-mix(in srgb,var(--glow-cool) 30%,transparent); }
        .task-card.is-selected { border-color:color-mix(in srgb,var(--glow-warm) 35%,transparent); background:color-mix(in srgb,var(--glow-warm) 8%,var(--space-panel)); }
        .task-card__icon { width:38px; height:38px; display:grid; place-items:center; border:1px solid var(--border-subtle); border-radius: var(--shape-control); color:var(--glow-cool); background:color-mix(in srgb,var(--space-surface) 92%,transparent); }
        .task-card.status-running .task-card__icon { color:var(--glow-success); }
        .task-card.status-completed .task-card__icon { color:var(--glow-warm); }
        .task-card.status-failed .task-card__icon,.task-card.status-cancelled .task-card__icon { color:var(--error); }
        .task-card__body { min-width:0; display:flex; flex-direction:column; }
        .task-card__meta { display:flex; flex-wrap:wrap; gap:4px 14px; color:var(--foreground-muted); font: var(--weight-regular) var(--text-caption-size)/var(--text-caption-line) var(--font-code); }
        .task-card__body > strong { margin-top:7px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: var(--text-body-size); font-weight: var(--weight-medium); line-height: var(--text-body-line); }
        .task-card__stage { margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color: var(--text-muted); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-card__progress { height:3px; margin-top:12px; overflow:hidden; border-radius: 50%; background:rgba(255,255,255,.05); }
        .task-card__progress i { display:block; height:100%; border-radius:inherit; background:var(--glow-cool); transition:width 220ms cubic-bezier(.16,1,.3,1); }
        .task-card.status-running .task-card__progress i { background:var(--glow-success); }
        .task-card.status-completed .task-card__progress i { background:var(--glow-warm); }
        .task-card__status { display:flex; flex-direction:column; align-items:flex-end; gap:8px; color: var(--text-muted); font-size: var(--text-caption-size); white-space:nowrap; line-height: var(--text-caption-line); }
        .task-card__status b { color:var(--foreground); font: var(--weight-medium) var(--text-body-size)/var(--text-body-line) var(--font-code); }
        .task-detail { position:sticky; top:96px; min-height:364px; padding:18px; border:1px solid var(--border-subtle); border-radius: var(--shape-card); background:color-mix(in srgb,var(--space-panel) 96%,transparent); }
        .task-detail__head { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--foreground-muted); font: var(--weight-regular) var(--text-caption-size)/var(--text-caption-line) var(--font-code); }
        .task-detail__signal { display:flex; align-items:center; gap:6px; color:var(--glow-cool); }
        .task-detail__signal.status-running { color:var(--glow-success); }
        .task-detail__signal.status-failed,.task-detail__signal.status-cancelled { color:var(--error); }
        .task-detail h3 { margin:18px 0 7px; font-size: var(--text-heading-size); font-weight: var(--weight-medium); line-height: var(--text-heading-line); }
        .task-detail__stage { min-height:34px; margin:0; color: var(--text-muted); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-detail__progress { margin:18px 0; }
        .task-detail__progress > div { display:flex; justify-content:space-between; color: var(--text-muted); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-detail__progress strong { color:var(--foreground); font: var(--weight-medium) var(--text-label-size)/var(--text-label-line) var(--font-code); }
        .task-detail__progress > span { display:block; height:4px; margin-top:8px; overflow:hidden; border-radius: var(--shape-control); background:rgba(255,255,255,.05); }
        .task-detail__progress i { display:block; height:100%; background:var(--glow-warm); }
        .task-detail dl { margin:0; padding:12px 0; border-block:1px solid var(--border-subtle); }
        .task-detail dl div { display:flex; justify-content:space-between; gap:18px; padding:5px 0; }
        .task-detail dt { flex-shrink:0; color: var(--text-muted); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-detail dd { min-width:0; margin:0; display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:5px; color:var(--foreground); font-size: var(--text-caption-size); text-align:right; overflow-wrap:anywhere; line-height: var(--text-caption-line); }
        .task-detail__prompt { margin-top:14px; }
        .task-detail__prompt > span { color: var(--text-muted); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-detail__prompt p { max-height:84px; margin:6px 0 0; overflow:auto; color:var(--foreground); font-size: var(--text-label-size); line-height: var(--text-label-line); overflow-wrap:anywhere; }
        .task-detail__failure { margin-top:12px; padding:9px; display:flex; gap:7px; border:1px solid color-mix(in srgb,var(--error) 30%,transparent); border-radius: var(--shape-control); color:var(--error); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-detail__actions { margin-top:18px; display:flex; flex-wrap:wrap; gap:7px; }
        .task-detail__actions button { min-height:34px; padding:0 11px; display:flex; align-items:center; gap:6px; border:1px solid var(--border-subtle); border-radius: var(--shape-control); background:transparent; color:var(--foreground); font-size: var(--text-label-size); cursor:pointer; transition:border-color 150ms cubic-bezier(.16,1,.3,1),color 150ms cubic-bezier(.16,1,.3,1),transform 150ms cubic-bezier(.16,1,.3,1); line-height: var(--text-label-line); }
        .task-detail__actions button:hover { transform:translateY(-1px); border-color:var(--glow-warm); color:var(--glow-warm); }
        .task-detail__actions button.danger:hover { border-color:var(--error); color:var(--error); }
        .task-card:focus-visible,.task-detail__actions button:focus-visible { outline:2px solid var(--glow-warm); outline-offset:2px; }
        .task-detail__actions button:disabled { opacity:.45; cursor:wait; transform:none; }
        .task-center__empty,.task-detail__empty { min-height:260px; padding:42px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:1px dashed var(--border-subtle); border-radius: var(--shape-card); color:var(--foreground-muted); text-align:center; }
        .task-center__empty strong,.task-detail__empty strong { color:var(--foreground); font-size: var(--text-label-size); line-height: var(--text-label-line); }
        .task-center__empty span,.task-detail__empty span { max-width:320px; font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-detail__empty { min-height:326px; padding:20px; border:0; }
        .task-center__auth-gate { max-width:1180px; min-height:260px; margin:0 auto; padding:36px; display:flex; align-items:center; justify-content:center; gap:18px; border:1px dashed var(--border-subtle); border-radius: var(--shape-card); background:color-mix(in srgb,var(--space-panel) 88%,transparent); }
        .task-center__auth-icon { width:48px; height:48px; display:grid; place-items:center; border:1px solid color-mix(in srgb,var(--glow-warm) 20%,transparent); border-radius: var(--shape-control); color:var(--glow-warm); }
        .task-center__auth-gate strong { font-size: var(--text-body-size); line-height: var(--text-body-line); }
        .task-center__auth-gate p { margin:6px 0 0; color: var(--text-muted); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-center__error { max-width:1180px; margin:0 auto 12px; padding:10px 12px; display:flex; align-items:center; gap:8px; border:1px solid color-mix(in srgb,var(--error) 35%,transparent); color:var(--error); border-radius: var(--shape-control); font-size: var(--text-caption-size); line-height: var(--text-caption-line); }
        .task-center__error button { margin-left:auto; border:0; background:transparent; color:inherit; cursor:pointer; text-decoration:underline; }
        .task-card--skeleton { display:flex; flex-direction:column; gap:10px; pointer-events:none; }
        .task-card--skeleton span { display:block; height:10px; border-radius: var(--shape-control); background:rgba(255,255,255,.05); animation:skeleton-breathe 1.4s cubic-bezier(.16,1,.3,1) infinite alternate; }
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
