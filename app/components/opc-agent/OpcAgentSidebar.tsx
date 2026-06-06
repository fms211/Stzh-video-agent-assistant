"use client";

import { useMemo, useState, useEffect } from "react";
import { Workflow, History, Cpu, Trash2, Plus, ChevronDown, ArrowLeft, Play } from "lucide-react";
import { getSessionsSync, getSessions } from "@/app/lib/opc-agent-persist";
import { getWorkflowsByCategory, CATEGORY_LABELS, getWorkflowById } from "@/app/lib/opc-workflows";
import { THINKING_LEVELS, type LLMProvider } from "@/app/lib/llm-providers";
import type { OpcAgentMessage } from "./types";

type Props = {
  activeTab: "workflow" | "history" | "model";
  onTabChange: (tab: "workflow" | "history" | "model") => void;
  messages: OpcAgentMessage[];
  onClear: () => void;
  provider: LLMProvider | null;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onRunWorkflow: (workflowId: string, input: Record<string, string>) => void;
};

const TABS = [
  { key: "workflow" as const, label: "工作流", icon: Workflow },
  { key: "history" as const, label: "历史", icon: History },
  { key: "model" as const, label: "模型", icon: Cpu },
];

export default function OpcAgentSidebar({
  activeTab, onTabChange, messages, onClear, provider,
  onNewSession, onSwitchSession, onRunWorkflow,
}: Props) {
  const [sessions, setSessions] = useState(getSessionsSync());
  // 后台从服务端刷新会话列表
  useEffect(() => {
    getSessions().then((s) => { if (s.length > 0) setSessions(s); });
  }, [messages.length]);
  const workflowGroups = useMemo(() => getWorkflowsByCategory(), []);
  const [expandedCat, setExpandedCat] = useState<string | null>("create");
  const [activeWfId, setActiveWfId] = useState<string | null>(null);
  const [wfInput, setWfInput] = useState<Record<string, string>>({});

  const activeWf = activeWfId ? getWorkflowById(activeWfId) : null;

  const handleStartWorkflow = () => {
    if (!activeWf) return;
    for (const f of activeWf.fields) {
      if (f.required && !wfInput[f.key]?.trim()) { alert(`请填写"${f.label}"`); return; }
    }
    onRunWorkflow(activeWf.id, wfInput);
    setActiveWfId(null);
    setWfInput({});
  };

  return (
    <div className="opc-sidebar">
      <div className="opc-sidebar-tabs">
        {TABS.map((tab) => (
          <button key={tab.key} type="button"
            className={`opc-sidebar-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => { onTabChange(tab.key); setActiveWfId(null); }}
            role="tab" aria-selected={activeTab === tab.key}>
            <tab.icon size={14} strokeWidth={1.8} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="opc-sidebar-content" role="tabpanel">
        {/* 工作流 tab */}
        {activeTab === "workflow" && !activeWfId && (
          <div className="opc-sidebar-workflow">
            <div className="opc-sidebar-section-label">链式工作流</div>
            {Object.entries(workflowGroups).map(([cat, wfs]) => (
              <div key={cat} className="opc-wf-group">
                <button type="button" className="opc-wf-group-header"
                  onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}>
                  <span>{CATEGORY_LABELS[cat] || cat}</span>
                  <ChevronDown size={12} className={`opc-wf-chevron ${expandedCat === cat ? "open" : ""}`} />
                </button>
                {expandedCat === cat && (
                  <div className="opc-wf-group-list">
                    {wfs.map((wf) => (
                      <button key={wf.id} type="button" className="opc-wf-item"
                        onClick={() => { setActiveWfId(wf.id); setWfInput({}); }}
                        title={wf.desc}>
                        <span className="opc-wf-item-icon">{wf.icon}</span>
                        <div className="opc-wf-item-text">
                          <span className="opc-wf-item-name">{wf.name}</span>
                          <span className="opc-wf-item-desc">{wf.steps.length} 步 · {wf.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="opc-sidebar-btn-row">
              <button type="button" className="opc-sidebar-new-btn" onClick={onNewSession}><Plus size={12} /> 新对话</button>
              {messages.length > 0 && <button type="button" className="opc-sidebar-clear" onClick={onClear}><Trash2 size={12} /> 清空</button>}
            </div>
          </div>
        )}

        {/* 工作流输入表单 */}
        {activeTab === "workflow" && activeWf && (
          <div className="opc-sidebar-workflow-form">
            <button type="button" className="opc-wf-back" onClick={() => { setActiveWfId(null); setWfInput({}); }}>
              <ArrowLeft size={12} /> 返回
            </button>
            <div className="opc-wf-form-title">{activeWf.icon} {activeWf.name}</div>
            <div className="opc-wf-form-desc">{activeWf.desc}</div>

            <div className="opc-wf-form-steps">
              {activeWf.steps.map((s, i) => (
                <div key={s.id} className="opc-wf-form-step">
                  <span className="opc-wf-form-step-num">{i + 1}</span>
                  <span className="opc-wf-form-step-name">{s.name}</span>
                </div>
              ))}
            </div>

            {activeWf.fields.map((f) => (
              <div key={f.key} className="opc-wf-form-field">
                <label className="opc-wf-form-label">{f.label}{f.required && <span className="opc-wf-required">*</span>}</label>
                {f.type === "textarea" ? (
                  <textarea className="opc-wf-form-textarea" placeholder={f.placeholder}
                    value={wfInput[f.key] || ""} onChange={(e) => setWfInput((p) => ({ ...p, [f.key]: e.target.value }))} rows={3} />
                ) : (
                  <input className="opc-wf-form-input" type="text" placeholder={f.placeholder}
                    value={wfInput[f.key] || ""} onChange={(e) => setWfInput((p) => ({ ...p, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}

            <button type="button" className="opc-wf-start-btn" onClick={handleStartWorkflow} disabled={!provider}>
              <Play size={12} /> 开始执行
            </button>
          </div>
        )}

        {/* 历史 tab */}
        {activeTab === "history" && (
          <div className="opc-sidebar-history">
            {sessions.length === 0 ? (
              <div className="opc-sidebar-empty">暂无历史会话</div>
            ) : sessions.map((s) => (
              <div key={s.id} role="button" tabIndex={0} className="opc-sidebar-session-item"
                onClick={() => onSwitchSession(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSwitchSession(s.id); }}>
                <span className="opc-sidebar-session-title">{s.title}</span>
                <span className="opc-sidebar-session-meta">{new Date(s.timestamp).toLocaleDateString("zh-CN")} · {s.messageCount} 轮</span>
              </div>
            ))}
          </div>
        )}

        {/* 模型 tab */}
        {activeTab === "model" && (
          <div className="opc-sidebar-model">
            <div className="opc-sidebar-section-label">当前模型</div>
            {provider ? (
              <div className="opc-sidebar-model-card">
                <div className="opc-sidebar-model-name">{provider.name}</div>
                <div className="opc-sidebar-model-id">{provider.model}</div>
                <span className={`opc-thinking-badge ${provider.thinkingLevel || "standard"}`}>
                  {THINKING_LEVELS.find((l) => l.key === (provider.thinkingLevel || "standard"))?.label || "标准"}
                </span>
              </div>
            ) : (
              <div className="opc-sidebar-empty">未配置模型<br /><span style={{ fontSize: 10, opacity: 0.6 }}>点击头部齿轮图标配置</span></div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .opc-sidebar { width: 220px; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; flex-shrink: 0; background: color-mix(in srgb, var(--space-deep) 50%, transparent); }
        .opc-sidebar-tabs { display: flex; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
        .opc-sidebar-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; border: none; background: transparent; color: var(--foreground-muted); cursor: pointer; font-family: "GeistPixel-Line", var(--font-sans); font-size: 9px; letter-spacing: 0.04em; transition: all 0.15s; outline: none; min-height: 44px; }
        .opc-sidebar-tab:hover { color: var(--foreground); }
        .opc-sidebar-tab.active { color: var(--glow-warm); background: color-mix(in srgb, var(--glow-warm) 6%, transparent); }
        .opc-sidebar-tab:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent); }
        .opc-sidebar-content { flex: 1; overflow-y: auto; padding: 10px; }

        .opc-sidebar-section-label { font-family: "GeistPixel-Line", var(--font-sans); font-size: 9px; color: var(--foreground-muted); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; margin-top: 10px; }
        .opc-sidebar-section-label:first-child { margin-top: 0; }

        .opc-wf-group { margin-bottom: 2px; }
        .opc-wf-group-header { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 8px; border-radius: 6px; border: none; background: transparent; color: var(--foreground-muted); font-size: 10px; cursor: pointer; transition: all 0.15s; outline: none; }
        .opc-wf-group-header:hover { color: var(--foreground); background: color-mix(in srgb, var(--glow-warm) 4%, transparent); }
        .opc-wf-chevron { transition: transform 0.2s; }
        .opc-wf-chevron.open { transform: rotate(180deg); }
        .opc-wf-group-list { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 4px; }
        .opc-wf-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: var(--foreground-muted); font-size: 11px; cursor: pointer; transition: all 0.15s; outline: none; text-align: left; min-height: 34px; }
        .opc-wf-item:hover { color: var(--foreground); background: color-mix(in srgb, var(--glow-warm) 6%, transparent); border-color: color-mix(in srgb, var(--glow-warm) 15%, transparent); }
        .opc-wf-item:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent); }
        .opc-wf-item-icon { font-size: 14px; flex-shrink: 0; width: 20px; text-align: center; }
        .opc-wf-item-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .opc-wf-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .opc-wf-item-desc { font-size: 9px; color: var(--foreground-muted); opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .opc-sidebar-btn-row { display: flex; gap: 6px; margin-top: 10px; }
        .opc-sidebar-new-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--glow-warm) 25%, transparent); background: color-mix(in srgb, var(--glow-warm) 6%, transparent); color: var(--glow-warm); font-size: 11px; cursor: pointer; transition: all 0.15s; min-height: 36px; }
        .opc-sidebar-new-btn:hover { background: color-mix(in srgb, var(--glow-warm) 12%, transparent); }
        .opc-sidebar-clear { display: flex; align-items: center; gap: 4px; padding: 8px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--error) 20%, transparent); background: transparent; color: var(--error); font-size: 11px; cursor: pointer; transition: all 0.15s; min-height: 36px; }
        .opc-sidebar-clear:hover { background: color-mix(in srgb, var(--error) 8%, transparent); }

        .opc-sidebar-empty { text-align: center; padding: 20px 8px; color: var(--foreground-muted); font-size: 11px; line-height: 1.6; }
        .opc-sidebar-session-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s; min-height: 44px; justify-content: center; }
        .opc-sidebar-session-item:hover { background: color-mix(in srgb, var(--glow-warm) 5%, transparent); }
        .opc-sidebar-session-item:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--glow-warm) 30%, transparent); outline: none; }
        .opc-sidebar-session-title { font-size: 12px; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .opc-sidebar-session-meta { font-size: 9px; color: var(--foreground-muted); opacity: 0.6; }

        .opc-sidebar-model-card { padding: 10px; border-radius: 8px; border: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--glow-warm) 4%, transparent); }
        .opc-sidebar-model-name { font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px; color: var(--foreground); margin-bottom: 2px; }
        .opc-sidebar-model-id { font-family: var(--font-geist-mono), monospace; font-size: 10px; color: var(--foreground-muted); margin-bottom: 6px; }
        .opc-thinking-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-family: "GeistPixel-Square", var(--font-sans); font-size: 9px; letter-spacing: 0.06em; }
        .opc-thinking-badge.quick { background: color-mix(in srgb, #4ade80 15%, transparent); color: #4ade80; border: 1px solid color-mix(in srgb, #4ade80 25%, transparent); }
        .opc-thinking-badge.standard { background: color-mix(in srgb, var(--glow-cool) 15%, transparent); color: var(--glow-cool); border: 1px solid color-mix(in srgb, var(--glow-cool) 25%, transparent); }
        .opc-thinking-badge.deep { background: color-mix(in srgb, var(--glow-warm) 15%, transparent); color: var(--glow-warm); border: 1px solid color-mix(in srgb, var(--glow-warm) 25%, transparent); }

        /* 工作流表单 */
        .opc-sidebar-workflow-form { display: flex; flex-direction: column; gap: 8px; }
        .opc-wf-back { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; color: var(--foreground-muted); font-size: 11px; cursor: pointer; transition: all 0.15s; min-height: 32px; }
        .opc-wf-back:hover { color: var(--foreground); border-color: var(--glow-warm); }
        .opc-wf-form-title { font-family: "GeistPixel-Line", var(--font-sans); font-size: 13px; color: var(--foreground); }
        .opc-wf-form-desc { font-size: 10px; color: var(--foreground-muted); line-height: 1.4; margin-bottom: 4px; }
        .opc-wf-form-steps { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
        .opc-wf-form-step { display: flex; align-items: center; gap: 6px; padding: 3px 6px; }
        .opc-wf-form-step-num { width: 18px; height: 18px; border-radius: 50%; background: color-mix(in srgb, var(--glow-warm) 10%, transparent); color: var(--glow-warm); font-size: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: "GeistPixel-Line", var(--font-sans); }
        .opc-wf-form-step-name { font-size: 10px; color: var(--foreground-muted); }
        .opc-wf-form-field { display: flex; flex-direction: column; gap: 3px; }
        .opc-wf-form-label { font-size: 10px; color: var(--foreground-muted); font-family: "GeistPixel-Line", var(--font-sans); }
        .opc-wf-required { color: var(--error); margin-left: 2px; }
        .opc-wf-form-input, .opc-wf-form-textarea { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--space-surface); color: var(--foreground); font-size: 12px; font-family: var(--font-geist-sans), sans-serif; outline: none; transition: border-color 0.15s; }
        .opc-wf-form-input:focus, .opc-wf-form-textarea:focus { border-color: color-mix(in srgb, var(--glow-warm) 35%, transparent); }
        .opc-wf-form-input::placeholder, .opc-wf-form-textarea::placeholder { color: var(--foreground-muted); opacity: 0.5; }
        .opc-wf-form-textarea { resize: vertical; min-height: 50px; }
        .opc-wf-start-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 8px; border: none; background: var(--glow-warm); color: var(--space-deep); font-family: "GeistPixel-Line", var(--font-sans); font-size: 12px; cursor: pointer; transition: all 0.15s; min-height: 40px; margin-top: 4px; }
        .opc-wf-start-btn:hover { filter: brightness(1.1); }
        .opc-wf-start-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        @media (max-width: 640px) { .opc-sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); max-height: 200px; } .opc-sidebar-content { max-height: 140px; } }
      `}</style>
    </div>
  );
}
