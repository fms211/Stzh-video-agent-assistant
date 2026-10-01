import type { ResearchPlanStep } from "@/app/lib/research-runtime/types";

export function ResearchPluginDetails({ step }: { step: ResearchPlanStep }) {
  if (!step.plugin) return null;
  const risk = { read: "读取资料", write: "写入数据", external: "外部操作" }[step.plugin.risk];
  const tier = { safe: "安全", standard: "标准", full: "完整" }[step.plugin.permissionTier];
  return <div className="rtab-empty-next rplan-plugin-details">
    <p>{step.plugin.pluginId} · v{step.plugin.version} · {tier}权限 · {risk}</p>
    <p>{step.description}</p>
    <p>在步骤输入的 arguments 字段填写工具参数；启用并确认计划后执行。</p>
    <details><summary>输入格式（JSON）</summary><pre>{JSON.stringify(step.plugin.inputSchema, null, 2)}</pre></details>
  </div>;
}
