"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Menu, X, FileImage, FileText, FileSpreadsheet, File } from "lucide-react";

export type StagedFile = { id: string; name: string; file: File };
export type HistorySession = { id: string; title: string; timestamp: number; messageCount: number };

type Props = {
  files: StagedFile[];
  onFileClick: (file: StagedFile) => void;
  onClear: () => void;
  sessions: HistorySession[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onSessionDelete: (id: string) => void;
  onNewChat: () => void;
  onGoHome?: () => void;
  /** 统一工作台 dock 内使用：隐藏旧 toggle、面板常开 */
  forceOpen?: boolean;
};

// 时间分组工具
function getTimeGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86400000);

  if (date >= startOfToday) return "今天";
  if (date >= startOfYesterday) return "昨天";
  if (date >= startOfWeek) return "本周";
  return "更早";
}

function groupSessions(sessions: HistorySession[]): Map<string, HistorySession[]> {
  const groups = new Map<string, HistorySession[]>();
  const order = ["今天", "昨天", "本周", "更早"];
  for (const s of sessions) {
    const group = getTimeGroup(s.timestamp);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(s);
  }
  // 按预定义顺序排序
  const sorted = new Map<string, HistorySession[]>();
  for (const key of order) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!);
  }
  return sorted;
}

export default function LeftSidebar({
  files, onFileClick, onClear,
  sessions, activeSessionId,
  onSessionClick, onSessionDelete, onNewChat, onGoHome,
  forceOpen = false,
}: Props) {
  const [collapsedSelf, setCollapsedSelf] = useState(true);
  // 在统一工作台 dock 内时面板常开（开合由 dock 的 rail/docked 控制，不用旧 toggle）
  const collapsed = forceOpen ? false : collapsedSelf;
  const [tab, setTab] = useState<"files" | "history">("history");
  const [searchQuery, setSearchQuery] = useState("");
  const newChatButton = useRef<HTMLButtonElement>(null);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingDeletionFocus = useRef<{ removedId: string; targetId: string | null } | null>(null);
  const hasFiles = files.length > 0;
  const hasSessions = sessions.length > 0;

  // 搜索过滤
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  // 按时间分组
  const groupedSessions = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

  useEffect(() => {
    const pending = pendingDeletionFocus.current;
    if (!pending || sessions.some((session) => session.id === pending.removedId)) return;
    const target = pending.targetId ? deleteButtons.current.get(pending.targetId) : newChatButton.current;
    (target || newChatButton.current)?.focus();
    pendingDeletionFocus.current = null;
  }, [sessions]);

  const handleDeleteSession = (id: string, keyboard: boolean) => {
    if (keyboard) {
      const index = filteredSessions.findIndex((session) => session.id === id);
      const target = filteredSessions[index + 1] || filteredSessions[index - 1];
      pendingDeletionFocus.current = { removedId: id, targetId: target?.id || null };
    }
    onSessionDelete(id);
  };

  return (
    <>
      {!forceOpen && (
        <button
          type="button"
          className={`sidebar-toggle ${!collapsed ? "is-open" : ""}`}
          onClick={() => setCollapsedSelf(!collapsed)}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          <span className="sidebar-toggle-icon">{collapsed ? <Menu size={18} strokeWidth={1.8} /> : <X size={18} strokeWidth={1.8} />}</span>
          {hasFiles && <span className="sidebar-toggle-badge">{files.length}</span>}
        </button>
      )}

      <div className={`sidebar-panel edge-glow ${!collapsed ? "is-open" : ""} ${forceOpen ? "sidebar-panel--docked" : ""}`}>
        {/* New Chat button */}
        <div className="sidebar-new-chat">
          <button type="button" ref={newChatButton} onClick={onNewChat} className="sidebar-new-chat-btn">
            + 新对话
          </button>
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs">
          <button
            type="button"
            className={`sidebar-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            历史
          </button>
          <button
            type="button"
            className={`sidebar-tab ${tab === "files" ? "active" : ""}`}
            onClick={() => setTab("files")}
          >
            文件{hasFiles ? ` (${files.length})` : ""}
          </button>
        </div>

        {tab === "history" ? (
          <div className="sidebar-file-list">
            {/* 搜索框 */}
            {hasSessions && (
              <div className="sidebar-search">
                <span className="sidebar-search-icon">⌕</span>
                <input
                  type="text"
                  className="sidebar-search-input"
                  placeholder="搜索对话…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="搜索对话"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="sidebar-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="清除搜索"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {!hasSessions ? (
              <div className="sidebar-empty">
                <p className="sidebar-empty-title">暂无历史对话</p>
                <p className="sidebar-empty-desc">在右侧输入框开始对话，历史记录将显示在这里</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="sidebar-empty">
                <p className="sidebar-empty-title">未找到匹配对话</p>
                <p className="sidebar-empty-desc">试试其他关键词</p>
              </div>
            ) : (
              Array.from(groupedSessions.entries()).map(([group, items]) => (
                <div key={group} className="sidebar-group">
                  <div className="sidebar-group-label">{group}</div>
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className={`sidebar-history-item ${s.id === activeSessionId ? "active" : ""}`}
                    >
                      <button
                        type="button"
                        className="sidebar-history-select"
                        onClick={() => onSessionClick(s.id)}
                        aria-current={s.id === activeSessionId ? "true" : undefined}
                      >
                        <span className="sidebar-history-info">
                          <span className="sidebar-history-title">{s.title}</span>
                          <span className="sidebar-history-meta">
                            {new Date(s.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} · {s.messageCount} 条消息
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="sidebar-history-delete"
                        ref={(node) => { if (node) deleteButtons.current.set(s.id, node); else deleteButtons.current.delete(s.id); }}
                        onClick={(event) => handleDeleteSession(s.id, event.detail === 0)}
                        aria-label={`删除 ${s.title}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="sidebar-file-list">
            {!hasFiles ? (
              <div className="sidebar-empty">
                <p className="sidebar-empty-title">暂无上传文件</p>
                <p className="sidebar-empty-desc">上传文件后会自动出现在这里</p>
              </div>
            ) : (
              <>
                <div className="sidebar-section-actions">
                  <button type="button" onClick={onClear} className="sidebar-clear-btn">清空</button>
                </div>
                {files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="sidebar-file-item"
                    onClick={() => onFileClick(f)}
                    title={`点击添加到输入框：${f.name}`}
                  >
                    <span className="sidebar-file-icon">
                      {f.file.type.startsWith("image/") ? <FileImage size={15} strokeWidth={1.6} />
                        : f.file.type.includes("pdf") ? <FileText size={15} strokeWidth={1.6} />
                        : f.name.endsWith(".docx") ? <FileText size={15} strokeWidth={1.6} />
                        : f.name.endsWith(".xlsx") || f.name.endsWith(".csv") ? <FileSpreadsheet size={15} strokeWidth={1.6} />
                        : <File size={15} strokeWidth={1.6} />}
                    </span>
                    <span className="sidebar-file-name">{f.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {onGoHome && (
          <div className="sidebar-footer">
            <SidebarAuth />
            <button type="button" className="sidebar-home-btn" onClick={onGoHome}>返回首页</button>
          </div>
        )}
      </div>

      <style>{`
        .sidebar-search {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          margin: 0 8px 4px;
          border-radius: var(--shape-control);
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--space-deep) 60%, transparent);
          transition: border-color 0.2s;
        }
        .sidebar-search:focus-within {
          border-color: color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }
        .sidebar-search-icon {
          font-size: var(--text-body-size);
          color: var(--text-muted);
          opacity: 0.6;
          flex-shrink: 0; line-height: var(--text-body-line); }
        .sidebar-search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--foreground);
          font-family: var(--font-ui);
          font-size: var(--text-caption-size);
          letter-spacing: 0.02em;
          min-width: 0; line-height: var(--text-caption-line); }
        .sidebar-search-input::placeholder {
          color: var(--foreground-muted);
          opacity: 0.5;
        }
        .sidebar-search-clear {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: none;
          background: color-mix(in srgb, var(--foreground-muted) 15%, transparent);
          color: var(--text-muted);
          font-size: var(--text-caption-size);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s; line-height: var(--text-caption-line); }
        .sidebar-search-clear:hover {
          background: color-mix(in srgb, var(--error) 20%, transparent);
          color: var(--error);
        }

        .sidebar-group {
          margin-bottom: 4px;
        }
        .sidebar-group-label {
          padding: 6px 14px 2px;
          font-family: var(--font-ui);
          font-size: var(--text-caption-size);
          color: var(--text-muted);
          opacity: 0.6;
          letter-spacing: 0.08em;
          text-transform: uppercase; line-height: var(--text-caption-line); }
      `}</style>
    </>
  );
}

function SidebarAuth() {
  const router = useRouter();
  const { user, logout } = useAuth();

  // 注入样式（useEffect 内，避免模块作用域副作用 / hydration 风险）
  useEffect(() => {
    if (document.getElementById("sidebar-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "sidebar-auth-styles";
    style.textContent = authStyles;
    document.head.appendChild(style);
  }, []);

  if (user) {
    return (
      <div className="sidebar-auth">
        <span className="sidebar-auth-user">{user.displayName || user.username}</span>
        <button type="button" className="sidebar-auth-btn" onClick={logout}>退出</button>
      </div>
    );
  }

  return (
    <div className="sidebar-auth">
      <button type="button" className="sidebar-auth-btn primary" onClick={() => router.push("/login")}>登录</button>
      <button type="button" className="sidebar-auth-btn" onClick={() => router.push("/register")}>注册</button>
    </div>
  );
}

const authStyles = `
  .sidebar-auth {
    display: flex; align-items: center; gap: 8px; padding: 8px 14px;
    border-top: 1px solid var(--border-subtle);
  }
  .sidebar-auth-user {
    flex: 1; font-size: var(--text-caption-size); color: var(--text-muted);
    font-family: var(--font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: var(--text-caption-line); }
  .sidebar-auth-btn {
    padding: 5px 12px; border-radius: var(--shape-control); border: 1px solid var(--border-subtle);
    background: transparent; color: var(--text-muted); cursor: pointer;
    font-family: var(--font-ui); font-size: var(--text-label-size); transition: all 0.15s; line-height: var(--text-label-line); }
  .sidebar-auth-btn:hover { border-color: var(--glow-warm); color: var(--glow-warm); }
  .sidebar-auth-btn.primary { background: var(--glow-warm); color: var(--on-warm); border-color: var(--glow-warm); }
  .sidebar-auth-btn.primary:hover { background: var(--glow-warm-soft); }
`;
