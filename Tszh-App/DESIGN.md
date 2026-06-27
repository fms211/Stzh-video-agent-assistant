# Tszh Remote App — 设计规范文档

> 版本: v3.0 | 日期: 2026-06-11
> 定位: 腾昇智和平台的远程控制 App（"外置小脑"）
> 框架: React Native + Expo
> 风格: Deep Space Neumorphic（深空新拟态）

---

## 一、设计哲学

### 1.1 核心隐喻
一块悬浮在深空中的**钛合金操控面板**。每个 UI 元素都像是从金属表面**雕刻**出来的。

### 1.2 三条原则

| 原则 | 含义 |
|------|------|
| **边框即光影** | 凹陷效果用边框粗细+颜色模拟，比多层渐变更高效 |
| **光晕即层次** | 凸起元素用外发光（shadow/elevation）表达高度 |
| **文字即装饰** | 标题用 textShadow 发光，不需要额外装饰元素 |

### 1.3 绝对禁止

| 禁止 | 原因 |
|------|------|
| 纯白 `#fff` / 纯黑 `#000` | 破坏深空氛围 |
| emoji 作功能图标 | 跨平台渲染不一致 |
| 硬边 View 做光影 | 看起来像贴纸不是物理表面 |
| 多层渐变做凹陷 | 性能差且效果不明显，用边框法替代 |
| ScrollView 做登录页 | 一屏显示完，不需要滑动 |
| overflow: hidden 裁剪外发光 | 外发光必须 `overflow: 'visible'` |

---

## 二、色彩系统

### 2.1 关键色值

| Token | 值 | 用途 |
|-------|-----|------|
| `BG` | `#0a1228` | 页面背景 |
| `SURFACE` | `rgba(5,13,35,0.7)` | 面板（半透明） |
| `INPUT_BG` | `#0a1228` | 输入框底色 |
| `AMBER` | `#ffb870` | 主强调 |
| `AMBER_DARK` | `#e89840` | 发光体/Logo |
| `AMBER_GLOW` | `rgba(255,184,112,0.15)` | 光晕 |
| `BORDER_DARK` | `rgba(0,0,0,0.6)` | 凹陷暗边 |
| `BORDER_LIGHT` | `rgba(255,255,255,0.05)` | 凹陷亮边 |
| `BORDER_FOCUS` | `rgba(255,184,112,0.4)` | 聚焦边框 |
| `BORDER_PANEL` | `rgba(255,184,112,0.1)` | 面板边框 |
| `TEXT_PRIMARY` | `#dbe1ff` | 主文字 |
| `TEXT_SECONDARY` | `#d8c3b1` | 次文字 |
| `TEXT_MUTED` | `#2d344c` | 占位符 |

### 2.2 状态色

| 状态 | 色值 |
|------|------|
| 成功 | `#4ade80` |
| 错误 | `#ffb4ab` |
| 警告 | `#fbbf24` |
| 信息 | `#aec6ff` |

---

## 三、新拟态实现方法

### 3.1 凹陷效果（输入框）— 边框法

**原理**：用 4 条不同粗细/颜色的边框模拟光照方向。

```
顶部: borderTopWidth: 2, borderTopColor: rgba(0,0,0,0.6)    ← 暗影（厚）
左侧: borderLeftWidth: 2, borderLeftColor: rgba(0,0,0,0.6)  ← 暗影（厚）
底部: borderBottomWidth: 1, borderBottomColor: rgba(255,255,255,0.05) ← 微光（薄）
右侧: borderRightWidth: 1, borderRightColor: rgba(255,255,255,0.05)  ← 微光（薄）
```

**聚焦态**：所有边框变为 `rgba(255,184,112,0.4)`，宽度统一为 1。

**错误态**：所有边框变为 `rgba(255,180,171,0.6)`。

**优势**：比 5 层 LinearGradient 性能更好，效果更清晰。

### 3.2 凸起效果（按钮）— 光晕层法

**原理**：在按钮背后放一个 `scale(1.05)` 的同色层作为光晕。

```
Layer 1: 光晕层
  backgroundColor: #ffb870
  borderRadius: 与按钮相同
  opacity: 0.3-1（脉冲动画）
  transform: [{ scale: 1.05 }]

Layer 2: 按钮主体
  多层 LinearGradient（#ffcb8e → #e89840 → #c07020）
  + 上半高光 LinearGradient
  + 顶部亮条 LinearGradient
  + 底部暗影 LinearGradient
  + 边框 borderColor: rgba(255,255,255,0.25)

Layer 3: 外发光（可选）
  4 个 LinearGradient 从边缘向外扩散
  颜色: rgba(232,152,64,0.06-0.18)
```

**关键**：所有父容器必须 `overflow: 'visible'`，否则外发光被裁剪。

### 3.3 文字发光效果

```
textShadowColor: 'rgba(255,184,112,0.4)'
textShadowOffset: { width: 0, height: 0 }
textShadowRadius: 10-12
```

### 3.4 面板效果

```
backgroundColor: 'rgba(5,13,35,0.7)'  ← 半透明深色
borderRadius: 16
borderWidth: 1
borderColor: 'rgba(255,184,112,0.1)'  ← 微妙琥珀边框
overflow: 'visible'  ← 允许子元素外发光溢出
```

### 3.5 状态标签（来自 Stitch 规范）

```
backgroundColor: 'rgba(颜色,0.15)'
borderRadius: 20（胶囊）
paddingHorizontal: 10, paddingVertical: 2
borderWidth: 1
borderColor: 'rgba(颜色,0.25)'
fontSize: 12, fontWeight: '600'
```

颜色映射：
- 运行中: `rgba(79,195,247,0.15)` + `#4fc3f7`
- 已完成: `rgba(102,187,106,0.15)` + `#66bb6a`
- 失败: `rgba(239,83,80,0.15)` + `#ef5350`
- 重试: `rgba(255,167,38,0.15)` + `#ffa726`

### 3.6 任务卡片左侧状态条（来自 Stitch 规范）

```
borderLeftWidth: 3
borderLeftColor: 颜色（蓝=进行中，绿=完成，红=失败）
```

### 3.7 Shimmer 按钮动效（来自 Stitch 规范）

在 CTA 按钮上叠加一层半透明光泽，从左到右扫过：
```
Animated 循环 translateX: -width → width
颜色: rgba(255,255,255,0.15)
时长: 3s
```

### 3.8 进度条脉冲（来自 Stitch 规范）

```
填充条 opacity 循环: 1 → 0.7 → 1
时长: 2s
缓动: ease-in-out
```

---

## 四、背景氛围层

### 4.1 星空粒子（Layer 0）

```
40 个 Animated.View 小圆点（小屏 25 个）
颜色: #ffb870（琥珀色）
尺寸: 1-3px 随机
动画: translateY 从屏幕底部到顶部，Easing.linear 无缝循环
速度: 10s-25s 随机
透明度: 0.1-0.6 随机
```

### 4.2 CRT 扫描线（Layer 1）

```
叠加层: backgroundColor: rgba(0,0,0,0.06)
光带: 100px 高 LinearGradient [透明, rgba(255,184,112,0.08), 透明]
动画: translateY 从 -100 到屏幕高度+100，6s 循环
pointerEvents: "none" ← 不阻挡交互
```

---

## 五、组件 API

### 5.1 NeuCard

```tsx
<NeuCard variant="raised" | "inset" | "glow" glow={boolean}>
  {children}
</NeuCard>
```

- `raised`: 7 层渐变凸起
- `inset`: 边框法凹陷
- `glow`: 琥珀色发光体
- `glow={true}`: 仅 raised 有效，添加边缘外发光

### 5.2 NeuButton

```tsx
<NeuButton
  title="文字"
  onPress={() => {}}
  variant="primary" | "outline" | "ghost"
  size="sm" | "md" | "lg"
  loading={boolean}
  disabled={boolean}
  icon="📡"
/>
```

- `primary`: 多层渐变发光 + 外发光 + 脉冲光晕
- `outline`: 凸起阴影 + 边框
- `ghost`: 无边框纯文字
- 文字 `fontWeight: '900'`（最粗）

### 5.3 NeuInput

```tsx
<NeuInputField
  icon="👤"
  placeholder="PILOT_ID"
  value={text}
  onChangeText={setText}
  secureTextEntry={boolean}
  error="错误信息"
  compact={boolean}  // 小屏模式
/>
```

凹陷效果用边框法实现。

### 5.4 PulseGlow

```tsx
<PulseGlow color="#e89840">
  {children}
</PulseGlow>
```

3s 循环脉冲光晕，`overflow: 'visible'`。

### 5.5 StatusIndicator

```tsx
<StatusIndicator items={[
  { label: 'SYNC', color: '#ffb870', pulse: true },
  { label: 'LINKED', color: '#aec6ff' },
]} />
```

---

## 六、响应式系统

### 6.1 useResponsive Hook

```tsx
const { width, height, insets, isCompact, isLarge, s, sp, scale } = useResponsive();

s(24)   // 间距缩放（基准 375px，最大 115%）
sp(16)  // 字号缩放（最大 110%）
```

### 6.2 断点

| 断点 | 宽度 | 处理 |
|------|------|------|
| compact | < 375px | 输入框高度 44px，粒子数 25 |
| regular | 375-428px | 标准布局 |
| large | > 428px | 面板最大 400px |

### 6.3 安全区

```tsx
const insets = useSafeAreaInsets();
// paddingTop: insets.top + s(12)
// paddingBottom: insets.bottom + s(12)
```

### 6.4 字体规范（来自 Stitch）

| 场景 | 字体 | 字号 | 字重 | 字间距 |
|------|------|------|------|--------|
| Logo/品牌 | Geist | 28-32 | 700 | 4px |
| 页面标题 | Geist | 20-24 | 600 | 1px |
| 正文 | Geist | 16 | 400 | 0 |
| 标签 | Geist | 12 | 500 | 1-2px |
| 输入框 | monospace | 14 | 400 | 0.5px |
| 状态灯 | monospace | 10 | 400 | 1px |
| 版本号 | monospace | 10 | 400 | 1px |

### 6.5 圆角规范（来自 Stitch）

| 元素 | 圆角 |
|------|------|
| 卡片/面板 | 12-16px |
| 输入框 | 8-12px |
| 按钮 | 胶囊（9999px） |
| 标签/徽章 | 20px（胶囊） |
| 图标按钮 | 圆形（width/2） |

---

## 七、动画规范

| 交互 | 动画 | 时长 |
|------|------|------|
| 按钮按压 | scale 1→0.95 | 80ms |
| 按钮释放 | 弹簧回弹 | tension:180, friction:8 |
| 输入框聚焦 | 边框色渐变 | 200ms |
| 脉冲光晕 | opacity 0.3→0.7 | 1500ms 循环 |
| Logo 旋转 | rotate 0→360° | 20000ms 循环 |
| 星空粒子 | translateY 底→顶 | 10-25s 循环 |
| CRT 光带 | translateY -100→H+100 | 6000ms 循环 |

---

## 八、开发约定

1. **凹陷效果用边框法**，不用多层 LinearGradient
2. **凸起效果用光晕层法**，按钮背后放 scale(1.05) 的同色层
3. **所有父容器必须 `overflow: 'visible'`**，否则外发光被裁剪
4. **按钮文字 `fontWeight: '900'`**，最粗
5. **标题用 `textShadow` 发光**，不需要额外装饰
6. **一屏显示完**，不用 ScrollView
7. **CRT 蒙版 `opacity: 0.06`**，不挡交互
8. **字号/间距用 `s()`/`sp()` 缩放**，适配不同屏幕
