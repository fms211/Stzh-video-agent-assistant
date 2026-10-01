"use client";

// 全站 additive slot 渲染器（规划 §7.9 / Task 15 Step 3）
// 只渲染当前项目 effective contributions（启用中插件的该 slot 贡献，按 order 排序）；
// 单个插件帧出错渲染为带插件名的隔离错误卡，不阻断宿主页面；
// 插件独立页面只在插件中心 viewer 打开——本组件不处理 page 贡献。
//
// Mock 阶段：contributions 由宿主页面以 props 注入（宿主已持有 adapter 异步快照），
// 本组件保持纯渲染 + 校验语义；阶段 C 接 ui-assets 服务后可切换为内部拉取。

import { useMemo } from "react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import { getSlotDefinition, isKnownSlot } from "@/app/lib/plugin-center/slot-registry";
import { PluginFrame } from "@/app/components/plugin-center/PluginFrame";
import { usePluginRuntime } from "./PluginRuntimeProvider";

export type SlotContribution = {
  pluginId: string;
  version: string;
  slot: string;
  uiSurfaceId: string;
  order: number;
  generationId?: string;
};

type Props = {
  slot: string;
  /** 宿主持有的 contributions 快照（按 order 升序）；Mock 阶段通常为空数组 */
  contributions: SlotContribution[];
  projectId: string;
  /** 演示 HTML（Mock 阶段）；未来来自 ui-assets 服务 */
  demoHtml?: string;
  className?: string;
};

export function PluginSlot({ slot, contributions, projectId, demoHtml, className }: Props) {
  const runtime = usePluginRuntime();
  const effectiveProjectId = contributions.length ? projectId : runtime.projectId;
  const effectiveContributions = useMemo(() => contributions.length ? contributions : runtime.contributions.flatMap((plugin) =>
    (plugin.manifest.contributes.slots || []).filter((item) => item.slot === slot).map((item) => ({ ...item, pluginId: plugin.pluginId, version: plugin.version, generationId: plugin.generationId }))), [contributions, runtime.contributions, slot]);
  const items = useMemo(() => {
    if (!isKnownSlot(slot)) return [];
    return effectiveContributions.filter((item) => item.slot === slot).sort((a, b) => a.order - b.order);
  }, [slot, effectiveContributions]);

  if (!isKnownSlot(slot)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[PluginSlot] unknown slot: ${slot}`);
    }
    return null;
  }

  const definition = getSlotDefinition(slot);

  if (!items.length) return null;

  return (
    <div
      className={`plugin-slot${className ? ` ${className}` : ""}`}
      data-slot={slot}
      style={{ maxHeight: definition.maxHeight, overflowY: "auto" }}
      aria-label={`插件槽位：${definition.label}`}
    >
      {items.map((contribution) => (
        <PluginFrame
          key={`${contribution.pluginId}:${contribution.version}:${contribution.generationId}:${contribution.slot}:${contribution.uiSurfaceId}`}
          pluginId={contribution.pluginId}
          projectId={effectiveProjectId}
          slot={slot}
          uiSurfaceId={contribution.uiSurfaceId}
          title={definition.label}
          frameHeight={Math.max(0, definition.maxHeight - 28)}
          demoHtml={demoHtml}
        />
      ))}
    </div>
  );
}

// PluginCenterAdapter 类型仅用于宿主注入约定说明（不参与运行时）
export type { PluginCenterAdapter };
