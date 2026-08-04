// 定时任务列表 — 共享背景 + 错误处理

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NeuTag, PageBackground, EmptyState } from '../src/components';
import { useApp, C, STATUS, STORAGE } from '../src/hooks/useApp';

interface ScheduledTask { id: string; prompt: string; mode: string; scheduleType: string; scheduledDate?: string; scheduledTime?: string; repeatPattern?: string; status: string; createdAt: string; }

export default function ScheduledListScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE.scheduledTasks)
      .then((d) => { if (d) setTasks(JSON.parse(d)); })
      .catch((e) => setError(e.message || '加载定时任务失败'));
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('确认删除', '确定要删除这个定时任务吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        const u = tasks.filter((t) => t.id !== id); setTasks(u);
        try { await AsyncStorage.setItem(STORAGE.scheduledTasks, JSON.stringify(u)); }
        catch { Alert.alert('删除失败', '请重试'); }
      }},
    ]);
  };

  const sv = (s: string) => s === 'pending' ? 'running' as const : s === 'sent' ? 'completed' as const : 'failed' as const;
  const sl = (s: string) => s === 'pending' ? '等待中' : s === 'sent' ? '已发送' : '失败';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(24) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="返回" accessibilityRole="button"><Text style={{ fontSize: sp(18), color: C.text }}>←</Text></TouchableOpacity>
            <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(232,152,64,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>定时任务</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/scheduled')} style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: 'rgba(232,152,64,0.15)', justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: sp(18), color: C.amber }}>＋</Text></TouchableOpacity>
        </View>

        {error && (
          <View style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(12), borderRadius: s(10), backgroundColor: 'rgba(239,83,80,0.1)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.2)' }}>
            <Text style={{ fontSize: sp(12), color: C.red }}>{error}</Text>
          </View>
        )}

        {tasks.length === 0 && !error ? (
          <EmptyState
            icon="⏰"
            title="暂无定时任务"
            description="你可以设置定时发布，让平台在指定时间自动执行创作任务。"
            actionLabel="创建定时任务"
            onAction={() => router.push('/scheduled')}
          />
        ) : tasks.map((task) => (
          <View key={task.id} style={{ marginHorizontal: s(24), marginBottom: s(10), padding: s(14), borderRadius: s(12), backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: (STATUS[sv(task.status)] || STATUS.pending).text, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', borderRightColor: 'rgba(255,255,255,0.03)', borderBottomColor: 'rgba(255,255,255,0.03)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(6) }}>
              <View style={{ flexDirection: 'row', gap: s(6) }}>
                <NeuTag variant={sv(task.status)} label={sl(task.status)} />
                <NeuTag variant="default" label={task.mode === 'remix' ? '混剪' : '连贯'} />
              </View>
              <TouchableOpacity onPress={() => handleDelete(task.id)}><Text style={{ fontSize: sp(16), color: C.textMuted }}>×</Text></TouchableOpacity>
            </View>
            <Text style={{ fontSize: sp(14), color: C.text, marginBottom: s(6) }} numberOfLines={2}>{task.prompt}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: sp(11), color: C.amber }}>{task.scheduleType === 'now' ? '立即发送' : task.scheduleType === 'scheduled' ? `${task.scheduledDate} ${task.scheduledTime}` : `重复·${task.repeatPattern === 'daily' ? '每天' : '每周'}`}</Text>
              <Text style={{ fontSize: sp(11), color: C.textMuted }}>{new Date(task.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
