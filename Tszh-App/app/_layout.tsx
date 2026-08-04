import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/theme';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { flushPendingTasks } from '../src/lib/api';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Geist': require('../assets/fonts/Geist-Regular.ttf'),
    'GeistMono': require('../assets/fonts/GeistMono-Regular.ttf'),
  });

  // 启动时补发离线任务队列（幂等）
  useEffect(() => {
    const timer = setTimeout(() => {
      void flushPendingTasks();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.spaceDeep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.spaceDeep },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scheduled" />
        <Stack.Screen name="scheduled-list" />
        <Stack.Screen name="model-config" />
        <Stack.Screen name="connection" />
      </Stack>
    </ErrorBoundary>
  );
}
