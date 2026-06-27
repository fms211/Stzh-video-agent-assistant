// 新拟态聊天气泡组件
// 修复：确保渐变层被正确约束

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

interface Props {
  role: 'user' | 'assistant';
  children: React.ReactNode;
  style?: ViewStyle;
}

export function NeuBubble({ role, children, style }: Props) {
  if (role === 'user') {
    return (
      <View style={[styles.base, styles.userWrapper, style]}>
        <LinearGradient
          colors={['rgba(255,184,112,0.2)', 'rgba(232,152,64,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
          style={styles.fill}
        />
        <View style={styles.userContent}>
          {children}
        </View>
      </View>
    );
  }

  // AI 气泡
  return (
    <View style={[styles.base, styles.aiWrapper, style]}>
      {/* 右下暗影 */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      />
      {/* 左上高光 */}
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={styles.fill}
      />
      {/* 边框 */}
      <View style={styles.aiBorder} />
      <View style={styles.aiContent}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'relative',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },

  // === 用户气泡 ===
  userWrapper: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    borderRadius: BorderRadius.lg,
    borderBottomRightRadius: Spacing.xs,
  },
  userContent: {
    padding: Spacing.lg,
  },

  // === AI 气泡 ===
  aiWrapper: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: Spacing.xs,
  },
  aiBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  aiContent: {
    padding: Spacing.lg,
    backgroundColor: '#171f35',
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: Spacing.xs,
  },
});
