# ⬡ 腾昇智和 · 一键 Video Workspace

> 基于 Coze 平台的 AI 短视频全链路自动生成智能体前端交互系统

## 项目简介

腾昇智和是一个面向非技术用户的 AI 短视频创作平台。用户通过自然语言对话，即可完成从创意构思到视频生成的全流程。系统采用"深空原子朋克"设计语言，以天文台控制室为核心隐喻，提供沉浸式的创作体验。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js (App Router) | 16.2.4 |
| UI 库 | React | 19.2.4 |
| 类型系统 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 4.x |
| 3D 渲染 | Three.js + R3F | r128+ |
| 动画 | GSAP + anime.js | 3.x |
| 后端 | Express | 5.1 |
| 数据库 | SQLite (better-sqlite3) | 12.10.0 |
| 桌面端 | Electron | 35.x |
| AI 引擎 | Coze v3 Chat API | — |
| LLM 集成 | 多模型 (DeepSeek/OpenAI/Anthropic/通义/Kimi/智谱/MiMo/Ollama) | — |

## 功能特性

### 核心功能
- **对话工作区 (ChatFlow)** — 多轮上下文对话 + SSE 流式响应 + 文件上传
- **OPC AI 创作助手** — 多模型 LLM + 6 个链式工作流 + 联网搜索 + 跨会话记忆
- **工作统计面板** — Canvas 甘特图 + 主题色跟随 + 按日/周/月聚合
- **用户认证** — JWT 鉴权 + bcrypt 密码哈希 + 10 年令牌有效期

### AI 能力
- **多模型支持** — 8 个 LLM 预设 (DeepSeek/通义/OpenAI/智谱/Kimi/Anthropic/MiMo/Ollama)
- **思考深度可调** — 快速/标准/深度/极深 四级
- **联网搜索** — Bing 服务端代理 + 30+ 触发词自动检测
- **链式工作流** — 全链路视频创作、提示词优化、风格调研、AB 对比、广告脚本、AIGC 趋势研究
- **对话压缩** — 超 40 条消息自动 LLM 摘要，保留最近 10 条
- **跨会话记忆** — opc_memory 表持久化，下次会话自动注入

### 视觉设计
- **10 套深空主题** — CSS 变量驱动，data-theme 属性切换
- **edge-glow 辉光系统** — CSS @property 旋转锥形渐变，四级强度
- **Three.js 粒子星空** — 680 粒子 + 星座连线 + 鼠标引力/斥力
- **GSAP 动画引擎** — 恒星坍缩爆炸 + ScrollTrigger + timeline 编排

### 数据持久化
- **12 张 SQLite 表** — 用户认证组 (6) + OPC/应用组 (6)
- **双写同步** — localStorage 立即写 + 服务端异步同步
- **全量持久化** — LLM 配置、用户偏好、通知、主题设置全部入库

## 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/stzh-agent.git
cd stzh-agent

# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，填入：
# AGENT_BACKEND_URL=http://localhost:8080
# COZE_API_KEY=your_key
# COZE_BOT_ID=your_bot_id
```

### 运行

```bash
# 启动后端 (端口 8080)
cd server && node server.js

# 启动前端 (端口 3000)
npm run dev
```

### 构建

```bash
# 静态导出
npm run build

# Electron 桌面打包
npm run electron:build
```

## 项目结构

```
├── app/                    # Next.js 前端
│   ├── api/                # API 路由
│   ├── components/         # React 组件 (35+)
│   ├── lib/                # 工具库 (LLM/持久化/搜索)
│   ├── globals.css         # 全局样式 (10主题+edge-glow)
│   ├── layout.tsx          # 根布局
│   └── page.tsx            # 入口页
├── server/                 # Express 后端
│   ├── server.js           # 独立开发模式入口
│   ├── server-express.js   # Electron 内嵌模式入口
│   ├── db.js               # SQLite 数据库 (12表)
│   ├── routes/             # 路由模块
│   └── services/           # 服务层 (Coze API)
├── electron/               # Electron 桌面打包
├── public/                 # 静态资源
├── scripts/                # 构建脚本
├── rag-service/            # RAG 检索服务 (Python)
├── ppt-assets/             # 演示文稿素材
├── slides/                 # 演示幻灯片
├── CLAUDE.md               # Claude Code 项目记忆
├── DATABASE.md             # 数据库技术说明
├── DESIGN.md               # 设计系统文档
├── PRODUCT.md              # 产品需求文档
└── README.md               # 本文件
```

## 文档

| 文档 | 说明 |
|------|------|
| [DATABASE.md](./DATABASE.md) | 数据库架构 (12表 + API + 同步层) |
| [DESIGN.md](./DESIGN.md) | 设计系统 (色彩/字体/edge-glow/主题) |
| [PRODUCT.md](./PRODUCT.md) | 产品需求与功能清单 |
| [USAGE.md](./USAGE.md) | 使用指南 |
| [BACKEND_SETUP.md](./BACKEND_SETUP.md) | 后端部署指南 |
| [AI助手设计文档.md](./AI助手设计文档.md) | OPC AI 助手设计说明 |

## 部署模式

| 模式 | 前端 | 后端 | 适用场景 |
|------|------|------|---------|
| 浏览器 | Next.js Dev (3000) | Express (8080) | 开发调试 |
| 生产 | 静态导出 (out/) | Express (8080) | 服务器部署 |
| 桌面 | Electron | 内嵌 Express | 无需 Node.js |

## 许可证

本项目为深圳职业技术大学比赛作品，仅供学习交流使用。

---

**腾昇智和** · 短视频智能体 · 全链路 AI 创作平台
