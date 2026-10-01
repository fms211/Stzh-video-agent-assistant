// 手机远程控制台 — 统一任务模型 + WebSocket 实时联动

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  createTask,
  getTasks,
  healthCheck,
  type LinkedTask,
  taskAction,
} from '../../src/lib/api';
import { wsClient } from '../../src/lib/ws';
import { NeuButton, NeuInsetView, PageBackground } from '../../src/components';
import { useApp, C, STATUS, cardShadow } from '../../src/hooks/useApp';

type TaskStatus = LinkedTask['status'];
type TaskFilter = 'all' | 'active' | 'completed' | 'failed';
type TaskAction = 'pause' | 'resume' | 'cancel' | 'retry';

const LABELS: Record<TaskStatus, string> = {
  queued: '等待服务器',
  running: '进行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '活跃' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '异常' },
];

function isActiveTask(task: LinkedTask) {
  return task.status === 'queued' || task.status === 'running' || task.status === 'paused';
}

function visualStatus(status: TaskStatus) {
  if (status === 'completed') return STATUS.done;
  if (status === 'running') return STATUS.running;
  if (status === 'failed' || status === 'cancelled') return STATUS.failed;
  return STATUS.pending;
}

function statusIcon(status: TaskStatus): keyof typeof Ionicons.glyphMap {
  if (status === 'running') return 'pulse-outline';
  if (status === 'paused') return 'pause-circle-outline';
  if (status === 'completed') return 'checkmark-circle-outline';
  if (status === 'failed' || status === 'cancelled') return 'alert-circle-outline';
  return 'time-outline';
}

function ProgressBar({
  value,
  color,
  running,
  reduceMotion,
  s,
}: {
  value: number;
  color: string;
  running: boolean;
  reduceMotion: boolean;
  s: (n: number) => number;
}) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!running || reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.62, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 720, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, reduceMotion, running]);

  return (
    <View style={{ height: s(4), borderRadius: s(2), backgroundColor: 'rgba(255,255,255,0.055)', overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, borderRadius: s(2), backgroundColor: color, opacity: pulse }} />
    </View>
  );
}

function TaskCard({
  task,
  busy,
  reduceMotion,
  onOpen,
  onAction,
  s,
  sp,
}: {
  task: LinkedTask;
  busy: boolean;
  reduceMotion: boolean;
  onOpen: (task: LinkedTask) => void;
  onAction: (task: LinkedTask, action: TaskAction) => void;
  s: (n: number) => number;
  sp: (n: number) => number;
}) {
  const colors = visualStatus(task.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}，${LABELS[task.status]}，进度 ${task.progress}%`}
      onPress={() => onOpen(task)}
      style={({ pressed }) => ({
        marginHorizontal: s(22),
        marginBottom: s(10),
        borderRadius: s(14),
        backgroundColor: pressed ? 'rgba(232,152,64,0.07)' : C.surface,
        borderWidth: 1,
        borderColor: pressed ? C.borderFocus : C.borderLight,
        padding: s(15),
        ...cardShadow,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: s(38), height: s(38), borderRadius: s(10), alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name={statusIcon(task.status)} size={sp(18)} color={colors.text} />
        </View>
        <View style={{ flex: 1, marginLeft: s(11) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8) }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: sp(13), fontWeight: '700', color: C.text }}>{task.title}</Text>
            <Text style={{ fontSize: sp(9), color: colors.text }}>{LABELS[task.status]}</Text>
          </View>
          <Text style={{ fontSize: sp(10), color: C.textMuted, marginTop: s(4), marginBottom: s(10) }} numberOfLines={1}>
            {task.stage || String(task.input?.prompt || '等待桌面创作中心处理')}
          </Text>
          <ProgressBar value={task.progress} color={colors.text} running={task.status === 'running'} reduceMotion={reduceMotion} s={s} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: s(9) }}>
            <Text style={{ fontSize: sp(9), color: C.textMuted }}>{task.origin === 'mobile' ? '本机发起' : '桌面发起'} · {new Date(task.updatedAt).toLocaleTimeString()}</Text>
            <Text style={{ fontSize: sp(10), color: C.text, fontFamily: 'GeistMono' }}>{task.progress}%</Text>
          </View>
        </View>
      </View>

      {isActiveTask(task) || task.status === 'failed' || task.status === 'cancelled' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: s(7), marginTop: s(12), paddingTop: s(11), borderTopWidth: 1, borderTopColor: C.borderLight }}>
          {task.status === 'running' && <NeuButton title="暂停" variant="outline" size="sm" disabled={busy} onPress={() => onAction(task, 'pause')} />}
          {task.status === 'paused' && <NeuButton title="继续" variant="primary" size="sm" disabled={busy} onPress={() => onAction(task, 'resume')} />}
          {isActiveTask(task) && <NeuButton title="取消" variant="outline" size="sm" disabled={busy} onPress={() => onAction(task, 'cancel')} />}
          {(task.status === 'failed' || task.status === 'cancelled') && <NeuButton title="重试" variant="primary" size="sm" disabled={busy} onPress={() => onAction(task, 'retry')} />}
        </View>
      ) : null}
    </Pressable>
  );
}

function TaskDetailSheet({
  task,
  busy,
  onClose,
  onAction,
  s,
  sp,
}: {
  task: LinkedTask | null;
  busy: boolean;
  onClose: () => void;
  onAction: (task: LinkedTask, action: TaskAction) => void;
  s: (n: number) => number;
  sp: (n: number) => number;
}) {
  if (!task) return null;
  const colors = visualStatus(task.status);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,5,13,0.82)' }}>
        <Pressable onPress={() => undefined} style={{ maxHeight: '82%', paddingHorizontal: s(22), paddingTop: s(18), paddingBottom: s(32), borderTopLeftRadius: s(22), borderTopRightRadius: s(22), backgroundColor: C.sheetBg, borderWidth: 1, borderColor: C.borderLight }}>
          <View style={{ width: s(38), height: s(3), borderRadius: s(2), backgroundColor: C.textDim, alignSelf: 'center', marginBottom: s(18) }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(7) }}>
              <Ionicons name={statusIcon(task.status)} size={sp(17)} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: sp(10) }}>{LABELS[task.status]}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭任务详情" onPress={onClose} style={{ width: s(34), height: s(34), alignItems: 'center', justifyContent: 'center', borderRadius: s(9), borderWidth: 1, borderColor: C.borderLight }}>
              <Ionicons name="close" size={sp(17)} color={C.text} />
            </Pressable>
          </View>
          <Text style={{ color: C.text, fontSize: sp(19), fontWeight: '700', lineHeight: sp(26), marginTop: s(16) }}>{task.title}</Text>
          <Text style={{ color: C.textMuted, fontSize: sp(10), lineHeight: sp(16), marginTop: s(6) }}>{task.stage || '等待桌面创作中心处理'}</Text>

          <View style={{ marginTop: s(18), padding: s(14), borderRadius: s(13), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.borderLight }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: s(8) }}>
              <Text style={{ color: C.textMuted, fontSize: sp(9) }}>执行进度</Text>
              <Text style={{ color: C.text, fontSize: sp(11), fontFamily: 'GeistMono' }}>{task.progress}%</Text>
            </View>
            <ProgressBar value={task.progress} color={colors.text} running={false} reduceMotion s={s} />
          </View>

          <View style={{ marginTop: s(14), gap: s(9) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: C.textMuted, fontSize: sp(9) }}>来源</Text><Text style={{ color: C.text, fontSize: sp(10) }}>{task.origin === 'mobile' ? '手机远程' : '桌面创作中心'}</Text></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: C.textMuted, fontSize: sp(9) }}>任务类型</Text><Text style={{ color: C.text, fontSize: sp(10), fontFamily: 'GeistMono' }}>{task.kind}</Text></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: C.textMuted, fontSize: sp(9) }}>更新时间</Text><Text style={{ color: C.text, fontSize: sp(10) }}>{new Date(task.updatedAt).toLocaleString()}</Text></View>
          </View>

          <Text style={{ color: C.textMuted, fontSize: sp(9), marginTop: s(18) }}>创作指令</Text>
          <Text style={{ color: C.text, fontSize: sp(11), lineHeight: sp(18), marginTop: s(6), padding: s(12), borderRadius: s(11), backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.borderLight }}>
            {String(task.input?.prompt || '暂无创作指令')}
          </Text>
          {task.error ? <Text style={{ color: C.red, fontSize: sp(10), lineHeight: sp(15), marginTop: s(12), padding: s(10), borderRadius: s(9), backgroundColor: C.redBg, borderWidth: 1, borderColor: C.redBorder }}>{task.error}</Text> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: s(8), marginTop: s(20) }}>
            {task.status === 'running' && <NeuButton title="暂停任务" variant="outline" disabled={busy} onPress={() => onAction(task, 'pause')} />}
            {task.status === 'paused' && <NeuButton title="继续任务" variant="primary" disabled={busy} onPress={() => onAction(task, 'resume')} />}
            {isActiveTask(task) && <NeuButton title="取消任务" variant="outline" disabled={busy} onPress={() => onAction(task, 'cancel')} />}
            {(task.status === 'failed' || task.status === 'cancelled') && <NeuButton title="重新排队" variant="primary" disabled={busy} onPress={() => onAction(task, 'retry')} />}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProcessScreen() {
  const router = useRouter();
  const { insets, s, sp } = useApp();
  const [tasks, setTasks] = useState<LinkedTask[]>([]);
  const [prompt, setPrompt] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selectedTask, setSelectedTask] = useState<LinkedTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const PAGE_SIZE = 20;

  const loadData = useCallback(async (loadMore = false) => {
    try {
      const [data, online] = await Promise.all([getTasks({
        limit: PAGE_SIZE,
        cursor: loadMore ? nextCursorRef.current || undefined : undefined,
      }), healthCheck()]);
      if (loadMore) {
        setTasks((current) => {
          const seen = new Set(current.map((t) => t.id));
          return [...current, ...(data.tasks || []).filter((t) => !seen.has(t.id))];
        });
      } else {
        setTasks(data.tasks || []);
      }
      nextCursorRef.current = data.nextCursor;
      setTotalTasks(data.total);
      setIsOnline(online);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '加载失败，请检查网络');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onEndReached = () => {
    if (loading || tasks.length >= totalTasks) return;
    void loadData(true);
  };

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadData(), 0);
    const onConnected = () => { setRealtime(true); setIsOnline(true); };
    const onDisconnected = () => setRealtime(false);
    const onTask = (event: { payload?: { task?: LinkedTask } }) => {
      const task = event.payload?.task;
      if (!task) return;
      setTasks((current) => current.some((item) => item.id === task.id)
        ? current.map((item) => item.id === task.id ? task : item)
        : [task, ...current]);
      setSelectedTask((current) => current?.id === task.id ? task : current);
    };
    wsClient.on('connected', onConnected);
    wsClient.on('disconnected', onDisconnected);
    wsClient.on('task.updated', onTask);
    wsClient.reconnect();
    const fallback = setInterval(() => void loadData(), 20000);
    const reduceSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(fallback);
      reduceSubscription.remove();
      wsClient.off('connected', onConnected);
      wsClient.off('disconnected', onDisconnected);
      wsClient.off('task.updated', onTask);
      wsClient.disconnect();
    };
  }, [loadData]);

  const submit = async () => {
    const text = prompt.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await createTask(text);
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      setPrompt('');
      setFilter('active');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '提交失败，请检查与桌面端的连接');
    } finally {
      setSubmitting(false);
    }
  };

  const control = async (task: LinkedTask, action: TaskAction) => {
    const execute = async () => {
      setBusyId(task.id);
      setError(null);
      try {
        const updated = await taskAction(task.id, action);
        setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
        setSelectedTask((current) => current?.id === task.id ? updated : current);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : '任务状态可能已经变化，请刷新后重试');
      } finally {
        setBusyId('');
      }
    };
    if (action === 'cancel') {
      Alert.alert('取消任务', `确定取消“${task.title}”吗？`, [
        { text: '返回', style: 'cancel' },
        { text: '取消任务', style: 'destructive', onPress: () => void execute() },
      ]);
      return;
    }
    await execute();
  };

  const counts = useMemo(() => ({
    all: tasks.length,
    active: tasks.filter(isActiveTask).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled').length,
  }), [tasks]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'active') return isActiveTask(task);
    if (filter === 'failed') return task.status === 'failed' || task.status === 'cancelled';
    return task.status === filter;
  }), [filter, tasks]);

  const header = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: s(22), paddingTop: insets.top + s(16), paddingBottom: s(15) }}>
        <View>
          <Text style={{ fontSize: sp(9), color: C.blue, letterSpacing: 2 }}>LINK CONTROL</Text>
          <Text style={{ fontSize: sp(22), fontWeight: '700', color: C.text, marginTop: 4 }}>远程控制台</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开连接管理"
          onPress={() => router.push('/connection')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), paddingHorizontal: s(10), paddingVertical: s(7), borderRadius: s(10), backgroundColor: C.surface, borderWidth: 1, borderColor: realtime ? C.greenBorder : isOnline ? C.borderFocus : C.redBorder }}
        >
          <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: realtime ? C.green : isOnline ? C.amber : C.red }} />
          <Text style={{ fontSize: sp(9), color: realtime ? C.green : isOnline ? C.amber : C.red }}>{realtime ? '实时联动' : isOnline ? '轮询在线' : '桌面离线'}</Text>
          <Ionicons name="chevron-forward" size={sp(12)} color={C.textMuted} />
        </Pressable>
      </View>

      <View style={{ marginHorizontal: s(22), marginBottom: s(14) }}>
        <NeuInsetView borderRadius={15}>
          <View style={{ padding: s(15) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(8) }}>
              <Text style={{ fontSize: sp(10), color: C.amber, letterSpacing: 1 }}>发送创作指令到桌面</Text>
              <Ionicons name="paper-plane-outline" size={sp(15)} color={C.amber} />
            </View>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="例如：制作一条 15 秒的夏日饮品产品短片"
              placeholderTextColor={C.textPlaceholder}
              multiline
              maxLength={500}
              style={{ minHeight: s(70), color: C.text, fontSize: sp(13), lineHeight: sp(19), textAlignVertical: 'top', padding: 0 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: s(8) }}>
              <Text style={{ color: C.textMuted, fontSize: sp(8) }}>{prompt.length}/500</Text>
              <NeuButton title={submitting ? '发送中…' : '发送到桌面'} variant="primary" size="sm" disabled={submitting || !prompt.trim() || !isOnline} onPress={() => void submit()} />
            </View>
          </View>
        </NeuInsetView>
      </View>

      <View style={{ marginHorizontal: s(22), marginBottom: s(14), paddingHorizontal: s(13), minHeight: s(48), flexDirection: 'row', alignItems: 'center', borderRadius: s(12), borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.surface }}>
        <View style={{ flex: 1 }}><Text style={{ color: C.textMuted, fontSize: sp(8) }}>活跃</Text><Text style={{ color: C.text, fontSize: sp(15), fontFamily: 'GeistMono', marginTop: 2 }}>{counts.active}</Text></View>
        <View style={{ width: 1, height: s(20), backgroundColor: C.borderLight }} />
        <View style={{ flex: 1, paddingLeft: s(14) }}><Text style={{ color: C.textMuted, fontSize: sp(8) }}>已完成</Text><Text style={{ color: C.text, fontSize: sp(15), fontFamily: 'GeistMono', marginTop: 2 }}>{counts.completed}</Text></View>
        <View style={{ width: 1, height: s(20), backgroundColor: C.borderLight }} />
        <View style={{ flex: 1, paddingLeft: s(14) }}><Text style={{ color: C.textMuted, fontSize: sp(8) }}>异常</Text><Text style={{ color: counts.failed ? C.red : C.text, fontSize: sp(15), fontFamily: 'GeistMono', marginTop: 2 }}>{counts.failed}</Text></View>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: s(22), gap: s(7), marginBottom: s(14) }}>
        {FILTERS.map((item) => {
          const active = filter === item.key;
          const count = counts[item.key];
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(item.key)}
              style={{ paddingHorizontal: s(11), paddingVertical: s(7), borderRadius: s(9), borderWidth: 1, borderColor: active ? C.borderFocus : C.borderLight, backgroundColor: active ? C.amberGlow : 'transparent', flexDirection: 'row', alignItems: 'center', gap: s(5) }}
            >
              <Text style={{ color: active ? C.amber : C.textMuted, fontSize: sp(9) }}>{item.label}</Text>
              <Text style={{ color: active ? C.amber : C.textDim, fontSize: sp(8), fontFamily: 'GeistMono' }}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Pressable onPress={() => void loadData()} style={{ marginHorizontal: s(22), marginBottom: s(12), padding: s(11), backgroundColor: C.redBg, borderWidth: 1, borderColor: C.redBorder, borderRadius: s(10), flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Ionicons name="alert-circle-outline" size={sp(16)} color={C.red} />
          <Text style={{ flex: 1, color: C.red, fontSize: sp(9), lineHeight: sp(14) }}>{error}</Text>
          <Text style={{ color: C.red, fontSize: sp(9), textDecorationLine: 'underline' }}>重试</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageBackground />
      <FlatList
        data={loading ? [] : filteredTasks}
        keyExtractor={(task) => task.id}
        renderItem={({ item }) => (
          <TaskCard task={item} busy={busyId === item.id} reduceMotion={reduceMotion} onOpen={setSelectedTask} onAction={(task, action) => void control(task, action)} s={s} sp={sp} />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={!loading && tasks.length < totalTasks ? (
          <View style={{ marginHorizontal: s(22), marginVertical: s(12), alignItems: 'center' }}>
            <ActivityIndicator color={C.amber} size="small" />
            <Text style={{ color: C.textMuted, fontSize: sp(9), marginTop: s(5) }}>加载更多…</Text>
          </View>
        ) : null}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? (
          <View style={{ marginHorizontal: s(22), gap: s(10) }}>
            {[0, 1, 2].map((item) => <View key={item} style={{ height: s(105), borderRadius: s(14), borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.surface, opacity: 0.58 }} />)}
          </View>
        ) : (
          <View style={{ marginHorizontal: s(22), minHeight: s(190), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderLight, borderRadius: s(15) }}>
            <Ionicons name={tasks.length ? 'filter-outline' : 'git-network-outline'} size={sp(25)} color={C.textMuted} />
            <Text style={{ color: C.text, fontSize: sp(12), fontWeight: '600', marginTop: s(9) }}>{tasks.length ? '当前筛选下没有任务' : '等待第一条联动任务'}</Text>
            <Text style={{ color: C.textMuted, fontSize: sp(9), marginTop: s(5), textAlign: 'center', maxWidth: s(260), lineHeight: sp(14) }}>{tasks.length ? '切换筛选条件查看其他任务。' : '在上方输入创作要求，桌面创作中心会立即收到。'}</Text>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(); }} tintColor={C.amber} colors={[C.amber]} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + s(92) }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />
      <TaskDetailSheet task={selectedTask} busy={Boolean(selectedTask && busyId === selectedTask.id)} onClose={() => setSelectedTask(null)} onAction={(task, action) => void control(task, action)} s={s} sp={sp} />
      {submitting ? <View pointerEvents="none" style={{ position: 'absolute', right: s(22), bottom: insets.bottom + s(70) }}><ActivityIndicator size="small" color={C.amber} /></View> : null}
    </View>
  );
}
