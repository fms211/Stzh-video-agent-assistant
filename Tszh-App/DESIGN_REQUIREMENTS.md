# Tszh Remote — 设计需求文档

> 版本: v3.0 | 日期: 2026-06-11
> 角色: 审美与功能思维兼备的专业前端开发工程师

---

## 一、设计愿景

**"一块悬浮在深空中的钛合金操控面板，每个按键都是从金属表面雕刻出来的。"**

### 1.1 用户感知

- 我在操控一个**精密仪器**，不是在刷社交媒体
- 每个元素都有**物理重量**——凸起来的能按，凹下去的能看
- 界面是**安静的**——深空底色不争不抢，琥珀色只在关键处亮起

### 1.2 三条设计律

| 律 | 原文 | 开发含义 |
|----|------|---------|
| **边框即光影** | 凹陷用边框粗细+颜色模拟 | 输入框：top/left 2px 暗，bottom/right 1px 亮 |
| **光晕即层次** | 凸起用外发光表达高度 | 按钮：背后 scale(1.05) 光晕层 + shadow |
| **文字即装饰** | 标题用 textShadow 发光 | 不需要额外装饰 View |

---

## 二、新拟态实现规范

### 2.1 凹陷效果（输入框）— 边框法

```tsx
// 默认态
{
  borderTopWidth: 2,     borderTopColor: 'rgba(0,0,0,0.6)',
  borderLeftWidth: 2,    borderLeftColor: 'rgba(0,0,0,0.6)',
  borderBottomWidth: 1,  borderBottomColor: 'rgba(255,255,255,0.05)',
  borderRightWidth: 1,   borderRightColor: 'rgba(255,255,255,0.05)',
  backgroundColor: '#0a1228',
}

// 聚焦态
{
  borderWidth: 1,
  borderColor: 'rgba(255,184,112,0.4)',
}

// 错误态
{
  borderWidth: 1,
  borderColor: 'rgba(255,180,171,0.6)',
}
```

**为什么用边框法不用渐变**：
- 性能：1 个 View vs 5 个 LinearGradient
- 效果：边框法凹陷感更清晰
- 维护：代码量减少 70%

### 2.2 凸起效果（按钮）— 光晕层法

```tsx
// Layer 1: 光晕（按钮背后）
<View style={{
  ...StyleSheet.absoluteFillObject,
  backgroundColor: '#ffb870',
  borderRadius: 26,
  opacity: glowAnim,  // 0.3-1 脉冲
  transform: [{ scale: 1.05 }],
}} />

// Layer 2: 按钮主体
<LinearGradient
  colors={['#ffcb8e', '#e89840', '#c07020']}
  style={{ borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }}
>
  // 上半高光
  <LinearGradient colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.15)', 'transparent']} />
  // 顶部亮条
  <LinearGradient colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.2)', 'transparent']} />
  // 底部暗影
  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.2)']} />
</LinearGradient>

// Layer 3: 外发光（4 边）
<LinearGradient colors={['rgba(232,152,64,0.18)', 'transparent']} /> // 顶部
<LinearGradient colors={['transparent', 'rgba(232,152,64,0.12)']} /> // 底部
// ... 左右同理
```

**关键约束**：所有父容器必须 `overflow: 'visible'`。

### 2.3 文字发光

```tsx
<Text style={{
  fontSize: 28,
  color: '#ffb870',
  fontWeight: 'bold',
  letterSpacing: 4,
  textShadowColor: 'rgba(255,184,112,0.4)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 10,
}}>
  TSZH REMOTE
</Text>
```

### 2.4 面板效果

```tsx
<View style={{
  backgroundColor: 'rgba(5,13,35,0.7)',  // 半透明
  padding: 18,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(255,184,112,0.1)',  // 微妙琥珀边
  overflow: 'visible',  // 允许子元素外发光
}}>
```

---

## 三、背景氛围规范

### 3.1 星空粒子

```
数量: 40（小屏 25）
颜色: #ffb870
尺寸: 1-3px 随机
动画: translateY 底→顶，Easing.linear 无缝循环
速度: 10-25s 随机
透明度: 0.1-0.6 随机
实现: Animated.Value + setValue(屏幕高度) 重置
```

### 3.2 CRT 扫描线

```
叠加层: rgba(0,0,0,0.06) 全屏
光带: 100px 高 LinearGradient [透明, rgba(255,184,112,0.08), 透明]
动画: translateY -100 → 屏幕高度+100，6s 循环
pointerEvents: "none"
zIndex: 10
```

---

## 四、响应式规范

### 4.1 缩放系统

```tsx
const scale = screen宽度 / 375;  // 基准 iPhone SE
const s = (size) => Math.round(size * Math.min(scale, 1.15));  // 间距
const sp = (size) => Math.round(size * Math.min(scale, 1.1));  // 字号
```

### 4.2 断点处理

| 断点 | 宽度 | 处理 |
|------|------|------|
| compact | < 375 | 输入框高 44px，粒子 25 个 |
| regular | 375-428 | 标准 |
| large | > 428 | 面板 max 400px |

### 4.3 安全区

```tsx
const insets = useSafeAreaInsets();
// 顶部: insets.top + s(12)
// 底部: insets.bottom + s(12)
```

---

## 五、页面规范

### 5.1 登录页

**一屏显示，不用 ScrollView。**

```
Layer 0: 星空粒子（40 个琥珀色圆点）
Layer 1: CRT 扫描线（叠加层 + 移动光带）
Layer 2: 内容（KeyboardAvoidingView）
  ├─ Logo（NeuCard glow + PulseGlow + 旋转 20s）
  ├─ TSZH REMOTE（textShadow 发光）
  ├─ 外置小脑（letterSpacing: 6）
  ├─ 认证面板（半透明 + 琥珀边框）
  │   ├─ COMMAND PILOT 输入框（边框法凹陷）
  │   ├─ SECURITY CIPHER 输入框（+密码显隐）
  │   └─ 连接按钮（NeuButton primary + PulseGlow）
  ├─ 记住登录 / 忘记密钥
  ├─ SUBSPACE GATEWAY（服务器配置）
  └─ SYNC / LINKED / ENCRYPT 状态灯
```

**叠层 overflow 规则**：
```
认证面板: overflow: 'visible'
PulseGlow: overflow: 'visible'
NeuButton: overflow: 'visible'
→ 三层都 visible，外发光不被裁剪
```

### 5.2 其他页面

按 `DESIGN.md` 第五章组件 API 调用，遵循：
- 凹陷用边框法
- 凸起用光晕层法
- 标题用 textShadow 发光
- 面板用半透明 + 琥珀边框
- 所有父容器 `overflow: 'visible'`

---

## 六、Stitch 设计规范（从设计稿提取）

### 6.1 状态标签样式

```tsx
{
  backgroundColor: 'rgba(颜色,0.15)',
  borderRadius: 20,
  paddingHorizontal: 10,
  paddingVertical: 2,
  borderWidth: 1,
  borderColor: 'rgba(颜色,0.25)',
  fontSize: 12,
  fontWeight: '600',
  color: 颜色,
}
```

### 6.2 任务卡片左侧状态条

```tsx
borderLeftWidth: 3
borderLeftColor: 颜色  // 蓝=进行中, 绿=完成, 红=失败
```

### 6.3 Shimmer 按钮动效

CTA 按钮叠加半透明光泽从左到右扫过，3s 循环。

### 6.4 进度条脉冲

填充条 opacity 循环 `1→0.7→1`，2s，ease-in-out。

### 6.5 Logo 脉冲

`drop-shadow` keyframes 4s 循环，光晕半径 12→24px。

### 6.6 输入框规范

- 前缀图标（Material Icons）
- monospace 字体
- 凹陷阴影 `inset 2px 2px 6px rgba(0,0,0,0.4)`
- 聚焦边框 `rgba(颜色,0.3)` + 外发光 `0 0 16px rgba(颜色,0.1)`

---

## 七、动画规范

| 交互 | 动画 | 驱动 |
|------|------|------|
| 按钮按压 | scale 0.95 | useNativeDriver: true |
| 脉冲光晕 | opacity 0.3→0.7 | useNativeDriver: false（shadow） |
| Logo 旋转 | rotate 0→360° | useNativeDriver: true |
| 星空粒子 | translateY 底→顶 | useNativeDriver: true |
| CRT 光带 | translateY -100→H+100 | useNativeDriver: true |
| 输入框聚焦 | 边框色渐变 | useNativeDriver: false（layout） |

---

## 七、性能规范

| 指标 | 目标 |
|------|------|
| 粒子数 | ≤40（小屏 25） |
| 渐变层数 | 按钮 ≤6 层，输入框 ≤0 层（边框法） |
| 动画驱动 | 尽量 useNativeDriver: true |
| 一屏渲染 | 不用 ScrollView |

---

## 八、开发检查表

### 每个新页面必须检查：

- [ ] 凹陷效果用边框法（不是多层渐变）
- [ ] 凸起按钮有光晕层（scale 1.05）
- [ ] 所有父容器 `overflow: 'visible'`
- [ ] 标题有 textShadow 发光
- [ ] 面板用半透明背景 + 琥珀边框
- [ ] 字号/间距用 `s()`/`sp()` 缩放
- [ ] 安全区用 `useSafeAreaInsets()`
- [ ] 一屏显示完（不用 ScrollView）
- [ ] CRT 蒙版不挡交互（opacity ≤0.06）
- [ ] 按钮文字 `fontWeight: '900'`
