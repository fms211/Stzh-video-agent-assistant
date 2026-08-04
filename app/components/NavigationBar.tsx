"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { motion } from "motion/react";
import { LogIn } from "lucide-react";
import type { AccessMode } from "@/app/lib/entry-flow";
import { getToken } from "@/app/lib/auth";
import { useAuth } from "./AuthProvider";
import { fetchWeather, getWeatherIcon, getWeatherMood, getWeatherGlowColor, type WeatherData } from "@/app/lib/weather";
import {
  MessageSquare,
  Film,
  BarChart3,
  ImageIcon,
  Palette,
  Bell,
  Check,
  X,
  Info,
  ListTodo,
} from "lucide-react";

export type Page = "chat" | "opc" | "tasks" | "stats" | "libtv" | "gallery";
export type WorkspacePage = Page;

const PAGE_TABS: { key: Page; label: string; icon: ReactNode }[] = [
  { key: "chat", label: "对话工作区", icon: <MessageSquare size={15} strokeWidth={1.8} /> },
  { key: "opc", label: "OPC 工作模式", icon: <Film size={15} strokeWidth={1.8} /> },
  { key: "tasks", label: "任务中心", icon: <ListTodo size={15} strokeWidth={1.8} /> },
  { key: "stats", label: "工作统计", icon: <BarChart3 size={15} strokeWidth={1.8} /> },
  { key: "libtv", label: "LibTV 生图", icon: <ImageIcon size={15} strokeWidth={1.8} /> },
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

type Props = {
  page: Page;
  onPageChange: (page: Page) => void;
  locked?: boolean;
  accessMode?: AccessMode | null;
  showBrandCore?: boolean;
  onAuthOpen?: () => void;
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

const WINDOW_SIZE = 4; // 导航栏一次显示的标签数

export default function NavigationBar({
  page,
  onPageChange,
  locked = false,
  accessMode = null,
  showBrandCore = true,
  onAuthOpen,
}: Props) {
  const { user } = useAuth();
  const [hovered, setHovered] = useState<Page | null>(null);
  const [scrollPulse, setScrollPulse] = useState<Page | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(0);

  // 滑动窗口偏移（0 = 显示前4个, 1 = 显示后4个）
  const [windowStart, setWindowStart] = useState(0);

  // 时间状态
  const [time, setTime] = useState<string>("--:--");
  const [date, setDate] = useState<string>("");

  // 天气状态
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherIcon, setWeatherIcon] = useState<string>("🌤️");
  const [glowColor, setGlowColor] = useState<string>("var(--glow-warm)");

  // 通知状态
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // 导航栏状态
  const [isExpanded, setIsExpanded] = useState(false);
  const expandProgress = useRef(new SpringValue(0)); // 0=缩短, 1=伸长
  const [expandValue, setExpandValue] = useState(0);

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

  // 动画循环
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      let needsUpdate = false;

      // 更新展开进度
      if (expandProgress.current.update(dt)) {
        needsUpdate = true;
        setExpandValue(expandProgress.current.current);
      }

      // 更新按钮弹簧
      const newStates = new Map(buttonStates);
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
  }, []);

  // 导航栏鼠标事件（锁定态不响应 hover，避免入口阶段展开）
  const handleNavMouseEnter = useCallback(() => {
    if (locked) return;
    setIsExpanded(true);
    expandProgress.current.setTarget(1);
  }, [locked]);

  const handleNavMouseLeave = useCallback(() => {
    setIsExpanded(false);
    expandProgress.current.setTarget(0);
  }, []);

  // 按钮鼠标事件
  const handleButtonEnter = useCallback((key: Page) => {
    setHovered(key);
    const spring = getButtonSpring(key);
    spring.setTarget(1.08);
    spring.velocity = 2;
  }, [getButtonSpring]);

  const handleButtonLeave = useCallback((key: Page) => {
    setHovered(null);
    const spring = getButtonSpring(key);
    spring.setTarget(1);
  }, [getButtonSpring]);

  const handleButtonDown = useCallback((key: Page) => {
    const spring = getButtonSpring(key);
    spring.setTarget(0.92);
    spring.velocity = -3;
  }, [getButtonSpring]);

  const handleButtonUp = useCallback((key: Page) => {
    const spring = getButtonSpring(key);
    spring.setTarget(1.05);
    spring.velocity = 5;
  }, [getButtonSpring]);

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

  // 获取天气
  useEffect(() => {
    const loadWeather = async () => {
      const data = await fetchWeather();
      if (data) {
        setWeather(data);
        setWeatherIcon(getWeatherIcon(data.icon));
        const mood = getWeatherMood(data.icon);
        setGlowColor(getWeatherGlowColor(mood));
      }
    };
    loadWeather();
    const timer = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // 读取通知
  useEffect(() => {
    const loadNotifications = () => {
      const stored = localStorage.getItem("tszh_notifications");
      if (stored) {
        try {
          const parsed = JSON.parse(stored).map((n: any) => ({ ...n, time: new Date(n.time) }));
          setNotifications(parsed);
        } catch {}
      }
    };
    loadNotifications();
    const handleNewNotif = () => loadNotifications();
    window.addEventListener("tszh_notification_added", handleNewNotif);

    // WS 实时推送：服务端 notification.created 时触发本地刷新（登录才建连）
    let ws: WebSocket | null = null;
    const token = getToken();
    if (token) {
      try {
        const backendUrl = new URL(
          process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || window.location.origin
        );
        const protocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${backendUrl.host}/ws/desktop?token=${encodeURIComponent(token)}`);
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as { type?: string };
            if (message.type === "notification.created") handleNewNotif();
          } catch {}
        };
      } catch {}
    }

    return () => {
      window.removeEventListener("tszh_notification_added", handleNewNotif);
      ws?.close();
    };
  }, []);

  // 点击外部关闭通知面板
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 标记全部已读
  const markAllRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    localStorage.setItem("tszh_notifications", JSON.stringify(updated));
  };

  // 清空通知
  const clearNotifications = () => {
    setNotifications([]);
    localStorage.removeItem("tszh_notifications");
  };

  // 格式化时间
  const formatNotifTime = (date: Date) => {
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
      e.preventDefault();
      const currentIndex = PAGE_TABS.findIndex((t) => t.key === page);

      if (e.deltaY > 0 && currentIndex < PAGE_TABS.length - 1) {
        // 向下 → 下一页
        const nextIndex = currentIndex + 1;
        onPageChange(PAGE_TABS[nextIndex].key);
        // 窗口跟随：确保新页面在可视范围内
        if (nextIndex >= windowStart + WINDOW_SIZE) {
          setWindowStart(Math.min(nextIndex - WINDOW_SIZE + 1, maxWindowStart));
        }
      } else if (e.deltaY < 0 && currentIndex > 0) {
        // 向上 → 上一页
        const prevIndex = currentIndex - 1;
        onPageChange(PAGE_TABS[prevIndex].key);
        // 窗口跟随：确保新页面在可视范围内
        if (prevIndex < windowStart) {
          setWindowStart(Math.max(prevIndex, 0));
        }
      }

      setScrollPulse(page);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setScrollPulse(null), 500);
    };

    nav.addEventListener("wheel", handleWheel, { passive: false });
    return () => nav.removeEventListener("wheel", handleWheel);
  }, [page, onPageChange, windowStart]);

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
  const sideOffset = (1 - expandValue) * 60; // 缩短时向中间偏移 60%

  return (
    <>
      <nav
        ref={navRef}
        className={`nav-bar ${isExpanded ? "expanded" : "collapsed"} ${locked ? "is-locked" : ""}`}
        style={{ "--weather-glow": glowColor } as React.CSSProperties}
        onMouseEnter={handleNavMouseEnter}
        onMouseLeave={handleNavMouseLeave}
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
              opacity: 0.3 + expandValue * 0.7,
              width: expandValue > 0.01 ? "auto" : 0,
              minWidth: expandValue > 0.01 ? undefined : 0,
              overflow: "hidden",
            }}
          >
            <div className="nav-time-block pixel-corners">
              <span className="nav-time">{time}</span>
              <span className="nav-date">{date}</span>
            </div>
            {weather && (
              <div className="nav-weather-block pixel-corners">
                <span className="nav-weather-icon">{weatherIcon}</span>
                <div className="nav-weather-info">
                  <span className="nav-weather-temp">{weather.temp}°</span>
                  <span className="nav-weather-text">{weather.text}</span>
                </div>
              </div>
            )}
          </div>

          {/* 中间：页面切换按钮 — 旋转木马式连续滑动 */}
          <div
            className="nav-tabs-viewport"
            style={{
              "--label-w": expandValue > 0.5 ? "100px" : "0px",
              "--tab-gap": expandValue > 0.5 ? "16px" : "8px",
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
                  >
                    <span className="nav-tab-icon">{tab.icon}</span>
                    <span
                      className="nav-tab-label"
                      style={{
                        maxWidth: expandValue > 0.5 ? 100 : 0,
                        opacity: expandValue > 0.5 ? 1 : 0,
                        marginLeft: expandValue > 0.5 ? 4 : 0,
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
              opacity: expandValue > 0.01 || showNotifications ? 0.3 + expandValue * 0.7 : 0,
              width: expandValue > 0.01 || showNotifications ? "auto" : 0,
              minWidth: expandValue > 0.01 || showNotifications ? "fit-content" : 0,
              overflow: showNotifications ? "visible" : "hidden",
              pointerEvents: expandValue > 0.01 || showNotifications ? "auto" : "none",
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
              <span className="nav-user-chip" title={user.displayName || user.username}>
                {user.displayName || user.username}
              </span>
            )}

            <button
              type="button"
              className={`nav-notif-btn pixel-corners ${showNotifications ? "active" : ""}`}
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="通知"
            >
              <span className="nav-notif-icon"><Bell size={15} strokeWidth={1.8} /></span>
              {unreadCount > 0 && <span className="nav-notif-badge">{unreadCount}</span>}
            </button>

            {showNotifications && (
              <div className="nav-notif-panel edge-glow edge-glow-subtle">
                <div className="nav-notif-header">
                  <span className="nav-notif-title">通知</span>
                  <div className="nav-notif-actions">
                    {unreadCount > 0 && (
                      <button type="button" className="nav-notif-action" onClick={markAllRead}>全部已读</button>
                    )}
                    {notifications.length > 0 && (
                      <button type="button" className="nav-notif-action" onClick={clearNotifications}>清空</button>
                    )}
                  </div>
                </div>
                <div className="nav-notif-list">
                  {notifications.length === 0 ? (
                    <div className="nav-notif-empty">暂无通知</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`nav-notif-item ${n.read ? "" : "unread"}`}>
                        <span className={`nav-notif-type ${n.type}`}>
                          {n.type === "success" ? <Check size={8} strokeWidth={2.5} /> : n.type === "error" ? <X size={8} strokeWidth={2.5} /> : <Info size={8} strokeWidth={2.5} />}
                        </span>
                        <div className="nav-notif-content">
                          <span className="nav-notif-item-title">{n.title}</span>
                          <span className="nav-notif-item-msg">{n.message}</span>
                        </div>
                        <span className="nav-notif-time">{formatNotifTime(n.time)}</span>
                      </div>
                    ))
                  )}
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
          will-change: width;
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
          font-size: 10px;
          cursor: pointer;
          transition: background var(--motion-fast), color var(--motion-fast);
          outline: none;
        }
        .nav-login-btn:hover { background: color-mix(in srgb, var(--glow-warm) 14%, transparent); color: var(--glow-warm); }
        .nav-login-btn:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 40%, transparent); }
        .nav-user-chip {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 10px;
          margin-right: 4px;
          border: 1px solid color-mix(in srgb, #8bcda4 25%, transparent);
          border-radius: 999px;
          color: #8bcda4;
          font-size: 10px;
          white-space: nowrap;
        }

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
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 12px;
          color: var(--glow-warm-soft);
          letter-spacing: 0.06em;
          text-shadow: 0 0 6px color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }
        .nav-date {
          font-size: 9px;
          color: var(--foreground-muted);
          letter-spacing: 0.03em;
        }

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
          font-size: 14px;
          filter: drop-shadow(0 0 4px color-mix(in srgb, var(--weather-glow, var(--glow-warm)) 50%, transparent));
        }
        .nav-weather-info {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 3px;
        }
        .nav-weather-temp {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 11px;
          color: var(--foreground);
          letter-spacing: 0.04em;
        }
        .nav-weather-text {
          font-size: 9px;
          color: var(--foreground-muted);
        }

        /* 中间标签 — 旋转木马传送带 */
        .nav-tabs-viewport {
          --label-w: 0px;
          --tab-gap: 6px;
          overflow: hidden;
          flex-shrink: 0;
          /* 4个标签宽度 + 标签文字宽度 + 3个间距 */
          width: calc(4 * 68px + 4 * var(--label-w) + 3 * var(--tab-gap));
          transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
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
          flex: 0 0 calc(25% - var(--tab-gap) * 3 / 4);
          min-height: 44px;
          padding: 8px 12px;
          border: 1px solid transparent;
          border-radius: 10px;
          background: linear-gradient(180deg,
            color-mix(in srgb, var(--space-surface) 50%, transparent) 0%,
            color-mix(in srgb, var(--space-panel) 70%, transparent) 100%
          );
          color: var(--foreground-muted);
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 12px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          white-space: nowrap;
          will-change: transform, box-shadow;
          transform-origin: center center;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
          overflow: hidden;
          outline: none;
        }

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
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          flex-shrink: 0;
          color: inherit;
        }
        .nav-tab:hover .nav-tab-icon { transform: scale(1.15); }
        .nav-tab.active .nav-tab-icon {
          filter: drop-shadow(0 0 3px color-mix(in srgb, var(--glow-warm) 60%, transparent));
          color: var(--glow-warm-soft);
        }

        .nav-tab-label {
          transition: max-width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s, margin 0.3s;
          overflow: hidden;
          white-space: nowrap;
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
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 0 6px color-mix(in srgb, var(--glow-warm) 10%, transparent);
          animation: notif-glow 4s ease-in-out infinite;
          will-change: transform;
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
          min-width: 12px;
          height: 12px;
          padding: 0 2px;
          border-radius: 6px;
          background: var(--error);
          color: #fff;
          font-size: 7px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 5px color-mix(in srgb, var(--error) 60%, transparent);
          animation: badge-pulse 2s ease-in-out infinite;
        }

        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        /* 通知面板 */
        .nav-notif-panel {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: 280px;
          max-height: 360px;
          border-radius: 12px;
          background: var(--space-panel);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px color-mix(in srgb, var(--glow-warm) 8%, transparent);
          overflow: hidden;
          animation: notif-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 100;
        }

        @keyframes notif-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .nav-notif-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .nav-notif-title {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 11px;
          color: var(--foreground);
          letter-spacing: 0.04em;
        }
        .nav-notif-actions { display: flex; gap: 5px; }
        .nav-notif-action {
          padding: 2px 5px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--foreground-muted);
          font-size: 9px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .nav-notif-action:hover {
          color: var(--glow-warm);
          background: color-mix(in srgb, var(--glow-warm) 8%, transparent);
        }

        .nav-notif-list { max-height: 280px; overflow-y: auto; }

        .nav-notif-empty {
          padding: 24px 12px;
          text-align: center;
          color: var(--foreground-muted);
          font-size: 10px;
        }

        .nav-notif-item {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          padding: 8px 10px;
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
        .nav-notif-type.success { background: color-mix(in srgb, #4ade80 20%, transparent); color: #4ade80; }
        .nav-notif-type.error { background: color-mix(in srgb, var(--error) 20%, transparent); color: var(--error); }
        .nav-notif-type.info { background: color-mix(in srgb, var(--glow-cool) 20%, transparent); color: var(--glow-cool); }

        .nav-notif-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .nav-notif-item-title { font-size: 10px; color: var(--foreground); font-weight: 500; }
        .nav-notif-item-msg {
          font-size: 9px;
          color: var(--foreground-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .nav-notif-time {
          font-size: 8px;
          color: var(--foreground-muted);
          opacity: 0.7;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* 响应式 */
        @media (max-width: 768px) {
          .nav-info-left, .nav-info-right { display: none !important; }
          .nav-tab-label { display: none; }
        }
      `}</style>
    </>
  );
}
