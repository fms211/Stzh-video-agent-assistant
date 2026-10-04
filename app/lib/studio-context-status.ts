import type { StudioMode } from "../../shared/studio-context/index.cjs";

export type StudioRollout = "off" | "shadow" | "enforce";
export type RolloutSource = "default" | "global" | "global_off" | "mode_override" | "invalid_override" | "invalid_global" | "invalid_mode" | "legacy_global";
export type ModeRolloutStatus = { rollout: StudioRollout; source: RolloutSource; configurationValid: boolean | null };
export type StudioContextStatus = { rollout: StudioRollout | null; byMode: Record<StudioMode, ModeRolloutStatus | null> };
export const studioModeLabels: Record<StudioMode, string> = { coze: "Coze 创作", assistant: "单助手", workflow: "工作流", collaboration: "协作编排" };
const modes = Object.keys(studioModeLabels) as StudioMode[];
const sources: RolloutSource[] = ["default", "global", "global_off", "mode_override", "invalid_override", "invalid_global", "invalid_mode"];
const isRollout = (value: unknown): value is StudioRollout => value === "off" || value === "shadow" || value === "enforce";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Missing/malformed per-mode entries are unknown, never guessed from the global flag. */
export function normalizeContextStatus(value: unknown): StudioContextStatus {
  const data = record(value), hasModes = Object.hasOwn(data, "byMode"), byMode = record(data.byMode);
  const rollout = isRollout(data.rollout) ? data.rollout : null;
  return { rollout, byMode: Object.fromEntries(modes.map(mode => {
    if (!hasModes) return [mode, rollout ? { rollout, source: "legacy_global", configurationValid: null } : null];
    const item = record(byMode[mode]);
    if (!isRollout(item.rollout) || !sources.includes(item.source as RolloutSource) || typeof item.configurationValid !== "boolean") return [mode, null];
    return [mode, { rollout: item.rollout, source: item.source, configurationValid: item.configurationValid }];
  })) as StudioContextStatus["byMode"] };
}
export function rolloutSourceLabel(source: unknown) {
  const labels: Record<RolloutSource, string> = {
    default: "默认预览", global: "全局配置", global_off: "全局关闭", mode_override: "本模式配置",
    invalid_override: "本模式配置无效，已关闭", invalid_global: "全局配置无效，采用预览",
    invalid_mode: "模式无效，已关闭", legacy_global: "旧版全局状态，未提供分模式配置",
  };
  return typeof source === "string" && Object.hasOwn(labels, source) ? labels[source as RolloutSource] : "配置来源未记录";
}
export function contextStatusDescription(mode: StudioMode, status: ModeRolloutStatus | null) {
  const label = studioModeLabels[mode];
  if (!status) return `${label}：暂时无法确认记忆引用状态。可继续管理记忆，点击刷新重新读取。`;
  const prefix = `${label} · ${rolloutSourceLabel(status.source)}。`;
  if (status.rollout === "enforce") return `${prefix}记忆引用已开启：已确认且相关的条目可参与此模式的新请求，以每次回答的上下文记录为准。`;
  if (status.rollout === "shadow") return `${prefix}当前为匹配预览，匹配结果尚未用于模型回答。`;
  return `${prefix}当前已关闭记忆引用；已保存的记忆仍可管理，不会自动加入新请求。`;
}
