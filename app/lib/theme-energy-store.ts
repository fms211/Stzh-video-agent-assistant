// 创意工坊统一工作区 — 能谱状态 store（规划 §4.3）
// 模块单例：6 类真实运行信号经 setSource 汇入；派生优先级 running > thinking > idle；
// peak 仅在 idle→running 上升沿 + 当前主题 ∈ {solar-forge, rust-chamber} 时触发，
// 有界 timeout（MAX_PEAK_MS=900ms）后回落到 derive()；reduced-motion 静态直落。
// 禁止循环轮播驱动状态（规划 §4.3 硬约束，契约测试锚定）。

import type { ThemeEnergyState } from "./appearance-types";

export const MAX_PEAK_MS = 900;

/** 归一化信号档位：busy/active 归入 running 层 */
export type EnergySignal = "idle" | "thinking" | "running" | "busy" | "active";

type EnergySource = { id: string; state: EnergySignal };

const PEAK_THEMES = new Set(["solar-forge", "rust-chamber"]);

export type ThemeEnergyStore = {
  subscribe(listener: () => void): () => void;
  getState(): ThemeEnergyState;
  setSource(id: string, state: EnergySignal): void;
  clearSource(id: string): void;
  /** 测试/诊断锚点：指定当前主题（运行时由组件写 data-theme 时调用） */
  setThemeForPeak(themeId: string): void;
  setReducedMotion(value: boolean): void;
};

function derive(activeSources: EnergySource[]): ThemeEnergyState {
  const states = activeSources.map((s) => s.state);
  if (states.includes("running") || states.includes("busy") || states.includes("active")) return "running";
  if (states.includes("thinking")) return "thinking";
  return "idle";
}

export function createThemeEnergyStore(): ThemeEnergyStore {
  let sources = new Map<string, EnergySource>();
  let state: ThemeEnergyState = "idle";
  let peakTimer: ReturnType<typeof setTimeout> | null = null;
  let themeId = "deep-space";
  let reducedMotion = false;
  const listeners = new Set<() => void>();

  function publish(next: ThemeEnergyState): void {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function clearPeakTimer(): void {
    if (peakTimer !== null) {
      clearTimeout(peakTimer);
      peakTimer = null;
    }
  }

  function setSource(id: string, next: EnergySignal): void {
    const existing = sources.get(id);
    if (existing && existing.state === next) return; // 无变化不重复触发
    sources.set(id, { id, state: next });

    const prev = state;
    const derivedNow = derive([...sources.values()]);

    // peak 触发：上升沿（非 running → running 派生）+ 主题门控 + 非 reduced-motion
    const wasRunningLike = prev === "running" || prev === "peak";
    const isRunningLike = derivedNow === "running";
    if (PEAK_THEMES.has(themeId) && !reducedMotion && !wasRunningLike && isRunningLike) {
      clearPeakTimer();
      publish("peak");
      peakTimer = setTimeout(() => {
        peakTimer = null;
        publish(derive([...sources.values()]));
      }, MAX_PEAK_MS);
      return;
    }
    // peak 持续期间非上升沿变化：回落按 derive（peak timer 保留）
    if (prev !== "peak") {
      publish(derivedNow);
    }
  }

  function clearSource(id: string): void {
    sources.delete(id);
    const derivedNow = derive([...sources.values()]);
    if (state === "peak" && derivedNow !== "peak") {
      // peak 期间清除来源：立即回落
      clearPeakTimer();
      publish(derivedNow);
    } else if (state !== "peak") {
      publish(derivedNow);
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState(): ThemeEnergyState {
      return state;
    },
    setSource,
    clearSource,
    setThemeForPeak(value: string): void {
      themeId = value;
    },
    setReducedMotion(value: boolean): void {
      reducedMotion = value;
      if (value) {
        // 静态降级：取消 peak 并直接落到 derive
        clearPeakTimer();
        publish(derive([...sources.values()]));
      }
    },
  };
}
