// 进程面板 — 共享背景 + 错误处理

import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { getGenerations, getGenerationStats, healthCheck, Generation } from '../../src/lib/api';
import { NeuTag, NeuButton, NeuInsetView, PageBackground, EmptyState } from '../../src/components';
import { useApp, C, STATUS, insetBorder, cardShadow } from '../../src/hooks/useApp';
import { useStagger } from '../../src/hooks/useAnimation';
import { usePolling } from '../../src/hooks/usePolling';

function ProgressBar({ value, color = '#4fc3f7', s }: { value: number; color?: string; s: (n: number) => number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]));
    anim.start(); return () => anim.stop();
  }, []);
  return (
    <View style={{ height: s(6), borderRadius: s(3), backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', borderRadius: s(3), width: `${Math.min(100, value)}%`, backgroundColor: color, opacity: pulse }} />
    </View>
  );
}

function StatusPill({ status, s }: { status: string; s: (n: number) => number }) {
  const c = STATUS[status] || STATUS.pending;
  const label = status === 'running' ? '进行中' : status === 'done' ? '已完成' : status === 'failed' ? '失败' : '等待中';
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: s(20), paddingHorizontal: s(10), paddingVertical: s(3), borderWidth: 1, borderColor: c.border, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: s(12), fontWeight: '600', color: c.text }}>{label}</Text>
    </View>
  );
}

// 任务状态标准化
function getTaskStatus(gen: Generation): string {
  if (gen.status === 'done' || gen.status === 'completed') return 'done';
  if (gen.status === 'failed' || gen.status === 'error') return 'failed';
  if (gen.status === 'running' || gen.status === 'processing') return 'running';
  return 'pending';
}

// 任务列表 — 带 stagger 入场动画
function TaskList({ tasks, s, sp }: { tasks: Generation[]; s: (n: number) => number; sp: (n: number) => number }) {
  const anims = useStagger(tasks.length, 80);

  return (
    <>
      {tasks.map((gen, i) => {
        const status = getTaskStatus(gen);
        const sc = STATUS[status] || STATUS.pending;
        return (
          <Animated.View key={gen.id} style={{
            marginHorizontal: s(24), marginBottom: s(12),
            opacity: anims[i] || 1,
            transform: [{ translateY: (anims[i] || { interpolate: () => 0 }).interpolate ? anims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) : 0 }],
          }}>
            <View style={{ borderRadius: s(12), backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: sc.text, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: C.borderLight, borderRightColor: 'rgba(255,255,255,0.03)', borderBottomColor: 'rgba(255,255,255,0.03)', padding: s(16), ...cardShadow }}>
              <StatusPill status={status} s={s} />
              <Text style={{ fontSize: sp(15), fontWeight: '600', color: C.text, marginTop: s(8), marginBottom: s(8) }} numberOfLines={2}>{gen.prompt || '未命名任务'}</Text>
              {status === 'running' && <View style={{ gap: s(6) }}><ProgressBar value={50} color={sc.text} s={s} /><Text style={{ fontSize: sp(12), color: C.textMuted }}>生成中...</Text></View>}
              {status === 'done' && <Text style={{ fontSize: sp(12), color: C.textMuted }}>{gen.created_at ? new Date(gen.created_at).toLocaleDateString() : ''}</Text>}
              {status === 'failed' && <View style={{ gap: s(8) }}><Text style={{ fontSize: sp(12), color: C.red }}>生成失败</Text><View style={{ flexDirection: 'row', gap: s(8) }}><NeuButton title="重试" variant="primary" size="sm" onPress={() => Alert.alert('提示', '重试功能开发中')} /><NeuButton title="详情" variant="outline" size="sm" onPress={() => Alert.alert('提示', '详情功能开发中')} /></View></View>}
            </View>
          </Animated.View>
        );
      })}
    </>
  );
}

export default function ProcessScreen() {
  const { insets, s, sp } = useApp();
  const [tasks, setTasks] = useState<Generation[]>([]);
  const [stats, setStats] = useState({ total: 0, today: 0, videos: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每 30s 自动刷新
  usePolling(async () => {
    await loadData();
  }, 30000);

  const loadData = async () => {
    setError(null);
    try {
      const [genData, statsData, online] = await Promise.all([
        getGenerations(1, 20).catch(() => ({ generations: [], total: 0 })),
        getGenerationStats().catch(() => ({ total: 0, today: 0, videos: 0 })),
        healthCheck().catch(() => false),
      ]);
      setTasks(genData.generations || []); setStats(statsData); setIsOnline(online);
    } catch (e: any) {
      setError(e.message || '加载失败，请检查网络');
    } finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, []);

  const getTaskStatus = (gen: Generation): string => {
    if (gen.status === 'done' || gen.status === 'completed') return 'done';
    if (gen.status === 'failed' || gen.status === 'error') return 'failed';
    if (gen.status === 'running' || gen.status === 'processing') return 'running';
    return 'pending';
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(80) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(12) }}>
          <View>
            <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(255,184,112,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>进程监控</Text>
            <Text style={{ fontSize: sp(11), color: C.textMuted, letterSpacing: 1, marginTop: 2 }}>实时任务状态</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), backgroundColor: isOnline ? STATUS.done.bg : STATUS.failed.bg, paddingHorizontal: s(12), paddingVertical: s(4), borderRadius: s(20), borderWidth: 1, borderColor: isOnline ? STATUS.done.border : STATUS.failed.border }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOnline ? C.green : C.red }} />
            <Text style={{ fontSize: sp(11), fontWeight: '600', color: isOnline ? C.green : C.red }}>{isOnline ? '在线' : '离线'}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: s(24), gap: s(12), marginBottom: s(20), overflow: 'visible' }}>
          {[{ label: '总任务', value: String(stats.total) }, { label: '今日', value: String(stats.today) }, { label: '视频', value: String(stats.videos) }].map((item) => (
            <View key={item.label} style={{ flex: 1, overflow: 'visible' }}>
              <NeuInsetView borderRadius={12}>
                <View style={{ padding: s(14) }}>
                  <Text style={{ fontSize: sp(10), color: C.textMuted, letterSpacing: 1, marginBottom: s(4) }}>{item.label}</Text>
                  <Text style={{ fontSize: sp(22), fontWeight: '700', color: C.amber }}>{item.value}</Text>
                </View>
              </NeuInsetView>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), marginBottom: s(12) }}>
          <Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text }}>活跃任务</Text>
          <Text style={{ fontSize: sp(11), color: C.textMuted }}>{tasks.length} 个任务</Text>
        </View>

        {error && (
          <View style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(14), borderRadius: s(12), backgroundColor: 'rgba(239,83,80,0.1)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.2)', flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Text style={{ fontSize: sp(14), color: C.red, flex: 1 }}>{error}</Text>
            <NeuButton title="重试" variant="outline" size="sm" onPress={loadData} />
          </View>
        )}

        {loading ? <ActivityIndicator size="large" color={C.amber} style={{ marginTop: s(40) }} /> : tasks.length === 0 && !error ? (
          <EmptyState
            icon="📡"
            title="暂无任务"
            description="去「协同」页面和 AI 对话，描述你的创作想法，任务会自动出现在这里。"
            actionLabel="去协同"
            onAction={() => {}}
          />
        ) : <TaskList tasks={tasks} s={s} sp={sp} />}
      </ScrollView>
    </View>
  );
}
