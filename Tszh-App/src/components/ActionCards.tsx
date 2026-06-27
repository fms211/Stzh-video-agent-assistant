// 动作卡片 — 保存报告/继续/存模板/发工作区
// 对标桌面端 ActionCards.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp, C, insetBorder, cardShadow } from '../hooks/useApp';
import type { ActionCard } from '../lib/opc-agent';

interface Props {
  cards: ActionCard[];
  onAction: (card: ActionCard) => void;
}

const ICONS: Record<string, string> = {
  'save-report': '📄',
  'continue': '💬',
  'save-template': '📌',
  'send-to-workspace': '🚀',
};

export function ActionCards({ cards, onAction }: Props) {
  const { s, sp } = useApp();

  return (
    <View style={styles.container}>
      {cards.map((card) => (
        <TouchableOpacity
          key={card.id}
          style={[styles.card, { ...insetBorder, ...cardShadow }]}
          onPress={() => onAction(card)}
          activeOpacity={0.7}
        >
          <Text style={styles.icon}>{ICONS[card.type] || '📄'}</Text>
          <View style={styles.texts}>
            <Text style={styles.title}>{card.title}</Text>
            <Text style={styles.desc}>{card.desc}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#0a1228',
    minWidth: 140,
    flex: 1,
    minHeight: 48,
  },
  icon: {
    fontSize: 18,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dbe1ff',
  },
  desc: {
    fontSize: 11,
    color: '#5a6a8a',
    marginTop: 2,
  },
});
