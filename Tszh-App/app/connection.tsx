import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getDevices,
  pairDevice,
  type PairedDevice,
  setServerUrl,
} from '../src/lib/api';
import { wsClient } from '../src/lib/ws';
import { NeuButton, NeuRaisedView, PageBackground } from '../src/components';
import { useApp, C } from '../src/hooks/useApp';

type PairingPayload = { server: string; code: string };
type PairingState = 'idle' | 'ready' | 'pairing' | 'success' | 'error';

export function parsePairingPayload(value: string): PairingPayload | null {
  try {
    const url = new URL(value.trim());
    const route = `${url.host}${url.pathname}`.replace(/^\/+|\/+$/g, '');
    const server = url.searchParams.get('server')?.trim() || '';
    const code = url.searchParams.get('code')?.trim().toUpperCase() || '';
    const serverUrl = new URL(server);
    if (url.protocol !== 'tszh-remote:' || route !== 'connection') return null;
    if (!['http:', 'https:'].includes(serverUrl.protocol)) return null;
    if (!/^[A-Z0-9]{8}$/.test(code)) return null;
    return { server: serverUrl.toString().replace(/\/$/, ''), code };
  } catch {
    return null;
  }
}

function DeviceRow({ device, s, sp }: { device: PairedDevice; s: (n: number) => number; sp: (n: number) => number }) {
  const online = device.status === 'online';
  return (
    <View style={{
      padding: s(14),
      marginBottom: s(9),
      borderRadius: s(13),
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: online ? 'rgba(102,187,106,0.22)' : C.borderLight,
      flexDirection: 'row',
      alignItems: 'center',
    }}>
      <View style={{
        width: s(38),
        height: s(38),
        borderRadius: s(10),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.inputBg,
        borderWidth: 1,
        borderColor: C.borderLight,
        marginRight: s(12),
      }}>
        <Ionicons name={device.type === 'mobile' ? 'phone-portrait-outline' : 'desktop-outline'} size={sp(18)} color={online ? C.green : C.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: sp(13), fontWeight: '600' }}>{device.name}</Text>
        <Text style={{ color: C.textMuted, fontSize: sp(9), marginTop: 4 }}>
          最近连接 {new Date(device.lastSeen).toLocaleString()}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: online ? C.green : C.textMuted }} />
        <Text style={{ color: online ? C.green : C.textMuted, fontSize: sp(10) }}>{online ? '在线' : '离线'}</Text>
      </View>
    </View>
  );
}

export default function ConnectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ server?: string | string[]; code?: string | string[] }>();
  const { insets, s, sp, maxContentW } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [server, setServer] = useState('');
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [pairingState, setPairingState] = useState<PairingState>('idle');
  const [message, setMessage] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [handshake] = useState(() => new Animated.Value(0));

  const loadDevices = useCallback(async () => {
    try {
      setDevices(await getDevices());
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadDevices(), 0);
    const reduceSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => {
      clearTimeout(timer);
      reduceSubscription.remove();
    };
  }, [loadDevices]);

  useEffect(() => {
    if (pairingState !== 'pairing' || reduceMotion) {
      handshake.stopAnimation();
      handshake.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(handshake, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(handshake, { toValue: 0, duration: 760, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [handshake, pairingState, reduceMotion]);

  const applyPayload = useCallback((payload: PairingPayload, source: 'scan' | 'link') => {
    setServer(payload.server);
    setCode(payload.code);
    setPairingState('ready');
    setMessage(source === 'scan' ? '二维码识别成功，请确认连接。' : '已从桌面深链读取配对信息。');
    setScannerOpen(false);
  }, []);

  useEffect(() => {
    const serverParam = Array.isArray(params.server) ? params.server[0] : params.server;
    const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;
    if (!serverParam || !codeParam) return;
    const payload = parsePairingPayload(`tszh-remote://connection?server=${encodeURIComponent(serverParam)}&code=${encodeURIComponent(codeParam)}`);
    if (!payload) return;
    const timer = setTimeout(() => applyPayload(payload, 'link'), 0);
    return () => clearTimeout(timer);
  }, [applyPayload, params.code, params.server]);

  async function openScanner() {
    setMessage('');
    setScanned(false);
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setPairingState('error');
        setMessage('需要相机权限才能扫码。你仍可使用下方手动配对码。');
        return;
      }
    }
    setScannerOpen(true);
  }

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    const payload = parsePairingPayload(result.data);
    if (!payload) {
      setPairingState('error');
      setMessage('这不是有效的腾昇智和配对二维码，请扫描桌面任务中心生成的二维码。');
      return;
    }
    applyPayload(payload, 'scan');
  }

  async function pair() {
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      setPairingState('error');
      setMessage('请输入完整的 8 位配对码。');
      return;
    }
    setPairingState('pairing');
    setMessage('正在验证桌面创作中心并建立安全通道…');
    try {
      if (server) await setServerUrl(server);
      const device = await pairDevice(code);
      setCode('');
      setPairingState('success');
      setMessage(`已连接“${device.name}”，任务状态将通过实时通道同步。`);
      await loadDevices();
      wsClient.reconnect();
    } catch (cause: unknown) {
      setPairingState('error');
      setMessage(cause instanceof Error ? cause.message : '配对失败，请在桌面端重新生成配对码。');
    }
  }

  const handshakeScale = handshake.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055] });
  const handshakeOpacity = handshake.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.92] });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            width: '100%',
            maxWidth: maxContentW,
            alignSelf: 'center',
            paddingHorizontal: s(22),
            paddingTop: insets.top + s(14),
            paddingBottom: insets.bottom + s(34),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={() => router.back()}
              style={{ width: s(38), height: s(38), alignItems: 'center', justifyContent: 'center', borderRadius: s(10), borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.surface }}
            >
              <Ionicons name="arrow-back" size={sp(18)} color={C.text} />
            </Pressable>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: C.blue, fontSize: sp(9), letterSpacing: 2 }}>LINK CONTROL</Text>
              <Text style={{ color: C.textMuted, fontSize: sp(9), marginTop: 3 }}>{devices.length} 台已授权设备</Text>
            </View>
          </View>

          <Text style={{ color: C.text, fontWeight: '700', fontSize: sp(25), marginTop: s(24), letterSpacing: -0.5 }}>连接桌面创作中心</Text>
          <Text style={{ color: C.textMuted, fontSize: sp(11), lineHeight: sp(18), marginTop: s(7), marginBottom: s(18) }}>
            扫描桌面任务中心显示的二维码。系统会自动填写局域网地址和一次性配对码。
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="扫描桌面配对二维码"
            onPress={() => void openScanner()}
            style={({ pressed }) => ({
              minHeight: s(108),
              padding: s(16),
              borderRadius: s(16),
              borderWidth: 1,
              borderColor: scannerOpen ? C.amberDark : C.borderPanel,
              backgroundColor: pressed ? C.amberGlow : C.surface,
              flexDirection: 'row',
              alignItems: 'center',
            })}
          >
            <View style={{ width: s(54), height: s(54), borderRadius: s(15), alignItems: 'center', justifyContent: 'center', backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.borderFocus }}>
              <Ionicons name="scan-outline" size={sp(25)} color={C.amber} />
            </View>
            <View style={{ flex: 1, marginLeft: s(14) }}>
              <Text style={{ color: C.text, fontSize: sp(15), fontWeight: '700' }}>扫描二维码</Text>
              <Text style={{ color: C.textMuted, fontSize: sp(10), lineHeight: sp(15), marginTop: 4 }}>推荐方式 · 自动读取地址与配对码</Text>
            </View>
            <Ionicons name="chevron-forward" size={sp(18)} color={C.textMuted} />
          </Pressable>

          {scannerOpen && (
            <View style={{ marginTop: s(12), height: s(310), borderRadius: s(18), overflow: 'hidden', borderWidth: 1, borderColor: C.borderFocus, backgroundColor: '#02050d' }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
              />
              <View pointerEvents="none" style={{ position: 'absolute', inset: s(36), borderWidth: 1, borderColor: C.amber, borderRadius: s(18) }} />
              <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: s(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: C.text, fontSize: sp(10), backgroundColor: 'rgba(5,10,20,0.78)', paddingHorizontal: s(10), paddingVertical: s(7), borderRadius: s(8) }}>将二维码置于扫描框内</Text>
                <Pressable onPress={() => setScannerOpen(false)} style={{ width: s(34), height: s(34), borderRadius: s(10), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,10,20,0.82)' }}>
                  <Ionicons name="close" size={sp(18)} color={C.text} />
                </Pressable>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), marginVertical: s(18) }}>
            <View style={{ flex: 1, height: 1, backgroundColor: C.borderLight }} />
            <Text style={{ color: C.textMuted, fontSize: sp(9), letterSpacing: 1 }}>或手动输入</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.borderLight }} />
          </View>

          <NeuRaisedView borderRadius={16}>
            <View style={{ padding: s(17) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: C.text, fontSize: sp(12), fontWeight: '600' }}>8 位一次性配对码</Text>
                <Text style={{ color: C.textMuted, fontSize: sp(9) }}>5 分钟内有效</Text>
              </View>
              <TextInput
                value={code}
                onChangeText={(value) => {
                  const next = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
                  setCode(next);
                  setPairingState(next.length === 8 ? 'ready' : 'idle');
                  setMessage('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                placeholder="ABCD2345"
                placeholderTextColor={C.textPlaceholder}
                style={{ color: C.amber, fontSize: sp(25), letterSpacing: s(4), fontFamily: 'GeistMono', paddingVertical: s(14), borderBottomWidth: 1, borderBottomColor: code.length === 8 ? C.borderFocus : C.borderLight }}
              />
              {server ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: s(10), gap: s(6) }}>
                  <Ionicons name="wifi-outline" size={sp(13)} color={C.blue} />
                  <Text numberOfLines={1} style={{ flex: 1, color: C.textMuted, fontSize: sp(9), fontFamily: 'GeistMono' }}>{server}</Text>
                </View>
              ) : null}
              <Animated.View style={{ marginTop: s(16), transform: [{ scale: pairingState === 'pairing' ? handshakeScale : 1 }], opacity: pairingState === 'pairing' ? handshakeOpacity : 1 }}>
                <NeuButton
                  title={pairingState === 'pairing' ? '正在建立安全通道…' : '连接桌面创作中心'}
                  variant="primary"
                  disabled={pairingState === 'pairing' || code.length !== 8}
                  onPress={() => void pair()}
                />
              </Animated.View>
            </View>
          </NeuRaisedView>

          {message ? (
            <View style={{
              marginTop: s(12),
              padding: s(12),
              borderRadius: s(11),
              borderWidth: 1,
              borderColor: pairingState === 'error' ? C.redBorder : pairingState === 'success' ? C.greenBorder : C.blueBorder,
              backgroundColor: pairingState === 'error' ? C.redBg : pairingState === 'success' ? C.greenBg : C.blueBg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(9),
            }}>
              {pairingState === 'pairing' ? <ActivityIndicator size="small" color={C.blue} /> : (
                <Ionicons name={pairingState === 'error' ? 'alert-circle-outline' : pairingState === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={sp(17)} color={pairingState === 'error' ? C.red : pairingState === 'success' ? C.green : C.blue} />
              )}
              <Text style={{ flex: 1, color: pairingState === 'error' ? C.red : pairingState === 'success' ? C.green : C.text, fontSize: sp(10), lineHeight: sp(15) }}>{message}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: s(28), marginBottom: s(11) }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: sp(14) }}>已授权设备</Text>
            <Text style={{ color: C.textMuted, fontSize: sp(9) }}>状态来自实时通道</Text>
          </View>
          {devices.length === 0 ? (
            <View style={{ minHeight: s(104), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderLight, borderRadius: s(14) }}>
              <Ionicons name="desktop-outline" size={sp(22)} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: sp(10), marginTop: s(7) }}>尚未授权其他设备</Text>
            </View>
          ) : devices.map((device) => <DeviceRow key={device.id} device={device} s={s} sp={sp} />)}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
