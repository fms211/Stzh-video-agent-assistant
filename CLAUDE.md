# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
| **前端界面** | `D:\fms688_stzh-Agent`（当前） | Next.js 16 + Express 后端 + Electron 桌面端 |
| **Agent 汇总** | `E:\HuaweiMoveData\Users\fms\Desktop\圳潮漫剧AIGC\腾昇智和Agent汇总` | Coze 智能体配置、知识库、系统提示词、Python 脚本 |

---

## 常用命令

```bash
# 开发
npm run dev              # Next.js 开发服务器 (webpack 模式)
npm run build            # Next.js 静态导出 (output: "export") → out/
npm run start            # 预览构建产物
npm run lint             # ESLint
npm run icons:generate   # 生成应用图标 (scripts/generate-app-icons.mjs)

# 测试（Node 内置 node:test，非 Jest/Vitest）
npm run test:p0          # 运行根测试 + 服务端测试（node --test test/*.test.js && npm --prefix server test）
npm --prefix server test # 仅服务端测试；单测: node --test server/test/<file>.test.js

# Express 后端（独立运行）
node server/start.js     # 启动 Express 后端（默认端口 80，读 server/.env.local）

# Electron 桌面端
npm run electron:dev     # 开发模式（自动启动 Express 后端 + Electron 窗口）
npm run electron:build   # 生产构建 → NSIS 安装包
npm run electron:build:portable  # 便携版

# RAG 服务（Python）
npm run rag:start        # 启动 RAG 服务 (rag-service/main.py)
npm run rag:ingest       # 知识库灌入

# Tszh-App 移动端（独立子项目）
cd Tszh-App && npx expo start   # Expo 开发服务器
```

---

## 技术栈

```
Next.js 16.2.4 (App Router, output: "export", force-dynamic)
React 19.2.4 (全客户端组件)
TypeScript 5 (strict)
Tailwind CSS 4 (@theme inline + CSS variables)
Three.js + @react-three/fiber + @react-three/drei
GSAP (ScrollTrigger, timeline)
motion (framer-motion 继任，"motion/react" 导出，6+ 组件使用)
GeistPixel-Line/Square + FusionPixel-12px 像素字体
ZCOOL QingKe HuangYou 毛笔字体
Express 5 (后端 API + 静态文件服务)
better-sqlite3 (本地数据库，WAL 模式)
Electron 35 (桌面端打包)
Expo / React Native (移动端，Tszh-App/)
```

---

## 核心架构：三运行时 + 三数据层

```
┌──────────────────────────────────────────────────────┐
│                    Electron Shell                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Next.js (静态导出 → out/)                       │ │
│  │  ├── 前端路由 (App Router)                       │ │
│  │  ├── /api/agent → 转发到 Express 或 Coze         │ │
│  │  └── /api/search → web-search.ts                │ │
│  └───────────────┬─────────────────────────────────┘ │
│                  │ HTTP                               │
│  ┌───────────────▼─────────────────────────────────┐ │
│  │  Express 后端 (server/server-express.js)         │ │
│  │  ├── /api/auth/*     (JWT 鉴权)                 │ │
│  │  ├── /api/conversations/* (对话 CRUD)            │ │
│  │  ├── /api/templates/*     (模板管理)             │ │
│  │  ├── /api/generations/*   (生成记录)             │ │
│  │  ├── /api/settings/*      (用户设置)             │ │
│  │  ├── /api/opc/*           (OPC 工作区)           │ │
│  │  └── POST /api/agent     (Coze API 转发/Mock)   │ │
│  └───────────────┬─────────────────────────────────┘ │
│                  │                                    │
│  ┌───────────────▼─────────────────────────────────┐ │
│  │  SQLite (better-sqlite3, server/db.js)           │ │
│  │  users / conversations / messages /              │ │
│  │  templates / generations / user_settings         │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘

云部署模式: node server/start.js → Express 服务静态文件 + API
```

### 数据持久化三层

1. **服务端 SQLite** — 主数据（对话/模板/用户），Express 路由操作
2. **localStorage** — 前端缓存 + 离线回退（对话历史/LLM 配置/主题偏好）
3. **sessionStorage** — 会话级状态（进入状态/API 统计）

前端采用"优先服务端，离线回退 localStorage"策略，见 `app/lib/sync.ts`、`app/lib/server-sync.ts`。

---

### 阶段 3 新增服务层

- **Coze Agent 桥接** — `server/agent-service.js` + `server/routes/agent.js`：Coze v3 直连（`POST /api/agent` JSON + `POST /api/agent/stream` SSE），并发上限 5，客户端断连中止。⚠️ 同名 `server/routes/agent.ts` + `server/services/coze.ts` + `server/types.ts` 是一组未被 `require` 的 TypeScript 实验分支（用 `.ts` 扩展名 import，普通 Node 无法解析），改代码时以 `.js` 为准
- **附件存储** — `server/attachment-service.js` + `server/routes/attachments.js`：`POST /api/attachments`（multer 内存），5 文件 / 20MiB 每文件 / 50MiB 每任务，用户隔离随机路径 + 孤儿清理
- **创意协作** — `server/creative-agent-service.js`（LangGraph `StateGraph`：supervisor → research+creative 并行 → review → finalize）+ `server/routes/creative-agent.js`，挂载 `/api/model-providers*`、`/api/model/chat`、`/api/agent-roles*`、`/api/creative-projects*`、`/api/agent-runs*`、`/api/admin/plugins`
- **任务租约队列** — `server/task-runtime.js` + `server/video-generate-executor.js`：租约式异步执行（全局并发 2 / 每用户 1，60s 租约 15s 续约，`video.generate` 任务类型）
- **运行时装配** — `server/task-runtime-bootstrap.js`（组合根：TaskRuntime + video executor + agent-run 联动 + 附件服务装配，供新入口调用）；`server/task-notifications.js`（任务状态 → 用户通知文案映射）；`server/agent-run-linkage.js`（任务 ↔ `agent_runs` 记录经 `sourceAgentRunId` 同步）
- **密钥加密 / 沙箱** — `server/lib/secret-crypto.js`（AES-256-GCM 加密模型 key）+ `server/dsh-poc.js`（隔离无头沙箱 PoC）

服务注入模式：router 优先取 `req.app.locals.<service>`，否则懒加载默认实例，便于测试覆盖（新测试注入 mock 的关键）。

DB 新表（`server/db.js`，require 时幂等迁移）：`tasks`（含租约列 `worker_id`/`lease_token`/`lease_expires_at`/`attempt_count`/`execution_mode`）、`task_attachments`、`attachment_cleanup_queue`、`devices`、`pairing_codes`、`creative_projects`、`agent_roles`、`project_role_team`、`agent_runs`、`agent_run_events`、`plugin_manifests`、`schema_migrations`。

---

## LLM 抽象层

`app/lib/llm-providers.ts` 定义 Provider 接口，`app/lib/llm-config.ts` 管理持久化（XOR 混淆存储 API key），`app/lib/llm-client.ts` 实现统一流式调用，支持：

- **OpenAI 协议**（GPT / DeepSeek / 通义千问等）
- **Anthropic 协议**（Claude）
- **thinking level**: quick / standard / deep（映射到各厂商的推理参数）

---

## OPC 创作助手子系统

`app/components/opc-agent/` 曾是独立聊天工作区，**2026-08 已精简**——原 `OpcAgentChat` / `OpcAgentSidebar` / `OpcAgentInput` / `OpcAgentPanel` / `OpcAgentMessage` / `ModelSwitcher` / `ModelConfigPanel` / `QuickActions` 8 个组件已删除，聊天 UI 并入 `ModelAssistantPanel.tsx`（创意工坊内）。现仅存：

- `WorkflowStepCard.tsx` / `ActionCards.tsx` — 工作流步骤卡与动作卡（`ModelAssistantPanel` 使用）
- `types.ts` — 共享类型（`opc-agent-persist.ts` 等引用）
- 独立 API 层 (`app/lib/opc-agent-api.ts`) + 持久化 (`app/lib/opc-agent-persist.ts`) 继续存活

OPC 数据走 Express `/api/opc/*` 路由。

---

## 页面架构

```
首页(SplashScreen) → 点击恒星坍缩 → 工作区(Workspace)
                                         ├── 对话工作区 (ChatFlow + CollaborativeRunPanel)
                                         ├── OPC 工作模式 (OPCPanel / OpcAgentChat)
                                         ├── 创意工坊 (CreativeStudio：OPCPanel + ModelAssistantPanel 双栏)
                                         ├── 模型与角色 (ModelRoleCenter)
                                         └── 工作统计 (StatsDashboard)
```

导航 Tab 由 `app/components/NavigationBar.tsx` 的 `Page` 联合类型定义：
`"chat" | "studio" | "modelCenter" | "tasks" | "stats" | "libtv" | "gallery"`。

`CollaborativeRunPanel` 内嵌在 `chat` 页 `ChatFlow` 上方，其 `onDispatch` 把用户确认后的最终指令注入 ChatFlow。

## 创意协作与模型配置（阶段 3）

⚠️ **两套并行模型配置栈**（未来改动最易踩坑，二者不共享状态）：

| 栈 | 组件 | 存储 | 加密 |
|----|------|------|------|
| 旧（客户端） | 承载 UI 已删除，仅存持久化层 `opc-agent-persist.ts`（`ModelAssistantPanel` 仍在用其分仓存储） | localStorage | XOR 混淆 |
| 新（服务端） | `ModelRoleCenter` / `ModelAssistantPanel` / `CollaborativeRunPanel` | SQLite `llm_providers` | AES-256-GCM（`server/lib/secret-crypto.js`） |

- 新栈 API key 为「只写」——保存后不回传，`redactProvider` 脱敏历史 `apiKey`
- 新前端组件通过 `app/lib/creative-agent-api.ts`（`creativeApi` 带 JWT 的 fetch）访问后端，无共享 client 状态层

---

## 设计系统

### 色彩（全部通过 CSS 变量，禁止硬编码）
- 暖琥珀 `--glow-warm: #e89840`（强调、主要交互）
- 冷靛 `--glow-cool: #6088d8`（辅助、冷色调）
- 极光紫 `--glow-aurora: #9880d0`（点缀、过渡）
- 深空底 `--space-deep: #050a14`
- 面板 `--space-panel: #0a1228`

### 10 套内置主题
深空观测者 / 原子实验室 / 量子花园 / 星云漂流 / 太阳熔炉 /
水晶洞穴 / 虚空信号 / 锈蚀密室 / 光子场 / 深海虚空

主题切换：`document.documentElement.dataset.theme = themeName`，Canvas 组件需监听 `data-theme` 变化。

### 字体层级
- Display 标题: GeistPixel-Line（像素风）或 ZCOOL QingKe HuangYou（毛笔）
- Body 正文: Geist Sans (无 CJK，fallback 到系统字体)
- Mono 代码: Geist Mono

### edge-glow 系统
CSS `@property --glow-angle` 驱动旋转锥形渐变边缘辉光:
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
2. **Next.js 静态导出**：`output: "export"` → `out/`，Express 服务这些静态文件
3. **API 转发模式**：前端 `/api/agent` → Express 后端 → Coze API，未配置时返回 Mock 数据
4. **Three.js 粒子系统**：不使用 postprocessing bloom，用 AdditiveBlending + 软光晕纹理
5. **星环 CSS 实现**：不用 Three.js Canvas，用 CSS `rotateX` 透视 + `border-radius: 50%`
6. **LLM key 混淆**：localStorage 中 API key 经 XOR 混淆后 Base64 存储（非加密，仅防肉眼）
7. **JWT 非阻塞**：Express 中间件有 token 就解析，没有也放行（部分接口可选鉴权）

---

## 环境变量

| 变量 | 位置 | 用途 |
|------|------|------|
| `AGENT_BACKEND_URL` / `NEXT_PUBLIC_AGENT_BACKEND_URL` | Next.js | Coze 代理地址 |
| `COZE_API_KEY` / `COZE_BOT_ID` / `COZE_BASE_URL` | server/.env.local | Coze API 直连 |
| `API_SECRET_KEY` | server/.env.local | Express API 鉴权 |
| `JWT_SECRET` | server/.env.local | JWT 签名密钥 |
| `PORT` | server/.env.local | Express 监听端口（默认 80） |
| `STZH_DATA_DIR` | Electron 注入 | SQLite 数据目录（userData） |
| `STZH_OUT_DIR` | Electron 注入 | 静态文件目录（out/） |
| `COZE_API_TOKEN` / `COZE_USER_ID` | server/.env.local | Coze v3 直连（新 `agent-service.js` 使用，区别于旧 `COZE_API_KEY`） |
| `STZH_LLM_ENCRYPTION_KEY` | server/.env.local | 模型 API key 加密密钥（≥32 字符，必需） |
| `STZH_ADMIN_USER_IDS` | server/.env.local | 管理员用户 ID 列表（插件管理门禁） |
| `DSH_HEADLESS_COMMAND` | server/.env.local | DSH 无头沙箱命令路径 |

---

## 开发约定

1. **先问后做**：修改文件前先确认方案
2. **增量修改**：优先编辑现有文件，避免新建
3. **视觉优先**：深空原子朋克 > 功能完整性
4. **动效用 GSAP + motion**：复杂编排用 GSAP timeline，微交互/入场用 motion（`"motion/react"`）
5. **颜色用 CSS 变量**：禁止硬编码色值，始终使用 `var(--glow-warm)` 等
6. **组件加 edge-glow**：卡片/面板/输入框边缘辉光
7. **字体用 GeistPixel**：标题和标签优先使用
8. **主题跟随**：Canvas 绘制需读 CSS 变量并监听 `data-theme` 变化
9. **SSR 安全**：所有浏览器 API 调用包裹 `typeof window !== "undefined"`
10. **localStorage/sessionStorage**：统一在 `app/lib/` 下封装

---

## Tszh-App 移动端

`Tszh-App/` 是独立的 Expo/React Native 项目（Capacitor 混合），有独立的 `package.json` 和 `tsconfig.json`。

- 技术栈: Expo Router + React Native + LinearGradient 新拟态风格
- 页面: 首页 / AI 聊天 / 模板 / 画廊 / 通知 / 个人中心 / 登录
- 与主项目共享后端 API，但 UI 完全独立

---

## 部署

- **云服务器**: `node server/start.js`（Express 服务 out/ 静态文件 + API）
- **Electron**: `npm run electron:build` → NSIS 安装包（内嵌 Express + out/）
- **PM2**: `deploy/ecosystem.config.js` 配置
- **端口**: 默认 80（云）/ 8080+（Electron 自动找空闲端口）
- **入口差异**: `server/start.js`（云入口，端口 80，挂 WebSocket + 陈旧任务回收 reaper + scheduler）vs `server/server.js`（旧入口，端口 8080，无 reaper/scheduler）；`server/app.js` 只是 `server-express.js` 的 re-export

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

## 仓库内文档约定

- `docs/` — 研究报告（`docs/research/`）与执行规划（`docs/superpowers/plans/`）
- `docs/superpowers/plans/` — **阶段 3 剩余工作的两份已锁定执行规划**（2026-08-28 Hermes 研究运行工作台/插件系统 20 Tasks；2026-08-29 创意工坊统一工作区/深空水玻璃 15 Tasks），实施须按其中 Task 顺序与验收门禁执行
- `更新md/` — 长期变更日志目录，每次更新须按 `更新md/模板.md` 记录；索引见 `更新md/README.md`
