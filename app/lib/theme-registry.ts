// 创意工坊统一工作区 — Theme Registry（规划 §4）
// 10 套主题权威定义：colors（9 键）/ glass（4 键）/ energy（4 态）。
// 保留全部旧 ID；7 套重构主题采用规划 §4.2 新主色；globals.css 旧主题块保留兼容不动。

import type { ThemeEnergyState } from "./appearance-types";

export type ThemeId =
  | "deep-space"
  | "atom-lab"
  | "quantum-garden"
  | "nebula-drift"
  | "solar-forge"
  | "crystal-cave"
  | "void-signal"
  | "rust-chamber"
  | "photon-field"
  | "ocean-void";

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  description: string;
  colors: {
    deep: string;
    panel: string;
    surface: string;
    foreground: string;
    muted: string;
    primary: string;
    primarySoft: string;
    cool: string;
    aurora: string;
  };
  glass: { tint: string; border: string; highlight: string; shadow: string };
  energy: Record<ThemeEnergyState, string>;
};

// tint = primary 15% 展开 hex；border = primary 25% + border-subtle；highlight 白色镜面细线统一
function glassFrom(primary: string): ThemeDefinition["glass"] {
  const tint = primary + "26"; // 15%
  return {
    tint,
    border: `${primary}40`, // 25%
    highlight: "rgba(255,255,255,0.14)",
    shadow: "rgba(0,0,0,0.45)",
  };
}

// 克制能源套：idle=primary / running=cool / thinking=aurora / peak=primarySoft
function energyFrom(colors: ThemeDefinition["colors"]): Record<ThemeEnergyState, string> {
  return { idle: colors.primary, running: colors.cool, thinking: colors.aurora, peak: colors.primarySoft };
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "deep-space",
    name: "深空观测者",
    description: "暖琥珀 + 冷靛 — 科学仪器的浪漫星空",
    colors: {
      deep: "#050a14",
      panel: "#0a1228",
      surface: "#0e1630",
      foreground: "#d8dce8",
      muted: "#8890a8",
      primary: "#e89840",
      primarySoft: "#f8c878",
      cool: "#5888d8",
      aurora: "#9078d0",
    },
    glass: glassFrom("#e89840"),
    energy: energyFrom({
      deep: "#050a14", panel: "#0a1228", surface: "#0e1630", foreground: "#d8dce8", muted: "#8890a8",
      primary: "#e89840", primarySoft: "#f8c878", cool: "#5888d8", aurora: "#9078d0",
    }),
  },
  {
    id: "quantum-garden",
    name: "量子花园",
    description: "极光紫 + 薄荷 — 量子叠加的纷繁花园",
    colors: {
      deep: "#080a18",
      panel: "#0d1028",
      surface: "#12163a",
      foreground: "#dcd8f0",
      muted: "#9890b8",
      primary: "#9880d0",
      primarySoft: "#b8a4e8",
      cool: "#50c0b0",
      aurora: "#8088e0",
    },
    glass: glassFrom("#9880d0"),
    energy: energyFrom({
      deep: "#080a18", panel: "#0d1028", surface: "#12163a", foreground: "#dcd8f0", muted: "#9890b8",
      primary: "#9880d0", primarySoft: "#b8a4e8", cool: "#50c0b0", aurora: "#8088e0",
    }),
  },
  {
    id: "nebula-drift",
    name: "星云漂流",
    description: "蔷薇粉 + 电蓝 — 星云漂流的柔光",
    colors: {
      deep: "#0c0714",
      panel: "#141024",
      surface: "#1a1430",
      foreground: "#e8dce8",
      muted: "#a890a8",
      primary: "#e87898",
      primarySoft: "#f0a8b8",
      cool: "#48c8d8",
      aurora: "#b888e8",
    },
    glass: glassFrom("#e87898"),
    energy: energyFrom({
      deep: "#0c0714", panel: "#141024", surface: "#1a1430", foreground: "#e8dce8", muted: "#a890a8",
      primary: "#e87898", primarySoft: "#f0a8b8", cool: "#48c8d8", aurora: "#b888e8",
    }),
  },
  {
    id: "atom-lab",
    name: "生物反应堆",
    description: "荧光绿 + 实验蓝 — 原子实验室的微光",
    colors: {
      deep: "#06110f",
      panel: "#0a1a17",
      surface: "#102420",
      foreground: "#d8e8dc",
      muted: "#88a898",
      primary: "#b7f36b",
      primarySoft: "#d9f9a4",
      cool: "#39d6c8",
      aurora: "#8c6cff",
    },
    glass: glassFrom("#b7f36b"),
    energy: energyFrom({
      deep: "#06110f", panel: "#0a1a17", surface: "#102420", foreground: "#d8e8dc", muted: "#88a898",
      primary: "#b7f36b", primarySoft: "#d9f9a4", cool: "#39d6c8", aurora: "#8c6cff",
    }),
  },
  {
    id: "solar-forge",
    name: "极昼弧光",
    description: "薄荷绿 + 冰蓝 — 极昼下的能量弧光",
    colors: {
      deep: "#030a18",
      panel: "#07162a",
      surface: "#0c2038",
      foreground: "#d8f0ec",
      muted: "#88b0b8",
      primary: "#54e6b4",
      primarySoft: "#9ef5d9",
      cool: "#3bc7ff",
      aurora: "#7a76ff",
    },
    glass: glassFrom("#54e6b4"),
    // 规划 §4.3：极昼弧光四态专用
    energy: { idle: "#54E6B4", running: "#3BC7FF", thinking: "#7A76FF", peak: "#F05BC8" },
  },
  {
    id: "void-signal",
    name: "暗物质信标",
    description: "青蓝 + 洋红 — 虚空中的信号脉冲",
    colors: {
      deep: "#02070b",
      panel: "#061018",
      surface: "#0a1826",
      foreground: "#d8e8ea",
      muted: "#88a0aa",
      primary: "#37e0d1",
      primarySoft: "#9bf4e9",
      cool: "#ff4fbf",
      aurora: "#7a8cff",
    },
    glass: glassFrom("#37e0d1"),
    energy: energyFrom({
      deep: "#02070b", panel: "#061018", surface: "#0a1826", foreground: "#d8e8ea", muted: "#88a0aa",
      primary: "#37e0d1", primarySoft: "#9bf4e9", cool: "#ff4fbf", aurora: "#7a8cff",
    }),
  },
  {
    id: "rust-chamber",
    name: "磁暴极光",
    description: "洋红 + 电蓝 — 磁暴中的极光脉冲",
    colors: {
      deep: "#070612",
      panel: "#100b22",
      surface: "#181234",
      foreground: "#ecd8e8",
      muted: "#a890a8",
      primary: "#f05bc8",
      primarySoft: "#f89ee0",
      cool: "#4fb7ff",
      aurora: "#8a6dff",
    },
    glass: glassFrom("#f05bc8"),
    // 规划 §4.3：磁暴极光四态专用
    energy: { idle: "#4FB7FF", running: "#8A6DFF", thinking: "#F05BC8", peak: "#FF4FBF" },
  },
  {
    id: "photon-field",
    name: "棱镜光晕",
    description: "暖光 + 天蓝 — 棱镜折射的光子场",
    colors: {
      deep: "#08090d",
      panel: "#12141c",
      surface: "#1a1c28",
      foreground: "#ece8dc",
      muted: "#a8a898",
      primary: "#ffe3a1",
      primarySoft: "#fff3d6",
      cool: "#7fc8ff",
      aurora: "#d29bff",
    },
    glass: glassFrom("#ffe3a1"),
    energy: energyFrom({
      deep: "#08090d", panel: "#12141c", surface: "#1a1c28", foreground: "#ece8dc", muted: "#a8a898",
      primary: "#ffe3a1", primarySoft: "#fff3d6", cool: "#7fc8ff", aurora: "#d29bff",
    }),
  },
  {
    id: "ocean-void",
    name: "深渊生物光",
    description: "碧绿 + 靛蓝 — 深海深渊的生物荧光",
    colors: {
      deep: "#020812",
      panel: "#061322",
      surface: "#0a1c30",
      foreground: "#d8ece8",
      muted: "#88b0aa",
      primary: "#42e8c4",
      primarySoft: "#9ff5df",
      cool: "#4d7cff",
      aurora: "#ff6f91",
    },
    glass: glassFrom("#42e8c4"),
    energy: energyFrom({
      deep: "#020812", panel: "#061322", surface: "#0a1c30", foreground: "#d8ece8", muted: "#88b0aa",
      primary: "#42e8c4", primarySoft: "#9ff5df", cool: "#4d7cff", aurora: "#ff6f91",
    }),
  },
  {
    id: "crystal-cave",
    name: "极光冰晶",
    description: "冰蓝 + 靛紫 — 极光冰晶的折射",
    colors: {
      deep: "#030a12",
      panel: "#071522",
      surface: "#0c2032",
      foreground: "#dcecf2",
      muted: "#88a8b8",
      primary: "#9cebff",
      primarySoft: "#d3f5ff",
      cool: "#7c8cff",
      aurora: "#c17dff",
    },
    glass: glassFrom("#9cebff"),
    energy: energyFrom({
      deep: "#030a12", panel: "#071522", surface: "#0c2032", foreground: "#dcecf2", muted: "#88a8b8",
      primary: "#9cebff", primarySoft: "#d3f5ff", cool: "#7c8cff", aurora: "#c17dff",
    }),
  },
];

export const DEFAULT_THEME: ThemeId = "deep-space";

export function getThemeDefinition(id: string): ThemeDefinition {
  const found = THEMES.find((theme) => theme.id === id);
  if (!found) {
    // 未知 ID（含历史遗留）回退默认主题，保证不白屏
    return THEMES[0];
  }
  return found;
}
