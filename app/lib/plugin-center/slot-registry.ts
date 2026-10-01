// 插件中心 — 全站 additive slot registry（规划 §7.9 / Task 15）
// 12 个固定 slot；只追加（append-only），禁止替换宿主结构；
// 拒绝未知 slot；版本与尺寸约束供 PluginFrame 渲染参考。

import type { PluginSlotName } from "./types";

export type SlotDefinition = {
  name: PluginSlotName;
  label: string;
  /** 允许的单帧内容高度（px），超限由宿主滚动 */
  maxHeight: number;
};

export const SLOT_REGISTRY: ReadonlyArray<SlotDefinition> = [
  { name: "home.quickActions", label: "首页快捷动作", maxHeight: 220 },
  { name: "chat.composer.actions", label: "对话输入动作条", maxHeight: 120 },
  { name: "chat.message.after", label: "消息后缀扩展", maxHeight: 320 },
  { name: "studio.workflowCatalog", label: "创意工坊工作流目录", maxHeight: 420 },
  { name: "studio.promptRail", label: "提示词轨扩展", maxHeight: 380 },
  { name: "studio.workbench.toolbar", label: "运行工作台工具条", maxHeight: 96 },
  { name: "studio.workbench.inspector", label: "运行检查器扩展", maxHeight: 360 },
  { name: "modelCenter.actions", label: "模型中心动作", maxHeight: 160 },
  { name: "taskCenter.detailActions", label: "任务详情动作", maxHeight: 160 },
  { name: "gallery.itemActions", label: "画廊条目动作", maxHeight: 140 },
  { name: "stats.cards", label: "统计卡片", maxHeight: 260 },
  { name: "settings.sections", label: "设置分区", maxHeight: 480 },
] as const;

const KNOWN = new Set<string>(SLOT_REGISTRY.map((slot) => slot.name));

export function isKnownSlot(name: string): name is PluginSlotName {
  return KNOWN.has(name);
}

export function getSlotDefinition(name: PluginSlotName): SlotDefinition {
  const found = SLOT_REGISTRY.find((slot) => slot.name === name);
  if (!found) throw new Error(`unknown slot: ${name}`);
  return found;
}

/** 插件声明 slot contribution 时的静态校验：未知 slot / 非法 order 拒绝 */
export function validateSlotContribution(slot: string, order: number): { ok: boolean; reason?: string } {
  if (!isKnownSlot(slot)) return { ok: false, reason: `unknown slot: ${slot}` };
  if (!Number.isFinite(order) || order < 0 || order > 999) return { ok: false, reason: `invalid order: ${String(order)}` };
  return { ok: true };
}
