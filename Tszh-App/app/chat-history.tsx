// OPC 对话历史 — 查看/切换/删除所有会话

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { NeuCard, NeuTag, NeuButton, PageBackground, EmptyState } from '../src/components';
import { useApp, C, cardShadow } from '../src/hooks/useApp';
import { loadSessionsFromServer, deleteSessionOnServer, setActiveSessionId } from '../src/lib/opc-agent';

interface Session {
  id: string;
  title: string;
  updated_at: number;
  message_count: number;
}

export default function ChatHistoryScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    try {
      const data = await loadSessionsFromServer();
      setSessions(data);
    } catch {}
    finally { setLoading(false); }
  };

  const handleSelect = async (session: Session) => {
    await setActiveSessionId(session.id);
    router.back();
  };

  const handleDelete = (session: Session) => {
    Alert.alert('删除对话', `确定要删除「${session.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await deleteSessionOnServer(session.id);
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
      }},
    ]);
  };

  const handleNewSession = async () => {
    const { createSessionId, createSessionOnServer } = await import('../src/lib/opc-agent');
    const id = createSessionId();
    await createSessionOnServer(id, '新对话');
    await setActiveSessionId(id);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(24) }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(16) }}>
          <NeuIconButton icon="←" onPress={() => router.back()} />
          <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(255,184,112,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>对话历史</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleNewSession} style={{ padding: s(8) }}>
            <Text style={{ fontSize: sp(14), color: C.amber }}>+ 新对话</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.amber} style={{ marginTop: s(40) }} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="💬"
            title="暂无对话"
            description="在「协同」页面开始第一次对话，历史记录会自动保存到这里。"
            actionLabel="去协同"
            onAction={() => router.push('/(tabs)/ai-chat')}
          />
        ) : (
          sessions.map((session) => (
            <TouchableOpacity key={session.id} onPress={() => handleSelect(session)} style={{ marginHorizontal: s(24), marginBottom: s(10) }}>
              <NeuCard variant="raised">
                <View style={{ padding: s(14), flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text, marginBottom: s(4) }}>{session.title || '未命名对话'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                      <Text style={{ fontSize: sp(11), color: C.textMuted }}>
                        {session.message_count || 0} 条消息
                      </Text>
                      <Text style={{ fontSize: sp(11), color: C.textPlaceholder }}>
                        {session.updated_at ? new Date(session.updated_at * 1000).toLocaleDateString() : ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(session)} style={{ padding: s(8) }}>
                    <Text style={{ fontSize: sp(16), color: C.textMuted }}>×</Text>
                  </TouchableOpacity>
                </View>
              </NeuCard>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// 简化版图标按钮
function NeuIconButton({ icon, onPress }: { icon: string; onPress: () => void }) {
  const { s, sp } = useApp();
  return (
    <TouchableOpacity onPress={onPress} style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: sp(18), color: C.text }}>{icon}</Text>
    </TouchableOpacity>
  );
}
