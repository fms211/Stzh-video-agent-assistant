"use client";
import { MaterialSelect } from "@/app/components/MaterialSelect";

import SquishSwitch from "@/app/components/SquishSwitch";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Download, ExternalLink, Save, Search } from "lucide-react";
import { creativeApi } from "@/app/lib/creative-agent-api";
import { applyProviderPreset, PROVIDER_PRESETS, safeWebsiteUrl, type ProviderFormValue } from "@/app/lib/provider-presets";
import "./ModelProviderForm.css";

type DiscoveredModel = { id: string; name: string };
type Props = {
  value: ProviderFormValue; editingProviderId: string | null; hasSavedSecret: boolean; busy: boolean;
  onChange: (value: ProviderFormValue) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void;
};
export function ModelProviderForm({ value, editingProviderId, hasSavedSecret, busy, onChange, onSubmit, onCancel }: Props) {
  const id = useId();
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState("");
  const [discoveryError, setDiscoveryError] = useState(false);
  const requests = useRef(new Set<AbortController>());
  useEffect(() => {
    const pending=requests.current;
    return () => { for (const controller of pending) controller.abort();pending.clear(); };
  }, []);
  const cancelDiscovery = (clearList = true) => {
    for (const controller of requests.current) controller.abort();requests.current.clear();
    if (clearList) { setModels([]);setSearch(""); }
    setFetching(false);setDiscoveryStatus("");setDiscoveryError(false);
  };
  const patch = (change: Partial<ProviderFormValue>) => {
    if (busy) return;
    if (["apiKey", "baseUrl", "protocol", "vendorId"].some(key => key in change)) cancelDiscovery();
    onChange({ ...value, ...change });
  };
  const fetchModels = async () => {
    cancelDiscovery(false);
    const controller = new AbortController();requests.current.add(controller);
    setFetching(true);setDiscoveryStatus("正在读取厂商提供的模型列表…");
    try {
      const result = await creativeApi<{ models: DiscoveredModel[]; partial: boolean }>("/api/model-providers/discover-models", {
        method: "POST", signal: controller.signal,
        body: JSON.stringify({ protocol: value.protocol, baseUrl: value.baseUrl, apiKey: value.apiKey, ...(editingProviderId ? { providerId: editingProviderId } : {}) }),
      });
      if (controller.signal.aborted) return;
      setModels(result.models);
      setDiscoveryStatus(result.models.length ? `已获取 ${result.models.length} 个模型${result.partial ? "（厂商返回的部分列表）" : ""}，请在下方选择。` : "厂商返回了空列表，请检查密钥权限或手动填写模型标识。");
    } catch (cause) {
      if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
      const message = cause instanceof Error ? cause.message : "获取模型失败，请重试。";
      setDiscoveryError(true);setDiscoveryStatus(models.length ? `${message} 已保留上次模型列表和选择，可重试刷新。` : message);
    } finally { requests.current.delete(controller);if (!controller.signal.aborted) setFetching(false); }
  };
  const filtered = models.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleModels = filtered.slice(0, 200);
  const selectedMissing = value.model && !visibleModels.some(model => model.id === value.model);
  const website = safeWebsiteUrl(value.websiteUrl);
  const canDiscover = !!value.baseUrl.trim() && (!!value.apiKey.trim() || hasSavedSecret);
  return <form className="provider-form provider-config" onSubmit={onSubmit} inert={busy} aria-busy={busy}>
    <h3>{editingProviderId ? "编辑模型连接" : "添加模型连接"}</h3>
    <fieldset><legend>连接厂商</legend>
      <div className="two-fields">
        <label htmlFor={`${id}-vendor`}>模型厂商<MaterialSelect aria-label="模型厂商" id={`${id}-vendor`} value={PROVIDER_PRESETS.some(preset => preset.vendorId === value.vendorId) ? value.vendorId : "custom"} onValueChange={selectedValue => { cancelDiscovery();onChange(applyProviderPreset(value,selectedValue)); }}>
          {PROVIDER_PRESETS.map(preset => <option key={preset.vendorId} value={preset.vendorId}>{preset.name}</option>)}<option value="custom">自定义厂商 / 中转服务</option>
        </MaterialSelect></label>
        <label htmlFor={`${id}-name`}>连接名称<input id={`${id}-name`} required maxLength={100} value={value.name} onChange={event => patch({ name: event.target.value })} placeholder="给这条连接起个名字" /></label>
      </div>
      <label htmlFor={`${id}-website`}>官网 / 控制台链接<div className="provider-config__link-row"><input id={`${id}-website`} type="url" value={value.websiteUrl} onChange={event => patch({ websiteUrl: event.target.value })} placeholder="https://厂商官网" />
        {website && <a href={website} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />打开官网</a>}
      </div></label>
      <label htmlFor={`${id}-base`}>API 地址<input id={`${id}-base`} required type="url" value={value.baseUrl} onChange={event => patch({ baseUrl: event.target.value, vendorId: "custom", model: "", thinkingMode: "default" })} placeholder="https://api.example.com/v1" /></label>
      <p>官网用于登录和获取密钥；模型列表从 API 地址读取。预设地址可按地区或服务商要求修改。</p>
      <div className="two-fields">
        <label htmlFor={`${id}-protocol`}>接口协议<MaterialSelect aria-label="接口协议" id={`${id}-protocol`} value={value.protocol} onValueChange={selectedValue => patch({ protocol: selectedValue as ProviderFormValue["protocol"], model: "", thinkingMode: "default" })}><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic Messages</option></MaterialSelect></label>
        <label htmlFor={`${id}-key`}>{editingProviderId ? "API Key（留空保留已存密钥）" : "API Key"}<input id={`${id}-key`} required={!hasSavedSecret} type="password" autoComplete="new-password" maxLength={4096} value={value.apiKey} onChange={event => patch({ apiKey: event.target.value })} placeholder="只在提交时使用，不会回传" /></label>
      </div>
    </fieldset>
    <fieldset aria-busy={fetching}><legend>模型映射</legend>
      <div className="provider-config__discovery-header"><p>获取厂商列表后，选择创意工坊使用的模型。</p><button type="button" onClick={() => void fetchModels()} disabled={busy || fetching || !canDiscover}><Download size={15} aria-hidden="true" />{fetching ? "正在获取…" : models.length ? "刷新模型列表" : "获取模型"}</button></div>
      {discoveryStatus && <p className={`provider-config__feedback${discoveryError ? " provider-config__feedback--error" : ""}`} role={discoveryError ? "alert" : "status"}>{discoveryStatus}</p>}
      {models.length > 0 && <label className="provider-config__search" htmlFor={`${id}-search`}><Search size={15} aria-hidden="true" /><span className="sr-only">搜索模型</span><input id={`${id}-search`} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索模型名称或标识" /></label>}
      <label htmlFor={`${id}-model`}>使用的模型<MaterialSelect aria-label="使用的模型" id={`${id}-model`} required value={value.model} onValueChange={selectedValue => patch({ model: selectedValue })}>
        <option value="">{models.length ? "请选择模型" : "先获取模型列表"}</option>
        {selectedMissing && <option value={value.model}>{value.model}（当前填写）</option>}
        {visibleModels.map(model => <option key={model.id} value={model.id}>{model.name !== model.id ? `${model.name} · ${model.id}` : model.id}</option>)}
      </MaterialSelect></label>
      {models.length > 0 && <p>匹配 {filtered.length} / {models.length} 个模型{filtered.length > 200 ? "，显示前200个，可继续搜索缩小范围" : ""}。列表由厂商返回，所选模型仍需支持当前接口协议。</p>}
      <details><summary>手动填写模型标识</summary><label htmlFor={`${id}-manual`}>模型标识<input id={`${id}-manual`} maxLength={256} value={value.model} onChange={event => patch({ model: event.target.value })} placeholder="仅在厂商不提供列表时使用" /></label></details>
      <p>这条连接可以设为工坊默认，也可以在个人角色中单独绑定。</p>
    </fieldset>
    <details className="provider-config__advanced"><summary>高级设置 · 回复长度与对话容量</summary>
      <p>容量按厂商说明填写；留空表示未知。回复上限会限制每次生成的长度。</p>
      <div className="two-fields"><label htmlFor={`${id}-context`}>上下文容量（token）<input id={`${id}-context`} type="number" min={2048} max={2000000} step={1} value={value.contextWindowTokens} onChange={event => patch({ contextWindowTokens: event.target.value })} placeholder="未知" /></label>
        <label htmlFor={`${id}-output`}>回复上限（token）<input id={`${id}-output`} required type="number" min={1} max={200000} step={1} value={value.maxOutputTokens} onChange={event => patch({ maxOutputTokens: event.target.value })} /></label></div>
      <div className="two-fields"><label htmlFor={`${id}-margin`}>安全余量（token）<input id={`${id}-margin`} required type="number" min={256} max={200000} step={1} value={value.safetyMarginTokens} onChange={event => patch({ safetyMarginTokens: event.target.value })} /></label>
        {value.protocol === "openai" && <label htmlFor={`${id}-parameter`}>输出限制字段<MaterialSelect aria-label="输出限制字段" id={`${id}-parameter`} value={value.outputTokenParameter} onValueChange={selectedValue => patch({ outputTokenParameter: selectedValue as ProviderFormValue["outputTokenParameter"] })}><option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></MaterialSelect></label>}</div>
      <label htmlFor={`${id}-thinking`}>思考模式<MaterialSelect aria-label="思考模式" id={`${id}-thinking`} value={value.thinkingMode} onValueChange={selectedValue => patch({ thinkingMode: selectedValue as ProviderFormValue["thinkingMode"] })}><option value="default">遵循厂商默认</option><option value="enabled">开启</option><option value="disabled">关闭</option></MaterialSelect></label><p>仅在厂商支持思考开关时修改。MiMo 预设关闭思考，便于先进行短文本联调。</p>
    </details>
    <label className="check"><SquishSwitch checked={value.makeActive} onChange={event => patch({ makeActive: event.target.checked })} />设为创意工坊默认模型</label>
    <div className="provider-config__actions"><button type="submit" disabled={busy || fetching || !value.model.trim()}><Save size={16} aria-hidden="true" />{busy ? "处理中…" : editingProviderId ? "保存修改" : "加密保存连接"}</button>{editingProviderId && <button type="button" className="provider-config__secondary" disabled={busy} onClick={onCancel}>取消编辑</button>}</div>
  </form>;
}
