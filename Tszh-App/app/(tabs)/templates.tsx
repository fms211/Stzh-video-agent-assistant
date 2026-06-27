// 模板管理 — 共享背景 + 错误处理

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getTemplates, deleteTemplate, Template } from '../../src/lib/api';
import { NeuButton, NeuFilterChip, NeuInsetView, PageBackground, EmptyState } from '../../src/components';
import { useApp, C, insetBorder, cardShadow } from '../../src/hooks/useApp';

export default function TemplatesScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    setError(null);
    try { setTemplates(await getTemplates()); }
    catch (e: any) { setError(e.message || '加载模板失败'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, []);

  const handleDelete = (tpl: Template) => {
    Alert.alert('删除模板', `确定要删除「${tpl.label}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          await deleteTemplate(tpl.id);
          setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
        } catch { Alert.alert('删除失败', '请重试'); }
      }},
    ]);
  };

  const categories = ['全部', ...new Set(templates.map((t) => t.category))];
  const filtered = templates.filter((t) => filter === '全部' || t.category === filter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(80) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(12) }}>
          <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(255,184,112,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>模板管理</Text>
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <TouchableOpacity onPress={() => router.push('/scheduled-list')} style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: sp(14) }}>⏰</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => Alert.alert('提示', '新建模板功能开发中')} style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: 'rgba(255,184,112,0.15)', justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: sp(18), color: C.amber }}>＋</Text></TouchableOpacity>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: s(24), marginBottom: s(16) }} contentContainerStyle={{ gap: s(8) }}>
          {categories.map((cat) => <NeuFilterChip key={cat} label={cat} active={filter === cat} onPress={() => setFilter(cat)} />)}
        </ScrollView>

        {error && (
          <View style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(14), borderRadius: s(12), backgroundColor: 'rgba(239,83,80,0.1)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.2)', flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Text style={{ fontSize: sp(13), color: C.red, flex: 1 }}>{error}</Text>
            <NeuButton title="重试" variant="outline" size="sm" onPress={loadData} />
          </View>
        )}

        {loading ? <ActivityIndicator size="large" color={C.amber} style={{ marginTop: s(40) }} /> : filtered.length === 0 && !error ? (
          <EmptyState
            icon="📦"
            title="暂无模板"
            description="模板可以保存常用的创作指令，方便快速启动新任务。"
            actionLabel="创建模板"
            onAction={() => Alert.alert('提示', '创建模板功能开发中')}
          />
        ) : filtered.map((tpl) => (
          <View key={tpl.id} style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(16), borderRadius: s(12), backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(10), gap: s(12) }}>
              <View style={{ width: s(40), height: s(40) }}>
                <NeuInsetView borderRadius={8}>
                  <View style={{ width: s(40), height: s(40), justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: sp(18) }}>{tpl.icon || '📝'}</Text>
                  </View>
                </NeuInsetView>
              </View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text }}>{tpl.label}</Text><Text style={{ fontSize: sp(11), color: C.textMuted, marginTop: s(2) }}>{tpl.category}</Text></View>
              <TouchableOpacity onPress={() => handleDelete(tpl)} style={{ padding: s(4) }} accessibilityLabel={`删除 ${tpl.label}`}>
                <Text style={{ fontSize: sp(16), color: C.textMuted }}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: sp(12), color: C.textMuted, marginBottom: s(12), lineHeight: sp(18) }} numberOfLines={2}>{tpl.prompt}</Text>
            <View style={{ flexDirection: 'row', gap: s(8) }}>
              <NeuButton title="定时" variant="outline" size="sm" onPress={() => router.push('/scheduled')} />
              <NeuButton title="使用" variant="primary" size="sm" onPress={() => Alert.alert('提示', '使用模板功能开发中')} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
