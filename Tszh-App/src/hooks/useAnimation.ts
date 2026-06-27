// 共享动画工具 — stagger 入场、按压反馈、loading shimmer

import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

// 列表项 stagger 入场动画
export function useStagger(count: number, delay = 80) {
  const anims = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: i * delay,
        useNativeDriver: true,
      })
    );
    Animated.stagger(delay, animations).start();
  }, [count]);

  return anims;
}

// 单个元素 fade-in + slide-up
export function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  return { opacity, transform: [{ translateY }] };
}

// 按压反馈 — scale 缩小
export function usePressScale(scaleTo = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(scale, { toValue: scaleTo, duration: 80, useNativeDriver: true }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
  };

  return { scale, onPressIn, onPressOut };
}

// Loading shimmer 效果
export function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1500, useNativeDriver: false })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const backgroundColor = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)'],
  });

  return { backgroundColor };
}
