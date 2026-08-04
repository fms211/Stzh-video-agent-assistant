// 品牌 Logo：01「轨道智核」几何 + 03 式贴边轮廓辉光。
// 使用同一单色母标进行系统着色，外部旋转动画可继续直接包裹本组件。

import React, { useEffect, useState } from 'react';
import { Animated, Image, View } from 'react-native';

// Metro requires a static `require` so the PNG is bundled into native builds.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO_MARK: number = require('../../assets/logo-mark-monochrome.png');

interface Props {
  size?: number;
  color?: string;
  pulse?: boolean;
}

export function Logo({ size = 80, color = '#e89840', pulse = false }: Props) {
  const [glowAnim] = useState(() => new Animated.Value(0.62));

  useEffect(() => {
    if (!pulse) {
      glowAnim.setValue(0.62);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.92,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.42,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [glowAnim, pulse]);

  const imageStyle = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: size,
    height: size,
  };
  const satelliteSize = Math.max(5, size * 0.09);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="腾昇智和轨道智核标志"
      style={{ width: size, height: size, position: 'relative', overflow: 'visible' }}
    >
      <Animated.Image
        source={LOGO_MARK}
        accessible={false}
        resizeMode="contain"
        blurRadius={Math.max(4, size * 0.055)}
        style={[
          imageStyle,
          {
            tintColor: color,
            opacity: glowAnim,
            transform: [{ scale: 1.035 }],
          },
        ]}
      />
      <Image
        source={LOGO_MARK}
        accessible={false}
        alt=""
        resizeMode="contain"
        style={[imageStyle, { tintColor: color }]}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.752 - satelliteSize / 2,
          top: size * 0.27 - satelliteSize / 2,
          width: satelliteSize,
          height: satelliteSize,
          borderRadius: satelliteSize / 2,
          backgroundColor: '#5888D8',
          borderWidth: Math.max(1, size * 0.012),
          borderColor: '#AEC6FF',
          shadowColor: '#5888D8',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: Math.max(4, size * 0.08),
          elevation: 5,
        }}
      />
    </View>
  );
}
