// 作品画廊 — 共享背景 + 错误处理

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { getGenerations, Generation } from '../../src/lib/api';
import { NeuFilterChip, NeuTag, NeuButton, PageBackground, EmptyState } from '../../src/components';
import { useApp, C, STATUS, cardShadow } from '../../src/hooks/useApp';
import { usePolling } from '../../src/hooks/usePolling';

export default function GalleryScreen() {
  const { width, insets, s, sp } = useApp();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [error, setError] = useState<string | null>(null);
  const CARD_W = (width - s(24) * 2 - s(12)) / 2;

  usePolling(async () => { await loadData(); }, 30000);
  const loadData = async () => {
    setError(null);
    try { const d = await getGenerations(); setGenerations(d.generations || []); }
    catch (e: any) { setError(e.message || '加载作品失败'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(80) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(12) }}>
          <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(232,152,64,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>作品画廊</Text>
          <View style={{ backgroundColor: 'rgba(232,152,64,0.1)', paddingHorizontal: s(10), paddingVertical: s(3), borderRadius: s(12), borderWidth: 1, borderColor: 'rgba(232,152,64,0.15)' }}>
            <Text style={{ fontSize: sp(11), color: C.amber }}>{generations.length} 个作品</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: s(24), marginBottom: s(16) }} contentContainerStyle={{ gap: s(8) }}>
          {['全部', '混剪', '连贯', 'IP强锁'].map((f) => <NeuFilterChip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />)}
        </ScrollView>

        {error && (
          <View style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(14), borderRadius: s(12), backgroundColor: 'rgba(239,83,80,0.1)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.2)', flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Text style={{ fontSize: sp(13), color: C.red, flex: 1 }}>{error}</Text>
            <NeuButton title="重试" variant="outline" size="sm" onPress={loadData} />
          </View>
        )}

        {loading ? <ActivityIndicator size="large" color={C.amber} style={{ marginTop: s(40) }} /> : generations.length === 0 && !error ? (
          <EmptyState
            icon="🌌"
            title="暂无作品"
            description="你的视频和图片作品会在这里展示。去「协同」页面开始第一次创作吧。"
            actionLabel="去协同"
            onAction={() => {}}
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: s(24), gap: s(12) }}>
            {generations.map((gen) => (
              <View key={gen.id} style={{ width: CARD_W, borderRadius: s(12), overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, ...cardShadow }}>
                <View style={{ width: '100%', height: CARD_W * 0.7, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: sp(28), opacity: 0.5 }}>{gen.video_url ? '▶' : gen.image_urls?.length ? '🖼' : '⏳'}</Text>
                  <View style={{ position: 'absolute', top: s(8), right: s(8) }}><NeuTag variant={gen.status === 'done' ? 'completed' : gen.status === 'failed' ? 'failed' : 'info'} label={gen.status} /></View>
                </View>
                <View style={{ padding: s(10) }}>
                  <Text style={{ fontSize: sp(13), fontWeight: '600', color: C.text }} numberOfLines={2}>{gen.prompt || '未命名'}</Text>
                  <Text style={{ fontSize: sp(10), color: C.textMuted, marginTop: s(4) }}>{new Date(gen.created_at).toLocaleDateString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
