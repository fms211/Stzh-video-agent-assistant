// 定时发布 — 共享背景 + 错误处理

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NeuButton, NeuFilterChip, NeuInsetView, PageBackground } from '../src/components';
import { useApp, C, insetBorder, STORAGE } from '../src/hooks/useApp';

export default function ScheduledScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'remix' | 'continuous'>('remix');
  const [scheduleType, setScheduleType] = useState<'now' | 'scheduled' | 'repeat'>('scheduled');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10).replace(/-/g, '/'));
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [repeatPattern, setRepeatPattern] = useState<'none' | 'daily' | 'weekly'>('none');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!prompt.trim()) { Alert.alert('提示', '请输入 Prompt 内容'); return; }
    setSaving(true);
    try {
      const task = { id: Date.now().toString(), prompt: prompt.trim(), mode, scheduleType, scheduledDate: scheduleType === 'scheduled' ? selectedDate : undefined, scheduledTime: scheduleType === 'scheduled' ? selectedTime : undefined, repeatPattern: scheduleType === 'repeat' ? repeatPattern : undefined, status: 'pending', createdAt: new Date().toISOString() };
      const existing = await AsyncStorage.getItem(STORAGE.scheduledTasks);
      const tasks = existing ? JSON.parse(existing) : [];
      tasks.unshift(task);
      await AsyncStorage.setItem(STORAGE.scheduledTasks, JSON.stringify(tasks));
      Alert.alert('发布成功', '定时任务已保存', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('保存失败', e.message || '请稍后重试'); }
    finally { setSaving(false); }
  };

  const Inp = ({ value, onChange, placeholder, mono }: { value: string; onChange: (t: string) => void; placeholder: string; mono?: boolean }) => (
    <View style={{ overflow: 'visible' }}>
      <NeuInsetView borderRadius={8}>
        <View style={{ height: s(44), justifyContent: 'center' }}>
          <TextInput style={{ paddingHorizontal: s(14), color: C.text, fontSize: sp(14), fontFamily: mono ? 'monospace' : undefined }} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.textPlaceholder} />
        </View>
      </NeuInsetView>
    </View>
  );

  const Radio = ({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: selected ? C.amber : C.textMuted, backgroundColor: selected ? C.amber : 'transparent' }} />
      <Text style={{ fontSize: sp(14), color: selected ? C.text : C.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(24) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(16) }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: s(36), height: s(36), borderRadius: s(18), backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="返回" accessibilityRole="button"><Text style={{ fontSize: sp(18), color: C.text }}>←</Text></TouchableOpacity>
          <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(255,184,112,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>定时发布</Text>
        </View>

        <Text style={{ fontSize: sp(10), color: C.textSecondary, letterSpacing: 1, opacity: 0.8, paddingHorizontal: s(24), marginBottom: s(8) }}>PROMPT 内容</Text>
        <View style={{ paddingHorizontal: s(24), marginBottom: s(20) }}>
          <NeuInsetView borderRadius={8}>
            <View style={{ minHeight: s(100) }}>
              <TextInput style={{ padding: s(14), color: C.text, fontSize: sp(14), textAlignVertical: 'top', minHeight: s(80) }} value={prompt} onChangeText={setPrompt} placeholder="输入你的创作描述..." placeholderTextColor={C.textPlaceholder} multiline />
            </View>
          </NeuInsetView>
        </View>

        <Text style={{ fontSize: sp(10), color: C.textSecondary, letterSpacing: 1, opacity: 0.8, paddingHorizontal: s(24), marginBottom: s(8) }}>工作模式</Text>
        <View style={{ flexDirection: 'row', paddingHorizontal: s(24), gap: s(12), marginBottom: s(20) }}>
          {(['remix', 'continuous'] as const).map((m) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: s(8), padding: s(12), borderRadius: s(8), backgroundColor: mode === m ? 'rgba(255,184,112,0.08)' : C.cardBg, borderWidth: 1, borderColor: mode === m ? 'rgba(255,184,112,0.3)' : 'rgba(255,255,255,0.04)' }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: mode === m ? C.amber : C.textMuted, backgroundColor: mode === m ? C.amber : 'transparent' }} />
              <Text style={{ fontSize: sp(13), color: mode === m ? C.amber : C.textMuted, fontWeight: mode === m ? '600' : '400' }}>{m === 'remix' ? '混剪模式' : '连贯模式'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: sp(10), color: C.textSecondary, letterSpacing: 1, opacity: 0.8, paddingHorizontal: s(24), marginBottom: s(8) }}>发布时间</Text>
        <View style={{ paddingHorizontal: s(24), gap: s(10), marginBottom: s(20) }}>
          {[{ k: 'now' as const, l: '立即发送' }, { k: 'scheduled' as const, l: '定时发送' }, { k: 'repeat' as const, l: '重复' }].map((opt) => (
            <View key={opt.k}>
              <Radio selected={scheduleType === opt.k} label={opt.l} onPress={() => setScheduleType(opt.k)} />
              {opt.k === 'scheduled' && scheduleType === 'scheduled' && <View style={{ flexDirection: 'row', gap: s(12), marginTop: s(10), marginLeft: s(24) }}><View style={{ flex: 1 }}><Inp value={selectedDate} onChange={setSelectedDate} placeholder="YYYY/MM/DD" mono /></View><View style={{ flex: 1 }}><Inp value={selectedTime} onChange={setSelectedTime} placeholder="HH:MM" mono /></View></View>}
              {opt.k === 'repeat' && scheduleType === 'repeat' && <View style={{ flexDirection: 'row', gap: s(8), marginTop: s(10), marginLeft: s(24) }}>{(['none', 'daily', 'weekly'] as const).map((r) => <NeuFilterChip key={r} label={r === 'none' ? '不重复' : r === 'daily' ? '每天' : '每周'} active={repeatPattern === r} onPress={() => setRepeatPattern(r)} />)}</View>}
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: s(24) }}><NeuButton title="确认发布到主站" variant="primary" size="lg" loading={saving} disabled={saving} onPress={handleSave} /></View>
      </ScrollView>
    </View>
  );
}
