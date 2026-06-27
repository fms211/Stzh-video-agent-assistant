// 新拟态凹陷容器 — 边缘氛围辉光（若隐若现）
// 凹陷效果 + 边缘外溢的微弱琥珀色辉光

import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  children: React.ReactNode;
  borderRadius?: number;
  style?: ViewStyle;
  glow?: boolean; // 边缘氛围辉光
}

export function NeuInsetView({ children, borderRadius = 12, style, glow = true }: Props) {
  const R = borderRadius;

  return (
    <View style={[styles.wrapper, { borderRadius: R }, style]}>
      {/* 边缘氛围辉光 — 25px 外溢 */}
      {glow && (
        <>
          <LinearGradient
            colors={['rgba(232,152,64,0.2)', 'transparent']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={[styles.glowEdge, { borderTopLeftRadius: R, borderTopRightRadius: R, top: -6, height: 12 }]}
          />
          <LinearGradient
            colors={['transparent', 'rgba(232,152,64,0.12)']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={[styles.glowEdge, { borderBottomLeftRadius: R, borderBottomRightRadius: R, bottom: -6, height: 12 }]}
          />
          <LinearGradient
            colors={['rgba(232,152,64,0.15)', 'transparent']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[styles.glowEdge, { borderTopLeftRadius: R, borderBottomLeftRadius: R, left: -6, width: 12 }]}
          />
          <LinearGradient
            colors={['transparent', 'rgba(232,152,64,0.1)']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[styles.glowEdge, { borderTopRightRadius: R, borderBottomRightRadius: R, right: -6, width: 12 }]}
          />
        </>
      )}

      {/* 凹陷底色 */}
      <View style={[styles.surface, { borderRadius: R }]}>
        {/* 顶部暗边 — 凹陷上缘 */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)', 'transparent']}
          locations={[0, 0.35, 0.7]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 左侧暗边 */}
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 底部微光 */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.03)']}
          start={{ x: 0, y: 0.6 }}
          end={{ x: 0, y: 1 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 右侧微光 */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.02)']}
          start={{ x: 0.7, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 凹陷内边框 */}
        <View style={[styles.innerBorder, { borderRadius: R - 1 }]} />

        {/* 内容 */}
        <View style={[styles.content, { borderRadius: R - 2 }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'visible',
  },
  glowEdge: {
    position: 'absolute',
    left: 0, right: 0,
    zIndex: -1,
  },
  surface: {
    position: 'relative',
    backgroundColor: '#070c1a',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  innerBorder: {
    position: 'absolute',
    top: 1, left: 1, right: 1, bottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    zIndex: 2,
  },
  content: {
    position: 'relative',
    zIndex: 3,
    backgroundColor: '#0c1424',
    margin: 2,
  },
});
