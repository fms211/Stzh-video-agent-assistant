// 首次运行引导 — 登录后第一次进入 App 时显示
// 3 步引导：欢迎 → 连接服务器 → 开始创作
// 完成后存储标记，不再显示

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp, C, insetBorder } from '../hooks/useApp';
import { NeuButton } from './NeuButton';
import { Logo } from './Logo';

const STORAGE_KEY = 'tszh_onboarding_done';

interface Props {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: '📡',
    title: '欢迎使用 Tszh Remote',
    desc: '这是腾昇智和平台的远程控制中心。你可以在这里监控任务进度、管理模板、与 AI 协同创作。',
    cta: '下一步',
  },
  {
    icon: '🔗',
    title: '连接你的平台',
    desc: '确保手机和电脑在同一 WiFi 下。在「我的」页面可以查看连接状态和服务器地址。',
    cta: '下一步',
  },
  {
    icon: '🤖',
    title: '开始创作',
    desc: '去「协同」页面和 AI 对话，描述你的创作想法。AI 会自动生成短视频脚本和分镜。',
    cta: '开始使用',
  },
];

export function FirstRunOverlay({ onComplete }: Props) {
  const { s, sp } = useApp();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((done) => {
      if (!done) setVisible(true);
    });
  }, []);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    AsyncStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
    onComplete();
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { padding: s(28), borderRadius: s(20), maxWidth: Math.min(360, s(340)) }]}>
          {/* Logo */}
          <View style={{ alignItems: 'center', marginBottom: s(20) }}>
            <Logo size={s(56)} color={C.amberDark} />
          </View>

          {/* 步骤指示器 */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: s(8), marginBottom: s(20) }}>
            {STEPS.map((_, i) => (
              <View key={i} style={{
                width: i === step ? s(24) : s(8), height: s(4), borderRadius: s(2),
                backgroundColor: i === step ? C.amber : 'rgba(255,255,255,0.15)',
              }} />
            ))}
          </View>

          {/* 内容 */}
          <Text style={{ fontSize: sp(28), textAlign: 'center', marginBottom: s(12) }}>{current.icon}</Text>
          <Text style={{ fontSize: sp(18), fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: s(10) }}>{current.title}</Text>
          <Text style={{ fontSize: sp(13), color: C.textSecondary, textAlign: 'center', lineHeight: sp(20), marginBottom: s(24) }}>{current.desc}</Text>

          {/* 按钮 */}
          <NeuButton title={current.cta} variant="primary" size="md" onPress={handleNext} style={{ width: '100%', marginBottom: s(12) }} />
          <TouchableOpacity onPress={handleComplete} style={{ alignItems: 'center', paddingVertical: s(8) }}>
            <Text style={{ fontSize: sp(12), color: C.textMuted }}>跳过引导</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,10,20,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0f1a35',
    borderWidth: 1,
    borderColor: 'rgba(232,152,64,0.12)',
    width: '100%',
  },
});
