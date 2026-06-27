// 工作流步骤卡 — 展开/折叠 + 状态标签 + 进度
// 对标桌面端 WorkflowStepCard.tsx

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useApp, C, STATUS, cardShadow } from '../hooks/useApp';
import { NeuTag } from './NeuTag';

interface Props {
  workflowName: string;
  workflowIcon: string;
  stepName?: string;
  stepIndex: number;
  totalSteps: number;
  content: string;
  isRunning?: boolean;
  isDone?: boolean;
  isError?: boolean;
}

export function WorkflowStepCard({
  workflowName, workflowIcon, stepName, stepIndex, totalSteps,
  content, isRunning, isDone, isError,
}: Props) {
  const { s, sp } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const statusVariant = isDone ? 'completed' : isRunning ? 'running' : isError ? 'failed' : 'default';
  const statusLabel = isDone ? '完成' : isRunning ? '执行中' : isError ? '失败' : '等待';
  const borderColor = isDone ? C.green : isRunning ? C.blue : isError ? C.red : 'rgba(255,255,255,0.06)';

  return (
    <View style={[styles.card, { borderColor, ...cardShadow }]}>
      {/* 头部：工作流名 + 步骤进度 */}
      <TouchableOpacity
        style={styles.header}
        onPress={isDone && content ? () => setCollapsed(!collapsed) : undefined}
        activeOpacity={isDone && content ? 0.7 : 1}
      >
        <Text style={styles.icon}>{workflowIcon}</Text>
        <Text style={styles.name}>{workflowName}</Text>
        {stepName && (
          <View style={styles.stepInfo}>
            <NeuTag variant={statusVariant} label={`${stepName} (${stepIndex + 1}/${totalSteps})`} />
            {isRunning && <ActivityIndicator size="small" color={C.blue} style={{ marginLeft: s(6) }} />}
          </View>
        )}
        {isDone && content && (
          <Text style={[styles.chevron, { transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }]}>▾</Text>
        )}
      </TouchableOpacity>

      {/* 步骤内容 */}
      {content && !collapsed && (
        <View style={[styles.content, isDone && { backgroundColor: 'rgba(102,187,106,0.05)' }]}>
          <Text style={styles.contentText}>{content}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#0f1a35',
    overflow: 'hidden',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  icon: {
    fontSize: 16,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dbe1ff',
    flex: 1,
  },
  stepInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 12,
    color: '#5a6a8a',
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  contentText: {
    fontSize: 13,
    color: '#dbe1ff',
    lineHeight: 20,
    paddingTop: 10,
  },
});
