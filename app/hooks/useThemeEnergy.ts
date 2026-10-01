"use client";

// 创意工坊统一工作区 — useThemeEnergy（useSyncExternalStore 消费模块单例）

import { useSyncExternalStore } from "react";
import { createThemeEnergyStore, type ThemeEnergyStore } from "@/app/lib/theme-energy-store";
import type { ThemeEnergyState } from "@/app/lib/appearance-types";

// 运行时单例（模块级，与 research/plugin adapter 同生命周期模式）
const globalEnergyStore: ThemeEnergyStore = createThemeEnergyStore();

export function useThemeEnergy(): ThemeEnergyState {
  return useSyncExternalStore(globalEnergyStore.subscribe, globalEnergyStore.getState);
}

export { globalEnergyStore };
