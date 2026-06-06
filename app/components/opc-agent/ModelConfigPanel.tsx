"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, TestTube2, Save, Eye, EyeOff, Check, X } from "lucide-react";
import {
  getProviders,
  addProvider,
  removeProvider,
  updateProvider,
  setActiveProviderId,
  testConnection,
} from "@/app/lib/llm-config";
import { PROVIDER_PRESETS, createProviderId, THINKING_LEVELS, type LLMProvider, type Protocol, type ThinkingLevel } from "@/app/lib/llm-providers";

type Props = {
  provider: LLMProvider | null;
  onChange: (provider: LLMProvider) => void;
  onClose: () => void;
};

export default function ModelConfigPanel({ provider, onChange, onClose }: Props) {
  const [providers, setProviders] = useState<LLMProvider[]>(getProviders);
  const [showAdd, setShowAdd] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  // 新模型表单
  const [formName, setFormName] = useState("");
  const [formProtocol, setFormProtocol] = useState<Protocol>("openai");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formThinkingLevel, setFormThinkingLevel] = useState<ThinkingLevel>("standard");
  const [formMaxTokens, setFormMaxTokens] = useState(2048);
  const [formTemperature, setFormTemperature] = useState(0.7);
  const [formSearchEnabled, setFormSearchEnabled] = useState(false);
  const [formContextWindow, setFormContextWindow] = useState(8192);

  // 测试状态
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const resetForm = () => {
    setFormName("");
    setFormProtocol("openai");
    setFormBaseUrl("");
    setFormApiKey("");
    setFormModel("");
    setFormThinkingLevel("standard");
    setFormMaxTokens(2048);
    setFormTemperature(0.7);
    setFormSearchEnabled(false);
    setFormContextWindow(8192);
  };

  // 从预置填充
  const fillPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
    setFormName(preset.name);
    setFormProtocol(preset.protocol);
    setFormBaseUrl(preset.baseUrl);
    setFormModel(preset.defaultModel);
    setFormThinkingLevel(preset.thinkingLevel);
    setFormSearchEnabled(preset.searchEnabled ?? false);
    setFormContextWindow(preset.contextWindow ?? 8192);
  };

  // 添加模型
  const handleAdd = () => {
    if (!formName.trim() || !formBaseUrl.trim() || !formModel.trim()) return;
    // 校验模型 ID — 不能包含 [] 或空格
    if (/[[\]\s]/.test(formModel.trim())) {
      setTestResult((prev) => ({ ...prev, __add: { ok: false, msg: "模型 ID 不能包含空格或方括号" } }));
      return;
    }
    const newProvider: LLMProvider = {
      id: createProviderId(),
      name: formName.trim(),
      protocol: formProtocol,
      baseUrl: formBaseUrl.trim(),
      apiKey: formApiKey.trim(),
      model: formModel.trim(),
      thinkingLevel: formThinkingLevel,
      maxTokens: formMaxTokens,
      temperature: formTemperature,
      searchEnabled: formSearchEnabled,
      contextWindow: formContextWindow,
    };
    addProvider(newProvider);
    setProviders(getProviders());
    setShowAdd(false);
    resetForm();
    // 自动选中新添加的
    setActiveProviderId(newProvider.id);
    onChange(newProvider);
  };

  // 删除模型（带确认）
  const handleDelete = (id: string) => {
    const p = providers.find((pr) => pr.id === id);
    if (!confirm(`确定要删除模型"${p?.name || id}"吗？`)) return;
    removeProvider(id);
    setProviders(getProviders());
  };

  // 测试连接
  const handleTest = async (p: LLMProvider) => {
    setTesting(p.id);
    setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg: "测试中…" } }));
    const result = await testConnection(p);
    setTestResult((prev) => ({ ...prev, [p.id]: { ok: result.ok, msg: result.message } }));
    setTesting(null);
  };

  return (
    <div className="opc-config-panel">
      <div className="opc-config-header">
        <button type="button" className="opc-config-back" onClick={onClose}>
          <ArrowLeft size={14} /> 返回
        </button>
        <span className="opc-config-title">模型配置</span>
      </div>

      <div className="opc-config-body">
        {/* 已配置列表 */}
        {providers.map((p) => (
          <div key={p.id} className={`opc-config-card ${p.id === provider?.id ? "active" : ""}`}>
            <div className="opc-config-card-info">
              <div className="opc-config-card-name">{p.name}</div>
              <div className="opc-config-card-meta">
                <span className="opc-config-card-protocol">{p.protocol}</span>
                <span className="opc-config-card-model">{p.model}</span>
                {p.searchEnabled && <span className="opc-config-card-search">搜索</span>}
                {p.contextWindow && p.contextWindow > 8192 && (
                  <span className="opc-config-card-ctx">{p.contextWindow >= 1000000 ? `${p.contextWindow / 1000000}M` : `${Math.round(p.contextWindow / 1000)}K`}</span>
                )}
              </div>
              <div className="opc-config-card-key">
                {showKey[p.id] ? p.apiKey : p.apiKey ? "••••••••" : "未设置"}
                {p.apiKey && (
                  <button type="button" className="opc-config-key-toggle" onClick={() => setShowKey((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                    {showKey[p.id] ? <EyeOff size={10} /> : <Eye size={10} />}
                  </button>
                )}
              </div>
              {testResult[p.id] && (
                <div className={`opc-config-test-result ${testResult[p.id].ok ? "ok" : "fail"}`}>
                  {testResult[p.id].ok ? <Check size={10} /> : <X size={10} />}
                  {testResult[p.id].msg}
                </div>
              )}
            </div>
            <div className="opc-config-card-actions">
              <button type="button" className="opc-config-action" onClick={() => handleTest(p)} disabled={testing === p.id}>
                <TestTube2 size={12} />
              </button>
              <button type="button" className="opc-config-action" onClick={() => { setActiveProviderId(p.id); onChange(p); }}>
                <Check size={12} />
              </button>
              <button type="button" className="opc-config-action danger" onClick={() => handleDelete(p.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* 添加按钮 / 表单 */}
        {showAdd ? (
          <div className="opc-config-form">
            <div className="opc-config-form-title">添加模型</div>

            {/* 预置快选 */}
            <div className="opc-config-presets">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="opc-config-preset-btn"
                  onClick={() => fillPreset(preset)}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            {/* 协议选择 */}
            <div className="opc-config-field">
              <label className="opc-config-label">协议格式</label>
              <div className="opc-config-radio-group">
                <button type="button" className={`opc-config-radio ${formProtocol === "openai" ? "active" : ""}`} onClick={() => setFormProtocol("openai")}>
                  OpenAI 兼容
                </button>
                <button type="button" className={`opc-config-radio ${formProtocol === "anthropic" ? "active" : ""}`} onClick={() => setFormProtocol("anthropic")}>
                  Anthropic
                </button>
              </div>
            </div>

            <ConfigInput label="显示名称" value={formName} onChange={setFormName} placeholder="如: DeepSeek V3" />
            <ConfigInput label="API 地址" value={formBaseUrl} onChange={setFormBaseUrl} placeholder="https://api.deepseek.com" />
            <ConfigInput label="API Key" value={formApiKey} onChange={setFormApiKey} placeholder="sk-..." type="password" />
            <ConfigInput label="模型 ID" value={formModel} onChange={setFormModel} placeholder="deepseek-chat" />

            {/* 高级设置 */}
            <details className="opc-config-advanced">
              <summary>高级设置</summary>
              <div className="opc-config-advanced-body">
                <div className="opc-config-row">
                  <ConfigInput label="最大 Token" value={String(formMaxTokens)} onChange={(v) => setFormMaxTokens(Number(v) || 2048)} type="number" />
                  <ConfigInput label="温度" value={String(formTemperature)} onChange={(v) => setFormTemperature(Number(v) || 0.7)} type="number" />
                </div>
                <div className="opc-config-row">
                  <ConfigInput label="上下文窗口" value={String(formContextWindow)} onChange={(v) => setFormContextWindow(Number(v) || 8192)} type="number" placeholder="8192" />
                  <div className="opc-config-field" style={{ flex: 1 }}>
                    <label className="opc-config-label">联网搜索</label>
                    <button
                      type="button"
                      className={`opc-config-radio ${formSearchEnabled ? "active" : ""}`}
                      onClick={() => setFormSearchEnabled(!formSearchEnabled)}
                      style={{ width: "100%", marginTop: 3 }}
                    >
                      {formSearchEnabled ? "已启用" : "未启用"}
                    </button>
                  </div>
                </div>
                <div className="opc-config-field">
                  <label className="opc-config-label">思考程度</label>
                  <div className="opc-config-radio-group">
                    {THINKING_LEVELS.map((lvl) => (
                      <button key={lvl.key} type="button" className={`opc-config-radio ${formThinkingLevel === lvl.key ? "active" : ""}`} onClick={() => setFormThinkingLevel(lvl.key)} title={lvl.desc}>
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            <div className="opc-config-form-actions">
              <button type="button" className="opc-config-cancel" onClick={() => { setShowAdd(false); resetForm(); }}>取消</button>
              <button type="button" className="opc-config-save" onClick={handleAdd} disabled={!formName || !formBaseUrl || !formModel}>
                <Save size={12} /> 保存
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="opc-config-add" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> 添加模型
          </button>
        )}
      </div>

      <style>{`
        .opc-config-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .opc-config-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .opc-config-back {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .opc-config-back:hover { color: var(--foreground); border-color: var(--glow-warm); }
        .opc-config-title {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 13px;
          color: var(--foreground);
        }

        .opc-config-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .opc-config-card {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--space-surface);
          transition: border-color 0.15s;
        }
        .opc-config-card.active {
          border-color: color-mix(in srgb, var(--glow-warm) 35%, transparent);
          background: color-mix(in srgb, var(--glow-warm) 5%, var(--space-surface));
        }
        .opc-config-card-info { flex: 1; min-width: 0; }
        .opc-config-card-name {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 12px;
          color: var(--foreground);
        }
        .opc-config-card-meta {
          display: flex;
          gap: 6px;
          margin-top: 2px;
        }
        .opc-config-card-protocol {
          font-size: 9px;
          color: var(--glow-cool);
          padding: 1px 4px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--glow-cool) 10%, transparent);
        }
        .opc-config-card-search {
          font-size: 9px;
          color: #4ade80;
          padding: 1px 4px;
          border-radius: 3px;
          background: color-mix(in srgb, #4ade80 10%, transparent);
        }
        .opc-config-card-ctx {
          font-size: 9px;
          color: var(--glow-aurora);
          padding: 1px 4px;
          border-radius: 3px;
          background: color-mix(in srgb, var(--glow-aurora) 10%, transparent);
        }
        .opc-config-card-model {
          font-family: var(--font-geist-mono), monospace;
          font-size: 9px;
          color: var(--foreground-muted);
        }
        .opc-config-card-key {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 3px;
          font-family: var(--font-geist-mono), monospace;
          font-size: 9px;
          color: var(--foreground-muted);
        }
        .opc-config-key-toggle {
          background: none;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          padding: 2px;
          display: flex;
        }
        .opc-config-test-result {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 4px;
          font-size: 10px;
        }
        .opc-config-test-result.ok { color: #4ade80; }
        .opc-config-test-result.fail { color: var(--error); }

        .opc-config-card-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .opc-config-action {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .opc-config-action:hover { color: var(--foreground); border-color: var(--glow-warm); }
        .opc-config-action.danger:hover { color: var(--error); border-color: var(--error); }

        .opc-config-add {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px;
          border-radius: 8px;
          border: 1px dashed var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          cursor: pointer;
          font-size: 12px;
          transition: all 0.15s;
        }
        .opc-config-add:hover {
          border-color: var(--glow-warm);
          color: var(--glow-warm);
        }

        /* 添加表单 */
        .opc-config-form {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--space-surface);
        }
        .opc-config-form-title {
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 13px;
          color: var(--foreground);
          margin-bottom: 10px;
        }

        .opc-config-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 10px;
        }
        .opc-config-preset-btn {
          padding: 3px 8px;
          border-radius: 5px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          font-size: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .opc-config-preset-btn:hover {
          border-color: var(--glow-warm);
          color: var(--glow-warm);
        }

        .opc-config-field {
          margin-bottom: 8px;
        }
        .opc-config-label {
          display: block;
          font-size: 10px;
          color: var(--foreground-muted);
          margin-bottom: 3px;
        }
        .opc-config-input {
          width: 100%;
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--space-panel);
          color: var(--foreground);
          font-family: var(--font-geist-mono), monospace;
          font-size: 11px;
          outline: none;
          transition: border-color 0.15s;
        }
        .opc-config-input:focus {
          border-color: color-mix(in srgb, var(--glow-warm) 40%, transparent);
        }
        .opc-config-input::placeholder {
          color: var(--foreground-muted);
          opacity: 0.4;
        }

        .opc-config-radio-group {
          display: flex;
          gap: 4px;
        }
        .opc-config-radio {
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .opc-config-radio.active {
          border-color: var(--glow-warm);
          color: var(--glow-warm);
          background: color-mix(in srgb, var(--glow-warm) 8%, transparent);
        }

        .opc-config-row {
          display: flex;
          gap: 8px;
        }
        .opc-config-row > * { flex: 1; }

        .opc-config-advanced {
          margin-bottom: 8px;
        }
        .opc-config-advanced summary {
          font-size: 10px;
          color: var(--foreground-muted);
          cursor: pointer;
          padding: 4px 0;
        }
        .opc-config-advanced-body {
          padding-top: 8px;
        }

        .opc-config-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 10px;
        }
        .opc-config-cancel {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--foreground-muted);
          font-size: 11px;
          cursor: pointer;
        }
        .opc-config-save {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 14px;
          border-radius: 6px;
          border: none;
          background: var(--glow-warm);
          color: var(--space-deep);
          font-family: "GeistPixel-Line", var(--font-sans);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .opc-config-save:hover {
          filter: brightness(1.1);
        }
        .opc-config-save:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function ConfigInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="opc-config-field">
      <label className="opc-config-label">{label}</label>
      <input
        className="opc-config-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
