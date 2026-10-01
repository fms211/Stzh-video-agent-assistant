"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/app/lib/auth";
import type { WorkflowContribution } from "@/app/lib/plugin-center/types";
import { usePluginRuntime, type ActivePluginContribution } from "../plugin-slots/PluginRuntimeProvider";
import { ResearchProjectSelect } from "../research-workbench/ResearchProjectSelect";
import { PluginFrame } from "./PluginFrame";

type Selection = { key: string; mode: "tool" | "ui" };

export function PluginWorkflowCatalog() {
  const runtime = usePluginRuntime();
  const [selection, setSelection] = useState<Selection | null>(null);
  const workflows = runtime.contributions.flatMap(plugin => (plugin.manifest.contributes.workflows || []).map(workflow => ({
    plugin, workflow, key: JSON.stringify([runtime.projectId, plugin.pluginId, plugin.generationId, workflow.id]),
  })));
  const selected = workflows.find(item => item.key === selection?.key);
  return <section className="plugin-workflow-catalog" aria-label="项目插件工作流">
    <h3>项目插件工作流</h3>
    <ResearchProjectSelect id="plugin-workflow-project" label="插件项目" allowNone={false} value={runtime.projectId} onChange={runtime.selectProject} description="从插件中心启用项目插件后，可在这里使用它提供的工作流。" />
    {!workflows.length && <p className="studio-wf-desc">此项目暂无正在运行的插件工作流。</p>}
    {selected && selection ? <div className="studio-workflow-form" key={selected.key}>
      <button type="button" className="studio-wf-back" onClick={() => setSelection(null)}>返回插件工作流</button>
      <h4>{selected.workflow.title}</h4>
      <PluginIdentity plugin={selected.plugin} />
      <p>{selected.workflow.description}</p>
      {selection.mode === "ui" && selected.workflow.uiSurfaceId ? <PluginFrame pluginId={selected.plugin.pluginId} projectId={runtime.projectId} expectedGenerationId={selected.plugin.generationId} slot="plugin.workflow" uiSurfaceId={selected.workflow.uiSurfaceId} title={selected.workflow.title} frameHeight={400} /> :
        <WorkflowToolForm key={`${selected.key}:tool`} projectId={runtime.projectId} plugin={selected.plugin} workflow={selected.workflow} />}
    </div> : <div className="studio-wf-group-list">{workflows.map(item => <div key={item.key} className="plugin-workflow-item">
      <h4>{item.workflow.title}</h4><PluginIdentity plugin={item.plugin} /><p>{item.workflow.description}</p>
      <div className="plugin-workflow-actions">
        {item.workflow.entryTool && <button type="button" className="studio-wf-start" onClick={() => setSelection({ key: item.key, mode: "tool" })}>填写参数</button>}
        {item.workflow.uiSurfaceId && <button type="button" className="studio-wf-start" onClick={() => setSelection({ key: item.key, mode: "ui" })}>打开工作流界面</button>}
        {!item.workflow.entryTool && !item.workflow.uiSurfaceId && <span>插件未提供执行入口</span>}
      </div>
    </div>)}</div>}
  </section>;
}

function PluginIdentity({ plugin }: { plugin: ActivePluginContribution }) {
  const tier = plugin.permissionTier ? { safe: "安全", standard: "标准", full: "完整" }[plugin.permissionTier] : "未标注";
  return <small>{plugin.manifest.name} · {plugin.pluginId} · v{plugin.version} · {tier}权限</small>;
}

function WorkflowToolForm({ projectId, plugin, workflow }: { projectId: string; plugin: ActivePluginContribution; workflow: WorkflowContribution }) {
  const tool = plugin.manifest.contributes.tools?.find(tool => tool.name === workflow.entryTool);
  const [input, setInput] = useState("{}");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  if (!tool) return <p role="alert">此工作流的工具入口不可用，请在插件中心检查运行状态。</p>;
  async function run() {
    if (pending.current) return;
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { setError("请输入有效的 JSON 参数。"); return; }
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setOutput(null);
    try {
      const path = [projectId, plugin.pluginId, workflow.id].map(encodeURIComponent);
      const data = await authFetch<{ result: unknown }>(`/api/plugins/projects/${path[0]}/workflows/${path[1]}/${path[2]}`, { method: "POST", signal: controller.signal, body: JSON.stringify({ input: parsed, expectedGenerationId: plugin.generationId }) });
      if (!controller.signal.aborted) setOutput(typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2));
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "插件工作流执行失败"); }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  function download() {
    if (output === null) return;
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${workflow.id.replace(/[^\w.-]/g, "_")}-result.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="studio-wf-field">
    <p>工具：{tool.name} · {{ read: "读取资料", write: "写入数据", external: "外部操作" }[tool.risk]}</p>
    <details><summary>查看参数格式</summary><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>
    <label className="studio-wf-label" htmlFor="plugin-workflow-input">工具参数（JSON）</label>
    <textarea id="plugin-workflow-input" className="studio-wf-input" rows={5} value={input} disabled={busy} onChange={event => { setInput(event.target.value); setOutput(null); setError(""); }} />
    {error && <p role="alert" className="studio-wf-error">{error}</p>}
    <button type="button" className="studio-wf-start" disabled={busy} onClick={() => void run()}>{busy ? "正在执行…" : "确认并运行"}</button>
    {output !== null && <div><p role="status">执行完成</p><pre>{output}</pre><button type="button" className="studio-wf-back" onClick={download}>下载结果</button></div>}
  </div>;
}
