// 星空粒子背景 — 60 个琥珀色光点向上漂浮 + 透明度脉冲

import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const STAR_COUNT = 60;

interface StarData {
  x: number;
  y: number;
  size: number;
  speed: number;
  baseOpacity: number;
  phase: number;
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function StarfieldBackground() {
  const stars = useMemo<StarData[]>(() => {
    return Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * SCREEN_W,
      y: Math.random() * SCREEN_H,
      size: randomBetween(1, 2.5),
      speed: randomBetween(8000, 18000), // 漂浮一圈的 ms
      baseOpacity: randomBetween(0.15, 0.6),
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {stars.map((star, i) => (
        <StarParticle key={i} data={star} />
      ))}
    </View>
  );
}

function StarParticle({ data }: { data: StarData }) {
  const translateY = useRef(new Animated.Value(SCREEN_H - data.y)).current;
  const opacity = useRef(new Animated.Value(data.baseOpacity)).current;

  useEffect(() => {
    // 向上漂浮动画
    const floatAnim = Animated.loop(
      Animated.timing(translateY, {
        toValue: -20,
        duration: data.speed,
        useNativeDriver: true,
      })
    );

    // 透明度脉冲
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: data.baseOpacity * 0.3,
          duration: randomBetween(2000, 4000),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: data.baseOpacity,
          duration: randomBetween(2000, 4000),
          useNativeDriver: true,
        }),
      ])
    );

    floatAnim.start();
    pulseAnim.start();

    return () => {
      floatAnim.stop();
      pulseAnim.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: data.x,
          width: data.size,
          height: data.size,
          borderRadius: data.size / 2,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#ffb870',
  },
});
