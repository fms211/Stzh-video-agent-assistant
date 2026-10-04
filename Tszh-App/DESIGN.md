# Tszh Remote · 当前界面与组件说明

按main移动端源码核对2026-10-02。此文件说明React Native实现；Web主题/银河/玻璃在[根设计文档](../DESIGN.md)。手机完整体验尚未验收，不能以组件存在宣称阶段5完成。

## 当前视觉结构

深空背景、暖琥珀操作色和新拟态层级承载远程创作控制。页面复用 [PageBackground](src/components/PageBackground.tsx)、[StarfieldBackground](src/components/StarfieldBackground.tsx)、[CRTOverlay](src/components/CRTOverlay.tsx)，按真实平台查看效果与性能。

Token来源是 [theme.ts](src/constants/theme.ts)。部分组件还包含固定渐变/状态色；下表列的是当前Token，不是全组件统一的验收承诺：

| Token | 当前值/用途 |
|---|---|
| `Colors.spaceDeep` | `#050a14` 深空底 |
| `Colors.surface` | `#0a1228` 面板 |
| `Colors.onSurface` | `#dbe1ff` 正文 |
| `Colors.primary` | `#e89840` 暖琥珀 |
| `Colors.secondary` | `#aec6ff` 辅助色 |
| `Colors.success/error/warning/info` | `#7cc79a / #ffb4ab / #fbbf24 / #60a5fa` |
| `BorderRadius` | sm4、md8、lg12、xl16、full9999 |

字体尺寸、间距、动画常量及iOS/Android/web的原生阴影分支同样以theme.ts为准，不沿用旧设计稿虚构的BG/AMBER常量API。

## 实际组件

| 组件 | 当前属性/行为 |
|---|---|
| [NeuCard](src/components/NeuCard.tsx) | children、variant `raised/inset/glow`、glow、style；使用多层渐变和平台效果 |
| [NeuButton](src/components/NeuButton.tsx) | title、onPress、variant `primary/outline/ghost`、size `sm/md/lg`、loading、disabled、icon、style；按压动画 |
| [NeuInput](src/components/NeuInput.tsx) | TextInput属性、value/onChangeText、label、error等；聚焦/错误边缘与渐变层 |
| [PulseGlow](src/components/PulseGlow.tsx) | 发光动画层，具体参数以组件类型为准 |
| [StatusIndicator](src/components/StatusIndicator.tsx) | 状态显示，业务状态不能只由颜色推断 |
| [WorkflowStepCard](src/components/WorkflowStepCard.tsx) | 工作流步骤展示，与真实结果状态对应 |

其余NeuModal、NeuTag、NeuProgress、设置与加载组件在 `src/components/`。React Native使用View/Text/Animated/LinearGradient，不将Web CSS或DOM组件直接当手机实现。

## 布局与页面

Expo Router以 `app/` 页面文件和tabs布局组织任务、聊天、画廊、通知、模板及个人页面。相机、WebView、安全区和原生返回等行为要在实际平台核对。

旧说明提到的统一 `useResponsive` hook未在当前受跟踪源码中提供；各页面真实尺寸/安全区处理需直接核对实现。不要在新文档示例调用不存在的hook，固定设计宽度也不能证明平板/文字放大已适配。

## 状态、缓存和体验

API/WS来自当前配置后端，身份及设备/待发内容按服务器和用户保存。网络探测、WS在线、任务running和业务completed分别表达事实；离线缓存不代替服务器结果。

错误、空态、loading与重试应保留真实状态和草稿；只读核对后决定是否重试外部操作。当前全部触屏/IME/可访问性和后台行为仍需真机验证。

后续要求见[DESIGN_REQUIREMENTS.md](DESIGN_REQUIREMENTS.md)，启动/平台边界见[README](README.md)。本次未修改视觉或运行手机UI，不把这份说明作为已完成设计验收。
