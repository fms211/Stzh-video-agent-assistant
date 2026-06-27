// 新拟态进度条组件 — 凹陷轨道 + 发光填充
// 轨道用 inset 效果，填充用琥珀渐变 + 微妙光晕

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, FontSize, FontWeight, Spacing } from '../constants/theme';

interface Props {
  value: number; // 0-100
  label?: string;
  showPercent?: boolean;
  height?: number;
  color?: [string, string]; // 自定义渐变色
  style?: ViewStyle;
}

export function NeuProgress({
  value,
  label,
  showPercent = false,
  height = 6,
  color = ['#ffb870', '#e89840'],
  style,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <View style={[styles.container, style]}>
      {(label || showPercent) && (
        <View style={styles.labelRow}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showPercent && <Text style={styles.percent}>{Math.round(clamped)}%</Text>}
        </View>
      )}
      {/* 凹陷轨道 */}
      <View style={[styles.track, { height }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.trackGradient}
        />
        {/* 填充条 */}
        {clamped > 0 && (
          <View style={[styles.fillContainer, { width: `${clamped}%`, height }]}>
            <LinearGradient
              colors={color}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fillGradient}
            />
            {/* 发光高光 */}
            <LinearGradient
              colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fillHighlight}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.onSurfaceVariant,
  },
  percent: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    fontFamily: 'monospace',
  },
  track: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  trackGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
  },
  fillContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fillGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
  },
  fillHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
  },
});
