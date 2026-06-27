// 新拟态凸起容器 — 同材质雕刻感
// 表面色与背景接近，靠边缘光影差体现深度
// 不是玻璃拟态，是从同一块金属面板上凸起来的效果

import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  children: React.ReactNode;
  borderRadius?: number;
  style?: ViewStyle;
  glow?: boolean;
}

export function NeuRaisedView({ children, borderRadius = 16, style, glow = false }: Props) {
  const R = borderRadius;

  return (
    <View style={[styles.wrapper, { borderRadius: R }, style]}>
      {/* 底部偏移暗影 — 凸起感的关键 */}
      <View style={[styles.shadow, { borderRadius: R }]} />

      {/* 表面底色 — 与背景 #0a1228 接近，只亮一点点 */}
      <View style={[styles.surface, { borderRadius: R }]} />

      {/* 顶部边缘亮边 — 模拟光照打在凸起边缘 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)', 'transparent']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.edgeTop, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
      />

      {/* 左侧边缘亮边 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.edgeLeft, { borderTopLeftRadius: R, borderBottomLeftRadius: R }]}
      />

      {/* 底部边缘暗边 — 背光面 */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.25)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.edgeBottom, { borderBottomLeftRadius: R, borderBottomRightRadius: R }]}
      />

      {/* 右侧边缘暗边 */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.edgeRight, { borderTopRightRadius: R, borderBottomRightRadius: R }]}
      />

      {/* 渐变边框 — 极淡，只在边缘可见 */}
      <View style={[styles.border, { borderRadius: R }]} />

      {/* 外发光（可选） */}
      {glow && (
        <View style={[styles.glow, { borderRadius: R }]} />
      )}

      {/* 内容 */}
      <View style={[styles.content, { borderRadius: R }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    top: 3, left: 3, right: -3, bottom: -3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  surface: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#101a30', // 比背景 #0a1228 亮一点点，不是大幅提亮
  },
  edgeTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    zIndex: 2,
  },
  edgeLeft: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: 2,
    zIndex: 2,
  },
  edgeBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 2,
    zIndex: 2,
  },
  edgeRight: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: 2,
    zIndex: 2,
  },
  border: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    zIndex: 3,
  },
  glow: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    ...Platform.select({
      ios: {
        shadowColor: '#e89840',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  content: {
    position: 'relative',
    zIndex: 5,
    overflow: 'hidden',
  },
});
