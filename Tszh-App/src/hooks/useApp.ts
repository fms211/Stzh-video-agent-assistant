// 共享 App Hook — 响应式 + 安全区 + 主题色 + 共享星空粒子

import { useRef, useEffect } from 'react';
import { useWindowDimensions, Animated, Easing, ViewStyle, TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ============ 主题色 ============
export const C = {
  // 背景
  bg: '#0a1228',
  surface: 'rgba(5,13,35,0.7)',
  surfaceSolid: '#0f1a35',
  sheetBg: '#0f1a35',

  // 琥珀色系
  amber: '#ffb870',
  amberDark: '#e89840',
  amberGlow: 'rgba(255,184,112,0.15)',
  amberGlowStrong: 'rgba(255,184,112,0.25)',

  // 文字
  text: '#dbe1ff',
  textSecondary: '#d8c3b1',
  textMuted: '#5a6a8a',
  textPlaceholder: '#3a4a6a',
  textDim: '#2d344c',

  // 状态色
  green: '#66bb6a',
  greenBg: 'rgba(102,187,106,0.15)',
  greenBorder: 'rgba(102,187,106,0.25)',
  red: '#ef5350',
  redBg: 'rgba(239,83,80,0.1)',
  redBorder: 'rgba(239,83,80,0.2)',
  blue: '#4fc3f7',
  blueBg: 'rgba(79,195,247,0.15)',
  blueBorder: 'rgba(79,195,247,0.25)',
  orange: '#ffa726',
  orangeBg: 'rgba(255,167,38,0.15)',
  orangeBorder: 'rgba(255,167,38,0.25)',
  purple: '#a78bfa',
  purpleBg: 'rgba(167,139,250,0.15)',
  purpleBorder: 'rgba(167,139,250,0.25)',

  // 边框
  borderLight: 'rgba(255,255,255,0.05)',
  borderPanel: 'rgba(255,184,112,0.1)',
  borderFocus: 'rgba(255,184,112,0.4)',
  borderDark: 'rgba(0,0,0,0.6)',
  cardBorder: 'rgba(255,255,255,0.06)',

  // 背景变体
  inputBg: '#0a1228',
  panelBg: 'rgba(5,13,35,0.7)',
  cardBg: 'rgba(5,13,35,0.5)',
  modalOverlay: 'rgba(5,10,20,0.9)',
} as const;

// ============ 状态色映射 ============
export const STATUS: Record<string, { bg: string; text: string; border: string }> = {
  running: { bg: C.blueBg, text: C.blue, border: C.blueBorder },
  done: { bg: C.greenBg, text: C.green, border: C.greenBorder },
  completed: { bg: C.greenBg, text: C.green, border: C.greenBorder },
  failed: { bg: C.redBg, text: C.red, border: C.redBorder },
  pending: { bg: C.orangeBg, text: C.orange, border: C.orangeBorder },
  info: { bg: C.purpleBg, text: C.purple, border: C.purpleBorder },
  default: { bg: 'rgba(255,255,255,0.06)', text: C.text, border: 'rgba(255,255,255,0.08)' },
};

// ============ 存储键 ============
export const STORAGE = {
  providers: 'tszh_llm_providers',
  activeProvider: 'tszh_llm_active_id',
  scheduledTasks: 'tszh_scheduled_tasks',
  serverUrl: 'tszh_server_url',
  token: 'tszh_token',
} as const;

// ============ 共享卡片阴影 ============
import { Platform } from 'react-native';

export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  android: { elevation: 6 },
  default: { elevation: 4 },
}) as ViewStyle;

export const cardShadowStrong = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  android: { elevation: 10 },
  default: { elevation: 8 },
}) as ViewStyle;

// ============ 边框凹陷样式 ============
export const insetBorder: ViewStyle = {
  borderTopWidth: 2,
  borderLeftWidth: 2,
  borderBottomWidth: 1,
  borderRightWidth: 1,
  borderTopColor: C.borderDark,
  borderLeftColor: C.borderDark,
  borderBottomColor: C.borderLight,
  borderRightColor: C.borderLight,
  backgroundColor: C.inputBg,
};

// ============ useApp Hook ============
export function useApp() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // 平板检测（宽边 ≥ 768px）
  const isTablet = Math.min(width, height) >= 768;
  // 横屏检测
  const isLandscape = width > height;

  // 响应式缩放（基准 375px，平板上限 1.3，手机上限 1.15）
  const maxScale = isTablet ? 1.3 : 1.15;
  const s = (n: number) => Math.round(n * Math.min(width / 375, maxScale));
  const sp = (n: number) => Math.round(n * Math.min(width / 375, maxScale * 0.95));

  // 内容最大宽度（平板居中限制）
  const maxContentW = isTablet ? 600 : width;

  return { width, height, insets, s, sp, isTablet, isLandscape, maxContentW };
}

// ============ 共享星空粒子 Hook ============
// 40 个琥珀色粒子向上漂浮，跨页面共享同一个动画实例
const STAR_COUNT = 40;
const starAnims = Array.from({ length: STAR_COUNT }, () => ({
  x: Math.random(),
  speed: Math.random() * 20000 + 15000, // 15-35s（比之前慢）
  opacity: Math.random() * 0.4 + 0.1,
  size: Math.random() * 2 + 1,
}));

export function useStarfield(screenHeight: number) {
  const stars = useRef(
    starAnims.map((s) => ({
      x: s.x,
      y: new Animated.Value(Math.random() * (screenHeight || 900)),
      size: s.size,
      speed: s.speed,
      opacity: s.opacity,
    }))
  ).current;

  useEffect(() => {
    if (!screenHeight) return;
    const loops: Animated.CompositeAnimation[] = [];
    stars.forEach((star) => {
      const loop = () => {
        star.y.setValue(screenHeight);
        const anim = Animated.timing(star.y, {
          toValue: -10,
          duration: star.speed,
          easing: Easing.linear,
          useNativeDriver: true,
        });
        anim.start(() => loop());
        loops.push(anim);
      };
      loop();
    });
    return () => loops.forEach((a) => a.stop());
  }, [screenHeight]);

  return stars;
}

// ============ 标题样式 ============
export const headerTitleStyle: TextStyle = {
  fontSize: 20,
  fontWeight: '700',
  color: C.amber,
  letterSpacing: 2,
  textShadowColor: 'rgba(255,184,112,0.3)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 8,
};
