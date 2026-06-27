// 新拟态设置行组件 — 修复：确保渐变层被正确约束

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

interface Props {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  style?: ViewStyle;
}

export function NeuSettingsRow({ icon, label, value, onPress, danger = false, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.wrapper, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={styles.fill}
      />
      <View style={styles.border} />

      <View style={styles.content}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
        {value !== undefined && (
          <Text style={styles.value}>{value}</Text>
        )}
        {onPress && <Text style={styles.arrow}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: '#171f35',
    borderRadius: BorderRadius.lg,
  },
  icon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },
  label: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.onSurface,
  },
  labelDanger: {
    color: Colors.error,
  },
  value: {
    fontSize: FontSize.sm,
    color: Colors.onSurfaceVariant,
    marginRight: Spacing.sm,
  },
  arrow: {
    fontSize: FontSize.xl,
    color: 'rgba(255,255,255,0.2)',
  },
});
