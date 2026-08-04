// 修改密码 — 仅允许已登录用户使用旧密码修改

import { useState } from 'react';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { NeuButton, NeuInput, NeuTag, PageBackground } from '../src/components';
import { useApp, C } from '../src/hooks/useApp';
import { changePassword } from '../src/lib/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    setError('');
    if (!oldPassword) { setError('请输入当前密码'); return; }
    if (!newPassword) { setError('请输入新密码'); return; }
    if (newPassword.length < 6) { setError('新密码至少 6 个字符'); return; }
    if (newPassword !== confirmPassword) { setError('两次密码不一致'); return; }

    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || '重置失败');
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', paddingHorizontal: s(24), paddingBottom: insets.bottom + s(24) }}>
      <PageBackground />

      <View style={{ alignItems: 'center', marginBottom: s(32) }}>
        <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2 }}>修改密码</Text>
        <Text style={{ fontSize: sp(12), color: C.textMuted, marginTop: s(8) }}>验证当前密码后设置新密码</Text>
      </View>

      {success ? (
        <View style={{ alignItems: 'center', gap: s(16) }}>
          <Text style={{ fontSize: sp(32) }}>✅</Text>
          <Text style={{ fontSize: sp(16), fontWeight: '600', color: C.text }}>密码修改成功</Text>
          <Text style={{ fontSize: sp(13), color: C.textMuted, textAlign: 'center' }}>下次登录请使用新密码</Text>
          <NeuButton title="返回个人中心" variant="primary" onPress={() => router.back()} style={{ marginTop: s(16) }} />
        </View>
      ) : (
        <View style={{ gap: s(12) }}>
          <NeuInput
            label="当前密码"
            value={oldPassword}
            onChangeText={(t) => { setOldPassword(t); setError(''); }}
            placeholder="输入当前密码"
            secureTextEntry
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
            title="确认修改"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading}
            onPress={handleReset}
            style={{ marginTop: s(8) }}
          />

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: s(12) }}>
            <Text style={{ fontSize: sp(13), color: C.textMuted }}>返回个人中心</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
