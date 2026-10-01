// 通知中心 — 共享背景 + 错误处理

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteAllNotifications, Notification } from '../../src/lib/api';
import { NeuTag, NeuFilterChip, NeuButton, PageBackground, EmptyState } from '../../src/components';
import { useApp, C, STATUS, cardShadow } from '../../src/hooks/useApp';
import { usePolling } from '../../src/hooks/usePolling';
import { wsClient } from '../../src/lib/ws';

const TYPE_MAP: Record<string, { variant: 'completed' | 'failed' | 'info' | 'default'; label: string }> = {
  success: { variant: 'completed', label: '已完成' }, error: { variant: 'failed', label: '失败' }, info: { variant: 'info', label: '系统' },
};

export default function NotificationsScreen() {
  const { insets, s, sp } = useApp();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('全部');
  const [error, setError] = useState<string | null>(null);

  usePolling(async () => { await loadData(); }, 30000);

  const loadData = async () => {
    setError(null);
    try { setNotifications(await getNotifications()); }
    catch (e: any) { setError(e.message || '加载通知失败'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, []);

  // WS 实时推送：收到 notification.created 立即刷新（30s 轮询仍作兜底）
  useEffect(() => {
    const onNotif = () => { void loadData(); };
    wsClient.on('notification.created', onNotif);
    return () => { wsClient.off('notification.created', onNotif); };
  }, []);
  const handleMarkRead = async (id: string) => {
    try { await markNotificationRead(id); setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))); }
    catch { Alert.alert('操作失败', '标记已读失败，请重试'); }
  };
  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); setNotifications((p) => p.map((n) => ({ ...n, read: true }))); }
    catch { Alert.alert('操作失败', '批量标记失败，请重试'); }
  };

  const handleDeleteAll = () => {
    Alert.alert('清空通知', '确定要清空所有通知吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => {
        try { await deleteAllNotifications(); setNotifications([]); }
        catch { Alert.alert('操作失败', '清空失败，请重试'); }
      }},
    ]);
  };

  const filtered = notifications.filter((n) => {
    if (filter === '全部') return true;
    if (filter === '已完成') return n.type === 'success';
    if (filter === '失败') return n.type === 'error';
    return n.type === 'info' || n.type === 'system';
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(80) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(12) }}>
          <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(232,152,64,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>通知中心</Text>
          <View style={{ flexDirection: 'row', gap: s(12) }}>
            {notifications.length > 0 && <TouchableOpacity onPress={handleDeleteAll} accessibilityLabel="清空所有通知" accessibilityRole="button"><Text style={{ fontSize: sp(12), color: C.textMuted }}>清空</Text></TouchableOpacity>}
            {notifications.some((n) => !n.read) && <TouchableOpacity onPress={handleMarkAllRead} accessibilityLabel="全部标记为已读" accessibilityRole="button"><Text style={{ fontSize: sp(12), color: C.amber }}>全部已读</Text></TouchableOpacity>}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: s(24), marginBottom: s(16) }} contentContainerStyle={{ gap: s(8) }}>
          {['全部', '已完成', '失败', '系统'].map((f) => <NeuFilterChip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />)}
        </ScrollView>

        {error && (
          <View style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(14), borderRadius: s(12), backgroundColor: 'rgba(239,83,80,0.1)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.2)', flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Text style={{ fontSize: sp(13), color: C.red, flex: 1 }}>{error}</Text>
            <NeuButton title="重试" variant="outline" size="sm" onPress={loadData} />
          </View>
        )}

        {loading ? <ActivityIndicator size="large" color={C.amber} style={{ marginTop: s(40) }} /> : filtered.length === 0 && !error ? (
          <EmptyState icon="🔔" title="暂无通知" description="当任务完成、失败或有系统消息时，通知会出现在这里。" />
        ) : filtered.map((notif) => {
          const t = TYPE_MAP[notif.type] || TYPE_MAP.info;
          return (
            <TouchableOpacity key={notif.id} onPress={() => handleMarkRead(notif.id)} style={{ marginHorizontal: s(24), marginBottom: s(10), padding: s(14), borderRadius: s(12), backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: notif.read ? C.borderLight : C.amber, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: C.borderLight, borderRightColor: 'rgba(255,255,255,0.03)', borderBottomColor: 'rgba(255,255,255,0.03)', ...cardShadow }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(6) }}>
                <NeuTag variant={t.variant} label={t.label} />
                {!notif.read && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.amber }} />}
              </View>
              <Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text, marginBottom: s(4) }}>{notif.title}</Text>
              <Text style={{ fontSize: sp(12), color: C.textMuted, marginBottom: s(4) }}>{notif.message}</Text>
              <Text style={{ fontSize: sp(10), color: C.textPlaceholder }}>{new Date(notif.created_at).toLocaleString()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
