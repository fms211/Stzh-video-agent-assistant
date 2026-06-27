// 新拟态筛选标签组件 — 用 View 背景色替代 LinearGradient 避免溢出

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { C } from '../hooks/useApp';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

export function NeuFilterChip({ label, active, onPress, style }: Props) {
  if (active) {
    return (
      <TouchableOpacity
        style={[styles.chip, styles.activeChip, style]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={styles.activeText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.chip, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.inactiveText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  activeChip: {
    backgroundColor: 'rgba(255,184,112,0.12)',
    borderColor: 'rgba(255,184,112,0.3)',
  },
  inactiveText: {
    fontSize: 12,
    color: '#5a6a8a',
    fontWeight: '500',
  },
  activeText: {
    fontSize: 12,
    color: '#ffb870',
    fontWeight: '600',
  },
});
