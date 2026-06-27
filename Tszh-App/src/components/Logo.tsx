// 品牌 Logo — 几何天文台/卫星图标 + 脉冲发光
// 用纯 View 构建，无需图片资源

import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

interface Props {
  size?: number;
  color?: string;
  pulse?: boolean; // 是否脉冲发光
}

export function Logo({ size = 80, color = '#e89840', pulse = false }: Props) {
  const s = size;
  const c = color;
  const ring = s * 0.42;
  const core = s * 0.12;
  const arm = s * 0.28;

  // 脉冲动画
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!pulse) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.5, duration: 2000, useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={{ width: s, height: s, position: 'relative' }}>
      {/* 外层光晕（脉冲） */}
      {pulse && (
        <Animated.View style={{
          position: 'absolute',
          left: -s * 0.3, top: -s * 0.3,
          width: s * 1.6, height: s * 1.6,
          borderRadius: s * 0.8,
          backgroundColor: `${c}15`,
          opacity: glowAnim,
        }} />
      )}

      {/* 外环（轨道） */}
      <View style={{
        position: 'absolute',
        width: ring * 2, height: ring * 2,
        borderRadius: ring,
        borderWidth: 2,
        borderColor: `${c}cc`,
        left: s / 2 - ring,
        top: s / 2 - ring,
        shadowColor: c,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: s * 0.08,
      }} />

      {/* 内环 */}
      <View style={{
        position: 'absolute',
        width: ring * 1.2, height: ring * 1.2,
        borderRadius: ring * 0.6,
        borderWidth: 1.5,
        borderColor: `${c}55`,
        left: s / 2 - ring * 0.6,
        top: s / 2 - ring * 0.6,
        transform: [{ rotate: '45deg' }],
      }} />

      {/* 核心（恒星）— 强发光 */}
      <View style={{
        position: 'absolute',
        width: core * 2, height: core * 2,
        borderRadius: core,
        backgroundColor: c,
        left: s / 2 - core,
        top: s / 2 - core,
        shadowColor: c,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: s * 0.2,
        elevation: 12,
      }} />

      {/* 上支臂 */}
      <View style={{ position: 'absolute', width: 2, height: arm, backgroundColor: `${c}88`, left: s / 2 - 1, top: s / 2 - arm - core }} />
      {/* 下支臂 */}
      <View style={{ position: 'absolute', width: 2, height: arm, backgroundColor: `${c}88`, left: s / 2 - 1, top: s / 2 + core }} />
      {/* 左支臂 */}
      <View style={{ position: 'absolute', width: arm, height: 2, backgroundColor: `${c}88`, left: s / 2 - arm - core, top: s / 2 - 1 }} />
      {/* 右支臂 */}
      <View style={{ position: 'absolute', width: arm, height: 2, backgroundColor: `${c}88`, left: s / 2 + core, top: s / 2 - 1 }} />

      {/* 端点 — 发光点 */}
      {[
        { x: s / 2, y: s / 2 - arm - core },
        { x: s / 2, y: s / 2 + core + arm },
        { x: s / 2 - arm - core, y: s / 2 },
        { x: s / 2 + arm + core, y: s / 2 },
      ].map((p, i) => (
        <View key={i} style={{
          position: 'absolute',
          width: 7, height: 7, borderRadius: 3.5,
          backgroundColor: i % 2 === 0 ? c : `${c}aa`,
          left: p.x - 3.5, top: p.y - 3.5,
          shadowColor: c,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 8,
        }} />
      ))}

      {/* 轨道卫星 */}
      <View style={{
        position: 'absolute',
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: '#60a5fa',
        left: s / 2 + ring * 0.7 - 3,
        top: s / 2 - ring * 0.7 - 3,
        shadowColor: '#60a5fa',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
      }} />
      <View style={{
        position: 'absolute',
        width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: '#aec6ff',
        left: s / 2 - ring * 0.9 - 2.5,
        top: s / 2 + ring * 0.4 - 2.5,
        shadowColor: '#aec6ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
      }} />
    </View>
  );
}
