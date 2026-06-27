// CRT 扫描线叠加层 — 水平条纹 + 移动琥珀光带

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_H } = Dimensions.get('window');

export function CRTOverlay() {
  const scanY = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    const scan = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, {
          toValue: -120,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(scanY, {
          toValue: SCREEN_H,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    scan.start();
    return () => scan.stop();
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {/* 水平扫描线纹理 */}
      <View style={styles.scanlines} />

      {/* 移动琥珀光带 */}
      <Animated.View
        style={[
          styles.scanBeam,
          { transform: [{ translateY: scanY }] },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,184,112,0.04)', 'rgba(255,184,112,0.06)', 'rgba(255,184,112,0.04)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.beamGradient}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  // 水平条纹
  scanlines: {
    ...StyleSheet.absoluteFill,
    opacity: 0.3,
    backgroundColor: 'transparent',
    // 用 border 模拟条纹
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    // React Native 不支持 repeating-linear-gradient，用简化方案
  },
  // 移动光带
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 120,
  },
  beamGradient: {
    flex: 1,
  },
});
