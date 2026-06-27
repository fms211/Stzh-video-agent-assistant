// Tab 栏 — 背景色统一 + 激活指示器包裹图标

import { Tabs } from 'expo-router';
import { View, Text, Platform } from 'react-native';
import { C, cardShadow } from '../../src/hooks/useApp';
import { FirstRunOverlay } from '../../src/components';

const TABS = [
  { name: 'index', label: '进程', icon: '📡' },
  { name: 'notifications', label: '通知', icon: '🔔' },
  { name: 'gallery', label: '作品', icon: '🌌' },
  { name: 'ai-chat', label: '协同', icon: '🤖' },
  { name: 'templates', label: '模板', icon: '📦' },
  { name: 'profile', label: '我的', icon: '👤' },
];

export default function TabLayout() {
  return (
    <>
      <FirstRunOverlay onComplete={() => {}} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.amber,
          tabBarInactiveTintColor: C.textMuted,
          tabBarStyle: {
            backgroundColor: C.bg,
            borderTopWidth: 0,
            height: Platform.OS === 'ios' ? 88 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 8,
            paddingTop: 8,
            ...cardShadow,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarIcon: ({ focused }) => (
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {/* 发光光圈 — 包裹图标，居中 */}
                  {focused && (
                    <View style={{
                      position: 'absolute',
                      width: 44, height: 44,
                      borderRadius: 22,
                      backgroundColor: 'rgba(255,184,112,0.12)',
                      shadowColor: '#e89840',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 16,
                      elevation: 6,
                    }} />
                  )}
                  {/* 图标 */}
                  <Text style={{
                    fontSize: 20,
                    opacity: focused ? 1 : 0.5,
                    zIndex: 1,
                  }}>{tab.icon}</Text>
                </View>
              ),
            }}
          />
        ))}
      </Tabs>
    </>
  );
}
