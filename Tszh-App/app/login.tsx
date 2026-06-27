// 登录页 — 星空粒子 + CRT 扫描线 + 登录注册

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { NeuTag, NeuButton, NeuInsetView, PulseGlow, PageBackground, Logo } from '../src/components';
import { login, register, setServerUrl, getServerUrl, healthCheck, getToken, removeToken } from '../src/lib/api';
import { useApp, C, insetBorder, STORAGE, cardShadowStrong } from '../src/hooks/useApp';
import AsyncStorage from '@react-native-async-storage/async-storage';

function NeuInputField({ icon, placeholder, secureTextEntry, value, onChangeText, onFocus, onBlur, error, compact }: {
  icon: string; placeholder: string; secureTextEntry?: boolean; value: string;
  onChangeText: (t: string) => void; onFocus?: () => void; onBlur?: () => void;
  error?: string; compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const h = compact ? 44 : 52;
  return (
    <View style={{ marginBottom: 12, overflow: 'visible' }}>
      <NeuInsetView borderRadius={8} glow={focused}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: h }}>
          <Text style={{ position: 'absolute', left: 12, fontSize: compact ? 16 : 18, zIndex: 2, color: focused ? C.amber : 'rgba(255,184,112,0.5)' }}>{icon}</Text>
          <TextInput
            style={{ flex: 1, height: '100%', paddingLeft: 44, paddingRight: 16, color: C.text, fontSize: compact ? 13 : 14 }}
            placeholder={placeholder} placeholderTextColor={C.textDim}
            secureTextEntry={secureTextEntry} value={value} onChangeText={onChangeText}
            onFocus={() => { setFocused(true); onFocus?.(); }} onBlur={() => { setFocused(false); onBlur?.(); }}
            selectionColor={C.amberDark} autoCapitalize="none"
            accessibilityLabel={placeholder}
          />
        </View>
      </NeuInsetView>
      {error ? <Text style={{ fontSize: 11, color: C.red, marginTop: 4, paddingLeft: 4 }}>{error}</Text> : null}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { width, insets, s, sp, isTablet, maxContentW } = useApp();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [serverStatus, setServerStatus] = useState<'unknown' | 'checking' | 'online' | 'offline'>('unknown');
  const [errors, setErrors] = useState<{ username?: string; password?: string; submit?: string }>({});

  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getToken().then((token) => {
      if (token) { router.replace('/(tabs)'); return; }
      const glowLoop = Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ]));
      const rotateLoop = Animated.loop(Animated.timing(logoRotate, { toValue: 1, duration: 20000, useNativeDriver: true }));
      glowLoop.start(); rotateLoop.start();
      getServerUrl().then((url) => { setServer(url); checkServerSilent(url); });
      return () => { glowLoop.stop(); rotateLoop.stop(); };
    });
  }, []);

  const checkServerSilent = async (url: string) => {
    try { await setServerUrl(url); setServerStatus((await healthCheck()) ? 'online' : 'offline'); }
    catch { setServerStatus('offline'); }
  };

  const checkServer = async () => {
    if (!server.trim()) { setServerStatus('offline'); return; }
    setServerStatus('checking');
    try { await setServerUrl(server); setServerStatus((await healthCheck()) ? 'online' : 'offline'); }
    catch { setServerStatus('offline'); }
  };

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!username.trim()) e.username = '请输入用户名';
    else if (username.trim().length < 2) e.username = '用户名至少 2 个字符';
    if (!password.trim()) e.password = '请输入密码';
    else if (password.length < 6) e.password = '密码至少 6 个字符';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true); setErrors({});
    try {
      if (server) await setServerUrl(server);
      if (isRegister) { await register(username.trim(), password); await login(username.trim(), password); }
      else await login(username.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('已存在')) setErrors({ submit: '用户名已存在，请直接登录' });
      else if (msg.includes('密码') || msg.includes('401')) setErrors({ submit: '用户名或密码错误' });
      else if (msg.includes('Network') || msg.includes('fetch')) setErrors({ submit: '网络不可用' });
      else setErrors({ submit: msg || '连接失败' });
    } finally { setLoading(false); }
  };

  const handleLogoLongPress = async () => {
    await AsyncStorage.clear(); await removeToken();
    setUsername(''); setPassword(''); setErrors({}); setServerStatus('unknown');
  };

  const serverTag = () => {
    switch (serverStatus) {
      case 'online': return { v: 'completed' as const, l: '已连接' };
      case 'offline': return { v: 'failed' as const, l: '离线' };
      case 'checking': return { v: 'running' as const, l: '检测中' };
      default: return { v: 'default' as const, l: '检测' };
    }
  };

  const logoRotation = logoRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const logoSize = s(80);
  const maxPanelW = Math.min(maxContentW - s(48), 400);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground crt />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(12), paddingBottom: insets.bottom + s(12) }}>
          <View style={{ alignItems: 'center', marginBottom: s(24) }}>
            <TouchableOpacity onLongPress={handleLogoLongPress} delayLongPress={3000} accessibilityLabel="应用 Logo，长按清除数据" accessibilityRole="button">
              <View style={{ width: logoSize, height: logoSize, justifyContent: 'center', alignItems: 'center', marginBottom: s(10) }}>
                <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: C.amberGlow, borderRadius: logoSize / 2, opacity: glowAnim, transform: [{ scale: 1.5 }] }} />
                <Animated.View style={{ transform: [{ rotate: logoRotation }] }}>
                  <Logo size={logoSize * 0.8} color={C.amberDark} pulse />
                </Animated.View>
              </View>
            </TouchableOpacity>
            <Text style={{ fontSize: sp(24), color: C.amber, fontWeight: 'bold', letterSpacing: 4, textShadowColor: 'rgba(255,184,112,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16, marginBottom: 8 }}>TSZH REMOTE</Text>
            <Text style={{ fontSize: sp(12), color: C.textSecondary, letterSpacing: 6, fontWeight: '300' }}>外置小脑</Text>
          </View>

          <View style={{ width: '100%', maxWidth: maxPanelW, backgroundColor: C.surface, padding: s(18), borderRadius: s(16), borderWidth: 1, borderColor: C.borderPanel, marginBottom: s(10), overflow: 'visible', ...cardShadowStrong }}>
            <Text style={labelStyle}>{isRegister ? 'PILOT ID (注册)' : 'COMMAND PILOT'}</Text>
            <NeuInputField icon="👤" placeholder="PILOT_ID" compact={width < 375} value={username} onChangeText={(t) => { setUsername(t); if (errors.username) setErrors((p) => ({ ...p, username: undefined })); }} error={errors.username} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={labelStyle}>SECURITY CIPHER</Text>
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} accessibilityRole="button">
                <Text style={{ fontSize: sp(10), color: 'rgba(255,184,112,0.6)', marginBottom: 8, marginRight: 4 }}>{showPassword ? '隐藏' : '显示'}</Text>
              </TouchableOpacity>
            </View>
            <NeuInputField icon="🔒" placeholder="••••••••" secureTextEntry={!showPassword} compact={width < 375} value={password} onChangeText={(t) => { setPassword(t); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }} error={errors.password} />

            {errors.submit && <View style={{ marginBottom: 12, alignItems: 'center' }}><NeuTag variant="failed" label={errors.submit} /></View>}

            <View style={{ marginTop: s(12), overflow: 'visible' }}>
              <PulseGlow>
                <NeuButton title={loading ? '连接中...' : isRegister ? '注册并连接' : '连接 Tszh 平台'} onPress={handleSubmit} variant="primary" size="lg" loading={loading} disabled={loading} icon="📡" style={{ width: '100%' }} />
              </PulseGlow>
            </View>

            <TouchableOpacity style={{ alignItems: 'center', marginTop: s(16), paddingVertical: 8 }} onPress={() => { setIsRegister(!isRegister); setErrors({}); }} accessibilityLabel={isRegister ? '切换到登录' : '切换到注册'} accessibilityRole="button">
              <Text style={{ fontSize: sp(12), color: 'rgba(255,184,112,0.7)' }}>{isRegister ? '已有账号？去登录' : '没有账号？去注册'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: maxPanelW, paddingHorizontal: 8, marginBottom: s(12) }}>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => setRememberLogin(!rememberLogin)} accessibilityLabel={`记住登录，当前${rememberLogin ? '已开启' : '已关闭'}`} accessibilityRole="checkbox" accessibilityState={{ checked: rememberLogin }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: rememberLogin ? 'rgba(232,152,64,0.15)' : C.inputBg, justifyContent: 'center', alignItems: 'center', ...insetBorder, borderColor: rememberLogin ? 'rgba(232,152,64,0.4)' : C.borderDark }}>
                {rememberLogin && <Text style={{ fontSize: 12, color: C.amber, fontWeight: 'bold' }}>✓</Text>}
              </View>
              <Text style={{ fontSize: sp(11), color: C.textSecondary }}>记住登录</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="忘记密码" accessibilityRole="button" onPress={() => router.push('/forgot-password')}><Text style={{ fontSize: sp(11), color: 'rgba(255,184,112,0.5)' }}>忘记密钥?</Text></TouchableOpacity>
          </View>

          <View style={{ width: '100%', maxWidth: maxPanelW, backgroundColor: C.cardBg, padding: s(16), borderRadius: s(12), borderWidth: 1, borderColor: 'rgba(255,184,112,0.06)', marginBottom: s(16) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: sp(9), color: C.textSecondary, letterSpacing: 2, opacity: 0.6 }}>SUBSPACE GATEWAY</Text>
              <TouchableOpacity onPress={checkServer} disabled={serverStatus === 'checking'} accessibilityLabel={`检测服务器连接，当前${serverTag().l}`} accessibilityRole="button">
                <NeuTag variant={serverTag().v} label={serverTag().l} />
              </TouchableOpacity>
            </View>
            <NeuInputField icon="🌐" placeholder="http://192.168.5.105:8080" compact value={server} onChangeText={(t) => { if (t && !t.startsWith('http://') && !t.startsWith('https://')) setServer('http://' + t); else setServer(t); setServerStatus('unknown'); }} />
          </View>

          <View style={{ flexDirection: 'row', gap: s(16), opacity: 0.5, marginBottom: s(8) }}>
            {[{ c: C.amber, l: 'SYNC', breathe: true }, { c: '#aec6ff', l: 'LINKED', breathe: false }, { c: 'rgba(255,180,171,0.4)', l: 'ENCRYPT', breathe: false }].map((st, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 7, height: 7, borderRadius: 3.5,
                  backgroundColor: st.c, marginRight: 5,
                  shadowColor: st.c,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: st.breathe ? 0.8 : 0.3,
                  shadowRadius: st.breathe ? 10 : 4,
                }} />
                <Text style={{ fontSize: sp(10), color: C.textSecondary, letterSpacing: 1 }}>{st.l}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: sp(8), color: 'rgba(255,255,255,0.1)', letterSpacing: 2 }}>v1.0.0 · STABLE</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const labelStyle = { fontSize: 10, color: '#d8c3b1', marginBottom: 8, marginLeft: 4, letterSpacing: 1, opacity: 0.8 };
