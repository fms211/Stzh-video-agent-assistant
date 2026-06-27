// 我的 — 新拟态凸起圆滑效果

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getMe, getGenerationStats, logout, healthCheck, getServerUrl as fetchServerUrl, changePassword } from '../../src/lib/api';
import { NeuTag, NeuRaisedView, NeuButton, PageBackground, Logo } from '../../src/components';
import { useApp, C, STATUS } from '../../src/hooks/useApp';

export default function ProfileScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, today: 0, videos: 0 });
  const [serverUrlDisplay, setServerUrlDisplay] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMe().catch(() => null),
      getGenerationStats().catch(() => ({ total: 0, today: 0, videos: 0 })),
      fetchServerUrl(),
      healthCheck().catch(() => false),
    ]).then(([me, statsData, url, online]) => {
      setUser(me?.user || null); setStats(statsData); setServerUrlDisplay(url); setIsOnline(online);
    }).catch((e) => setError(e.message || '加载失败'))
    .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('确认退出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const showComingSoon = (name: string) => Alert.alert('即将推出', `${name}功能正在开发中`);

  const handleChangePassword = () => {
    router.push('/forgot-password');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(80) }}>

        {/* 用户卡片 — 凸起新拟态 + 外发光 */}
        <View style={{ marginHorizontal: s(24), marginTop: insets.top + s(24), marginBottom: s(8) }}>
          <NeuRaisedView borderRadius={20} glow>
            <View style={{ alignItems: 'center', padding: s(28) }}>
              <View style={{ marginBottom: s(16) }}>
                <Logo size={s(72)} color={C.amberDark} pulse />
              </View>
              <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.text, marginBottom: s(8) }}>
                {user?.display_name || user?.username || '未登录'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                <NeuTag variant={isOnline ? 'completed' : 'failed'} label={isOnline ? '已连接' : '未连接'} />
                <Text style={{ fontSize: sp(10), color: C.textMuted, fontFamily: 'monospace' }}>
                  {serverUrlDisplay.replace('http://', '')}
                </Text>
              </View>
            </View>
          </NeuRaisedView>
        </View>

        {error && (
          <View style={{ marginHorizontal: s(24), marginTop: s(8), padding: s(12), borderRadius: s(10), backgroundColor: C.redBg, borderWidth: 1, borderColor: C.redBorder }}>
            <Text style={{ fontSize: sp(12), color: C.red }}>{error}</Text>
          </View>
        )}

        {/* 数据概览 */}
        <NeuSectionLabel label="数据概览" s={s} sp={sp} />
        <View style={{ flexDirection: 'row', paddingHorizontal: s(24), gap: s(12) }}>
          {[
            { value: stats.total, label: '总创作' },
            { value: stats.today, label: '今日' },
            { value: stats.videos, label: '视频' },
          ].map((stat) => (
            <View key={stat.label} style={{ flex: 1 }}>
              <NeuRaisedView borderRadius={14}>
                <View style={{ alignItems: 'center', padding: s(18) }}>
                  <Text style={{ fontSize: sp(28), fontWeight: '700', color: C.amber }}>{stat.value}</Text>
                  <Text style={{ fontSize: sp(11), color: C.textMuted, marginTop: s(6) }}>{stat.label}</Text>
                </View>
              </NeuRaisedView>
            </View>
          ))}
        </View>

        {/* 设置列表 */}
        <NeuSectionLabel label="设置" s={s} sp={sp} />
        <View style={{ paddingHorizontal: s(24), gap: s(10) }}>
          {[
            { icon: '🎨', label: '主题切换', value: '深空观测者', action: () => showComingSoon('主题切换') },
            { icon: '🔔', label: '通知设置', value: '已开启', action: () => showComingSoon('通知设置') },
            { icon: '🔗', label: '连接管理', value: isOnline ? '在线' : '离线', action: () => showComingSoon('连接管理') },
            { icon: '🔑', label: '修改密码', value: '', action: handleChangePassword },
          { icon: '📤', label: '导出数据', value: '', action: () => showComingSoon('导出数据') },
            { icon: 'ℹ️', label: '关于', value: 'v1.0.0', action: () => Alert.alert('关于 Tszh Remote', '版本: v1.0.0\n代号: 外置小脑\n\n腾昇智和 · AI 短视频全链路自动生成') },
          ].map((item, i) => (
            <TouchableOpacity key={i} onPress={item.action} accessibilityLabel={`${item.label}${item.value ? '，' + item.value : ''}`} accessibilityRole="button">
              <NeuRaisedView borderRadius={12}>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: s(16) }}>
                  <Text style={{ fontSize: sp(20), marginRight: s(14) }}>{item.icon}</Text>
                  <Text style={{ flex: 1, fontSize: sp(15), color: C.text }}>{item.label}</Text>
                  <Text style={{ fontSize: sp(12), color: C.textMuted, marginRight: s(8) }}>{item.value}</Text>
                  <Text style={{ fontSize: sp(18), color: 'rgba(255,255,255,0.15)' }}>›</Text>
                </View>
              </NeuRaisedView>
            </TouchableOpacity>
          ))}
        </View>

        {/* 退出登录 */}
        <View style={{ paddingHorizontal: s(24), marginTop: s(16) }}>
          <TouchableOpacity onPress={handleLogout} accessibilityLabel="退出登录" accessibilityRole="button">
            <NeuRaisedView borderRadius={12}>
              <View style={{ padding: s(16), alignItems: 'center' }}>
                <Text style={{ fontSize: sp(15), fontWeight: '600', color: C.red }}>退出登录</Text>
              </View>
            </NeuRaisedView>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

// Section 标题
function NeuSectionLabel({ label, s, sp }: { label: string; s: (n: number) => number; sp: (n: number) => number }) {
  return (
    <View style={{ paddingHorizontal: s(24), marginTop: s(24), marginBottom: s(12) }}>
      <Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text, letterSpacing: 0.5 }}>{label}</Text>
      <View style={{ height: 1, backgroundColor: 'rgba(255,184,112,0.15)', marginTop: s(8) }} />
    </View>
  );
}
