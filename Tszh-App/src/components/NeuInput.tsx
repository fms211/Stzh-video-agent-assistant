// 新拟态输入框组件 — 全渐变光滑凹陷版本
// 凹陷 = 多层柔和暗影渐变（没有硬边）+ 底部微光

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ViewStyle,
  Animated, TextInputProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, Spacing, BorderRadius, Animation } from '../constants/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  error?: string;
  label?: string;
  icon?: string;
  style?: ViewStyle;
}

export function NeuInput({
  value, onChangeText, placeholder, secureTextEntry,
  error, label, icon, style, onFocus, onBlur, ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const errorAnim = useRef(new Animated.Value(0)).current;
  const R = BorderRadius.lg;

  const handleFocus = (e: any) => {
    setFocused(true);
    Animated.timing(focusAnim, { toValue: 1, duration: Animation.focusDuration, useNativeDriver: false }).start();
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setFocused(false);
    Animated.timing(focusAnim, { toValue: 0, duration: Animation.focusDuration, useNativeDriver: false }).start();
    onBlur?.(e);
  };

  React.useEffect(() => {
    Animated.timing(errorAnim, { toValue: error ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [error]);

  const borderColor = error
    ? 'rgba(255,180,171,0.6)'
    : focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255,255,255,0.03)', 'rgba(232,152,64,0.5)'],
      });

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View style={[styles.outer, { borderRadius: R }]}>
        {/* 第 1 层：底色（比背景暗） */}
        <View style={[styles.fill, { borderRadius: R, backgroundColor: '#070c1a' }]} />

        {/* 第 2 层：顶部暗影渐变（凹陷上缘） */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.25)', 'transparent']}
          locations={[0, 0.3, 0.6]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 第 3 层：左侧暗影 */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 第 4 层：底部微光（凹陷底反射） */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.04)']}
          start={{ x: 0, y: 0.6 }}
          end={{ x: 0, y: 1 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 第 5 层：右侧微光 */}
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.03)']}
          start={{ x: 0.7, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { borderRadius: R }]}
        />

        {/* 图标 */}
        {icon && <Text style={styles.icon}>{icon}</Text>}

        {/* 输入框 — 必须在渐变层之上 */}
        <TextInput
          style={[styles.input, { borderRadius: R - 4 }, icon ? { paddingLeft: 40 } : null]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#3a4a6a"
          secureTextEntry={secureTextEntry}
          onFocus={handleFocus}
          onBlur={handleBlur}
          selectionColor={Colors.primaryContainer}
          {...rest}
        />

        {/* 动态边框 — 在输入框之下，不阻挡触摸 */}
        <Animated.View pointerEvents="none" style={[styles.borderAnim, { borderRadius: R, borderColor }]} />

        {/* 聚焦底部发光线 */}
        <Animated.View pointerEvents="none" style={[styles.glowLine, { opacity: focusAnim, borderRadius: 1 }]} />
      </View>

      {/* 错误信息 */}
      <Animated.View style={[styles.errorWrap, { opacity: errorAnim }]}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: {
    fontSize: FontSize.xs, color: Colors.onSurfaceVariant,
    letterSpacing: 1, marginBottom: Spacing.sm, fontWeight: '500',
  },
  outer: {
    position: 'relative',
    height: 52,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  borderAnim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1, zIndex: 5,
  },
  glowLine: {
    position: 'absolute',
    bottom: 1, left: '15%', right: '15%',
    height: 2,
    backgroundColor: 'rgba(232,152,64,0.7)',
    zIndex: 6,
  },
  icon: {
    position: 'absolute', left: 14, top: 15,
    fontSize: 18, color: '#3a4a6a', zIndex: 7,
  },
  input: {
    flex: 1,
    backgroundColor: '#0c1424',
    margin: 4,
    borderWidth: 0,
    paddingHorizontal: 16,
    color: Colors.onSurface,
    fontSize: FontSize.base,
    zIndex: 3,
  },
  errorWrap: { minHeight: 0, overflow: 'hidden' },
  errorText: {
    fontSize: FontSize.xs, color: Colors.error,
    marginTop: Spacing.xs, paddingLeft: 4,
  },
});
