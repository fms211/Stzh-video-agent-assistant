// 新拟态卡片组件 — 全渐变光滑 + 边缘外发光

import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius } from '../constants/theme';

interface Props {
  children: React.ReactNode;
  variant?: 'raised' | 'inset' | 'glow';
  glow?: boolean; // 是否开启边缘外发光
  style?: ViewStyle;
}

export function NeuCard({ children, variant = 'raised', glow = false, style }: Props) {
  const R = BorderRadius.lg;

  if (variant === 'inset') {
    return (
      <View style={[styles.wrapper, { borderRadius: R }, style]}>
        <View style={[styles.fill, { borderRadius: R, backgroundColor: '#070c1a' }]} />
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.25)', 'transparent']}
          locations={[0, 0.3, 0.6]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={[styles.fill, { borderRadius: R }]}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.fill, { borderRadius: R }]}
        />
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.04)']}
          start={{ x: 0, y: 0.6 }} end={{ x: 0, y: 1 }}
          style={[styles.fill, { borderRadius: R }]}
        />
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.03)']}
          start={{ x: 0.7, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.fill, { borderRadius: R }]}
        />
        <View style={[styles.insetContent, { borderRadius: R - 3 }]}>
          {children}
        </View>
      </View>
    );
  }

  if (variant === 'glow') {
    return (
      <View style={[styles.wrapper, { borderRadius: 999 }, style]}>
        <View style={[styles.glowHalo, { borderRadius: 999 }]} />
        <LinearGradient
          colors={['#ffcb8e', '#e89840', '#c07020']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderRadius: 999 }]}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.1)', 'transparent']}
          locations={[0, 0.35, 0.6]}
          start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 0.6 }}
          style={[styles.fill, { borderRadius: 999 }]}
        />
        <View style={{ zIndex: 2 }}>{children}</View>
      </View>
    );
  }

  // raised — 凸起 + 可选边缘外发光
  return (
    <View style={[styles.wrapper, glow && styles.wrapperGlow, { borderRadius: R }, style]}>
      {/* === 外发光层（在阴影外面）=== */}
      {glow && (
        <>
          {/* 顶部外发光 */}
          <LinearGradient
            colors={['rgba(232,152,64,0.12)', 'rgba(232,152,64,0.03)', 'transparent']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={[styles.glowTop, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
          />
          {/* 底部外发光 */}
          <LinearGradient
            colors={['transparent', 'rgba(232,152,64,0.03)', 'rgba(232,152,64,0.08)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={[styles.glowBottom, { borderBottomLeftRadius: R, borderBottomRightRadius: R }]}
          />
          {/* 左侧外发光 */}
          <LinearGradient
            colors={['rgba(232,152,64,0.1)', 'rgba(232,152,64,0.02)', 'transparent']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[styles.glowLeft, { borderTopLeftRadius: R, borderBottomLeftRadius: R }]}
          />
          {/* 右侧外发光 */}
          <LinearGradient
            colors={['transparent', 'rgba(232,152,64,0.02)', 'rgba(232,152,64,0.06)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[styles.glowRight, { borderTopRightRadius: R, borderBottomRightRadius: R }]}
          />
          {/* 四角加强发光 */}
          <View style={[styles.glowCornerTL, { borderTopLeftRadius: R }]} />
          <View style={[styles.glowCornerBR, { borderBottomRightRadius: R }]} />
        </>
      )}

      {/* === 凸起主体 === */}
      {/* 底部偏移暗影 */}
      <View style={[styles.raisedShadow, { borderRadius: R }]} />
      {/* 表面底色 */}
      <View style={[styles.fill, { borderRadius: R, backgroundColor: '#1e2d50' }]} />
      {/* 右下暗影渐变 */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.5)']}
        locations={[0, 0.4, 0.75, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.fill, { borderRadius: R }]}
      />
      {/* 左上高光渐变 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)', 'transparent']}
        locations={[0, 0.4, 0.7]}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.6 }}
        style={[styles.fill, { borderRadius: R }]}
      />
      {/* 顶部边缘高光 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.06)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[styles.topHL, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
      />
      {/* 左侧边缘高光 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.12)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.leftHL, { borderTopLeftRadius: R, borderBottomLeftRadius: R }]}
      />
      {/* 对角氛围 */}
      <LinearGradient
        colors={['rgba(100,140,220,0.04)', 'transparent', 'rgba(0,0,0,0.08)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.fill, { borderRadius: R }]}
      />
      {/* 渐变边框 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.borderG, { borderRadius: R }]}
      />

      {/* 内容 */}
      <View style={{ zIndex: 10 }}>{children}</View>
    </View>
  );
}

const GLOW_SIZE = 8; // 外发光延伸宽度

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'visible',
  },
  wrapperGlow: {
    // 外发光需要额外空间
    marginVertical: GLOW_SIZE,
    marginHorizontal: GLOW_SIZE / 2,
  },
  fill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },

  // === 外发光 ===
  glowTop: {
    position: 'absolute',
    top: -GLOW_SIZE, left: -2, right: -2,
    height: GLOW_SIZE * 2,
    zIndex: -1,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -GLOW_SIZE, left: -2, right: -2,
    height: GLOW_SIZE * 2,
    zIndex: -1,
  },
  glowLeft: {
    position: 'absolute',
    top: -2, left: -GLOW_SIZE, bottom: -2,
    width: GLOW_SIZE * 2,
    zIndex: -1,
  },
  glowRight: {
    position: 'absolute',
    top: -2, right: -GLOW_SIZE, bottom: -2,
    width: GLOW_SIZE * 2,
    zIndex: -1,
  },
  glowCornerTL: {
    position: 'absolute',
    top: -GLOW_SIZE, left: -GLOW_SIZE,
    width: GLOW_SIZE * 2.5, height: GLOW_SIZE * 2.5,
    backgroundColor: 'rgba(232,152,64,0.06)',
    zIndex: -1,
  },
  glowCornerBR: {
    position: 'absolute',
    bottom: -GLOW_SIZE, right: -GLOW_SIZE,
    width: GLOW_SIZE * 2.5, height: GLOW_SIZE * 2.5,
    backgroundColor: 'rgba(232,152,64,0.03)',
    zIndex: -1,
  },

  // === RAISED ===
  raisedShadow: {
    position: 'absolute',
    top: 5, left: 5, right: -5, bottom: -5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  topHL: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 6, zIndex: 5,
  },
  leftHL: {
    position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, zIndex: 5,
  },
  borderG: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1, borderColor: 'transparent', zIndex: 6,
  },

  // === INSET ===
  insetContent: {
    margin: 4, backgroundColor: '#0c1424', overflow: 'hidden', zIndex: 2,
  },

  // === GLOW ===
  glowHalo: {
    position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
    ...Platform.select({
      ios: { shadowColor: '#e89840', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 28 },
      android: { elevation: 18 },
    }),
  },
});
