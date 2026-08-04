// Tab 栏 — 背景色统一 + 激活指示器包裹图标

import { Tabs } from 'expo-router';
import { View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, cardShadow } from '../../src/hooks/useApp';
import { FirstRunOverlay } from '../../src/components';

const TABS = [
  { name: 'index', label: '进程', icon: 'radio-outline' as const },
  { name: 'notifications', label: '通知', icon: 'notifications-outline' as const },
  { name: 'gallery', label: '作品', icon: 'sparkles-outline' as const },
  { name: 'ai-chat', label: '协同', icon: 'chatbubble-ellipses-outline' as const },
  { name: 'templates', label: '模板', icon: 'albums-outline' as const },
  { name: 'profile', label: '我的', icon: 'person-outline' as const },
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
                      backgroundColor: 'rgba(232,152,64,0.12)',
                      shadowColor: '#e89840',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 16,
                      elevation: 6,
                    }} />
                  )}
                  {/* 图标 */}
                  <Ionicons
                    name={tab.icon}
                    size={22}
                    color={focused ? C.amber : C.textMuted}
                    style={{ zIndex: 1, opacity: focused ? 1 : 0.6 }}
                  />
                </View>
              ),
            }}
          />
        ))}
      </Tabs>
    </>
  );
}
