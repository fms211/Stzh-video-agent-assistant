// 忘记密码 — 通过用户名重置密码

import { useState } from 'react';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { NeuButton, NeuInput, NeuTag, PageBackground } from '../src/components';
import { useApp, C } from '../src/hooks/useApp';
import { resetPassword } from '../src/lib/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    setError('');
    if (!username.trim()) { setError('请输入用户名'); return; }
    if (!newPassword) { setError('请输入新密码'); return; }
    if (newPassword.length < 6) { setError('新密码至少 6 个字符'); return; }
    if (newPassword !== confirmPassword) { setError('两次密码不一致'); return; }

    setLoading(true);
    try {
      await resetPassword(username.trim(), newPassword);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || '重置失败');
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', paddingHorizontal: s(24), paddingBottom: insets.bottom + s(24) }}>
      <PageBackground />

      <View style={{ alignItems: 'center', marginBottom: s(32) }}>
        <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2 }}>重置密码</Text>
        <Text style={{ fontSize: sp(12), color: C.textMuted, marginTop: s(8) }}>输入用户名和新密码</Text>
      </View>

      {success ? (
        <View style={{ alignItems: 'center', gap: s(16) }}>
          <Text style={{ fontSize: sp(32) }}>✅</Text>
          <Text style={{ fontSize: sp(16), fontWeight: '600', color: C.text }}>密码重置成功</Text>
          <Text style={{ fontSize: sp(13), color: C.textMuted, textAlign: 'center' }}>请使用新密码登录</Text>
          <NeuButton title="去登录" variant="primary" onPress={() => router.replace('/login')} style={{ marginTop: s(16) }} />
        </View>
      ) : (
        <View style={{ gap: s(12) }}>
          <NeuInput
            label="用户名"
            value={username}
            onChangeText={(t) => { setUsername(t); setError(''); }}
            placeholder="输入注册时的用户名"
            autoCapitalize="none"
          />
          <NeuInput
            label="新密码"
            value={newPassword}
            onChangeText={(t) => { setNewPassword(t); setError(''); }}
            placeholder="至少 6 位"
            secureTextEntry
          />
          <NeuInput
            label="确认新密码"
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
            placeholder="再次输入新密码"
            secureTextEntry
          />

          {error ? <NeuTag variant="failed" label={error} /> : null}

          <NeuButton
            title="重置密码"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading}
            onPress={handleReset}
            style={{ marginTop: s(8) }}
          />

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: s(12) }}>
            <Text style={{ fontSize: sp(13), color: C.textMuted }}>返回登录</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
