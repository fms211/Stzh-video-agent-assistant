// 新拟态按钮组件 — 全渐变光滑 + 边缘外发光

import React, { useRef } from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ViewStyle,
  Animated, ActivityIndicator, Platform, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Colors, FontSize, FontWeight, Animation } from '../constants/theme';

const R = BorderRadius.full;
const GLOW = 6;

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}

export function NeuButton({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, icon, style,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 8 }).start();
  };

  const isDisabled = disabled || loading;
  const sz = SIZE_MAP[size];

  // === Outline — 凸起按钮 + 边缘外发光 ===
  if (variant === 'outline') {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        <TouchableOpacity
          style={{ position: 'relative', borderRadius: R, overflow: 'visible' }}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={isDisabled}
          activeOpacity={1}
        >
          {/* 边缘外发光 */}
          <LinearGradient
            colors={['rgba(232,152,64,0.08)', 'transparent']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={[styles.outGlowT, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
          />
          <LinearGradient
            colors={['transparent', 'rgba(232,152,64,0.06)']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={[styles.outGlowB, { borderBottomLeftRadius: R, borderBottomRightRadius: R }]}
          />
          <LinearGradient
            colors={['rgba(232,152,64,0.07)', 'transparent']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[styles.outGlowL, { borderTopLeftRadius: R, borderBottomLeftRadius: R }]}
          />
          <LinearGradient
            colors={['transparent', 'rgba(232,152,64,0.05)']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={[styles.outGlowR, { borderTopRightRadius: R, borderBottomRightRadius: R }]}
          />

          {/* 阴影 */}
          <View style={[styles.outShadow, { borderRadius: R }]} />
          {/* 底色 */}
          <View style={[styles.fill, { borderRadius: R, backgroundColor: '#1e2d50' }]} />
          {/* 右下暗影 */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.fill, { borderRadius: R }]}
          />
          {/* 左上高光 */}
          <LinearGradient
            colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.03)', 'transparent']}
            locations={[0, 0.3, 0.6]}
            start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 0.5 }}
            style={[styles.fill, { borderRadius: R }]}
          />
          {/* 顶部亮条 */}
          <LinearGradient
            colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={[styles.topHL, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
          />
          {/* 渐变边框 */}
          <LinearGradient
            colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.borderG, { borderRadius: R }]}
          />
          {/* 内容 */}
          <View style={[styles.outContent, sz.container, { borderRadius: R }, isDisabled && styles.disabled]}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.onSurface} />
            ) : (
              <View style={styles.row}>
                {icon && <Text style={[styles.outText, sz.text, { marginRight: 6 }]}>{icon}</Text>}
                <Text style={[styles.outText, sz.text]}>{title}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // === Ghost ===
  if (variant === 'ghost') {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        <TouchableOpacity
          style={[styles.ghostBtn, sz.container, { borderRadius: R }, isDisabled && styles.disabled]}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={isDisabled}
          activeOpacity={0.6}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <View style={styles.row}>
              {icon && <Text style={[styles.ghostTxt, sz.text, { marginRight: 6 }]}>{icon}</Text>}
              <Text style={[styles.ghostTxt, sz.text]}>{title}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // === Primary — 发光 CTA + 边缘外发光 ===
  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        style={{ position: 'relative', borderRadius: R, alignItems: 'center', overflow: 'visible' }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={1}
      >
        {/* 边缘外发光 */}
        <LinearGradient
          colors={['rgba(232,152,64,0.18)', 'rgba(232,152,64,0.04)', 'transparent']}
          locations={[0, 0.4, 1]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={[styles.priGlowT, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
        />
        <LinearGradient
          colors={['transparent', 'rgba(232,152,64,0.04)', 'rgba(232,152,64,0.12)']}
          locations={[0, 0.6, 1]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={[styles.priGlowB, { borderBottomLeftRadius: R, borderBottomRightRadius: R }]}
        />
        <LinearGradient
          colors={['rgba(232,152,64,0.15)', 'rgba(232,152,64,0.03)', 'transparent']}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={[styles.priGlowL, { borderTopLeftRadius: R, borderBottomLeftRadius: R }]}
        />
        <LinearGradient
          colors={['transparent', 'rgba(232,152,64,0.03)', 'rgba(232,152,64,0.1)']}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={[styles.priGlowR, { borderTopRightRadius: R, borderBottomRightRadius: R }]}
        />

        {/* 外层光晕 */}
        <View style={[styles.glowHalo, { borderRadius: R }]} />
        {/* 主体渐变 */}
        <LinearGradient
          colors={['#ffcb8e', '#e89840', '#c07020']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.primaryBody, sz.container, { borderRadius: R }, isDisabled && styles.disabled]}
        >
          {/* 上半高光 */}
          <LinearGradient
            colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.15)', 'transparent']}
            locations={[0, 0.35, 0.6]}
            start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
            style={[styles.fill, { borderRadius: R }]}
          />
          {/* 顶部亮条 */}
          <LinearGradient
            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 0 }}
            style={[styles.priEdge, { borderTopLeftRadius: R, borderTopRightRadius: R }]}
          />
          {/* 底部暗影 */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.2)']}
            start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }}
            style={[styles.fill, { borderRadius: R }]}
          />
          {/* 内容 */}
          <View style={{ zIndex: 3 }}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.onPrimary} />
            ) : (
              <View style={styles.row}>
                {icon && <Text style={[styles.priTxt, sz.text, { marginRight: 6 }]}>{icon}</Text>}
                <Text style={[styles.priTxt, sz.text]}>{title}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const SIZE_MAP = {
  sm: { container: { paddingVertical: 10, paddingHorizontal: 18 }, text: { fontSize: FontSize.sm } },
  md: { container: { paddingVertical: 15, paddingHorizontal: 28 }, text: { fontSize: FontSize.base } },
  lg: { container: { paddingVertical: 19, paddingHorizontal: 36 }, text: { fontSize: FontSize.lg } },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  disabled: { opacity: 0.4 },

  // === Primary 外发光（紧贴边缘向外扩散）===
  priGlowT: {
    position: 'absolute', top: -GLOW, left: 0, right: 0, height: GLOW * 2, zIndex: -1,
  },
  priGlowB: {
    position: 'absolute', bottom: -GLOW, left: 0, right: 0, height: GLOW * 2, zIndex: -1,
  },
  priGlowL: {
    position: 'absolute', top: 0, left: -GLOW, bottom: 0, width: GLOW * 2, zIndex: -1,
  },
  priGlowR: {
    position: 'absolute', top: 0, right: -GLOW, bottom: 0, width: GLOW * 2, zIndex: -1,
  },
  glowHalo: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    ...Platform.select({
      ios: { shadowColor: '#e89840', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 24 },
      android: { elevation: 16 },
    }),
  },
  primaryBody: {
    overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  priEdge: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 2,
  },
  priTxt: {
    fontWeight: '900', color: Colors.onPrimary, letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  // === Outline 外发光（紧贴边缘）===
  outGlowT: {
    position: 'absolute', top: -GLOW * 0.8, left: 0, right: 0, height: GLOW * 1.8, zIndex: -1,
  },
  outGlowB: {
    position: 'absolute', bottom: -GLOW * 0.8, left: 0, right: 0, height: GLOW * 1.8, zIndex: -1,
  },
  outGlowL: {
    position: 'absolute', top: 0, left: -GLOW * 0.8, bottom: 0, width: GLOW * 1.8, zIndex: -1,
  },
  outGlowR: {
    position: 'absolute', top: 0, right: -GLOW * 0.8, bottom: 0, width: GLOW * 1.8, zIndex: -1,
  },
  outShadow: {
    position: 'absolute', top: 3, left: 3, right: -3, bottom: -3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topHL: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 3,
  },
  borderG: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1, borderColor: 'transparent', zIndex: 4,
  },
  outContent: {
    zIndex: 5, alignItems: 'center', justifyContent: 'center',
  },
  outText: { fontWeight: FontWeight.medium, color: Colors.onSurface },

  // === Ghost ===
  ghostBtn: { alignItems: 'center', justifyContent: 'center' },
  ghostTxt: { fontWeight: FontWeight.medium, color: Colors.primary },
});
