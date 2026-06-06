---
name: 腾昇智和 · OPC 微智能体
description: 深空原子朋克风格的 AI 短视频创作助手界面
colors:
  space-deep: "#050a14"
  space-panel: "#0a1228"
  space-surface: "#0e1630"
  foreground: "#d8dce8"
  foreground-muted: "#8890a8"
  border-subtle: "rgba(255,255,255,0.08)"
  glow-warm: "#e89840"
  glow-warm-soft: "#f8c878"
  glow-cool: "#5888d8"
  glow-aurora: "#9078d0"
  error: "#e06050"
  success: "#4ade80"
typography:
  display:
    fontFamily: "GeistPixel-Line, var(--font-geist-sans), sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.04em"
  title:
    fontFamily: "GeistPixel-Line, var(--font-geist-sans), sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.04em"
  body:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "GeistPixel-Line, var(--font-geist-sans), sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
  mono:
    fontFamily: "var(--font-geist-mono), monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  panel: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  panel:
    backgroundColor: "{colors.space-panel}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "10px 14px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.foreground-muted}"
    rounded: "{rounded.md}"
    size: "32px"
  button-primary:
    backgroundColor: "{colors.glow-warm}"
    textColor: "{colors.space-deep}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  input-capsule:
    backgroundColor: "{colors.space-surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "6px 6px 6px 12px"
  message-user:
    backgroundColor: "color-mix(in srgb, {colors.glow-warm} 12%, {colors.space-surface})"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  message-assistant:
    backgroundColor: "{colors.space-surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  chip:
    backgroundColor: "color-mix(in srgb, {colors.glow-warm} 4%, transparent)"
    textColor: "{colors.foreground-muted}"
    rounded: "{rounded.md}"
    padding: "5px 10px"
---

# Design System: 腾昇智和 · OPC 微智能体

## 1. Overview

**Creative North Star: "深空天文台的控制台"**

一个搭建在深空中的天文台控制室。对话流是观测窗口，AI 是坐在对面的导演，界面是精密的控制台。每一个交互都像是在调整望远镜的焦距：精准、有目的、带着探索未知的仪式感。

这个系统拒绝传统企业蓝的冰冷感，也拒绝过度拟物的虚假感。它用暖琥珀色的辉光在深空底色上勾勒出功能边界，用像素风字体暗示数字世界的底层逻辑。色彩不喧哗但有温度，间距不拥挤但有密度。

**Key Characteristics:**
- 三层深空底色（deep → panel → surface）构建视觉纵深
- 暖琥珀辉光（8%-40% 渐变透明度）标记所有可交互元素
- GeistPixel 像素字体承载所有标题和标签，与深空主题呼应
- `color-mix()` 透明度分层替代传统 opacity，保持色彩纯度
- 所有交互元素有明确的 hover/focus/active 三态反馈

## 2. Colors: The Deep Space Palette

暖琥珀在深蓝黑底上燃烧。不是霓虹的刺眼，是天文台仪表盘上那种被玻璃罩过滤过的、带着温度的光。

### Primary
- **暖琥珀 Glow Warm** (#e89840): 系统的核心强调色。标记当前激活项、可交互元素的 hover 边框、发送按钮、焦点环。用 8%-40% 的透明度梯度控制其存在感，从"隐约感知"到"明确指引"。

### Secondary
- **冷靛 Glow Cool** (#5888d8): AI 助手的头像底色、模型协议标签、辅助信息。与暖琥珀形成冷暖对比，但永远处于从属地位。

### Tertiary
- **极光紫 Glow Aurora** (#9078d0): 极少使用，仅在需要第三层语义区分时出现（如特殊标签、过渡状态）。

### Neutral
- **深空底 Space Deep** (#050a14): 最深层背景，视口级。
- **面板底 Space Panel** (#0a1228): 面板、卡片、下拉菜单的背景。
- **浮层面 Space Surface** (#0e1630): 消息气泡、表单区域、配置卡片的背景。
- **前景色 Foreground** (#d8dce8): 主要文字，接近白但带着冷蓝调。
- **静音色 Foreground Muted** (#8890a8): 次要文字、占位符、非激活状态。
- **边框色 Border Subtle** (rgba(255,255,255,0.08)): 所有分隔线和边框。极低对比度，仅提供结构暗示。

### Named Rules

**The 8% Rule.** 暖琥珀辉光通过 `color-mix(in srgb, var(--glow-warm) N%, transparent)` 控制可见度。hover 背景用 8%，焦点环用 30%，激活边框用 35%。这个梯度系统不允许随意选择百分比，必须在 8/12/15/20/30/35/40 这几个档位中选择。

**The No Pure Black Rule.** 禁止使用 `#000`。最深的黑色是 `#050a14`（深空底），它带着微弱的蓝色调。纯黑在深色界面上会形成视觉空洞。

## 3. Typography

**Display Font:** GeistPixel-Line（像素风等宽，从 officialskills.sh 加载）
**Body Font:** Geist Sans（Next.js 内置无衬线）
**Mono Font:** Geist Mono（Next.js 内置等宽）

**Character:** GeistPixel 的像素网格感与深空主题的数字底层逻辑呼应。标题和标签全部使用 GeistPixel，正文使用 Geist Sans 保持可读性。两者混用时通过字号和字重拉开层级。

### Hierarchy
- **Display** (400, 15px, 1.3, 0.04em): 面板标题、空态大标题。GeistPixel-Line。
- **Title** (400, 13px, 1.4, 0.04em): 区域标题、表单标题。GeistPixel-Line。
- **Body** (400, 13px, 1.6, normal): 消息正文、输入框文本。Geist Sans。最大行宽 65ch。
- **Label** (400, 10px, 1.4, 0.06em): 分类标签、时间戳、配置标签。GeistPixel-Line。
- **Mono** (400, 11px, 1.4, normal): 模型 ID、API 地址、配置输入框。Geist Mono。

### Named Rules

**The Pixel For Labels Rule.** 所有 10px 及以下的文字必须使用 GeistPixel-Line 或 GeistPixel-Square。小字号在像素字体下反而更清晰，因为每个字形都在网格上对齐。

## 4. Elevation

深空不靠阴影堆叠来表达层级，而是靠三层底色的渐变：deep → panel → surface。阴影的角色不是"抬起"元素，而是"标记悬浮"。只有浮在主界面之上的元素（面板、下拉、蒙版）才使用 box-shadow。

### Shadow Vocabulary
- **Floating Panel** (`0 24px 80px rgba(0,0,0,0.6), 0 0 40px color-mix(var(--glow-warm) 8%)`): 主面板的悬浮阴影。大面积黑色漫射 + 暖琥珀辉光晕染。
- **Dropdown** (`0 8px 32px rgba(0,0,0,0.5)`): 下拉菜单。纯黑色漫射，无辉光。
- **Focus Ring** (`0 0 0 2px color-mix(var(--glow-warm) 30%)`): 键盘导航焦点环。暖琥珀色，30% 透明度。
- **Glow Hover** (`0 0 12px color-mix(var(--glow-warm) 40%)`): 按钮 hover 时的辉光扩散。

### Named Rules

**The Flat-By-Default Rule.** 面板、卡片、输入框在静息状态下没有阴影。阴影只出现在两种场景：元素浮在主界面之上（面板、下拉），或元素处于交互状态（hover、focus）。

## 5. Components

### Panel
- **Shape:** 圆角 16px，1px 实线边框（border-subtle）
- **Background:** space-panel (#0a1228)
- **Shadow:** Floating Panel 级别
- **Layout:** 固定居中，780×580px，移动端全屏
- **Animation:** 从 scale(0.95) + translateY(8px) 弹入，0.3s ease-out-expo

### Buttons
- **Icon Button:** 32×32px，圆角 8px，透明底，foreground-muted 色。hover 时底色变为 glow-warm 8%，边框变为 glow-warm 20%。
- **Primary Button:** 内边距 6px 14px，圆角 6px，glow-warm 底色，space-deep 文字。hover 时 brightness(1.1)。禁用时 opacity 0.4。
- **Quick Action Chip:** 内边距 5px 10px，圆角 8px，1px border-subtle 边框，glow-warm 4% 底色。hover 时边框升至 30%，底色升至 8%，translateY(-1px) 微浮。
- **Danger Button:** 同 icon button 尺寸，hover 时 color 和 border 变为 error 色。

### Input
- **Capsule:** 圆角 12px，space-surface 底色，1px border-subtle 边框。focus-within 时边框变为 glow-warm 35%。
- **Textarea:** 无边框，透明底，Geist Sans 13px。placeholder 用 foreground-muted 50% opacity。
- **Config Input:** 圆角 6px，space-panel 底色，Geist Mono 11px。focus 时边框变为 glow-warm 40%。

### Message Bubble
- **User:** 圆角 10px，glow-warm 12% + space-surface 混合底色，glow-warm 18% 边框。头像 28×28 圆角 8px，glow-warm 15% 底色。
- **Assistant:** 圆角 10px，space-surface 底色，border-subtle 边框。头像同尺寸，glow-cool 15% 底色。
- **Copy Action:** 消息 hover 时显示，20×20px，opacity 0→0.6 渐显。

### Chip / Badge
- **Tier Badge:** 内边距 1px 6px，圆角 4px，GeistPixel-Square 8px 大写。三级颜色：fast 用 success 色，balanced 用 glow-cool，powerful 用 glow-warm。底色 15%，边框 25%。
- **Protocol Badge:** 9px，glow-cool 色，glow-cool 10% 底色，圆角 3px。
- **Radio Toggle:** 内边距 4px 10px，圆角 6px。激活时边框 glow-warm，底色 glow-warm 8%。

### Navigation
- **Sidebar Tabs:** flex 等分，列布局，GeistPixel-Line 9px。激活时 glow-warm 色 + glow-warm 6% 底色。focus-visible 时 inset ring glow-warm 30%。

### Thinking Indicator
- **Dots:** 3 个 5×5px 圆点，glow-warm 40% 底色，staggered 脉冲动画（1.4s ease-in-out infinite，延迟 0.2s/0.4s）。脉冲时 opacity 0.4→1，scale 1→1.2。

## 6. Do's and Don'ts

### Do:
- **Do** 使用 `color-mix()` 透明度分层控制暖琥珀的存在感，而非直接降低 opacity。opacity 会让整个元素变灰，color-mix 保持色彩纯度。
- **Do** 在 8/12/15/20/30/35/40 这几个档位中选择 glow-warm 的透明度百分比。这是系统级的梯度，不是随意选择的。
- **Do** 为所有交互元素提供 hover/focus-visible/active 三态。hover 改变底色和边框，focus-visible 添加光环，active 改变 transform。
- **Do** 使用 GeistPixel-Line 作为所有 13px 及以下标题和标签的字体。
- **Do** 使用 `prefers-reduced-motion: reduce` 媒体查询禁用所有动画。
- **Do** 保持三层底色的视觉层级：deep 最深，panel 中间，surface 最浅。

### Don't:
- **Don't** 使用 `#000` 或 `#fff`。PRODUCT.md 明确禁止纯黑纯白。最深是 #050a14，最浅是 #d8dce8。
- **Don't** 使用 glassmorphism（backdrop-blur 装饰性使用）。PRODUCT.md 将其列为反面参考。backdrop-filter 仅用于蒙版层（如面板背后的遮罩）。
- **Don't** 使用 emoji 作为功能性图标。PRODUCT.md 明确禁止。导航、操作、状态全部使用 Lucide SVG 图标。
- **Don't** 使用 bounce/elastic 缓动（cubic-bezier 控制点 >1.0）。面板入口动画使用 ease-out-expo，不允许过冲振荡。
- **Don't** 在深空主题上使用传统企业蓝（蓝色主题、正式严肃的企业级 UI）。PRODUCT.md 将其列为首要反面参考。
- **Don't** 让阴影成为默认状态。卡片和面板在静息时没有阴影，阴影只用于浮层和交互反馈。
- **Don't** 使用 gradient text（background-clip: text + 渐变背景）。装饰性强于语义性，用单一实色替代。
