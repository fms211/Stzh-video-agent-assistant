"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { motion } from "motion/react";
import { LogIn, UserRound } from "lucide-react";
import type { AccessMode } from "@/app/lib/entry-flow";
import { getToken, resolveApiBase } from "@/app/lib/auth";
import { captureNotificationClient, createNotificationFeed, notificationTaskId } from "@/app/lib/notification-client";
import { connectAccountEvents } from "@/app/lib/account-realtime";
import { useAuth } from "./AuthProvider";
import { fetchWeather, getWeatherIcon, getWeatherMood, getWeatherGlowColor, type WeatherData } from "@/app/lib/weather";
import {
  Film,
  BarChart3,
  Palette,
  Bell,
  Check,
  X,
  Info,
  ListTodo,
  SlidersHorizontal,
} from "lucide-react";

export type Page = "studio" | "modelCenter" | "tasks" | "stats" | "gallery";
export type WorkspacePage = Page;

const PAGE_TABS: { key: Page; label: string; icon: ReactNode }[] = [
  { key: "studio", label: "创意工坊", icon: <Film size={15} strokeWidth={1.8} /> },
  { key: "modelCenter", label: "模型与角色", icon: <SlidersHorizontal size={15} strokeWidth={1.8} /> },
  { key: "tasks", label: "任务中心", icon: <ListTodo size={15} strokeWidth={1.8} /> },
  { key: "stats", label: "工作统计", icon: <BarChart3 size={15} strokeWidth={1.8} /> },
  { key: "gallery", label: "创作画廊", icon: <Palette size={15} strokeWidth={1.8} /> },
];

type Notification = {
  id: string;
  title: string;
  message: string;
  time: Date;
  read: boolean;
  type: "success" | "error" | "info";
};

function normalizeNotification(value: unknown): Notification | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.message !== "string") return null;
  const sourceTime = row.time ?? row.created_at;
  const timestamp = typeof sourceTime === "number" && sourceTime < 10_000_000_000
    ? sourceTime * 1000
    : sourceTime as string | number;
  const time = new Date(typeof timestamp === "string" || typeof timestamp === "number" ? timestamp : NaN);
  const type = ["success", "error", "info"].includes(String(row.type))
    ? row.type as Notification["type"]
    : "info";
  return { id: row.id, title: row.title, message: row.message, time, read: row.read === true || row.read === 1, type };
}

type Props = {
  onOpenTask?: (id: string) => void;
  page: Page;
  onPageChange: (page: Page) => void;
  locked?: boolean;
  accessMode?: AccessMode | null;
  showBrandCore?: boolean;
  onAuthOpen?: () => void;
  reducedMotion?: boolean;
};

// 弹簧物理参数
const SPRING = {
  stiffness: 100,
  damping: 12,
  mass: 1,
  precision: 0.001,
};

// 弹簧插值器
class SpringValue {
  current: number;
  target: number;
  velocity: number;

  constructor(initial: number) {
    this.current = initial;
    this.target = initial;
    this.velocity = 0;
  }

  setTarget(target: number) {
    this.target = target;
  }

  update(dt: number): boolean {
    const displacement = this.current - this.target;
    const springForce = -SPRING.stiffness * displacement;
    const dampingForce = -SPRING.damping * this.velocity;
    const acceleration = (springForce + dampingForce) / SPRING.mass;

    this.velocity += acceleration * dt;
    this.current += this.velocity * dt;

    if (Math.abs(displacement) < SPRING.precision && Math.abs(this.velocity) < SPRING.precision) {
      this.current = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}

const WINDOW_SIZE = PAGE_TABS.length; // 五个页面始终可达，无需滚轮发现隐藏入口。

export default function NavigationBar({
  onOpenTask,
  page,
  onPageChange,
  locked = false,
  accessMode = null,
  showBrandCore = true,
  onAuthOpen,
  reducedMotion = false,
}: Props) {
  const { user, verification, notice } = useAuth();
  const [hovered, setHovered] = useState<Page | null>(null);
  const [scrollPulse, setScrollPulse] = useState<Page | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(0);

  // Text enlargement may wrap navigation labels; reserve the rendered height.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--workspace-nav-clearance");
    const update = () => root.style.setProperty("--workspace-nav-clearance", `${Math.max(86, Math.ceil(nav.getBoundingClientRect().bottom) + 8)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      if (previous) root.style.setProperty("--workspace-nav-clearance", previous);
      else root.style.removeProperty("--workspace-nav-clearance");
    };
  }, []);

  // 滑动窗口偏移（0 = 显示前4个, 1 = 显示后4个）
  const [windowStart, setWindowStart] = useState(0);

  // 时间状态
  const [time, setTime] = useState<string>("--:--");
  const [date, setDate] = useState<string>("");

  // 天气状态
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherIcon, setWeatherIcon] = useState<string>("🌤️");
  const [glowColor, setGlowColor] = useState<string>("var(--glow-warm)");

  // 通知状态
  const notificationOwner = user ? `user:${user.id}` : "guest";
  const [notificationState, setNotificationState] = useState({ owner: notificationOwner, rows: [] as Notification[], busy: false, loading: true, error: "" });
  const notificationFeed = useRef<ReturnType<typeof createNotificationFeed> | null>(null);
  const notificationScopeCurrent = notificationState.owner === notificationOwner && Boolean(notificationFeed.current?.current());
  const notifications = notificationScopeCurrent ? notificationState.rows : [];
  const notificationError = notificationScopeCurrent ? notificationState.error : "";
  const notificationBusy = notificationScopeCurrent && notificationState.busy;
  const notificationLoading = !notificationScopeCurrent || notificationState.loading;
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationSessionRevision, setNotificationSessionRevision] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // 按钮弹簧动画
  const buttonSprings = useRef<Map<string, SpringValue>>(new Map());
  const [buttonStates, setButtonStates] = useState<Map<string, { scale: number; glow: number }>>(new Map());

  // 初始化按钮弹簧
  const getButtonSpring = useCallback((key: string) => {
    if (!buttonSprings.current.has(key)) {
      buttonSprings.current.set(key, new SpringValue(1));
    }
    return buttonSprings.current.get(key)!;
  }, []);

  // 动画循环（reducedMotion 时跳过 RAF，直接落到目标值）
  useEffect(() => {
    if (reducedMotion) return;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      let needsUpdate = false;

      // 更新按钮弹簧
      const newStates = new Map<string, { scale: number; glow: number }>();
      buttonSprings.current.forEach((spring, key) => {
        if (spring.update(dt)) {
          needsUpdate = true;
        }
        newStates.set(key, {
          scale: spring.current,
          glow: Math.max(0, (spring.current - 1) * 10),
        });
      });

      if (needsUpdate) {
        setButtonStates(new Map(newStates));
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reducedMotion]);

  // 按钮鼠标事件
  const handleButtonEnter = useCallback((key: Page) => {
    setHovered(key);
    const spring = getButtonSpring(key);
    if (reducedMotion) { setButtonStates((m) => new Map(m).set(key, { scale: 1.08, glow: 0.8 })); return; }
    spring.setTarget(1.08);
    spring.velocity = 2;
  }, [getButtonSpring, reducedMotion]);

  const handleButtonLeave = useCallback((key: Page) => {
    setHovered(null);
    const spring = getButtonSpring(key);
    if (reducedMotion) { setButtonStates((m) => new Map(m).set(key, { scale: 1, glow: 0 })); return; }
    spring.setTarget(1);
  }, [getButtonSpring, reducedMotion]);

  const handleButtonDown = useCallback((key: Page) => {
    const spring = getButtonSpring(key);
    if (reducedMotion) { setButtonStates((m) => new Map(m).set(key, { scale: 0.92, glow: 0 })); return; }
    spring.setTarget(0.92);
    spring.velocity = -3;
  }, [getButtonSpring, reducedMotion]);

  const handleButtonUp = useCallback((key: Page) => {
    const spring = getButtonSpring(key);
    if (reducedMotion) { setButtonStates((m) => new Map(m).set(key, { scale: 1, glow: 0 })); return; }
    spring.setTarget(1.05);
    spring.velocity = 5;
  }, [getButtonSpring, reducedMotion]);

  // 实时时钟
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      setDate(now.toLocaleDateString("zh-CN", { month: "short", day: "numeric", weekday: "short" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取天气；缺失配置和离线状态不显示伪造温度。
  useEffect(() => {
    let disposed = false;
    const loadWeather = async () => {
      const data = await fetchWeather();
      if (disposed) return;
      setWeather(data);
      setWeatherLoading(false);
      if (data) {
        setWeatherIcon(getWeatherIcon(data.icon));
        const mood = getWeatherMood(data.icon);
        setGlowColor(getWeatherGlowColor(mood));
      }
    };
    loadWeather();
    const timer = setInterval(loadWeather, 30 * 60 * 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const changed = () => setNotificationSessionRevision(value => value + 1);
    window.addEventListener("tszh_data_owner_changed", changed);
    return () => window.removeEventListener("tszh_data_owner_changed", changed);
  }, []);

  // 读取通知
  useEffect(() => {
    const client = captureNotificationClient();
    const feed = createNotificationFeed(client, state => setNotificationState({ ...state, owner: client.owner, rows: state.rows.map(normalizeNotification).filter((item): item is Notification => Boolean(item)) }));
    notificationFeed.current = feed;
    feed.start();
    const handleNewNotif = () => { void feed.refresh(); };
    window.addEventListener("tszh_notification_added", handleNewNotif);
    const fallback = window.setInterval(handleNewNotif, 30000);

    // WS 实时推送：服务端 notification.created 时触发本地刷新（登录才建连）
    let stopRealtime: (() => void) | undefined;
    const token = getToken();
    if (token) {
      try {
        const backendUrl = new URL(resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location));
        const protocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
        stopRealtime = connectAccountEvents({
          url: `${protocol}//${backendUrl.host}/ws/desktop?token=${encodeURIComponent(token)}`,
          current: client.current,
          onMessage: message => { if (message.type === "notification.created" || message.type === "connection.ready") handleNewNotif(); },
        });
      } catch {}
    }

    return () => {
      window.removeEventListener("tszh_notification_added", handleNewNotif);
      window.clearInterval(fallback);
      feed.dispose(); notificationFeed.current = null;
      stopRealtime?.();
    };
  }, [notificationOwner, notificationSessionRevision]);

  // Non-modal notification popover: focus enters it; Escape returns to its trigger.
  useEffect(() => {
    if (!showNotifications) return;
    const handleOutside = (event: MouseEvent | FocusEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifications(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setShowNotifications(false);
      if (notifButtonRef.current?.isConnected) notifButtonRef.current.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleKey);
    notifPanelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showNotifications]);

  // 标记全部已读
  const markAllRead = () => {
    void notificationFeed.current?.mutate("read");
  };

  // 清空通知
  const clearNotifications = () => {
    void notificationFeed.current?.mutate("clear");
  };

  // 格式化时间
  const formatNotifTime = (date: Date) => {
    if (!Number.isFinite(date.getTime())) return "时间未知";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return date.toLocaleDateString("zh-CN");
  };

  // 滚轮：每次滑一格，旋转木马式连续转动
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const maxWindowStart = PAGE_TABS.length - WINDOW_SIZE; // 1

    const handleWheel = (e: WheelEvent) => {
      if (locked) return;
      const currentIndex = PAGE_TABS.findIndex((t) => t.key === page);

      // 仅当滚轮方向还能有效切页时才拦截，否则放行页面滚动
      const canNext = e.deltaY > 0 && currentIndex < PAGE_TABS.length - 1;
      const canPrev = e.deltaY < 0 && currentIndex > 0;
      if (!canNext && !canPrev) return;

      e.preventDefault();

      if (canNext) {
        const nextIndex = currentIndex + 1;
        onPageChange(PAGE_TABS[nextIndex].key);
        setScrollPulse(PAGE_TABS[nextIndex].key);
        // 窗口跟随：确保新页面在可视范围内
        if (nextIndex >= windowStart + WINDOW_SIZE) {
          setWindowStart(Math.min(nextIndex - WINDOW_SIZE + 1, maxWindowStart));
        }
      } else {
        const prevIndex = currentIndex - 1;
        onPageChange(PAGE_TABS[prevIndex].key);
        setScrollPulse(PAGE_TABS[prevIndex].key);
        // 窗口跟随：确保新页面在可视范围内
        if (prevIndex < windowStart) {
          setWindowStart(Math.max(prevIndex, 0));
        }
      }

      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setScrollPulse(null), 500);
    };

    nav.addEventListener("wheel", handleWheel, { passive: false });
    return () => nav.removeEventListener("wheel", handleWheel);
  }, [page, onPageChange, windowStart, locked]);

  // 点击标签：切页面 + 窗口平滑跟随
  const handleTabClick = useCallback((key: Page) => {
    onPageChange(key);
    const idx = PAGE_TABS.findIndex((t) => t.key === key);
    if (idx < windowStart) {
      setWindowStart(idx);
    } else if (idx >= windowStart + WINDOW_SIZE) {
      setWindowStart(idx - WINDOW_SIZE + 1);
    }
  }, [onPageChange, windowStart]);

  useEffect(() => {
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, []);

  // 计算左右区域的偏移量（缩短时靠拢中间）
  const sideOffset = 0;

  return (
    <>
      <nav
        ref={navRef}
        className={`nav-bar ${locked ? "collapsed is-locked" : "expanded"}`}
        style={{ "--weather-glow": glowColor } as React.CSSProperties}
        aria-label="主导航"
      >
        <div className="nav-bar-inner">
          {/* 品牌恒星标记（与 splash 共享 layoutId 动画） */}
          <div className="nav-brand-core">
            {showBrandCore ? (
              <motion.span
                layoutId="brand-core"
                className="product-nav__core"
                transition={{ type: "spring", stiffness: 180, damping: 24 }}
              >
                <i />
              </motion.span>
            ) : <span className="product-nav__core-placeholder" />}
          </div>

          {/* 左侧：时间 + 天气 */}
          <div
            className="nav-info-left"
            style={{
              transform: `translateX(${sideOffset}%)`,
              opacity: locked ? 0.3 : 1,
              width: locked ? 0 : "auto",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <div className="nav-time-block pixel-corners">
              <span className="nav-time">{time}</span>
              <span className="nav-date">{date}</span>
            </div>
            {weather ? (
              <div className="nav-weather-block pixel-corners">
                <span className="nav-weather-icon">{weatherIcon}</span>
                <div className="nav-weather-info">
                  <span className="nav-weather-temp">{weather.temp}°</span>
                  <span className="nav-weather-text">{weather.text}</span>
                </div>
              </div>
            ) : (
              <div className="nav-weather-block" title={weatherLoading ? "正在读取天气" : "天气暂不可用"}>
                <span className="nav-weather-text">{weatherLoading ? "天气加载中…" : "天气暂不可用"}</span>
              </div>
            )}
          </div>

          {/* 中间：页面切换按钮 — 旋转木马式连续滑动 */}
          <div
            className="nav-tabs-viewport"
            style={{
              "--label-w": locked ? "0px" : "100px",
              "--tab-gap": "4px",
            } as React.CSSProperties}
          >
            <div
              className="nav-tabs-track"
              style={{ transform: `translateX(-${windowStart * 100 / WINDOW_SIZE}%)` }}
            >
              {PAGE_TABS.map((tab) => {
                const state = buttonStates.get(tab.key) || { scale: 1, glow: 0 };
                const isActive = page === tab.key;
                const isHovered = hovered === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`nav-tab ${isActive ? "active" : ""} ${isHovered ? "hovered" : ""} ${scrollPulse === tab.key ? "pulse" : ""}`}
                    style={{
                      transform: `scale(${state.scale})`,
                      boxShadow: isHovered || isActive
                        ? `0 ${4 * state.scale}px ${12 * state.scale}px rgba(0,0,0,0.3), 0 0 ${20 + state.glow * 2}px color-mix(in srgb, var(--glow-warm) ${15 + state.glow}%, transparent)`
                        : undefined,
                    }}
                    disabled={locked}
                    onClick={() => handleTabClick(tab.key)}
                    onMouseEnter={() => handleButtonEnter(tab.key)}
                    onMouseLeave={() => handleButtonLeave(tab.key)}
                    onMouseDown={() => handleButtonDown(tab.key)}
                    onMouseUp={() => handleButtonUp(tab.key)}
                    aria-label={tab.label}
                    aria-current={isActive ? "page" : undefined}
                    title={tab.label}
                  >
                    <span className="nav-tab-icon">{tab.icon}</span>
                    <span
                      className="nav-tab-label"
                      style={{
                        maxWidth: locked ? 0 : "none",
                        opacity: locked ? 0 : 1,
                        marginLeft: locked ? 0 : 4,
                      }}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右侧：通知 */}
          <div
            className="nav-info-right"
            ref={notifRef}
            style={{
              transform: `translateX(-${sideOffset}%)`,
              opacity: locked ? 0.3 : 1,
              width: "auto",
              minWidth: "fit-content",
              overflow: showNotifications ? "visible" : "hidden",
              pointerEvents: "auto",
            }}
          >
            {!locked && accessMode === "guest" && (
              <button
                type="button"
                className="nav-login-btn"
                onClick={onAuthOpen}
                aria-label="登录"
              >
                <LogIn size={13} strokeWidth={1.8} /> 登录
              </button>
            )}
            {!locked && accessMode === "authenticated" && user && (
              <button type="button" className="nav-user-chip" title={notice || user.displayName || user.username} aria-label={notice ? `管理账户：${notice}` : "管理账户"} onClick={onAuthOpen}>
                <UserRound size={13} aria-hidden="true" /><span className="nav-user-name">{user.displayName || user.username}</span>
                {(notice || verification !== "verified") && <span className="nav-user-status" aria-hidden="true" />}
              </button>
            )}

            <button
              type="button"
              ref={notifButtonRef}
              className={`nav-notif-btn pixel-corners ${showNotifications ? "active" : ""}`}
              aria-haspopup="dialog"
              aria-controls={showNotifications ? "workspace-notifications" : undefined}
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="通知"
              aria-expanded={showNotifications}
            >
              <span className="nav-notif-icon"><Bell size={15} strokeWidth={1.8} /></span>
              {unreadCount > 0 && <span className="nav-notif-badge">{unreadCount}</span>}
            </button>

            {showNotifications && (
              <div ref={notifPanelRef} id="workspace-notifications" role="dialog" aria-label="通知" tabIndex={-1} className="nav-notif-panel edge-glow edge-glow-subtle">
                <div className="nav-notif-header">
                  <span className="nav-notif-title">通知</span>
                  <div className="nav-notif-actions">
                    {unreadCount > 0 && (
                      <button type="button" disabled={notificationBusy} className="nav-notif-action" onClick={markAllRead}>全部已读</button>
                    )}
                    {notifications.length > 0 && (
                      <button type="button" disabled={notificationBusy} className="nav-notif-action" onClick={clearNotifications}>清空</button>
                    )}
                  </div>
                </div>
                <div className="nav-notif-list" aria-busy={notificationLoading || notificationBusy}>
                  {(notificationLoading || notificationBusy) && <div className="nav-notif-empty" role="status">{notificationBusy ? "正在更新通知…" : notifications.length ? "正在刷新通知…" : "正在读取通知…"}</div>}
                  {notificationError && <div className="nav-notif-empty" role="alert">{notificationError} <button type="button" disabled={notificationBusy || notificationLoading} onClick={() => void notificationFeed.current?.refresh()}>重新读取</button></div>}
                  {notifications.length === 0 && !notificationLoading && !notificationBusy && !notificationError && <div className="nav-notif-empty">暂无通知</div>}
                  {notifications.map((n) => (
                      <div key={n.id} className={`nav-notif-item ${n.read ? "" : "unread"}`}>
                        <span className={`nav-notif-type ${n.type}`}>
                          {n.type === "success" ? <Check size={8} strokeWidth={2.5} /> : n.type === "error" ? <X size={8} strokeWidth={2.5} /> : <Info size={8} strokeWidth={2.5} />}
                        </span>
                        <div className="nav-notif-content">
                          <span className="nav-notif-item-title" title={n.title}>{n.title}</span>
                          <span className="nav-notif-item-msg" title={n.message}>{n.message}</span>
                          {onOpenTask && notificationTaskId(n.id) && <button type="button" className="nav-notif-action" onClick={() => { onOpenTask(notificationTaskId(n.id)!); setShowNotifications(false); }}>查看任务</button>}
                          <span className="nav-notif-time">{formatNotifTime(n.time)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <style>{`
        .nav-bar {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: var(--z-toast);
          padding: 2px;
          border-radius: 16px;
          background: conic-gradient(
            from var(--glow-angle, 0deg),
            color-mix(in srgb, var(--glow-warm) 35%, transparent),
            color-mix(in srgb, var(--glow-cool) 30%, transparent),
            color-mix(in srgb, var(--glow-aurora) 30%, transparent),
            color-mix(in srgb, var(--glow-warm) 35%, transparent)
          );
          animation: nav-glow-rotate 8s linear infinite;
          box-shadow:
            0 2px 16px rgba(0, 0, 0, 0.4),
            0 0 20px color-mix(in srgb, var(--glow-warm) 18%, transparent),
            0 0 50px color-mix(in srgb, var(--glow-warm) 12%, transparent),
            0 0 100px color-mix(in srgb, var(--glow-warm) 6%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          pointer-events: none;
          width: fit-content;
          max-width: 96%;
        }

        .nav-bar:hover {
          box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.5),
            0 0 24px color-mix(in srgb, var(--glow-warm) 25%, transparent),
            0 0 60px color-mix(in srgb, var(--glow-warm) 16%, transparent),
            0 0 120px color-mix(in srgb, var(--glow-warm) 8%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        @keyframes nav-glow-rotate {
          to { --glow-angle: 360deg; }
        }

        /* 品牌恒星标记 */
        .nav-brand-core { display: flex; align-items: center; flex-shrink: 0; flex: 0 0 34px; margin-right: 2px; }
        .nav-brand-core .product-nav__core {
          position: relative;
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #ffe0a2 0 5%, var(--glow-warm-soft) 18%, var(--glow-warm) 52%, #7b3d14 100%);
          border: 1px solid color-mix(in srgb, var(--glow-warm-soft) 44%, transparent);
          box-shadow: 0 0 0 5px color-mix(in srgb, var(--glow-warm) 8%, transparent), 0 0 20px color-mix(in srgb, var(--glow-warm) 28%, transparent);
        }
        .nav-brand-core .product-nav__core i { position: absolute; inset: -6px; border: 1px solid color-mix(in srgb, var(--glow-cool) 34%, transparent); border-radius: 50%; }
        .nav-brand-core .product-nav__core-placeholder { width: 30px; height: 30px; flex: 0 0 30px; }

        /* 访客登录按钮 + 账户名 */
        .nav-login-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 34px;
          padding: 0 11px;
          margin-right: 4px;
          border: 1px solid color-mix(in srgb, var(--glow-warm) 35%, transparent);
          border-radius: 9px;
          background: color-mix(in srgb, var(--glow-warm) 7%, transparent);
          color: var(--glow-warm-soft);
          font-size: var(--text-label-size);
          cursor: pointer;
          transition: background var(--motion-fast), color var(--motion-fast);
          outline: none; line-height: var(--text-label-line); }
        .nav-login-btn:hover { background: color-mix(in srgb, var(--glow-warm) 14%, transparent); color: var(--glow-warm); }
        .nav-login-btn:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 40%, transparent); }
        .nav-user-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--space-panel);
          cursor: pointer;
          min-height: 30px;
          padding: 0 10px;
          margin-right: 4px;
          border: 1px solid color-mix(in srgb, var(--glow-success) 25%, transparent);
          border-radius: 999px;
          color: var(--glow-success);
          background: color-mix(in srgb, var(--glow-success) 6%, var(--space-panel));
          font-size: var(--text-label-size);
          white-space: nowrap;
          cursor: pointer;
          transition: background 150ms, border-color 150ms; line-height: var(--text-label-line); }
        .nav-user-chip:hover { background: color-mix(in srgb, var(--glow-success) 12%, var(--space-panel)); }
        .nav-user-chip:focus-visible { outline: 2px solid var(--glow-success); outline-offset: 2px; }

        /* locked（身份交接/入口阶段）—— 低亮度锁定 */
        .nav-bar.is-locked { opacity: .72; }
        .nav-bar.is-locked .nav-tab { cursor: default; }
        .nav-bar.is-locked .nav-tab:hover {
          color: var(--foreground-muted);
          border-color: transparent;
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--space-surface) 50%, transparent) 0%,
            color-mix(in srgb, var(--space-panel) 70%, transparent) 100%
          );
        }

        .nav-bar-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 5px 14px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--space-deep) 88%, transparent);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          pointer-events: auto;
          min-height: 42px;
        }

        /* 左侧信息 */
        .nav-info-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          transition: transform 0.05s linear, opacity 0.15s;
          will-change: transform, opacity;
        }

        .nav-time-block {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border-radius: 7px;
          background: color-mix(in srgb, var(--glow-warm) 6%, transparent);
          box-shadow: 0 0 8px color-mix(in srgb, var(--glow-warm) 12%, transparent);
          animation: time-glow 4s ease-in-out infinite;
          white-space: nowrap;
        }

        @keyframes time-glow {
          0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--glow-warm) 12%, transparent); }
          50% { box-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 18%, transparent); }
        }

        .nav-time {
          font-family: var(--font-ui);
          font-size: var(--text-caption-size);
          color: var(--glow-warm-soft);
          letter-spacing: 0.06em;
          text-shadow: 0 0 6px color-mix(in srgb, var(--glow-warm) 40%, transparent); line-height: var(--text-caption-line); }
        .nav-date {
          font-size: var(--text-caption-size);
          color: var(--text-muted);
          letter-spacing: 0.03em; line-height: var(--text-caption-line); }

        /* 天气块 */
        .nav-weather-block {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 7px;
          background: color-mix(in srgb, var(--weather-glow, var(--glow-warm)) 6%, transparent);
          box-shadow: 0 0 8px color-mix(in srgb, var(--weather-glow, var(--glow-warm)) 10%, transparent);
          animation: weather-breathe 5s ease-in-out infinite;
          white-space: nowrap;
        }

        @keyframes weather-breathe {
          0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--weather-glow, var(--glow-warm)) 10%, transparent); }
          50% { box-shadow: 0 0 14px color-mix(in srgb, var(--weather-glow, var(--glow-warm)) 18%, transparent); }
        }

        .nav-weather-icon {
          font-size: var(--text-body-size);
          filter: drop-shadow(0 0 4px color-mix(in srgb, var(--weather-glow, var(--glow-warm)) 50%, transparent)); line-height: var(--text-body-line); }
        .nav-weather-info {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 3px;
        }
        .nav-weather-temp {
          font-family: var(--font-ui);
          font-size: var(--text-caption-size);
          color: var(--foreground);
          letter-spacing: 0.04em; line-height: var(--text-caption-line); }
        .nav-weather-text {
          font-size: var(--text-caption-size);
          color: var(--text-muted); line-height: var(--text-caption-line); }

        /* 中间标签 — 旋转木马传送带 */
        .nav-tabs-viewport {
          --label-w: 0px;
          --tab-gap: 6px;
          overflow: hidden;
          flex: 1 1 600px;
          min-width: 0;
          width: min(600px, calc(100vw - 230px));
        }
        .nav-tabs-track {
          display: flex;
          align-items: center;
          gap: var(--tab-gap);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), gap 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform;
        }

        .nav-tab {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 1 1 0;
          min-width: 0;
          min-height: 44px;
          padding: 8px 12px;
          border: 1px solid transparent;
          border-radius: 10px;
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--space-surface) 50%, transparent) 0%,
            color-mix(in srgb, var(--space-panel) 70%, transparent) 100%
          );
          color: var(--text-muted);
          font-family: var(--font-ui);
          font-size: var(--text-label-size);
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          white-space: nowrap;
          transform-origin: center center;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
          overflow: hidden;
          outline: none; line-height: var(--text-label-line); }

        /* 焦点状态 - 键盘导航 */
        .nav-tab:focus-visible {
          border-color: var(--glow-warm);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }

        .nav-tab:hover {
          color: var(--foreground);
          border-color: color-mix(in srgb, var(--glow-warm) 25%, transparent);
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--glow-warm) 10%, var(--space-surface)) 0%,
            color-mix(in srgb, var(--glow-warm) 6%, var(--space-panel)) 100%
          );
        }

        .nav-tab.active {
          color: var(--glow-warm-soft);
          border-color: color-mix(in srgb, var(--glow-warm) 35%, transparent);
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--glow-warm) 15%, var(--space-surface)) 0%,
            color-mix(in srgb, var(--glow-warm) 10%, var(--space-panel)) 100%
          );
          text-shadow: 0 0 6px color-mix(in srgb, var(--glow-warm) 40%, transparent);
          animation: tab-breathe 3s ease-in-out infinite;
        }
        @keyframes tab-breathe {
          0%, 100% {
            box-shadow: 0 0 8px color-mix(in srgb, var(--glow-warm) 12%, transparent),
                        0 0 20px color-mix(in srgb, var(--glow-warm) 6%, transparent);
          }
          50% {
            box-shadow: 0 0 14px color-mix(in srgb, var(--glow-warm) 22%, transparent),
                        0 0 32px color-mix(in srgb, var(--glow-warm) 10%, transparent);
          }
        }

        .nav-tab.pulse {
          animation: tab-pulse 0.5s ease-out;
        }

        /* Reduced motion — 禁用所有动画 */
        @media (prefers-reduced-motion: reduce) {
          .nav-tabs-track { transition: none !important; }
          .nav-tab, .nav-tab.active { animation: none !important; transition: none !important; }
          .nav-bar { animation: none !important; }
          .nav-time-block, .nav-weather-block, .nav-notif-btn, .nav-notif-badge {
            animation: none !important;
          }
          .nav-brand-core .product-nav__core { animation: none !important; transition-duration: 0.01ms !important; }
        }

        @keyframes tab-pulse {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--glow-warm) 40%, transparent); }
          50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--glow-warm) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--glow-warm) 0%, transparent); }
        }

        .nav-tab-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s var(--ease-out-expo);
          flex-shrink: 0;
          color: inherit;
        }
        .nav-tab:hover .nav-tab-icon { transform: scale(1.12); }
        .nav-tab.active .nav-tab-icon {
          filter: drop-shadow(0 0 3px color-mix(in srgb, var(--glow-warm) 60%, transparent));
          color: var(--glow-warm-soft);
        }

        .nav-tab-label {
          transition: max-width 0.28s var(--ease-out-expo), opacity 0.2s var(--ease-out-expo);
          min-width: 0;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        /* 右侧通知 */
        .nav-info-right {
          position: relative;
          display: flex;
          justify-content: flex-end;
          flex-shrink: 0;
          transition: transform 0.05s linear, opacity 0.15s;
          will-change: transform, opacity;
        }

        .nav-notif-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: color-mix(in srgb, var(--glow-warm) 6%, transparent);
          color: var(--foreground-muted);
          cursor: pointer;
          transition: background 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo), border-color 0.2s, transform 0.2s var(--ease-out-expo);
          box-shadow: 0 0 6px color-mix(in srgb, var(--glow-warm) 10%, transparent);
          animation: notif-glow 4s ease-in-out infinite;
          outline: none;
        }

        /* 焦点状态 - 键盘导航 */
        .nav-notif-btn:focus-visible {
          border-color: var(--glow-warm);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }

        @keyframes notif-glow {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 6px color-mix(in srgb, var(--glow-warm) 10%, transparent);
          }
          50% {
            transform: scale(1.03);
            box-shadow: 0 0 10px color-mix(in srgb, var(--glow-warm) 16%, transparent);
          }
        }

        .nav-notif-btn:hover {
          color: var(--foreground);
          transform: scale(1.1);
          box-shadow: 0 0 12px color-mix(in srgb, var(--glow-warm) 22%, transparent);
          animation: none;
        }

        .nav-notif-btn:active {
          transform: scale(0.95);
          transition-duration: 0.1s;
        }

        .nav-notif-btn.active {
          color: var(--glow-warm);
          box-shadow: 0 0 14px color-mix(in srgb, var(--glow-warm) 28%, transparent);
        }
        .nav-notif-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--foreground-muted);
        }

        .nav-notif-badge {
          position: absolute;
          top: 0px;
          right: 0px;
          min-width: 16px;
          height: 16px;
          padding: 0 2px;
          border-radius: 8px;
          background: var(--error);
          color: var(--primary-foreground);
          font-size: var(--text-caption-size);
          font-weight: var(--weight-semibold);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 5px color-mix(in srgb, var(--error) 60%, transparent);
          animation: badge-pulse 2s ease-in-out infinite; line-height: var(--text-caption-line); }

        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        /* 通知面板 */
        .nav-notif-panel {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: min(360px, calc(100vw - 32px));
          max-height: min(420px, calc(100svh - 120px));
          display: flex;
          flex-direction: column;
          border-radius: var(--shape-card);
          background: var(--space-panel);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px color-mix(in srgb, var(--glow-warm) 8%, transparent);
          overflow: hidden;
          animation: notif-in 0.22s var(--ease-out-expo);
          z-index: 100;
        }

        @keyframes notif-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .nav-notif-header {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex-shrink: 0;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .nav-notif-title {
          font-family: var(--font-sans);
          font-size: var(--text-label-size);
          font-weight: var(--weight-semibold);
          color: var(--foreground);
          letter-spacing: 0.04em; line-height: var(--text-label-line); }
        .nav-notif-actions { display: flex; flex-wrap: wrap; gap: 5px; }
        .nav-notif-action {
          min-height: 44px;
          padding: 6px 10px;
          border-radius: var(--shape-control);
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: var(--text-label-size);
          cursor: pointer;
          transition: background 0.15s, color 0.15s; line-height: var(--text-label-line); }
        .nav-notif-action:hover {
          color: var(--glow-warm);
          background: color-mix(in srgb, var(--glow-warm) 8%, transparent);
        }
        .nav-notif-action:focus-visible { outline: 2px solid var(--glow-warm); outline-offset: 2px; }

        .nav-notif-list { min-height: 0; overflow-y: auto; overflow-wrap: anywhere; }

        .nav-notif-empty {
          padding: 24px 12px;
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-caption-size); line-height: var(--text-caption-line); }

        .nav-notif-item {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          padding: 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent);
          transition: background 0.15s;
        }
        .nav-notif-item:hover { background: color-mix(in srgb, var(--glow-warm) 5%, transparent); }
        .nav-notif-item.unread { background: color-mix(in srgb, var(--glow-warm) 8%, transparent); }

        .nav-notif-type {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .nav-notif-type.success { background: color-mix(in srgb, var(--glow-success) 20%, transparent); color: var(--glow-success); }
        .nav-notif-type.error { background: color-mix(in srgb, var(--error) 20%, transparent); color: var(--error); }
        .nav-notif-type.info { background: color-mix(in srgb, var(--glow-cool) 20%, transparent); color: var(--glow-cool); }

        .nav-notif-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .nav-notif-item-title { font-size: var(--text-label-size); line-height: var(--text-label-line); color: var(--foreground); font-weight: var(--weight-medium); overflow-wrap: anywhere; }
        .nav-notif-item-msg {
          font-size: var(--text-caption-size);
          line-height: var(--text-caption-line);
          color: var(--text-muted);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .nav-notif-time {
          font-size: var(--text-caption-size);
          line-height: var(--text-caption-line);
          color: var(--text-muted);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        :root[data-reduced-motion="true"] .nav-notif-panel,
        :root[data-reduced-motion="true"] .nav-notif-badge { animation: none; }
        @media (prefers-reduced-motion: reduce) {
          .nav-notif-panel, .nav-notif-badge { animation: none; }
        }

        /* 响应式 */
        @media (max-width: 1100px) {
          .nav-info-left { display: none !important; }
        }
        @media (max-width: 768px) {
          .nav-user-name { display: none; }
          .nav-user-chip { padding: 0 8px; }
          .nav-bar-inner { padding: 5px 8px; gap: 4px; }
          .nav-tabs-viewport { width: calc(100vw - 140px); }
          .nav-tab { padding: 8px 6px; }
          .nav-tab-label { display: none; }
        }
      `}</style>
    </>
  );
}
