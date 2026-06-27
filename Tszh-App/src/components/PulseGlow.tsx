// 脉冲光晕包装器 — 3s 循环的琥珀色光晕脉冲
// 包裹任意元素，为其添加脉冲光晕效果

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  color?: string;
  style?: ViewStyle;
}

export function PulseGlow({ children, color = '#e89840', style }: Props) {
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.7,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // shadowOpacity 插值
  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0.3, 0.7],
    outputRange: [0.3, 0.7],
  });

  const elevation = glowAnim.interpolate({
    inputRange: [0.3, 0.7],
    outputRange: [8, 16],
  });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        style,
        Platform.OS === 'ios'
          ? { shadowColor: color, shadowOpacity, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }
          : { elevation: 8 },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 999,
    overflow: 'visible',
  },
});
