// 模型配置 — 对标桌面端完整功能 + 服务端同步

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { NeuButton, NeuTag, NeuFilterChip, NeuSection, NeuInsetView, PageBackground } from '../src/components';
import { useApp, C, insetBorder, cardShadow } from '../src/hooks/useApp';
import {
  LLMProvider, PRESET_PROVIDERS,
  loadProvidersFromServer, saveProviderToServer, deleteProviderFromServer,
  activateProviderOnServer, getActiveProviderFromServer,
} from '../src/lib/opc-agent';

type Protocol = 'openai' | 'anthropic';
type ThinkingLevel = 'quick' | 'standard' | 'deep';

const THINKING_LEVELS: { key: ThinkingLevel; label: string; desc: string }[] = [
  { key: 'quick', label: '快速', desc: '简短直接' },
  { key: 'standard', label: '标准', desc: '平衡质量与速度' },
  { key: 'deep', label: '深度', desc: '详细分析' },
];

export default function ModelConfigScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();

  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [activeId, setActiveId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // 表单
  const [formName, setFormName] = useState('');
  const [formProtocol, setFormProtocol] = useState<Protocol>('openai');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formThinkingLevel, setFormThinkingLevel] = useState<ThinkingLevel>('standard');
  const [formMaxTokens, setFormMaxTokens] = useState('2048');
  const [formTemperature, setFormTemperature] = useState('0.7');
  const [formSearchEnabled, setFormSearchEnabled] = useState(false);
  const [formContextWindow, setFormContextWindow] = useState('8192');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const list = await loadProvidersFromServer();
      setProviders(list);
      const active = await getActiveProviderFromServer();
      if (active) setActiveId(active.id);
    } catch (e: any) {
      setError(e.message || '加载配置失败');
    }
  };

  const fillPreset = (p: typeof PRESET_PROVIDERS[0]) => {
    setFormName(p.name);
    setFormProtocol(p.protocol);
    setFormBaseUrl(p.baseUrl);
    setFormModel(p.model);
    setFormThinkingLevel(p.thinkingLevel);
    setFormSearchEnabled(p.searchEnabled);
    setFormContextWindow(String(p.contextWindow));
    setFormMaxTokens(String(p.maxTokens));
    setFormTemperature(String(p.temperature));
  };

  const resetForm = () => {
    setFormName(''); setFormProtocol('openai'); setFormBaseUrl(''); setFormApiKey('');
    setFormModel(''); setFormThinkingLevel('standard'); setFormMaxTokens('2048');
    setFormTemperature('0.7'); setFormSearchEnabled(false); setFormContextWindow('8192');
  };

  const handleAdd = async () => {
    if (!formName.trim() || !formBaseUrl.trim() || !formModel.trim()) {
      Alert.alert('提示', '请填写名称、API 地址和模型 ID'); return;
    }
    const np: LLMProvider = {
      id: `p_${Date.now()}`, name: formName.trim(), protocol: formProtocol,
      baseUrl: formBaseUrl.trim(), apiKey: formApiKey.trim(), model: formModel.trim(),
      thinkingLevel: formThinkingLevel, maxTokens: parseInt(formMaxTokens) || 2048,
      temperature: parseFloat(formTemperature) || 0.7,
      searchEnabled: formSearchEnabled, contextWindow: parseInt(formContextWindow) || 8192,
    };
    await saveProviderToServer(np, false);
    await activateProviderOnServer(np.id); // 会先取消其他 provider 的激活
    setActiveId(np.id);
    setShowAdd(false); resetForm();
    await loadAll();
  };

  const handleDelete = (id: string) => {
    const p = providers.find((pr) => pr.id === id);
    Alert.alert('确认删除', `确定要删除「${p?.name}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await deleteProviderFromServer(id);
        if (activeId === id) {
          const remaining = providers.filter((pr) => pr.id !== id);
          if (remaining.length > 0) await activateProviderOnServer(remaining[0].id);
        }
        await loadAll();
      }},
    ]);
  };

  const handleActivate = async (id: string) => {
    await activateProviderOnServer(id);
    setActiveId(id);
  };

  const handleTest = async (p: LLMProvider) => {
    setTesting(p.id);
    setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg: '测试中...' } }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let url = `${p.baseUrl}/chat/completions`;
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (p.protocol === 'anthropic') {
        url = `${p.baseUrl}/v1/messages`;
        headers = { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' };
      } else {
        headers['Authorization'] = `Bearer ${p.apiKey}`;
      }
      const r = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify({ model: p.model, max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: r.ok, msg: r.ok ? '连接成功' : `HTTP ${r.status}` } }));
    } catch (e: any) {
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg: e.name === 'AbortError' ? '超时' : '连接失败' } }));
    } finally { setTesting(null); }
  };

  const getActive = () => providers.find((p) => p.id === activeId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + s(24) }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), paddingHorizontal: s(24), paddingTop: insets.top + s(16), paddingBottom: s(16) }}>
          <NeuIconButton icon="←" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: sp(20), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(255,184,112,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>模型配置</Text>
            <Text style={{ fontSize: sp(11), color: C.textMuted, marginTop: s(2) }}>{providers.length} 个模型 · 当前: {getActive()?.name || '未选择'}</Text>
          </View>
        </View>

        {error && (
          <View style={{ marginHorizontal: s(24), marginBottom: s(12), padding: s(12), borderRadius: s(10), backgroundColor: C.redBg, borderWidth: 1, borderColor: C.redBorder }}>
            <Text style={{ fontSize: sp(12), color: C.red }}>{error}</Text>
          </View>
        )}

        {/* Provider 列表 */}
        {providers.map((p) => (
          <View key={p.id} style={{ marginHorizontal: s(24), marginBottom: s(10), padding: s(14), borderRadius: s(12), backgroundColor: activeId === p.id ? 'rgba(255,184,112,0.06)' : C.surface, borderWidth: 1, borderColor: activeId === p.id ? 'rgba(255,184,112,0.2)' : C.cardBorder, ...cardShadow }}>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, gap: s(4) }}>
                {/* 名称 + 协议 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text }}>{p.name}</Text>
                  {activeId === p.id && <NeuTag variant="completed" label="当前" />}
                </View>
                {/* 模型 + 协议 + 参数 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), flexWrap: 'wrap' }}>
                  <NeuTag variant="info" label={p.protocol} />
                  <Text style={{ fontSize: sp(10), color: C.textMuted, fontFamily: 'monospace' }}>{p.model}</Text>
                  {p.thinkingLevel !== 'standard' && <NeuTag variant="default" label={p.thinkingLevel} />}
                  {p.searchEnabled && <NeuTag variant="completed" label="搜索" />}
                  {p.contextWindow > 8192 && (
                    <NeuTag variant="default" label={p.contextWindow >= 1000000 ? `${p.contextWindow / 1000000}M` : `${Math.round(p.contextWindow / 1000)}K`} />
                  )}
                </View>
                {/* API Key */}
                <TouchableOpacity onPress={() => setShowKeys((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}>
                  <Text style={{ fontSize: sp(10), color: C.textPlaceholder, fontFamily: 'monospace' }}>
                    {showKeys[p.id] ? p.apiKey : p.apiKey ? '•••••••• (点击显示)' : '未设置 Key'}
                  </Text>
                </TouchableOpacity>
                {/* 测试结果 */}
                {testResult[p.id] && (
                  <NeuTag variant={testResult[p.id].ok ? 'completed' : 'failed'} label={testResult[p.id].msg} />
                )}
              </View>
              {/* 操作按钮 */}
              <View style={{ gap: s(6), marginLeft: s(8) }}>
                <TouchableOpacity onPress={() => handleTest(p)} disabled={testing === p.id} style={{ width: s(32), height: s(32), borderRadius: s(16), ...insetBorder, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={`测试连接 ${p.name}`}>
                  <Text style={{ fontSize: sp(14) }}>{testing === p.id ? '⏳' : '🧪'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleActivate(p.id)} style={{ width: s(32), height: s(32), borderRadius: s(16), backgroundColor: activeId === p.id ? 'rgba(255,184,112,0.2)' : 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={`选择 ${p.name}`}>
                  <Text style={{ fontSize: sp(14) }}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(p.id)} style={{ width: s(32), height: s(32), borderRadius: s(16), backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel={`删除 ${p.name}`}>
                  <Text style={{ fontSize: sp(14), color: C.red }}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {/* 添加表单 */}
        {showAdd ? (
          <View style={{ marginHorizontal: s(24), padding: s(16), borderRadius: s(12), backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderPanel, ...cardShadow }}>
            <Text style={{ fontSize: sp(16), fontWeight: '700', color: C.text, marginBottom: s(12) }}>添加模型</Text>

            {/* 预置快选 */}
            <NeuSection title="快速选择" style={{ paddingHorizontal: 0, marginTop: 0 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6), marginBottom: s(12) }}>
              {PRESET_PROVIDERS.map((p) => (
                <NeuFilterChip key={p.name} label={p.name} active={formName === p.name} onPress={() => fillPreset(p)} />
              ))}
            </View>

            {/* 协议 */}
            <Text style={fieldLabel}>协议</Text>
            <View style={{ flexDirection: 'row', gap: s(8), marginBottom: s(12) }}>
              {(['openai', 'anthropic'] as const).map((proto) => (
                <TouchableOpacity key={proto} onPress={() => setFormProtocol(proto)} style={{ flex: 1, padding: s(10), borderRadius: s(8), alignItems: 'center', backgroundColor: formProtocol === proto ? 'rgba(255,184,112,0.08)' : 'transparent', borderWidth: 1, borderColor: formProtocol === proto ? 'rgba(255,184,112,0.3)' : 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ fontSize: sp(13), color: formProtocol === proto ? C.amber : C.textMuted }}>{proto === 'openai' ? 'OpenAI 兼容' : 'Anthropic'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 基本信息 */}
            <Text style={fieldLabel}>显示名称</Text>
            <Inp value={formName} onChange={setFormName} placeholder="如: DeepSeek" s={s} sp={sp} />
            <Text style={fieldLabel}>API 地址</Text>
            <Inp value={formBaseUrl} onChange={setFormBaseUrl} placeholder="https://api.deepseek.com" mono s={s} sp={sp} />
            <Text style={fieldLabel}>API Key</Text>
            <Inp value={formApiKey} onChange={setFormApiKey} placeholder="sk-..." secure s={s} sp={sp} />
            <Text style={fieldLabel}>模型 ID</Text>
            <Inp value={formModel} onChange={setFormModel} placeholder="deepseek-chat" s={s} sp={sp} />

            {/* 高级设置 */}
            <NeuSection title="高级设置" style={{ paddingHorizontal: 0, marginTop: s(8) }} />

            {/* 思考程度 */}
            <Text style={fieldLabel}>思考程度</Text>
            <View style={{ flexDirection: 'row', gap: s(8), marginBottom: s(12) }}>
              {THINKING_LEVELS.map((lvl) => (
                <TouchableOpacity key={lvl.key} onPress={() => setFormThinkingLevel(lvl.key)} style={{ flex: 1, padding: s(8), borderRadius: s(8), alignItems: 'center', backgroundColor: formThinkingLevel === lvl.key ? 'rgba(255,184,112,0.08)' : 'transparent', borderWidth: 1, borderColor: formThinkingLevel === lvl.key ? 'rgba(255,184,112,0.3)' : 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ fontSize: sp(12), fontWeight: '600', color: formThinkingLevel === lvl.key ? C.amber : C.textMuted }}>{lvl.label}</Text>
                  <Text style={{ fontSize: sp(9), color: C.textPlaceholder, marginTop: s(2) }}>{lvl.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 数值参数 */}
            <View style={{ flexDirection: 'row', gap: s(12) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>最大 Token</Text>
                <Inp value={formMaxTokens} onChange={setFormMaxTokens} placeholder="2048" mono s={s} sp={sp} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>温度</Text>
                <Inp value={formTemperature} onChange={setFormTemperature} placeholder="0.7" mono s={s} sp={sp} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: s(12) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>上下文窗口</Text>
                <Inp value={formContextWindow} onChange={setFormContextWindow} placeholder="8192" mono s={s} sp={sp} />
              </View>
              <View style={{ flex: 1, overflow: 'visible' }}>
                <Text style={fieldLabel}>搜索增强</Text>
                <NeuInsetView borderRadius={8}>
                  <TouchableOpacity onPress={() => setFormSearchEnabled(!formSearchEnabled)} style={{ height: s(44), justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: sp(13), color: formSearchEnabled ? C.amber : C.textMuted }}>{formSearchEnabled ? '✓ 已启用' : '未启用'}</Text>
                  </TouchableOpacity>
                </NeuInsetView>
              </View>
            </View>

            {/* 操作按钮 */}
            <View style={{ flexDirection: 'row', gap: s(12), marginTop: s(8) }}>
              <View style={{ flex: 1 }}><NeuButton title="取消" variant="outline" onPress={() => { setShowAdd(false); resetForm(); }} /></View>
              <View style={{ flex: 1 }}><NeuButton title="保存" variant="primary" onPress={handleAdd} /></View>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowAdd(true)} style={{ marginHorizontal: s(24), padding: s(14), borderRadius: s(12), alignItems: 'center', backgroundColor: C.cardBg, borderWidth: 1, borderColor: 'rgba(255,184,112,0.06)', ...cardShadow }}>
            <Text style={{ fontSize: sp(13), color: C.textMuted }}>+ 添加模型</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// 输入框组件 — 带氛围辉光
function Inp({ value, onChange, placeholder, secure, mono, s, sp }: {
  value: string; onChange: (t: string) => void; placeholder: string;
  secure?: boolean; mono?: boolean; s: (n: number) => number; sp: (n: number) => number;
}) {
  return (
    <View style={{ marginBottom: s(10), overflow: 'visible' }}>
      <NeuInsetView borderRadius={8}>
        <View style={{ height: s(44), justifyContent: 'center' }}>
          <TextInput
            style={{ paddingHorizontal: s(14), color: C.text, fontSize: sp(13), fontFamily: mono ? 'monospace' : undefined }}
            value={value} onChangeText={onChange} placeholder={placeholder}
            placeholderTextColor={C.textPlaceholder} secureTextEntry={secure} autoCapitalize="none"
          />
        </View>
      </NeuInsetView>
    </View>
  );
}

// 图标按钮（简化版）
function NeuIconButton({ icon, onPress }: { icon: string; onPress: () => void }) {
  const { s, sp } = useApp();
  return (
    <TouchableOpacity onPress={onPress} style={{ width: s(36), height: s(36), borderRadius: s(18), ...insetBorder, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="返回" accessibilityRole="button">
      <Text style={{ fontSize: sp(18), color: C.text }}>{icon}</Text>
    </TouchableOpacity>
  );
}

const fieldLabel = { fontSize: 10, color: '#d8c3b1', letterSpacing: 1, marginBottom: 4, marginTop: 8 };
