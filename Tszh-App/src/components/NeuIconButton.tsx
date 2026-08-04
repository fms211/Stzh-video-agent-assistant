// 新拟态圆形图标按钮 — 凸起 + 按压反馈
// 用于 header 操作按钮（设置/工作流/返回等）

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing } from '../constants/theme';

interface Props {
  icon: string;
  onPress: () => void;
  variant?: 'raised' | 'flat' | 'glow';
  size?: number;
  active?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function NeuIconButton({
  icon,
  onPress,
  variant = 'raised',
  size = 40,
  active = false,
  disabled = false,
  style,
}: Props) {
  const borderRadius = size / 2;

  if (variant === 'glow' || active) {
    return (
      <TouchableOpacity
        style={[
          styles.wrapper,
          { width: size, height: size, borderRadius },
          styles.glowShadow,
          disabled && styles.disabled,
          style,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={['rgba(232,152,64,0.3)', 'rgba(232,152,64,0.15)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { borderRadius }]}
        />
        <Text style={[styles.icon, { fontSize: size * 0.4 }]}>{icon}</Text>
      </TouchableOpacity>
    );
  }

  if (variant === 'flat') {
    return (
      <TouchableOpacity
        style={[
          styles.wrapper,
          { width: size, height: size, borderRadius },
          styles.flatBg,
          disabled && styles.disabled,
          style,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.icon, { fontSize: size * 0.4, opacity: 0.6 }]}>{icon}</Text>
      </TouchableOpacity>
    );
  }

  // raised (default)
  return (
    <TouchableOpacity
      style={[
        styles.wrapper,
        { width: size, height: size, borderRadius },
        styles.raisedShadow,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {/* 右下暗影 */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={[styles.shadowLayer, { borderRadius }]}
      />
      {/* 左上高光 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={[styles.shadowLayer, { borderRadius }]}
      />
      <Text style={[styles.icon, { fontSize: size * 0.4 }]}>{icon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#171f35',
    overflow: 'hidden',
    position: 'relative',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shadowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  icon: {
    color: '#dbe1ff',
  },
  raisedShadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
    },
    android: { elevation: 6 },
    default: { elevation: 4 },
  }) as ViewStyle,
  glowShadow: {
    shadowColor: '#e89840',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  flatBg: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  disabled: {
    opacity: 0.4,
  },
});
