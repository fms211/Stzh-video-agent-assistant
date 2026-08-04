// 共享页面背景 — 星空粒子 + 可选 CRT 扫描线
// 星空粒子跨页面共享同一个动画实例
// CRT 扫描线仅登录页使用

import React, { useEffect, useState } from 'react';
import { View, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { useStarfield, C } from '../hooks/useApp';

interface Props {
  crt?: boolean; // 是否显示 CRT 扫描线（仅登录页）
}

export function PageBackground({ crt = false }: Props) {
  const { height } = useWindowDimensions();
  const stars = useStarfield(height);

  // CRT 扫描线（仅登录页，全屏覆盖，慢速）
  const [scanY] = useState(() => new Animated.Value(-200));
  useEffect(() => {
    if (!crt) return;
    const anim = Animated.loop(
      Animated.timing(scanY, {
        toValue: height + 200,
        duration: 12000, // 12s 慢速扫描
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [crt, height, scanY]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Layer 0: 星空粒子 */}
      {stars.map((star, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: `${star.x * 100}%`,
            width: star.size,
            height: star.size,
            borderRadius: star.size / 2,
            backgroundColor: C.amber,
            opacity: star.opacity,
            transform: [{ translateY: star.y }],
          }}
        />
      ))}

      {/* Layer 1: CRT 扫描线（仅登录页） */}
      {crt && (
        <>
          {/* 全屏半透明叠加 */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.04)' }]} />
          {/* 移动光带 */}
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 200,
              transform: [{ translateY: scanY }],
            }}
          >
            <View style={[StyleSheet.absoluteFill, {
              backgroundColor: 'transparent',
            }]}>
              {/* 光带渐变 — 从中心向两端透明 */}
              <View style={{
                flex: 1,
                backgroundColor: 'rgba(232,152,64,0.06)',
                opacity: 0.8,
              }} />
            </View>
          </Animated.View>
          {/* CRT 水平条纹纹理 */}
          <View style={[StyleSheet.absoluteFill, {
            opacity: 0.03,
            backgroundColor: 'transparent',
          }]} />
        </>
      )}
    </View>
  );
}
