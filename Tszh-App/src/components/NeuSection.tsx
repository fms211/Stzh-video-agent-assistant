// 新拟态 Section 标题组件 — 标题 + 发光分隔线
// 用于页面中各区块的标题

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, FontWeight } from '../constants/theme';

interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function NeuSection({ title, subtitle, action, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {action}
      </View>
      {/* 发光分隔线 */}
      <View style={styles.dividerWrapper}>
        <LinearGradient
          colors={['rgba(232,152,64,0.4)', 'rgba(232,152,64,0.08)', 'rgba(232,152,64,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.dividerGlow}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.dividerLine}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
  },
  titleGroup: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.onSurface,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  dividerWrapper: {
    position: 'relative',
    height: 2,
  },
  dividerGlow: {
    position: 'absolute',
    top: -1,
    left: 0,
    right: 0,
    height: 4,
  },
  dividerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 0.5,
  },
});
