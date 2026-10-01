"use client";

// 插件中心 — 权限三档选择器（规划 §7.6 / Task 13）
// 项目不能以低于 manifest 最低档的权限启用插件；低于档位禁用并解释。

import { ShieldCheck, ShieldHalf, ShieldX } from "lucide-react";
import type { PluginPermissionTier } from "@/app/lib/plugin-center/types";

type Props = {
  requestedPermissionTier: PluginPermissionTier;
  value: PluginPermissionTier;
  onChange: (tier: PluginPermissionTier) => void;
  disabled?: boolean;
};

const TIERS: Array<{ key: PluginPermissionTier; label: string; hint: string; icon: typeof ShieldCheck }> = [
  { key: "safe", label: "安全", hint: "纯 UI / 纯计算，无网络与项目数据", icon: ShieldCheck },
  { key: "standard", label: "标准", hint: "宿主代理网络、项目授权上下文、草稿 artifact", icon: ShieldHalf },
  { key: "full", label: "完全", hint: "受控任务/artifact/subprocess 请求；仍拿不到密钥与数据库", icon: ShieldX },
];

const RANK: Record<PluginPermissionTier, number> = { safe: 0, standard: 1, full: 2 };

export function PluginPermissionPicker({ requestedPermissionTier, value, onChange, disabled }: Props) {
  const minRank = RANK[requestedPermissionTier];
  return (
    <div role="radiogroup" aria-label="权限档" className="pc-binding__tools">
      {TIERS.map(({ key, label, hint, icon: Icon }) => {
        const belowMinimum = RANK[key] < minRank;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            disabled={disabled || belowMinimum}
            title={belowMinimum ? `低于插件请求的最低权限档（${requestedPermissionTier}），不可选` : hint}
            className={`pc-btn${value === key ? " pc-btn--primary" : ""}`}
            onClick={() => onChange(key)}
          >
            <Icon aria-hidden="true" size={12} /> {label}
            {belowMinimum && "（低于最低档）"}
          </button>
        );
      })}
    </div>
  );
}
