# DeepSeek Harness Desktop 架构与 UI 设计分析报告

> 数据来源：`git clone https://github.com/anywhere-labs/deepseek-harness-desktop.git`（master，v2.0.1）
> 分析日期：2026-08-17
> 用途：作为腾昇智和 Agent 桌面端（Electron）能力提升的架构 + UI 设计借鉴点

---

## 一、总体定位

DSH Desktop 是**社区维护**（非 DeepSeek 官方）的桌面封装，把 DeepSeek Harness 的本地 Web UI、Host 服务和插件系统装进原生桌面应用。它的核心定位（`README.md` + `docs/why-desktop.md`）：

> **不是重新实现 Harness，而是把同一个运行时放进一个容易启动、容易管理、符合操作系统习惯的应用里。**

- 官方 Harness 以**固定版本原样运行**（git submodule 锁定）
- Desktop 负责：窗口、托盘、终端、更新、工作配置（profile）
- Desktop 自己就是一个合法的 DSH 插件（`dsh-plugin-desktop`），通过官方插件机制组合进同一个运行时

**平台**：Windows x64 + macOS Apple Silicon，Electron + Node + pnpm + 固定版本 DSH 依赖，下载即用，无需装命令行环境。

---

## 二、技术栈与工程结构

| 维度 | 内容 |
|------|------|
| 外层仓库 | Yarn 4.18 workspaces（`dsh-plugin-desktop` 是唯一 workspace） |
| 子模块 | `deepseek-harness/` 保持自己的 pnpm workspace（不动上游） |
| 桌面代码 | `dsh-plugin-desktop/`（TypeScript，ESM） |
| 打包 | Electron Builder + `app.asar`（需物理 unpack 的依赖放 `app.asar.unpacked`） |
| 测试 | Vitest（profile loader smoke + host service fixture） |
| 版本 | v2.0.1，`packageManager: yarn@4.18.0` |

```
deepseek-harness-desktop/
├── deepseek-harness/          git submodule（上游固定版本）
├── dsh-plugin-desktop/        桌面插件（核心代码）
│   ├── src/
│   │   ├── main.ts            Electron 启动入口（bootstrap）
│   │   ├── electron-runtime.ts  Electron 原生运行时适配器
│   │   ├── runtime.ts           DesktopRuntime 接口定义
│   │   ├── profile.ts           桌面 profile 组合
│   │   ├── profile-manager.ts   profile 选择状态管理
│   │   ├── profile-service.ts   desktopProfiles 公开 service
│   │   ├── pnpm.ts              内置 pnpm 能力（desktopPnpm service）
│   │   ├── terminal.ts / desktop-terminal.ts  内置终端
│   │   ├── window-chrome.ts / window-options.ts  无边框窗口
│   │   ├── tray-icons.ts        系统托盘
│   │   ├── update-checker.ts / update-download.ts / updates.ts  更新
│   │   ├── windows-acl-runner.ts / windows-pwsh-sandbox.ts  Windows 沙箱
│   │   ├── shutdown.ts          退出协调
│   │   ├── module-resolution.ts / packaged-runtime-path.ts  打包运行时解析
│   │   └── client/              渲染层（UI）
│   │       ├── index.ts         渲染层入口（apply）
│   │       ├── advanced-shell.ts  高级模式装配
│   │       ├── AdvancedFrame.tsx   高级模式根框架组件
│   │       ├── layout-service.ts / layout-state.ts  布局服务/状态
│   │       ├── theme-presenter.ts  主题投影
│   │       ├── styles.ts         内联样式
│   │       ├── environment.ts    环境校验
│   │       ├── contracts.ts      槽位/服务类型契约
│   │       └── boot-health.ts    渲染层启动健康上报
│   ├── cordis.patch.yml         桌面补丁（挂载 desktop-shell 等）
│   ├── docs/plugin-services.*.md  公开插件 service 契约
│   └── tests/fixtures/           smoke 测试插件
├── docs/                       架构/用户/插件/生态文档（中英双语）
├── scripts/verify-layout.mjs   布局校验
└── .agents/notes/              Agent Notes（决策记录）
```

---

## 三、架构总览

`docs/architecture.md` 的核心图：

```
User → Electron main/tray/window → Profile launcher → Host Cordis generation
     → Loopback HTTP + WebSocket → Sandboxed Web renderer
     → Upstream DSH services / Desktop-owned plugins / Third-party plugins
```

关键架构原则（`docs/architecture.md`）：

1. **薄 Electron 宿主**：Desktop 在 Electron main 进程启动官方 DSH Host，Host 通过 loopback HTTP/WebSocket 提供普通 Web UI。
2. **不另造 renderer IPC**：Desktop **不**把 Electron API 暴露给页面，**不**加 preload 或 Electron IPC bridge。
3. **同一 loopback carrier**：浏览器 UI 通过现有 loopback carrier 工作，不直接调 Electron。
4. **generation 边界**：任何 profile/mode 切换都 dispose 当前 generation，再启动新 generation。Service reference、窗口对象、subprocess handle 都不能跨 generation 缓存。

### 启动顺序（7 步，`docs/architecture.md:21-31`）

1. Electron 获取单实例锁，读 Desktop 私有 profile/mode 状态
2. Launcher 准备激活 profile（**不会为了列举 profile 而改写用户 profile**）
3. Launcher 提供 native runtime、`desktopProfiles` bootstrap、内置 pnpm 环境
4. Host Cordis root 启动 Loader entries（**Desktop service 在第三方插件可读取前注册**）
5. 官方 `dsh-base`、`dsh-web-app` + profile 中的第三方 bundle 组成 Web carrier
6. Host 绑定 loopback 端口，Electron 创建 BrowserWindow 加载同源页面
7. Web surface 加载成功后才创建托盘，提交 profile 的 last-known-good 状态

### 四层运行时（`docs/architecture.md:33-40`）

| 层 | 职责 |
|----|------|
| **Upstream Host** | agent/model/tool/session/settings/webServer/subprocess 等官方能力 |
| **Desktop Host** | 窗口、托盘、profile、终端、更新 + 两个公开 service |
| **Web Client** | 官方 Web UI + 第三方浏览器界面，通过 loopback carrier 工作 |
| **Native runtime** | Electron BrowserWindow、托盘、文件/网络/安装器适配 |

---

## 四、核心机制详解

### 4.1 兼容模式 vs 高级模式（双 UI 模式）

这是 Desktop 最核心的设计（`docs/why-desktop.md:30-32` + `docs/architecture.md:39`）：

- **兼容模式（compatibility）**：保留上游默认客户端。Client face 校验环境后直接返回，**不注册** Desktop layout、root、sidebar 或 conversation override。完全用官方 Web UI。
- **高级模式（advanced）**：安装 Desktop 自有的 layout、frame、原生材质，同时尊重上游和第三方 slot 组合。

切换模式通过托盘菜单「Switch to Advanced/Compatibility Mode」，本质是**重启**（dispose 当前 generation + relaunch）。`electron-runtime.ts:40-49` 的 `nextDesktopShellMode` / `modeToggleLabel`。

### 4.2 Profile 系统（`profile.ts` + `profile-manager.ts`）

Desktop 维护一个名为 `desktop` 的 profile（`profile.ts:34`），核心：

- **`ensureDesktopProfile`**（`profile.ts:172`）：初始化或修复持久化 profile，规范化 bundle 列表为 `[官方 bundles, ...第三方 bundle]`。
- **`prepareDesktopProfile`**（`profile.ts:292`）：组合一次桌面 generation——把桌面补丁插入到 `dsh-web-app` 层之后，应用 profile patch + home patch，平台门控 Windows 专属补丁（directory-picker browse + pwsh-sandbox）。
- **last-known-good 回滚**（`main.ts:301-320`）：启动失败时标记当前 profile failed，若存在 last-known-good 则 relaunch 到它，并弹出恢复通知。

**关键安全不变量**（`profile.ts:421-426`）：`webserver` 绑定 `host: '127.0.0.1', port: 0`（loopback-only），这是 launcher 的安全不变量，不是用户配置。

### 4.3 两个公开 plugin service（插件契约）

`dsh-plugin-desktop/docs/plugin-services.zh.md` 定义了第三方插件能用的**仅两个**公开 service：

| Service | 说明 | contract 路径 |
|---------|------|--------------|
| `ctx.desktopProfiles` | 读取/切换工作配置 | `dsh-plugin-desktop/profile-service` |
| `ctx.desktopPnpm` | 在当前配置中安装/更新/移除插件 | `dsh-plugin-desktop/pnpm` |

**刻意不暴露的**（`plugin-services.zh.md:126-136` + `why-desktop.md:38-43`）：
- `desktopRuntime`（窗口/托盘方法）—— Desktop 内部，第三方不得 inject
- `desktopPnpmBootstrap`（路径/ABI fact）—— launcher 私有
- 原始 Electron API / renderer / launcher bootstrap 状态——**全部不授予**

**设计哲学**（`why-desktop.md:24`）：稳定的边界比「什么都能访问」更容易升级和排错。第三方插件只能依赖它真正需要的 contract。

`desktopPnpm.run()` vs `runPlugin()` 的语义区别（`pnpm.ts:151-193` + `plugin-services.zh.md:106-111`）：
- `run()`：直接跑内置 pnpm，不承诺 profile 初始化 / 相对 source 锚定 / bundle reconcile
- `runPlugin()`：跑 `dsh plugin --profile <active>`，让上游 DSH 保持权威

**跨环境插件模式**（`plugin-services.zh.md:190-238`）：同一个 package 既要在普通 DSH 又在 Desktop 中激活时，用 `ctx.get('desktopProfiles')` 探测环境，存在则嵌套 `ctx.inject(['desktopPnpm'])`，不存在则挂载普通 DSH fallback。这是**优雅的渐进增强模式**。

### 4.4 内置 pnpm + 终端

`pnpm.ts` 的 `DesktopPnpm`（`pnpm.ts:121`）：通过 Electron `--import` 机制 + `ELECTRON_RUN_AS_NODE` 环境变量，用 Electron 的 Node 运行时跑内置 pnpm，**不修改用户全局 PATH**（`pnpm.ts:220-230` 的 env 构造）。一次只允许一个 package operation（`pnpm.ts:204`），完整进程树 teardown。

### 4.5 更新机制

`electron-runtime.ts:69-79` 的 `updates` adapter + `update-checker.ts`/`update-download.ts`：
- 用户确认后才下载（`confirmUpdateDownload`，`electron-runtime.ts:307`）
- macOS：下载 DMG → `shell.openPath` 打开 → 用户手动替换
- Windows：下载 NSIS → `launchWindowsUpdateInstaller`（`electron-runtime.ts:411`）spawn installer `--updated --force-run` → 退出当前进程

### 4.6 渲染层启动健康上报

`renderer-boot.ts` + `boot-health.ts`：渲染层 Loader 完成后通过 loopback endpoint `/_dsh/desktop/renderer-boot` POST 上报 `{status: healthy|failed, plugins, error}`。失败时弹出「Plugin Recovery」对话框（`electron-runtime.ts:241-258`），让用户打开终端修插件或重启。这是**桌面应用健壮性**的亮点——插件加载失败不白屏，而是可恢复。

---

## 五、UI 功能设计分析（重点章节）

### 5.1 高级模式根框架：AdvancedFrame

`AdvancedFrame.tsx`（`client/AdvancedFrame.tsx:24-103`）是高级模式的 UI 核心，一个**三栏网格布局**：

```tsx
<div className="dshDesktopFrame" style={{ gridTemplateColumns: `${sidebar}px minmax(0,1fr) ${details}px` }}>
  {/* macOS/Windows 标题栏占位行 */}
  <aside className="dshDesktopSidebarSurface">   {/* 左栏：上游 sidebar */}
  <main className="dshDesktopConversationSurface"> {/* 中栏：对话（minmax(0,1fr) 弹性） */}
  <aside className="dshDesktopDetailsSurface">    {/* 右栏：详情（可关闭） */}
  <div className="dshDesktopOverlay">              {/* 全屏 overlay（z-index 1000） */}
  {/* ResizeHandle 拖拽把手（sidebar + details） */}
</div>
```

**设计要点**：

1. **槽位（Slot）组合而非硬编码**（`advanced-shell.ts:48-57`）：Desktop 通过 `ctx.slots.register({ name: 'root', children: { sidebar, conversation, details, shell.overlay } })` 注册根槽位，`renderSlot('sidebar', {...})` 渲染上游内容。这意味着**上游的 sidebar/conversation/details 组件原样嵌入**，Desktop 只负责外层框架。这是「尊重上游 + 叠加自己」的关键。

2. **响应式状态管理用 `useSyncExternalStore`**（`AdvancedFrame.tsx:25-27`）：`layout.subscribe` + `layout.getSnapshot` 订阅外部布局状态。配合 `ResizeObserver`（`AdvancedFrame.tsx:35-43`）监听 viewport 宽度。

3. **窄屏自动折叠**（`AdvancedFrame.tsx:45-46`）：viewport < `SIDEBAR_AUTO_COLLAPSE`(1024px) 时 `layout.setNarrow(true)`，sidebar 折叠为 compact rail。

4. **切换会话自动关详情**（`AdvancedFrame.tsx:48-54`）：detailsSession 变化时 `layout.closeDetails()`。

5. **拖拽把手**（`ResizeHandle`，`AdvancedFrame.tsx:105-127`）：用 Pointer Events + `setPointerCapture` 实现，`onPointerMove` 根据 `side` 决定 `delta` 正负。纯 React，无第三方库。

### 5.2 布局状态：DesktopLayoutState

`layout-state.ts:66-125` 定义了一个**极简的可观察状态容器**：

- `snapshot` 不可变（`Object.freeze`），每次变更 `publish` 一个新 snapshot
- `subscribe`/`getSnapshot` 是标准 external store 接口（配 `useSyncExternalStore`）
- 状态字段：`sidebar`（0=compact rail）、`details`（0=closed）、`narrow`、`narrowExpanded`

**列几何算法** `computeDesktopColumns`（`layout-state.ts:43-59`）值得借鉴：
- 保护中央对话区最小宽度 `CENTER_MIN`(640px)
- 三档降级：全宽 → 压缩 details → 关闭 details
- 用 `clamp` 保证 sidebar `[264, 420]`、details `[300, 520]`

### 5.3 主题投影：DesktopThemePresenter

`theme-presenter.ts` 展示了「主题服务 → DOM」的干净投影：

- 订阅上游 `theme/change` 事件（`advanced-shell.ts:40`）
- `apply(snapshot)`：设 `color-scheme`、`data-ds-dark-theme` 属性、循环设置 CSS token 变量到 `document.body.style`
- 记录 `appliedTokens`，dispose 时只移除自己拥有的 DOM 状态（`dispose`，`theme-presenter.ts:31-37`）
- 同步 `<meta name="theme-color">` 为 `getComputedStyle(document.body).backgroundColor`（原生窗口标题栏颜色跟随主题）

### 5.4 原生窗口 chrome：无边框 + 拖拽区域

`styles.ts` 是**内联字符串样式**（不是 CSS 文件），配合 `window-chrome.ts` 的常量：

- **macOS**：`MACOS_TITLEBAR_HEIGHT=20`、`MACOS_DRAG_REGION_HEIGHT=32`、`MACOS_TRAFFIC_LIGHT_SAFE_WIDTH=80`（给红绿灯留位）
- **Windows**：`WINDOWS_TITLEBAR_HEIGHT=32`、`WINDOWS_CAPTION_CONTROLS_WIDTH=138`（给三个窗口控制按钮留位）

**拖拽区域用 CSS 伪元素**（`styles.ts:23-33`）：`::before` 伪元素 + `-webkit-app-region: drag` 实现标题栏拖拽区，避开 traffic lights / caption controls 的宽度。

**关键细节**（`styles.ts:38-43`）：
```css
button, input, textarea, select, a, [role="button"], [role="dialog"] { -webkit-app-region: no-drag; }
html:has([aria-modal="true"]) .dshDesktopFrame... { -webkit-app-region: no-drag !important; }
```
—— 用 `:has()` 选择器在有 modal 打开时禁用整个标题栏拖拽，避免 modal 被拖拽区遮挡。

**`prefers-reduced-motion: reduce`**（`styles.ts:44`）禁用过渡动画，无障碍考虑。

### 5.5 环境校验：parseDesktopClientEnvironment

`environment.ts:23-34` 展示了**运行时边界校验**的严谨：
- 从 URL query 读 `dsh-desktop-mode` / `dsh-desktop-platform`
- 用 `Set` 白名单校验，非法值 throw（fail loud）

### 5.6 类型契约：contracts.ts

`contracts.ts` 用 TS **声明合并**扩展上游类型：
- `declare module '@deepseek-ai/cordis'` 添加 `layout` service
- `declare module '@deepseek-ai/dsh-client-ui-slots'` 添加 `sidebar`/`conversation`/`details`/`shell.overlay` 槽位

这是「不修改上游、只扩展类型」的干净做法。

### 5.7 渲染层入口：apply + inject

`client/index.ts:23-38`：
- `inject = ['slots', 'sessions', 'theme']` 声明依赖
- `apply(ctx)`：解析环境 → 启动 boot reporter → 若 advanced 模式则 `applyAdvancedShell`
- 所有注册用 `ctx.effect()` 包裹，返回 disposer

---

## 六、对腾昇智和 Agent 的 UI/桌面端借鉴点

我们的项目也是 Electron 桌面端（`package.json` 有 `electron:dev`/`electron:build`），以下点可直接借鉴：

### 1. 「薄宿主 + 不改上游」的边界哲学（最重要）
Desktop **不重写上游 Web UI**，只做窗口/托盘/终端/profile。兼容模式完全不碰上游，高级模式只加外层框架 + 槽位嵌入。**对应我们**：Electron 壳只负责窗口生命周期，业务 UI 走 Next.js，不要为桌面端另写一套 UI。

### 2. Slot 组合而非硬编码
`ctx.slots.register` + `renderSlot` 让上游组件原样嵌入外层框架。**对应我们**：主应用的内容区应该是一个「槽位」，桌面端可注入自己的框架/侧栏/titlebar 而不改业务组件。

### 3. 双 UI 模式（兼容/高级）
通过「重启切换」而非「运行时切换」，dispose 整个 generation。**对应我们**：主题/布局切换若涉及原生 chrome，用重启而非热切换更安全。

### 4. 可观察布局状态 + useSyncExternalStore
`DesktopLayoutState` 的 `snapshot`/`subscribe`/`getSnapshot` 模式是 React 19 外部 store 的标准范式，比 `useState` + prop drilling 更适合「多处共享的布局状态」。

### 5. 原生窗口 chrome 的 CSS 处理
- 标题栏拖拽用 `-webkit-app-region: drag` + `::before` 伪元素
- 用 `:has([aria-modal])` 禁用 modal 下的拖拽
- 平台常量集中（`window-chrome.ts`）+ 内联字符串样式（`styles.ts`）

我们当前 `ProductShell.tsx` / `CursorTrail.tsx` 已有类似雏形，可对照加强。

### 6. 主题投影的「只移除自己拥有的 DOM 状态」
`appliedTokens` 记录 + `dispose()` 精确清理，避免主题切换残留脏状态。我们当前的 10 套主题切换（`document.documentElement.dataset.theme`）可参考这种精确清理。

### 7. 启动健康上报 + 可恢复失败
渲染层 boot 完成后上报，失败弹「Plugin Recovery」对话框（打开终端修/重启），不白屏。**对应我们**：Electron 加载 Next.js 失败时应有恢复路径（如回退到安全模式或显示诊断）。

### 8. 公开 service 契约的「最小暴露」
第三方插件只能访问 `desktopProfiles` + `desktopPnpm` 两个 service，其余全部私有。**对应我们**：若未来开放插件系统，先定义最小稳定契约，而非暴露内部对象。

### 9. last-known-good profile 回滚
启动失败自动回滚到上次正常 profile + 弹通知。**对应我们**：Electron 数据目录损坏时应有回滚/重建路径。

### 10. 内置运行时（不依赖用户环境）
内置 pnpm/Node 通过 `ELECTRON_RUN_AS_NODE` 跑，不修改用户 PATH。**对应我们**：打包时内嵌依赖，避免用户环境差异导致启动失败（我们已有「内嵌 Express + out/」的做法，可对标加强）。

---

## 七、结论

DSH Desktop 展示了一个**教科书级的 Electron 桌面封装**：
- **架构上**：薄宿主 + 不改上游 + 单 loopback carrier + generation 生命周期管理
- **UI 上**：slot 组合 + 三栏网格 + 可观察状态 + 原生 chrome CSS 处理 + 双模式
- **工程上**：最小公开契约 + 启动健康上报 + last-known-good 回滚 + 内置运行时

它与我们「腾昇智和」项目的 Electron 桌面端定位高度吻合（都是「Web 应用 + Electron 壳」），其「不重写 UI、只做原生集成层」的克制，以及「公开契约最小化」的插件边界设计，是我们后续桌面端能力提升最值得对齐的两个方向。
