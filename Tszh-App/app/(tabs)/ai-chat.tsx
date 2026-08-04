// AI 协同 — 共享背景 + 错误处理

import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Animated, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { NeuTag, NeuButton, NeuInsetView, PageBackground, EmptyState, WorkflowStepCard, ActionCards } from '../../src/components';
import { LLMProvider, PRESET_WORKFLOWS, Workflow, OpcMessage, ActionCard, createSessionId, getActiveSessionId, setActiveSessionId, streamChat, buildSystemPrompt, saveMessage, loadMessages, deleteMessage, getActiveProviderFromServer, loadSessionsFromServer, createSessionOnServer } from '../../src/lib/opc-agent';
import { ragRetrieve, formatRagContext, type RagResult } from '../../src/lib/rag-client';
import { shouldSearch, searchAndFormat } from '../../src/lib/web-search';
import { createTaskOrQueue } from '../../src/lib/api';
import { useApp, C, STATUS, insetBorder, cardShadow } from '../../src/hooks/useApp';

export default function AiChatScreen() {
  const router = useRouter();
  const { width, insets, s, sp } = useApp();
  const [messages, setMessages] = useState<OpcMessage[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [workflowInputs, setWorkflowInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { initSession(); loadProvider(); }, []);

  // 从对话历史返回时，检查是否切换了会话
  useFocusEffect(() => {
    let cancelled = false;
    (async () => {
      const activeId = await getActiveSessionId();
      if (!cancelled && activeId && activeId !== sessionId) {
        setSessionId(activeId);
        setMessages(await loadMessages(activeId));
      }
    })();
    return () => { cancelled = true; };
  });

  const initSession = async () => {
    try {
      // 1. 优先使用用户从历史列表选择的会话
      let activeId = await getActiveSessionId();

      if (activeId) {
        // 验证该会话在服务端是否存在
        const serverSessions = await loadSessionsFromServer();
        const exists = serverSessions.some(s => s.id === activeId);
        if (exists) {
          setSessionId(activeId);
          setMessages(await loadMessages(activeId));
          return;
        }
      }

      // 2. 没有选中的会话或已失效 → 用服务端最新的
      const serverSessions = await loadSessionsFromServer();
      if (serverSessions.length > 0) {
        const latest = serverSessions[0];
        await setActiveSessionId(latest.id);
        setSessionId(latest.id);
        setMessages(await loadMessages(latest.id));
        return;
      }

      // 3. 服务端也没有 → 创建新会话
      const newId = createSessionId();
      await setActiveSessionId(newId);
      await createSessionOnServer(newId, '新对话');
      setSessionId(newId);
      setMessages([]);
    } catch (e: any) { setError(e.message || '初始化会话失败'); }
  };
  const loadProvider = async () => {
    try {
      const active = await getActiveProviderFromServer();
      if (active) { setProvider(active); return; }
    } catch {}
  };
  const scrollToBottom = () => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    if (!provider?.apiKey) { Alert.alert('提示', '请先配置模型', [{ text: '去配置', onPress: () => router.push('/model-config') }, { text: '取消' }]); return; }
    const userContent = inputText.trim(); setInputText('');
    const userMsg: OpcMessage = { id: `user_${Date.now()}`, role: 'user', content: userContent, timestamp: new Date().toISOString() };
    setMessages((p) => [...p, userMsg]); await saveMessage(sessionId, userMsg); scrollToBottom();
    setSending(true); setStreamingText(''); setError(null);    try {
      // 并行：RAG 检索 + 条件性网络搜索（容错）
      let extraContext = '';
      let ragResults: RagResult[] = [];
      try {
        const [retrievedRagResults, webResults] = await Promise.all([
          ragRetrieve(userContent),
          shouldSearch(userContent) ? searchAndFormat(userContent) : Promise.resolve(''),
        ]);
        ragResults = retrievedRagResults;
        const ragContext = formatRagContext(ragResults);
        extraContext = [ragContext, webResults].filter(Boolean).join('\n\n');
      } catch {}
      const systemPrompt = buildSystemPrompt(undefined, extraContext || undefined, provider?.thinkingLevel);

      // 上下文窗口策略：根据 contextWindow 动态调整
      const ctx = provider?.contextWindow || 8192;
      const maxHistory = ctx <= 8192 ? 6 : ctx <= 32768 ? 20 : ctx <= 128000 ? 50 : ctx <= 200000 ? 80 : 200;
      const history = messages.slice(-maxHistory).map((m) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

      const reply = await streamChat(provider!, [{ role: 'system' as const, content: systemPrompt }, ...history, { role: 'user' as const, content: userContent }], undefined, (t) => { setStreamingText(t); scrollToBottom(); });
      const aiMsg: OpcMessage = { id: `ai_${Date.now()}`, role: 'assistant', content: reply, timestamp: new Date().toISOString() };
      // 保存 RAG 来源
      if (ragResults.length > 0) {
        aiMsg.ragSources = ragResults.map((r) => ({ name: r.metadata.name_cn || r.metadata.source, score: r.score, kb_type: r.metadata.kb_type }));
      }
      setMessages((p) => [...p, aiMsg]); await saveMessage(sessionId, aiMsg);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || 'AI 回复失败，请检查 API Key 和网络');
    } finally { setSending(false); setStreamingText(''); scrollToBottom(); }
  };

  // 一键转为桌面任务（手机发起 → 桌面执行；断网自动入离线队列）
  const handleSendTask = async () => {
    const prompt = inputText.trim();
    if (!prompt) return;
    setInputText('');
    try {
      const { task, queued } = await createTaskOrQueue(prompt);
      if (queued) {
        Alert.alert('已加入离线队列', '当前无法连接服务器，任务已暂存，联网后将自动下发。', [{ text: '好的' }]);
      } else if (task) {
        Alert.alert('已下发', `任务「${task.title}」已加入队列，桌面端将接手执行。`, [{ text: '好的' }]);
      }
    } catch (e: any) {
      Alert.alert('下发失败', e.message || '无法连接服务器', [{ text: '好的' }]);
      setInputText(prompt);
    }
  };

  // 工作流执行
  const handleRunWorkflow = async () => {
    if (!selectedWorkflow || !provider?.apiKey) return;
    // 检查必填字段
    for (const field of selectedWorkflow.fields) {
      if (field.required && !workflowInputs[field.key]?.trim()) {
        Alert.alert('提示', `请填写「${field.label}」`);
        return;
      }
    }

    setShowWorkflows(false);
    setSending(true);

    const inputText = selectedWorkflow.fields
      .map((f) => `${f.label}: ${workflowInputs[f.key] || ''}`)
      .join('\n');

    try {
      let prevOutput = '';
      // 工作流开始消息
      const workflowMsg: OpcMessage = {
        id: `workflow_${Date.now()}`,
        role: 'workflow',
        content: selectedWorkflow.name,
        workflowName: selectedWorkflow.name,
        workflowIcon: '🎬',
        totalSteps: selectedWorkflow.steps.length,
        stepIndex: 0,
        timestamp: new Date().toISOString(),
      };
      setMessages((p) => [...p, workflowMsg]);

      for (let i = 0; i < selectedWorkflow.steps.length; i++) {
        const step = selectedWorkflow.steps[i];
        // 更新工作流进度
        setMessages((p) =>
          p.map((m) => m.id === workflowMsg.id ? { ...m, stepIndex: i } : m)
        );

        const prompt = step.buildPrompt(inputText, prevOutput, workflowInputs);
        const stepMsg: OpcMessage = {
          id: `step_${Date.now()}_${i}`,
          role: 'workflow-step',
          content: '',
          workflowName: selectedWorkflow.name,
          workflowIcon: '🎬',
          stepName: step.name,
          stepIndex: i,
          totalSteps: selectedWorkflow.steps.length,
          timestamp: new Date().toISOString(),
        };
        setMessages((p) => [...p, stepMsg]);

        // 每步：RAG + 网络搜索（容错，失败不影响工作流）
        let stepExtraContext = '';
        try {
          const [stepRagResults, stepWebResults] = await Promise.all([
            ragRetrieve(prompt, 5, 0.45, true),
            searchAndFormat(prompt),
          ]);
          const stepRagContext = formatRagContext(stepRagResults);
          stepExtraContext = [stepRagContext, stepWebResults].filter(Boolean).join('\n\n');
        } catch {}
        const systemPrompt = buildSystemPrompt(undefined, stepExtraContext || undefined, provider?.thinkingLevel);

        const reply = await streamChat(
          provider,
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
          undefined,
          (text) => {
            setMessages((p) => p.map((m) => m.id === stepMsg.id ? { ...m, content: text } : m));
            scrollToBottom();
          }
        );
        prevOutput = reply;
        await saveMessage(sessionId, { ...stepMsg, content: reply });
      }

      // 工作流完成 — 动作卡片
      const completeMsg: OpcMessage = {
        id: `action_${Date.now()}`,
        role: 'action-cards',
        content: prevOutput, // 存实际工作流输出（桌面端保存报告用）
        workflowName: selectedWorkflow.name,
        cards: [
          { id: 'save', type: 'save-report', title: '保存报告', desc: '复制报告内容', icon: '📄' },
          { id: 'continue', type: 'continue', title: '继续对话', desc: '基于结果继续', icon: '💬' },
        ],
        timestamp: new Date().toISOString(),
      };
      setMessages((p) => [...p, completeMsg]);
      // 异步保存到服务端（不阻塞卡片显示）
      saveMessage(sessionId, completeMsg).catch(() => {});
    } catch (e: any) {
      if (e.name !== 'AbortError') Alert.alert('工作流执行失败', e.message);
    } finally {
      setSending(false);
      setSelectedWorkflow(null);
      setWorkflowInputs({});
    }
  };

  // 动作卡片处理
  const handleActionCard = (card: ActionCard, content: string) => {
    switch (card.type) {
      case 'save-report':
        // 手机端：提示用户到桌面端保存（报告已通过对话同步到服务端）
        Alert.alert(
          '保存报告',
          '报告已同步到服务端。\n\n请在桌面端打开同一对话，点击「保存报告」即可下载 .md 文件。',
          [{ text: '知道了' }]
        );
        break;
      case 'continue':
        setInputText('基于以上工作流结果，我想继续讨论。请总结关键发现，然后问我想深入哪个方面。');
        break;
      default:
        Alert.alert(card.title, card.desc);
    }
  };

  // 长按删除消息
  const handleDeleteMessage = (msg: OpcMessage) => {
    Alert.alert('删除消息', '确定要删除这条消息吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        try { await deleteMessage(msg.id); } catch {}
      }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(24), paddingTop: insets.top + s(12), paddingBottom: s(8) }}>
          <View>
            <Text style={{ fontSize: sp(18), fontWeight: '700', color: C.amber, letterSpacing: 2, textShadowColor: 'rgba(232,152,64,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 }}>OPC AI</Text>
            <Text style={{ fontSize: sp(10), color: C.textMuted, letterSpacing: 1 }}>创作协同</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <TouchableOpacity onPress={() => router.push('/chat-history')} style={{ width: s(36), height: s(36), borderRadius: s(18), ...insetBorder, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="对话历史" accessibilityRole="button"><Text style={{ fontSize: sp(14) }}>💬</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowWorkflows(true)} style={{ width: s(36), height: s(36), borderRadius: s(18), ...insetBorder, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="打开工作流" accessibilityRole="button"><Text style={{ fontSize: sp(16) }}>⚡</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/model-config')} style={{ width: s(36), height: s(36), borderRadius: s(18), ...insetBorder, justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="模型配置" accessibilityRole="button"><Text style={{ fontSize: sp(16) }}>⚙</Text></TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/model-config')} style={{ marginHorizontal: s(24), marginBottom: s(8), overflow: 'visible' }}>
          <NeuInsetView borderRadius={8}>
            <View style={{ padding: s(10), flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
              <Text style={{ fontSize: sp(12), fontWeight: '600', color: C.amber }}>{provider?.name || '未配置'}</Text>
              <Text style={{ fontSize: sp(10), color: C.textMuted, flex: 1 }} numberOfLines={1}>{provider?.model || '点击配置模型'}</Text>
              {!provider?.apiKey && <NeuTag variant="failed" label="无 Key" />}
            </View>
          </NeuInsetView>
        </TouchableOpacity>

        <ScrollView ref={scrollViewRef} style={{ flex: 1, paddingHorizontal: s(24) }} showsVerticalScrollIndicator={false}>
          {messages.length === 0 && (
            <EmptyState
              icon="🤖"
              title="开始和 AI 助手对话"
              description="描述你的创作想法，AI 会从四维视角分析并生成脚本。试试输入「帮我写一个赛博朋克风格的短视频脚本」。"
            />
          )}
          {messages.map((msg) => {
            // 工作流进度
            if (msg.role === 'workflow') {
              return (
                <WorkflowStepCard
                  key={msg.id}
                  workflowName={msg.workflowName || msg.content}
                  workflowIcon={msg.workflowIcon || '🎬'}
                  stepName={msg.stepName}
                  stepIndex={msg.stepIndex || 0}
                  totalSteps={msg.totalSteps || 0}
                  content=""
                  isRunning={sending && msg.stepIndex !== msg.totalSteps}
                  isDone={!sending && msg.stepIndex === msg.totalSteps}
                />
              );
            }
            // 工作流步骤
            if (msg.role === 'workflow-step') {
              return (
                <WorkflowStepCard
                  key={msg.id}
                  workflowName={msg.workflowName || ''}
                  workflowIcon={msg.workflowIcon || '🎬'}
                  stepName={msg.stepName}
                  stepIndex={msg.stepIndex || 0}
                  totalSteps={msg.totalSteps || 0}
                  content={msg.content}
                  isDone={!!msg.content && !msg.isError}
                  isError={msg.isError}
                />
              );
            }
            // 动作卡片
            if (msg.role === 'action-cards' && msg.cards) {
              return (
                <View key={msg.id} style={{ marginBottom: s(10) }}>
                  <ActionCards cards={msg.cards} onAction={(card) => handleActionCard(card, msg.content)} />
                </View>
              );
            }
            // 普通消息（长按删除）
            const isUser = msg.role === 'user';
            return (
              <TouchableOpacity key={msg.id} onLongPress={() => handleDeleteMessage(msg)} activeOpacity={0.8} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%', marginBottom: s(10), padding: s(12), borderRadius: s(12), borderBottomRightRadius: isUser ? s(4) : s(12), borderBottomLeftRadius: isUser ? s(12) : s(4), backgroundColor: isUser ? 'rgba(232,152,64,0.15)' : 'rgba(5,13,35,0.8)', borderWidth: 1, borderColor: isUser ? 'rgba(232,152,64,0.2)' : 'rgba(255,255,255,0.06)' }}>
                <Text style={{ fontSize: sp(14), color: isUser ? C.amber : C.text, lineHeight: sp(20) }}>{msg.content}</Text>
              </TouchableOpacity>
            );
          })}
          {sending && streamingText && (
            <View style={{ alignSelf: 'flex-start', maxWidth: '85%', marginBottom: s(10), padding: s(12), borderRadius: s(12), borderBottomLeftRadius: s(4), backgroundColor: 'rgba(5,13,35,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ fontSize: sp(14), color: C.text, lineHeight: sp(20) }}>{streamingText}</Text>
            </View>
          )}
          {sending && !streamingText && <ActivityIndicator size="small" color={C.amber} style={{ alignSelf: 'flex-start', marginBottom: s(10) }} />}

          {error && (
            <View style={{ marginBottom: s(10), padding: s(12), borderRadius: s(10), backgroundColor: 'rgba(239,83,80,0.1)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.2)', flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
              <Text style={{ fontSize: sp(13), color: C.red, flex: 1 }}>{error}</Text>
              <NeuButton title="重试" variant="outline" size="sm" onPress={handleSend} />
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(24), paddingBottom: insets.bottom + s(8), paddingTop: s(8), gap: s(8) }}>
          <View style={{ flex: 1, overflow: 'visible' }}>
            <NeuInsetView borderRadius={22}>
              <View style={{ height: s(44), flexDirection: 'row', alignItems: 'center' }}>
                <TextInput style={{ flex: 1, paddingHorizontal: s(16), color: C.text, fontSize: sp(14) }} placeholder="输入消息..." placeholderTextColor={C.textPlaceholder} value={inputText} onChangeText={setInputText} onSubmitEditing={handleSend} returnKeyType="send" editable={!sending} />
              </View>
            </NeuInsetView>
          </View>
          <TouchableOpacity onPress={handleSendTask} disabled={!inputText.trim() || sending} style={{ width: s(40), height: s(40), borderRadius: s(20), justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: inputText.trim() && !sending ? C.borderFocus : C.borderLight, backgroundColor: 'rgba(232,152,64,0.06)' }} accessibilityLabel="转为任务" accessibilityRole="button" accessibilityState={{ disabled: !inputText.trim() || sending }}>
            <Text style={{ fontSize: sp(11), color: inputText.trim() && !sending ? C.amber : C.textMuted, fontWeight: '600' }}>任务</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSend} disabled={!inputText.trim() || sending} style={{ width: s(44), height: s(44), borderRadius: s(22), overflow: 'visible', justifyContent: 'center', alignItems: 'center' }} accessibilityLabel="发送消息" accessibilityRole="button" accessibilityState={{ disabled: !inputText.trim() || sending }}>
            {/* 外层光晕 */}
            <View style={{
              position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
              borderRadius: s(24),
              shadowColor: C.amberDark,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: inputText.trim() && !sending ? 0.6 : 0.2,
              shadowRadius: 14,
              elevation: 8,
            }} />
            {/* 渐变主体 */}
            <LinearGradient
              colors={inputText.trim() && !sending ? ['#ffcb8e', '#e89840', '#c07020'] : ['rgba(232,152,64,0.2)', 'rgba(232,152,64,0.1)', 'rgba(192,112,32,0.05)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: s(44), height: s(44), borderRadius: s(22), justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: inputText.trim() && !sending ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)' }}
            >
              {/* 上半高光 */}
              <LinearGradient
                colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.08)', 'transparent']}
                locations={[0, 0.4, 0.7]}
                start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: s(22) }}
              />
              <Text style={{ fontSize: sp(18), color: inputText.trim() && !sending ? '#4a2800' : C.textMuted, fontWeight: '700', zIndex: 1 }}>↑</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {showWorkflows && (
        <WorkflowSheet
          selectedWorkflow={selectedWorkflow}
          setSelectedWorkflow={setSelectedWorkflow}
          onClose={() => { setShowWorkflows(false); setSelectedWorkflow(null); }}
          onRun={handleRunWorkflow}
          workflowInputs={workflowInputs}
          setWorkflowInputs={setWorkflowInputs}
          s={s} sp={sp} insets={insets}
        />
      )}
    </View>
  );
}

// 工作流选择/执行底部弹窗
function WorkflowSheet({
  selectedWorkflow, setSelectedWorkflow, onClose, onRun,
  workflowInputs, setWorkflowInputs, s, sp, insets,
}: {
  selectedWorkflow: Workflow | null;
  setSelectedWorkflow: (w: Workflow | null) => void;
  onClose: () => void;
  onRun: () => void;
  workflowInputs: Record<string, string>;
  setWorkflowInputs: (inputs: Record<string, string>) => void;
  s: (n: number) => number;
  sp: (n: number) => number;
  insets: { bottom: number };
}) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }} onPress={onClose} />
      <View style={{ backgroundColor: '#0f1a35', borderTopLeftRadius: s(16), borderTopRightRadius: s(16), padding: s(24), paddingBottom: insets.bottom + s(24), maxHeight: '70%' }}>
        {/* 拖拽手柄 */}
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: s(16) }} />

        {selectedWorkflow ? (
          // 工作流详情 + 表单
          <ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(12) }}>
              <TouchableOpacity onPress={() => setSelectedWorkflow(null)} style={{ marginRight: s(12) }}>
                <Text style={{ fontSize: sp(18), color: C.text }}>←</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: sp(18), fontWeight: '700', color: C.text }}>{selectedWorkflow.name}</Text>
                <Text style={{ fontSize: sp(12), color: C.textMuted, marginTop: s(4) }}>{selectedWorkflow.description}</Text>
              </View>
            </View>

            {/* 工作流步骤预览 */}
            <View style={{ marginBottom: s(16) }}>
              <Text style={{ fontSize: sp(11), color: C.textMuted, letterSpacing: 1, marginBottom: s(8) }}>执行步骤</Text>
              {selectedWorkflow.steps.map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(6), gap: s(8) }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(232,152,64,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: sp(10), color: C.amber, fontWeight: '600' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: sp(13), color: C.text }}>{step.name}</Text>
                </View>
              ))}
            </View>

            {/* 输入字段 */}
            {selectedWorkflow.fields.map((field) => (
              <View key={field.key} style={{ marginBottom: s(12) }}>
                <Text style={{ fontSize: sp(11), color: C.textSecondary, marginBottom: s(4) }}>
                  {field.label} {field.required && <Text style={{ color: C.red }}>*</Text>}
                </Text>
                <NeuInsetView borderRadius={8}>
                  <View style={{ minHeight: field.type === 'textarea' ? s(80) : s(44), justifyContent: field.type === 'textarea' ? 'flex-start' : 'center' }}>
                    <TextInput
                      style={{
                        paddingHorizontal: s(14), paddingVertical: field.type === 'textarea' ? s(10) : 0,
                        color: C.text, fontSize: sp(14), textAlignVertical: field.type === 'textarea' ? 'top' : 'auto',
                      }}
                      placeholder={field.placeholder}
                      placeholderTextColor={C.textPlaceholder}
                      value={workflowInputs[field.key] || ''}
                      onChangeText={(text) => setWorkflowInputs({ ...workflowInputs, [field.key]: text })}
                      multiline={field.type === 'textarea'}
                    />
                  </View>
                </NeuInsetView>
              </View>
            ))}

            {/* 执行按钮 */}
            <NeuButton
              title="开始执行"
              variant="primary"
              size="lg"
              onPress={onRun}
              style={{ marginTop: s(8) }}
            />
          </ScrollView>
        ) : (
          // 工作流列表
          <ScrollView>
            <Text style={{ fontSize: sp(18), fontWeight: '700', color: C.text, marginBottom: s(16) }}>选择工作流</Text>
            {PRESET_WORKFLOWS.map((wf) => (
              <TouchableOpacity
                key={wf.id}
                onPress={() => setSelectedWorkflow(wf)}
                style={{
                  padding: s(14), borderRadius: s(10), marginBottom: s(8),
                  backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                  ...cardShadow,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(4) }}>
                  <Text style={{ fontSize: sp(14), fontWeight: '600', color: C.text, flex: 1 }}>{wf.name}</Text>
                  <NeuTag variant="default" label={wf.category} />
                </View>
                <Text style={{ fontSize: sp(12), color: C.textMuted }}>{wf.description}</Text>
                <Text style={{ fontSize: sp(10), color: C.textPlaceholder, marginTop: s(4) }}>
                  {wf.steps.length} 步 · {wf.fields.length} 个输入
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
