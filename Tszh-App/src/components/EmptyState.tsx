// 统一空状态组件 — 回答：这里会有什么？怎么开始？
// 凹陷图标区 + 标题 + 描述 + CTA 按钮

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useApp, C, insetBorder } from '../hooks/useApp';
import { NeuButton } from './NeuButton';

interface Props {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  const { s, sp } = useApp();

  return (
    <View style={{ alignItems: 'center', paddingTop: s(48), paddingHorizontal: s(32) }}>
      {/* 凹陷图标区 */}
      <View style={{
        width: s(72), height: s(72), borderRadius: s(36),
        ...insetBorder, justifyContent: 'center', alignItems: 'center', marginBottom: s(20),
      }}>
        <Text style={{ fontSize: sp(32) }}>{icon}</Text>
      </View>

      <Text style={{ fontSize: sp(16), fontWeight: '700', color: C.text, marginBottom: s(8), textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: sp(13), color: C.textMuted, textAlign: 'center', lineHeight: sp(20), marginBottom: s(24) }}>{description}</Text>

      {actionLabel && onAction && (
        <NeuButton title={actionLabel} variant="primary" size="md" onPress={onAction} style={{ marginBottom: s(12) }} />
      )}
      {secondaryLabel && onSecondary && (
        <TouchableOpacity onPress={onSecondary} style={{ paddingVertical: s(8) }}>
          <Text style={{ fontSize: sp(12), color: C.textMuted }}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
