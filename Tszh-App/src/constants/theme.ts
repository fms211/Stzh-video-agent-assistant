// Tszh Remote - Deep Space Neumorphic Design System
// React Native 专用新拟态样式

import { Platform, ViewStyle } from 'react-native';

export const Colors = {
  // 深空底色
  spaceDeep: '#050a14',
  spaceSurface: '#0f1a35',

  // 面板色
  surface: '#0a1228',
  surfaceDim: '#0a1228',
  surfaceBright: '#313850',
  surfaceContainerLowest: '#050d23',
  surfaceContainerLow: '#131b31',
  surfaceContainer: '#171f35',
  surfaceContainerHigh: '#222940',
  surfaceContainerHighest: '#2d344c',

  // 文字色
  onSurface: '#dbe1ff',
  onSurfaceVariant: '#a0b4d0',
  textMuted: '#5a6a8a',

  // 主色 - 暖琥珀（对齐桌面 --glow-warm: #e89840）
  primary: '#e89840',
  primaryContainer: '#d0842e',
  onPrimary: '#4a2800',
  onPrimaryContainer: '#5e3400',

  // 辅助色 - 冷靛
  secondary: '#aec6ff',
  secondaryContainer: '#134692',
  onSecondary: '#002e6a',
  onSecondaryContainer: '#97b8ff',

  // 点缀色 - 极光紫
  tertiary: '#d1bcff',
  tertiaryContainer: '#b59cef',
  onTertiary: '#39216b',
  onTertiaryContainer: '#47307a',

  // 状态色（对齐桌面）
  success: '#7cc79a',
  successContainer: '#166534',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  warning: '#fbbf24',
  info: '#60a5fa',

  // 边框
  outline: '#a08d7e',
  outlineVariant: '#534437',

  // 新拟态专用色
  neuLight: 'rgba(255, 255, 255, 0.08)',
  neuDark: 'rgba(0, 0, 0, 0.45)',
  neuLightStrong: 'rgba(255, 255, 255, 0.12)',
  neuDarkStrong: 'rgba(0, 0, 0, 0.6)',
  neuInsetLight: 'rgba(255, 255, 255, 0.05)',
  neuInsetDark: 'rgba(0, 0, 0, 0.4)',

  // 聚焦/错误态专用
  focusBorder: 'rgba(232, 152, 64, 0.4)',
  focusGlow: 'rgba(232, 152, 64, 0.6)',
  errorBorder: 'rgba(255, 180, 171, 0.6)',
  errorGlow: 'rgba(255, 180, 171, 0.3)',
} as const;

export const Spacing = {
  unit: 6,
  gutter: 18,
  margin: 24,
  safeArea: 30,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// ============ 动画常量 ============
export const Animation = {
  // 按压反馈
  pressDuration: 80,
  releaseDuration: 120,
  pressScale: 0.97,

  // 聚焦渐变
  focusDuration: 200,

  // 页面转场
  transitionDuration: 250,
  modalOpenDuration: 300,
  modalCloseDuration: 200,

  // 列表入场
  listItemDuration: 300,
  listItemStagger: 50,

  // 进度条
  progressDuration: 500,

  // 错误抖动
  shakeDuration: 300,
} as const;

// ============ 新拟态样式系统 ============

// 凸起卡片（左上亮 + 右下暗 + 微妙边框）
export const NeuRaised: ViewStyle = Platform.select({
  ios: {
    backgroundColor: Colors.surfaceContainer,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  android: {
    backgroundColor: Colors.surfaceContainer,
    elevation: 6,
  },
  default: {
    backgroundColor: Colors.surfaceContainer,
    elevation: 4,
  },
})!;

// 凹陷输入框（内阴影效果）
export const NeuInset: ViewStyle = Platform.select({
  ios: {
    backgroundColor: Colors.surfaceContainerLow,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  android: {
    backgroundColor: Colors.surfaceContainerLow,
    elevation: -2,
  },
  default: {
    backgroundColor: Colors.surfaceContainerLow,
  },
})!;

// 深凹陷（激活状态的输入框）
export const NeuDeepInset: ViewStyle = Platform.select({
  ios: {
    backgroundColor: Colors.surfaceContainerLowest,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: -3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  android: {
    backgroundColor: Colors.surfaceContainerLowest,
    elevation: -3,
  },
  default: {
    backgroundColor: Colors.surfaceContainerLowest,
  },
})!;

// 发光按钮（琥珀色内发光）
export const NeuGlowButton: ViewStyle = {
  backgroundColor: Colors.primary,
  shadowColor: Colors.primary,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.4,
  shadowRadius: 12,
  elevation: 8,
};

// 边缘发光卡片（edge-glow 效果）
export const NeuEdgeGlow: ViewStyle = {
  backgroundColor: Colors.surfaceContainer,
  shadowColor: Colors.primary,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 4,
};

// 活跃状态边框
export const NeuActiveBorder = {
  borderWidth: 1,
  borderColor: Colors.primary,
} as const;

// 保持旧的 Neumorphic 导出（兼容）
export const Neumorphic = {
  inset: NeuInset,
  raised: NeuRaised,
  deepInset: NeuDeepInset,
} as const;
