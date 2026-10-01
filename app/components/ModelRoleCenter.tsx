"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Bot, Boxes, KeyRound, Plus, PlugZap, RefreshCw, ShieldAlert, Sparkles, Trash2, UserRoundCog } from "lucide-react";
import { captureCreativeApi, creativeApi, type AgentRole, type SafeProvider } from "@/app/lib/creative-agent-api";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import PluginCenter from "@/app/components/plugin-center/PluginCenter";
import { PluginSlot } from "@/app/components/plugin-slots/PluginSlot";
import type { AccessMode } from "@/app/lib/entry-flow";
import { emptyProvider, PROVIDER_PRESETS } from "@/app/lib/provider-presets";
import { ModelProviderForm } from "./ModelProviderForm";
import { StatusGlow } from "./StatusGlow";

type RoleCard = Pick<AgentRole, "name" | "prompt" | "capabilities"> & { defaultProviderId?: string | null; enabled?: boolean };
type Plugin = { id: string; name: string; version: string; enabled: number; change_note: string };

type MainTab = "models" | "roles" | "plugins";

function readInitialTab(): MainTab {
  if (typeof window === "undefined") return "models";
  const params = new URLSearchParams(window.location.search);
  const value = params.get("center");
  return value === "roles" || value === "plugins" ? value : "models";
}

export default function ModelRoleCenter({ accessMode, onAuthRequired, pluginCenterAdapter }: { accessMode: AccessMode; onAuthRequired: () => void; pluginCenterAdapter?: PluginCenterAdapter | null }) {
  const authenticated = accessMode === "authenticated";
  const [mainTab, setMainTab] = useState<MainTab>(readInitialTab);
  const [providers, setProviders] = useState<SafeProvider[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [providerForm, setProviderForm] = useState(emptyProvider);
  const [providerFormVersion, setProviderFormVersion] = useState(0);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleCard>({ name: "", prompt: "", capabilities: [], defaultProviderId: null });
  const [roleBrief, setRoleBrief] = useState("");
  const [candidate, setCandidate] = useState<RoleCard | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const latestRead = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);

  const refresh = useCallback(async (initiator?: AbortController) => {
    if (!mounted.current || !authenticated || (operation.current && operation.current !== initiator)) return false;
    latestRead.current?.abort();
    const controller = new AbortController();
    latestRead.current = controller; requests.current.add(controller);
    const current = () => mounted.current && !controller.signal.aborted && latestRead.current === controller;
    const request = captureCreativeApi();
    try {
      const [modelData, roleData, pluginData] = await Promise.all([
        request<{ providers: SafeProvider[] }>("/api/model-providers", { signal: controller.signal }),
        request<{ roles: AgentRole[] }>("/api/agent-roles", { signal: controller.signal }),
        request<{ plugins: Plugin[] }>("/api/admin/plugins", { signal: controller.signal }),
      ]);
      if (!current()) return false;
      setProviders(modelData.providers); setRoles(roleData.roles); setPlugins(pluginData.plugins);
      return true;
    } catch (cause) {
      if (current() && !(cause instanceof DOMException && cause.name === "AbortError")) setStatus(cause instanceof Error ? cause.message : "无法读取模型中心");
      return false;
    } finally {
      requests.current.delete(controller);
      if (latestRead.current === controller) latestRead.current = null;
    }
  }, [authenticated]);
  useEffect(() => {
    mounted.current = true;
    const pending = requests.current;
    const timer = window.setTimeout(() => { setBusy(false); void refresh(); }, 0);
    return () => {
      window.clearTimeout(timer); mounted.current = false;
      for (const controller of pending) controller.abort(); pending.clear();
      latestRead.current = null; operation.current = null;
    };
  }, [refresh]);

  const runOperation = async (action: (request: typeof creativeApi, current: () => boolean) => Promise<void>, fallback: string) => {
    if (!mounted.current || !authenticated || operation.current) return;
    latestRead.current?.abort(); latestRead.current = null;
    const controller = new AbortController(); operation.current = controller; requests.current.add(controller);
    const current = () => mounted.current && !controller.signal.aborted && operation.current === controller;
    const captured = captureCreativeApi();
    const request = <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      if (!current()) return Promise.reject(new DOMException("当前操作已取消", "AbortError"));
      return captured<T>(path, { ...options, signal: controller.signal });
    };
    setStatus(""); setBusy(true);
    try {
      await action(request, current);
      if (current()) await refresh(controller);
    } catch (cause) {
      if (!current() || (cause instanceof DOMException && cause.name === "AbortError")) return;
      const message = cause instanceof Error ? cause.message : fallback;
      const statusCode = cause && typeof cause === "object" && "status" in cause ? Number(cause.status) : NaN;
      if (!Number.isFinite(statusCode) || statusCode >= 500) {
        // A missing/error reply does not undo an already committed mutation.
        // Read authoritative state; never automatically repeat the write/model call.
        const reread = await refresh(controller);
        if (current()) setStatus(`${message}。${reread ? "已重新读取当前列表，请核对操作结果后再决定是否重试。" : "当前结果尚未确认，请先重新读取状态；不要重复提交或重新调用模型。"}`);
      } else setStatus(message);
    } finally {
      const active = current(); requests.current.delete(controller);
      if (operation.current === controller) operation.current = null;
      if (active) setBusy(false);
    }
  };
  // 主标签 → URL query（center=plugins&…）刷新恢复（规划 Task 11 Step 3）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (mainTab === "models") params.delete("center");
    else params.set("center", mainTab);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [mainTab]);
  const saveProvider = async (event: FormEvent) => {
    event.preventDefault();
    await runOperation(async (request, current) => {
      await request(editingProviderId ? `/api/model-providers/${encodeURIComponent(editingProviderId)}` : "/api/model-providers", { method: editingProviderId ? "PUT" : "POST", body: JSON.stringify({ ...providerForm, contextWindowTokens: providerForm.contextWindowTokens.trim() ? Number(providerForm.contextWindowTokens) : null, maxOutputTokens: Number(providerForm.maxOutputTokens), safetyMarginTokens: Number(providerForm.safetyMarginTokens) }) });
      if (!current()) return;
      setProviderForm(emptyProvider); setEditingProviderId(null); setProviderFormVersion(version=>version+1); setStatus("模型已保存。修改连接配置后需要重新验证；密钥不会回传。");
    }, "保存失败");
  };
  const testProvider = async (id: string) => {
    await runOperation(async (request, current) => {
      await request(`/api/model-providers/${id}/test`, { method: "POST", body: "{}" });
      if (current()) setStatus("模型连接验证成功。");
    }, "验证失败");
  };
  const generateRoleCard = async () => {
    if (!roleBrief.trim()) return;
    await runOperation(async (request, current) => {
      const data = await request<{ card: RoleCard }>("/api/agent-roles/suggest", { method: "POST", body: JSON.stringify({ description: roleBrief }) });
      if (current()) { setEditingRoleId(null); setCandidate(data.card); }
    }, "角色卡生成失败");
  };
  const saveRole = async (event: FormEvent) => {
    event.preventDefault(); const value = candidate || roleForm;
    await runOperation(async (request, current) => {
      await request(editingRoleId ? `/api/agent-roles/${encodeURIComponent(editingRoleId)}` : "/api/agent-roles", { method: editingRoleId ? "PUT" : "POST", body: JSON.stringify(value) });
      if (!current()) return;
      setCandidate(null); setEditingRoleId(null); setRoleForm({ name: "", prompt: "", capabilities: [], defaultProviderId: null }); setStatus("角色已保存到你的个人角色库。");
    }, "保存角色失败");
  };
  const editProvider = (provider: SafeProvider) => {
    setEditingProviderId(provider.id);
    const preset = PROVIDER_PRESETS.find(item=>item.baseUrl===provider.baseUrl && item.protocol===provider.protocol);
    setProviderFormVersion(version=>version+1);
    setProviderForm({ name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, model: provider.model, apiKey: "", makeActive: provider.isActive, vendorId: provider.vendorId || preset?.vendorId || "custom", websiteUrl: provider.websiteUrl || preset?.websiteUrl || "", thinkingMode: provider.thinkingMode || "default", contextWindowTokens: provider.contextWindowTokens == null ? "" : String(provider.contextWindowTokens), maxOutputTokens: String(provider.maxOutputTokens ?? 2000), safetyMarginTokens: String(provider.safetyMarginTokens ?? 1024), outputTokenParameter: provider.outputTokenParameter || "max_tokens" });
    setStatus("");
  };
  const editRole = (role: AgentRole) => {
    setEditingRoleId(role.id); setCandidate(null);
    setRoleForm({ name: role.name, prompt: role.prompt, capabilities: [...role.capabilities], defaultProviderId: role.defaultProviderId, enabled: role.enabled });
    setStatus("");
  };
  const mutateItem = async (path: string, method: "PUT" | "DELETE", body?: Record<string, unknown>) => {
    await runOperation(async (request, current) => {
      await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!current()) return;
      if (method === "DELETE" && path.endsWith(`/${editingProviderId}`)) { setEditingProviderId(null); setProviderForm(emptyProvider); }
      if (method === "DELETE" && path.endsWith(`/${editingRoleId}`)) { setEditingRoleId(null); setCandidate(null); setRoleForm({ name: "", prompt: "", capabilities: [], defaultProviderId: null }); }
      const deletedProviderId = method === "DELETE" && path.startsWith("/api/model-providers/") ? path.split("/").pop() : null;
      if (deletedProviderId) {
        setRoleForm(current => current.defaultProviderId === deletedProviderId ? { ...current, defaultProviderId: null } : current);
        setCandidate(current => current?.defaultProviderId === deletedProviderId ? { ...current, defaultProviderId: null } : current);
      }
      setStatus(deletedProviderId ? "模型已删除，相关角色改为跟随当前激活模型；已有运行快照保留。" : method === "DELETE" ? "已删除。" : "已更新。");
    }, "操作结果尚未确认");
  };
  if (!authenticated) {
    return <section className="model-center"><header className="model-center__hero"><div><span><UserRoundCog size={14} /> 账号能力</span><h1 className="page-title">模型与角色中心</h1><p>登录后可安全托管模型密钥、创建角色并配置项目编队。</p></div><button type="button" onClick={onAuthRequired}><KeyRound size={16} />登录后配置</button></header>
      <MainTabs mainTab={mainTab} setMainTab={setMainTab} />
      {mainTab === "plugins" && <PluginsTabBody pluginCenterAdapter={pluginCenterAdapter} accessMode={accessMode} onAuthRequired={onAuthRequired} legacyPlugins={plugins} />}
    </section>;
  }
  return <section className="model-center"><header className="model-center__hero"><div><span><UserRoundCog size={14} /> 个人模型工作台</span><h1 className="page-title">模型与角色中心</h1><p>在这里托管非 Coze 模型、维护个人角色库；密钥是一次性写入，不会出现在页面、日志或运行记录中。</p></div><button type="button" className="edge-glow--interactive" disabled={busy} onClick={() => void refresh()} aria-label="刷新模型与角色中心"><RefreshCw size={16} />刷新</button></header>
    <MainTabs mainTab={mainTab} setMainTab={setMainTab} />
    {status && <p className="model-center__status" role="status">{status}</p>}
    {mainTab === "models" && <div className="model-center__grid"><section className="center-card center-card--models edge-glow edge-glow-subtle"><header><div><KeyRound size={18} /><h2>已托管模型</h2></div><small>服务端加密 · 按账号隔离</small></header><div className="provider-list">{providers.length ? providers.map((provider) => <article key={provider.id}><div><b>{provider.name}{provider.isActive ? " · 默认" : ""}</b><span>{provider.model} · {provider.protocol}</span></div><small>{provider.hasSecret ? `已保存密钥 •••• ${provider.keyLast4 || ""}` : "需要重新录入密钥"}</small><div className="provider-list__actions"><button type="button" disabled={busy} onClick={() => editProvider(provider)}>编辑</button><button type="button" disabled={busy || editingProviderId === provider.id} onClick={() => void mutateItem(`/api/model-providers/${provider.id}`, "PUT", { makeActive: !provider.isActive })}>{provider.isActive ? "取消默认" : "设为默认"}</button><button type="button" className="edge-glow--interactive" onClick={() => void testProvider(provider.id)} disabled={busy}><StatusGlow value={provider.verifiedAt || ""} success={!!provider.verifiedAt}>{provider.verifiedAt ? "已验证" : "验证连接"}</StatusGlow></button><button type="button" className="danger" disabled={busy} aria-label={`删除模型 ${provider.name}`} onClick={() => void mutateItem(`/api/model-providers/${provider.id}`, "DELETE")}> <Trash2 size={14} /></button></div></article>) : <p className="center-empty">还没有模型连接。选择厂商 → 配置连接与密钥 → 获取模型 → 保存连接。</p>}</div><ModelProviderForm key={`${editingProviderId || "new"}:${providerFormVersion}`} value={providerForm} editingProviderId={editingProviderId} hasSavedSecret={!!editingProviderId && providers.some(provider=>provider.id===editingProviderId && provider.hasSecret)} busy={busy} onChange={setProviderForm} onSubmit={saveProvider} onCancel={() => { setEditingProviderId(null);setProviderForm(emptyProvider); }} /></section>
    </div>}
    {mainTab === "roles" && <div className="model-center__grid">
      <section className="center-card center-card--roles edge-glow edge-glow-subtle"><header><div><Bot size={18} /><h2>个人角色库</h2></div><small>项目可复制并覆写，不修改原角色</small></header><div className="role-list">{roles.length ? roles.map((role) => <article key={role.id}><b>{role.name}{role.enabled ? "" : " · 已停用"}</b><p>{role.prompt}</p><div>{role.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div><div className="role-list__actions"><button type="button" disabled={busy} onClick={() => editRole(role)}>编辑</button><button type="button" disabled={busy || editingRoleId === role.id} onClick={() => void mutateItem(`/api/agent-roles/${role.id}`, "PUT", { enabled: !role.enabled })}>{role.enabled ? "停用" : "启用"}</button><button type="button" className="danger" disabled={busy} aria-label={`删除${role.name}`} onClick={() => void mutateItem(`/api/agent-roles/${role.id}`, "DELETE")}><Trash2 size={14} /></button></div></article>) : <p className="center-empty">还没有角色。标准协作会临时使用主管、研究、创意、审校四角色。</p>}</div><div className="role-generator"><h3><Sparkles size={15} />让 AI 生成角色卡</h3><textarea className="collab-border-flow" value={roleBrief} onChange={(event) => setRoleBrief(event.target.value)} placeholder="例如：我需要一个擅长分析国风短片服装与材质一致性的角色。" /><button type="button" className="edge-glow--interactive" onClick={() => void generateRoleCard()} disabled={busy || !roleBrief.trim()}>AI 生成角色卡</button></div><form className="role-form" onSubmit={saveRole}><h3>{editingRoleId ? "编辑角色" : "新增角色"}</h3>{candidate && <div className="candidate-card"><strong>待确认角色卡</strong><label>名称<input className="collab-border-flow" value={candidate.name} onChange={(event) => setCandidate({ ...candidate, name: event.target.value })} /></label><label>角色提示词<textarea className="collab-border-flow" value={candidate.prompt} onChange={(event) => setCandidate({ ...candidate, prompt: event.target.value })} /></label><label>能力标签（逗号分隔）<input className="collab-border-flow" value={candidate.capabilities.join(", ")} onChange={(event) => setCandidate({ ...candidate, capabilities: event.target.value.split(/[,，]/).map((item) => item.trim()) })} /></label></div>} {!candidate && <><label>手动角色名称<input className="collab-border-flow" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} /></label><label>角色提示词<textarea className="collab-border-flow" value={roleForm.prompt} onChange={(event) => setRoleForm({ ...roleForm, prompt: event.target.value })} /></label><label>能力标签（逗号分隔）<input className="collab-border-flow" value={roleForm.capabilities.join(", ")} onChange={(event) => setRoleForm({ ...roleForm, capabilities: event.target.value.split(/[,，]/).map(item => item.trim()) })} /></label></>}<label>角色默认模型<select className="collab-border-flow" value={(candidate || roleForm).defaultProviderId || ""} onChange={(event) => candidate ? setCandidate({ ...candidate, defaultProviderId: event.target.value || null }) : setRoleForm({ ...roleForm, defaultProviderId: event.target.value || null })}><option value="">跟随当前激活模型</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}</select></label><button type="submit" className="edge-glow--interactive" disabled={busy || !(candidate ? candidate.name && candidate.prompt : roleForm.name && roleForm.prompt)}><Plus size={16} />{editingRoleId ? "保存修改" : "确认保存角色"}</button>{editingRoleId && <button type="button" disabled={busy} onClick={() => { setEditingRoleId(null); setCandidate(null); setRoleForm({ name: "", prompt: "", capabilities: [], defaultProviderId: null }); }}>取消编辑</button>}</form></section>
    </div>}
    {mainTab === "plugins" && <PluginsTabBody pluginCenterAdapter={pluginCenterAdapter} accessMode={accessMode} onAuthRequired={onAuthRequired} legacyPlugins={plugins} />}
    <style>{`.model-center__hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px}.model-center__hero span{display:flex;align-items:center;gap:7px;color:var(--glow-cool);font: var(--weight-regular) var(--text-caption-size)/var(--text-caption-line) var(--font-ui);letter-spacing:.08em}.model-center h1{margin:8px 0 6px;color:var(--foreground);font-size:clamp(31px,4vw,50px);letter-spacing:-.055em}.model-center__hero p{max-width:720px;margin:0;color:var(--foreground-muted);line-height:1.65}.model-center__hero>button{flex-shrink:0;white-space:nowrap;height:40px;padding:0 12px;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-panel);color:var(--foreground);display:flex;align-items:center;gap:7px;cursor:pointer}.model-center__status{padding:10px 12px;border:1px solid color-mix(in srgb,var(--glow-cool) 28%,var(--border-subtle));border-radius: var(--shape-control);background:color-mix(in srgb,var(--glow-cool) 7%,transparent);color:var(--foreground);font-size: var(--text-label-size); line-height: var(--text-label-line); }.center-card{padding:18px;border:1px solid var(--border-subtle);border-radius: var(--shape-card);background:linear-gradient(145deg,color-mix(in srgb,var(--space-panel) 92%,#000),var(--space-panel));min-width:0}.center-card>header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid var(--border-subtle)}.center-card>header>div{display:flex;gap:8px;align-items:center}.center-card h2{margin:0;font-size: var(--text-heading-size);color:var(--foreground); line-height: var(--text-heading-line); }.center-card header svg{color:var(--glow-warm)}.center-card header small{max-width:140px;color: var(--text-muted);font-size: var(--text-caption-size);line-height: var(--text-caption-line);text-align:right}.provider-list,.role-list,.plugin-list{display:flex;flex-direction:column;gap:8px;margin:14px 0}.provider-list article{display:grid;grid-template-columns:1fr auto;gap:5px 9px;padding:11px;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-surface)}.provider-list b,.role-list b,.plugin-list b{display:block;color:var(--foreground);font-size: var(--text-label-size); line-height: var(--text-label-line); }.provider-list span{display:block;margin-top:2px;color: var(--text-muted);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.provider-list small{color:var(--glow-cool);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.provider-list__actions{grid-column:1/-1;display:flex;align-items:center;gap:5px;flex-wrap:wrap}.provider-list button,.role-generator button,.role-form>button,.provider-form>button{border:0;border-radius: var(--shape-control);background:var(--glow-warm);color:var(--space-deep);padding:9px 11px;font-weight: var(--weight-semibold);font-size: var(--text-label-size);display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer; line-height: var(--text-label-line); }.provider-list button.danger,.role-list button.danger{width:32px;height:32px;padding:0;background:transparent;border:1px solid color-mix(in srgb,var(--error) 35%,var(--border-subtle));color:var(--error);display:grid;place-items:center}.provider-form,.role-form{display:flex;flex-direction:column;gap:9px;margin-top:15px;padding-top:15px;border-top:1px solid var(--border-subtle)}.provider-form h3,.role-generator h3{margin:0;color:var(--foreground);font-size: var(--text-body-size); line-height: var(--text-body-line); }.provider-form label,.role-form label,.candidate-card label{display:flex;flex-direction:column;gap:5px;color: var(--text-muted);font-size: var(--text-label-size);font-weight: var(--weight-medium); line-height: var(--text-label-line); }.provider-form input,.provider-form select,.role-form input,.role-form textarea,.role-generator textarea{box-sizing:border-box;width:100%;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-surface);color:var(--foreground);padding:9px;font-size: var(--text-label-size);font-weight: var(--weight-regular);font-family:var(--font-geist-sans),sans-serif; line-height: var(--text-label-line); }.provider-form .check{flex-direction:row;align-items:center}.two-fields{display:grid;grid-template-columns:1fr .85fr;gap:9px}.role-list article{position:relative;padding:11px;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-surface)}.role-list p{margin:5px 30px 8px 0;color: var(--text-muted);font-size: var(--text-caption-size);line-height: var(--text-caption-line)}.role-list span{display:inline-block;margin-right:4px;padding:3px 6px;border-radius:99px;background:color-mix(in srgb,var(--glow-cool) 12%,transparent);color:var(--glow-cool);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.role-list__actions{display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap}.role-list__actions button{position:static;border:1px solid var(--border-subtle);border-radius: var(--shape-control);padding:7px 10px;color:var(--foreground);background:var(--space-panel);cursor:pointer}.role-list__actions button:disabled{opacity:.5;cursor:not-allowed}.role-generator{padding:13px;border:1px dashed color-mix(in srgb,var(--glow-warm) 40%,var(--border-subtle));border-radius: var(--shape-control);background:color-mix(in srgb,var(--glow-warm) 4%,transparent)}.role-generator h3{display:flex;gap:6px;align-items:center}.role-generator textarea{min-height:74px;margin:10px 0;resize:vertical}.candidate-card{display:flex;flex-direction:column;gap:8px;padding:11px;border:1px solid color-mix(in srgb,var(--glow-cool) 34%,var(--border-subtle));border-radius: var(--shape-control);background:color-mix(in srgb,var(--glow-cool) 6%,var(--space-surface))}.candidate-card strong{color:var(--glow-cool);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.plugin-warning{display:flex;gap:8px;margin:14px 0;padding:11px;border-radius: var(--shape-control);background:color-mix(in srgb,var(--error) 8%,transparent);color: var(--text-muted);font-size: var(--text-caption-size);line-height: var(--text-caption-line)}.plugin-warning svg{flex-shrink:0;color:var(--error)}.plugin-list article{padding:10px;border:1px solid var(--border-subtle);border-radius: var(--shape-control)}.plugin-list span{color:var(--glow-warm);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.plugin-list p{margin:5px 0 0;color: var(--text-muted);font-size: var(--text-caption-size); line-height: var(--text-caption-line); }.center-empty{padding:15px 0;color: var(--text-muted);font-size: var(--text-caption-size);line-height: var(--text-caption-line)}.provider-list article,.role-list article,.plugin-list article{transition:border-color .2s var(--ease-out-quart),transform .2s var(--ease-out-quart),box-shadow .2s var(--ease-out-quart)}.provider-list article:hover,.role-list article:hover,.plugin-list article:hover{border-color:color-mix(in srgb,var(--glow-warm) 40%,transparent);transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.3),0 0 18px color-mix(in srgb,var(--glow-warm) 10%,transparent)}@media(prefers-reduced-motion:reduce){.provider-list article,.role-list article,.plugin-list article{transition:none}.provider-list article:hover,.role-list article:hover,.plugin-list article:hover{transform:none}}@media(max-width:1050px){.center-card--plugins{grid-column:1/-1}}@media(max-width:700px){.model-center{width:calc(100% - 20px)}.model-center__hero{align-items:flex-start;flex-direction:column}.model-center__grid{grid-template-columns:1fr}.center-card--plugins{grid-column:auto}.two-fields{grid-template-columns:1fr}}.model-center__tabs{display:flex;gap:6px;margin:2px 0 14px;flex-wrap:wrap}.model-center__tab{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border:1px solid var(--border-subtle);border-radius: var(--shape-control);background:var(--space-panel);color: var(--text-muted);font-size: var(--text-label-size);cursor:pointer;transition:color .16s var(--ease-out-quart),border-color .16s var(--ease-out-quart); line-height: var(--text-label-line); }.model-center__tab:hover{color:var(--foreground);border-color:color-mix(in srgb,var(--glow-warm) 40%,transparent)}.model-center__tab.is-active{color:var(--glow-warm);border-color:var(--glow-warm);background:color-mix(in srgb,var(--glow-warm) 9%,transparent)}.model-center__plugin-tab{display:flex;flex-direction:column;gap:14px}`}</style>
  </section>;
}

// ---- 三主标签 tablist（models | roles | plugins）----

function MainTabs({ mainTab, setMainTab }: { mainTab: MainTab; setMainTab: (tab: MainTab) => void }) {
  const tabs: Array<{ key: MainTab; label: string; icon: typeof Boxes }> = [
    { key: "models", label: "模型", icon: KeyRound },
    { key: "roles", label: "角色", icon: Bot },
    { key: "plugins", label: "插件", icon: Boxes },
  ];
  return (
    <div className="model-center__tabs" role="tablist" aria-label="模型 / 角色 / 插件">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mainTab === key}
          className={`model-center__tab${mainTab === key ? " is-active" : ""}`}
          onClick={() => setMainTab(key)}
        >
          <Icon aria-hidden="true" size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

// ---- 插件标签：PluginCenter + legacy 系统受信分组 ----

function PluginsTabBody({ pluginCenterAdapter, accessMode, onAuthRequired, legacyPlugins }: { pluginCenterAdapter?: PluginCenterAdapter | null; accessMode: AccessMode; onAuthRequired: () => void; legacyPlugins: Plugin[] }) {
  const authenticated = accessMode === "authenticated";
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectError, setProjectError] = useState("");
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void creativeApi<{ projects: Array<{ id: string; name: string }> }>("/api/creative-projects")
      .then((data) => { if (!cancelled) setProjects(data.projects); })
      .catch((error) => { if (!cancelled) setProjectError(error instanceof Error ? error.message : "读取项目失败"); });
    return () => { cancelled = true; };
  }, [authenticated]);
  const createProject = async (name: string) => {
    const { project } = await creativeApi<{ project: { id: string; name: string } }>("/api/creative-projects", { method: "POST", body: JSON.stringify({ name }) });
    setProjects((current) => [...current, project]);
    return project;
  };
  return (
    <div className="model-center__plugin-tab">
      {projectError && <p role="alert">{projectError}</p>}
      {/* 插件槽位：modelCenter.actions（additive，Mock 阶段无贡献时不渲染） */}
      <PluginSlot slot="modelCenter.actions" contributions={[]} projectId="project-a" />
      <section className="center-card center-card--plugins edge-glow edge-glow-subtle">
        <header>
          <div><PlugZap size={18} /><h2>系统受信插件（legacy）</h2></div>
          <small>仅管理员登记，全站展示，不等于账户安装包</small>
        </header>
        <div className="plugin-warning"><ShieldAlert size={17} />完全受信插件可访问服务器资源。只安装已审核包，升级前须记录版本与变更。</div>
        {legacyPlugins.length ? <div className="plugin-list">{legacyPlugins.map((plugin) => <article key={plugin.id}><b>{plugin.name}</b><span>v{plugin.version}</span><p>{plugin.change_note || "未填写变更说明"}</p></article>)}</div> : <p className="center-empty">暂未登记系统受信插件。此处为 legacy 登记册，账户级插件安装请使用下方插件中心。</p>}
      </section>
      {pluginCenterAdapter ? (
        <PluginCenter adapter={pluginCenterAdapter} projects={projects.map((project) => project.id)} projectLabels={Object.fromEntries(projects.map((project) => [project.id, project.name]))} onCreateProject={createProject} onAuthRequired={onAuthRequired} authenticated={authenticated} />
      ) : (
        <p className="center-empty">插件中心初始化中…</p>
      )}
    </div>
  );
}
