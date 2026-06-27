// 新拟态标签组件 — 使用统一的 C.* 和 STATUS.* 颜色

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../constants/theme';
import { C, STATUS } from '../hooks/useApp';

type TagVariant = 'running' | 'completed' | 'failed' | 'info' | 'default';

interface Props {
  label: string;
  variant?: TagVariant;
  icon?: string;
  style?: ViewStyle;
}

export function NeuTag({ label, variant = 'default', icon, style }: Props) {
  const s = STATUS[variant] || STATUS.default;

  return (
    <View style={[styles.wrapper, style]}>
      <LinearGradient
        colors={[s.bg, 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      />
      <View style={[styles.border, { borderColor: s.border }]} />
      <View style={styles.content}>
        {icon && <Text style={[styles.icon, { color: s.text }]}>{icon}</Text>}
        <Text style={[styles.label, { color: s.text }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.sm,
  },
  fill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: BorderRadius.sm,
  },
  border: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: 4,
  },
  icon: {
    fontSize: FontSize.xs,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.5,
  },
});
