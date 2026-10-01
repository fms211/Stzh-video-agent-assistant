# Stzh·video agent assistant

**让一个想法，成为一段有方向的创作。**

[English](README.md) · **版本 1.40** · [版本说明](docs/releases/v1.40.zh-CN.md)

腾昇智和是一个面向创作者的 AI 视频创作工作台。把需求、参考素材、模型、项目记忆和任务进度放在同一个 Web 空间里，从想法讨论到结果整理，减少工具之间的来回切换。

![Web工作台 · 本地UI模拟账号](docs/releases/images/v1.40/welcome.png)

## 一个工作台，四种创作方式

| 模式 | 用途 |
|---|---|
| Coze 创作 | 对接已发布智能体与工作流，提交创作需求、参考文件并查看任务结果 |
| 单助手 | 使用所选模型讨论创意、改写提示词或处理文字任务 |
| 工作流 | 分步骤组织创作过程，查看执行状态与已有结果 |
| 协作编排 | 配置角色与项目，让多个角色围绕同一创作任务协作 |

模型与角色中心支持多厂商连接配置、模型列表获取入口和角色管理。项目笔记、记忆排除与上下文检查帮助你了解这次请求实际使用了什么。任务中心、工作统计和创作画廊负责追踪与整理产出。

## 1.40：从观测窗口开始

- **居中待机 → 原位展开**：新对话聚焦星环中心；首次有效发送后，玻璃框展开为阅读区，标题缩小移到左上，消息轻量淡入。
- **可调边缘光**：在“个性化 → 对话边缘光”中实时调节辉光强度、光锥、敏感度、圆角、范围与颜色，支持主题配色和推荐值恢复。
- **银河与液态玻璃**：保留星环和银河鼠标交互，统一影灰玻璃、文字层次与圆角；支持减少动画和降低透明度。
- **可靠的会话边界**：历史恢复、项目选择和任务状态保留账户与会话归属；中文输入法确认候选词不会误发送。

## 本地启动

Node.js 22.18+（测试会直接加载 TypeScript）。源码包含 Web、Express 服务端与 Electron 包装；本版主要交付 Web。

```bash
git clone https://github.com/fms211/Stzh-video-agent-assistant.git
cd Stzh-video-agent-assistant
npm ci
npm --prefix server ci
```

根目录 `.env.local` 配置浏览器可访问的后端地址：

```dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
```

在 `server/.env.local` 设置以下字段，值仅保存在自己的机器上：

```dotenv
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
STZH_LLM_ENCRYPTION_KEY=replace-with-an-independent-random-secret
COZE_API_TOKEN=your-coze-token
COZE_BOT_ID=your-published-bot-id
COZE_BASE_URL=https://api.coze.cn
```

```bash
# 终端一：服务端
npm --prefix server start
# 终端二：Web
npm run dev
```

访问 `http://localhost:3000`。初次使用可以浏览和编辑草稿；实际提交需要登录。模型密钥在“模型与角色”配置。Coze 及模型功能需要对应厂商权限、网络和配额；没有配置时不能把排队或演示页面当成真实生成成功。

## 构建与验证

```bash
npm run build
npm run test:p0
```

构建输出在 `out/`。同源静态部署应把 `NEXT_PUBLIC_AGENT_BACKEND_URL` 设为空并重新构建；分域部署填写实际后端 HTTPS 地址。Electron打包需另行准备匹配ABI的SQLite原生绑定，本次源码发布不提供或验收新安装包，也不声称完成手机端验收。

## 使用边界与项目资料

模型列表获取受厂商兼容性和网络影响。视频生成、付费媒体与 Coze 生产配额验证不属于1.40本地 UI 验收。测试结果与延期项见版本说明；图片中的模拟回复只是布局验收。

- [产品范围](PRODUCT.md) · [设计说明](DESIGN.md) · [使用指南](USAGE.md)
- [后端配置](BACKEND_SETUP.md) · [项目记忆 API](docs/knowledge/studio-memory-api.md)
- [English release notes](docs/releases/v1.40.en.md)

视觉交互参考 [React Bits](https://reactbits.dev/) 与 [Aceternity UI](https://ui.aceternity.com/)，使用现有 Motion/GSAP 实现。第三方代码许可保留在 `public/licenses/`。本项目尚未提供统一的根目录开源许可证，不应据此推定所有源码可自由再分发。
