# 腾昇智和 · 短视频智能体 — 项目记忆

> 本文件为项目全局记忆，所有在本目录打开的 Claude Code 窗口均应首先读取本文件。

---

## 项目身份

- **名称**: 腾昇智和 · 一键 Video Workspace
- **定位**: 基于 Coze 平台的 AI 短视频全链路自动生成智能体前端交互系统
- **用户**: 客户/甲方，非技术用户，通过自然语言对话生成短视频
- **品牌气质**: 深邃像素星空 + 未来原子朋克 + 智慧艺术气息
- **核心隐喻**: 一座搭建在深空中的天文台控制室——对话流是观测窗口，AI 是坐在对面的导演

---

## 双仓库架构

| 仓库 | 路径 | 角色 |
|------|------|------|
| **前端界面** | `D:\fms688_stzh-Agent`（当前） | Next.js 16 交互页面 |
| **Agent 汇总** | `E:\HuaweiMoveData\Users\fms\Desktop\圳潮漫剧AIGC\腾昇智和Agent汇总` | Coze 智能体配置、知识库、系统提示词、Python 脚本 |

---

## 技术栈

```
Next.js 16.2.4 (App Router + force-dynamic)
React 19.2.4 (全客户端组件)
TypeScript 5 (strict)
Tailwind CSS 4 (@theme inline + CSS variables)
Three.js + @react-three/fiber + @react-three/drei
GSAP (ScrollTrigger, timeline)
anime.js
GeistPixel-Line/Square 像素字体 (officialskills.sh)
ZCOOL QingKe HuangYou 毛笔字体
```

---

## 页面架构

```
首页(SplashScreen) → 点击恒星坍缩 → 工作区(Workspace)
                                         ├── 对话工作区 (ChatFlow)
                                         ├── OPC 工作模式 (OPCPanel)
                                         └── 工作统计 (StatsDashboard)
```

---

## 设计系统

### 色彩
- 暖琥珀 `--glow-warm: #e89840`（强调、主要交互）
- 冷靛 `--glow-cool: #6088d8`（辅助、冷色调）
- 极光紫 `--glow-aurora: #9880d0`（点缀、过渡）
- 深空底 `--space-deep: #050a14`
- 面板 `--space-panel: #0a1228`

### 10 套内置主题
深空观测者 / 原子实验室 / 量子花园 / 星云漂流 / 太阳熔炉 /
水晶洞穴 / 虚空信号 / 锈蚀密室 / 光子场 / 深海虚空

### 字体层级
- Display 标题: GeistPixel-Line（像素风）或 ZCOOL QingKe HuangYou（毛笔）
- Body 正文: Geist Sans (无 CJK，fallback 到系统字体)
- Mono 代码: Geist Mono

### edge-glow 系统
CSS `@property --glow-angle` 驱动旋转锥形渐变边缘辉光，四级强度:
`.edge-glow` / `.edge-glow-strong` / `.edge-glow-subtle` / `.edge-glow-pulse` / `.edge-glow-sweep`

### 禁止
- 玻璃拟态 (backdrop-blur 装饰性使用)
- emoji 作为功能性图标
- 纯黑 `#000` 或纯白 `#fff`
- bounce/elastic 缓动（除非品牌刻意）
- Inter/Roboto/Arial 等通用字体

---

## 关键设计决策

1. **全部客户端组件**：无 SSR 内容，页面 `force-dynamic`
2. **sessionStorage 持久化**：进入状态、当前会话、API 统计
3. **localStorage 持久化**：对话历史、自定义模板、主题偏好
4. **CSS 变量主题切换**：`document.documentElement.dataset.theme` 属性驱动
5. **API 转发模式**：`AGENT_BACKEND_URL` 环境变量 → Coze 代理，未配置时 Mock
6. **Three.js 粒子系统**：不使用 postprocessing bloom，用 AdditiveBlending + 软光晕纹理
7. **星环 CSS 实现**：不用 Three.js Canvas，用 CSS `rotateX` 透视 + `border-radius: 50%`

---

## 文件结构速查

```
app/
├── api/agent/route.ts          — POST /api/agent (转发/Mock/FormData)
├── lib/
│   ├── needsUnoptimized.ts     — blob: URL 检测
│   ├── notify.ts               — Notification API + Web Audio 提示音
│   └── tracker.ts              — API 调用追踪 (localStorage)
├── globals.css                 — 全局样式 (~900行: 10主题+edge-glow+组件)
├── layout.tsx                  — 根布局 (Geist+ZCOOL+GeistPixel 字体)
├── page.tsx                    — 入口 (force-dynamic → HomeClient)
├── manifest.ts                 — PWA manifest
├── components/
│   ├── SplashScreen.tsx        — Canvas 像素首页 (恒星+星云+GSAP爆炸)
│   ├── HomeClient.tsx          — 根组件 (页面路由+状态+背景层)
│   ├── PageSwitch.tsx          — CSS transition 页面切换
│   ├── StarfieldBackground.tsx — Three.js 粒子 (680粒+星座连线+生命周期)
│   ├── OrbitRings.tsx          — CSS 星环 (5层+恒星+随机参数+GSAP脉冲)
│   ├── CursorTrail.tsx         — Canvas 鼠标拖尾+涟漪 (主题色缓存)
│   ├── PixelTitle.tsx          — 可拖拽 GeistPixel 标题
│   ├── ChatFlow.tsx            — 对话主组件 (消息/API/持久化/导出/通知)
│   ├── ChatInput.tsx           — 悬浮胶囊输入 (文件/模板填充)
│   ├── ResultCard.tsx          — 视频/图片结果卡片+Lightbox
│   ├── SettingsDrawer.tsx      — 右侧抽屉 (10主题+参数)
│   ├── LeftSidebar.tsx         — 左侧栏 (历史/文件/返回首页)
│   ├── StatsDashboard.tsx      — Canvas 甘特图统计 (主题色跟随)
│   ├── OPCPanel.tsx            — OPC 工作区 (模板管理/风格/参数)
│   ├── LayerStack.tsx          — Z轴背景层 (env-bg+空间纹理+网格)
│   └── ServiceWorkerRegister.tsx
```

---

## 开发约定

1. **先问后做**：修改文件前先确认方案
2. **增量修改**：优先编辑现有文件，避免新建
3. **视觉优先**：深空原子朋克 > 功能完整性
4. **动效用 GSAP/anime.js**：复杂编排用 GSAP timeline，微交互用 anime.js
5. **颜色用 CSS 变量**：禁止硬编码色值，始终使用 `var(--glow-warm)` 等
6. **组件加 edge-glow**：卡片/面板/输入框边缘辉光
7. **字体用 GeistPixel**：标题和标签优先使用
8. **主题跟随**：Canvas 绘制需读 CSS 变量并监听 `data-theme` 变化
9. **SSR 安全**：所有浏览器 API 调用包裹 `typeof window !== "undefined"`
10. **localStorage/sessionStorage**：统一在 `app/lib/` 下封装

---

## 可用 Skills 速查

| 场景 | Skill |
|------|-------|
| UI 设计/组件创建 | `frontend-design` |
| 设计审查/打磨 | `impeccable` |
| 风格配色 | `ui-ux-pro-max` / `theme-factory` |
| 视觉调校 | `design-taste-frontend` |
| 动效优化 | `gpt-taste` / `high-end-visual-design` |
| 代码审查 | `review` / `simplify` |
| Word 文档 | `docx` |

---

## Agent 汇总文件夹关键路径

- 系统提示词: `README/最终版人设与逻辑.md` / `混剪模式系统提示词.md` / `连贯模式系统提示词.md`
- 技术文档: `tech_doc.md` / `README/腾昇智和-video智能体技术文档.docx`
- 知识库: `我们构建的知识库/` (xlsx/csv/docx 表格 KB + 口语桥接层)
- Coze 原理: `README/Coze知识库调用README.md`
- Python 脚本: `代码/` (KB 优化/命中率测试/DOCX 生成)

---

## 后端对接待办

- [ ] 配置 `COZE_API_KEY` / `COZE_BOT_ID` / `COZE_BASE_URL`
- [ ] Express 后端或直接 Next.js route 调用 Coze API
- [ ] 鉴权 + 速率限制 + 日志追踪
- [ ] SSE 流式响应支持
