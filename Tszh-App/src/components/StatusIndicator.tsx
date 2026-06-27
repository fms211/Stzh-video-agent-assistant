// 硬件状态指示灯 — 小圆点 + 标签

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface StatusItem {
  label: string;
  color: string;
  pulse?: boolean;
}

interface Props {
  items: StatusItem[];
}

export function StatusIndicator({ items }: Props) {
  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <StatusDot key={i} {...item} />
      ))}
    </View>
  );
}

function StatusDot({ label, color, pulse = false }: StatusItem) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.item}>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse ? opacity : 1 }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    opacity: 0.35,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 8,
    fontFamily: 'monospace',
    color: '#5a6a8a',
    letterSpacing: 1,
  },
});
