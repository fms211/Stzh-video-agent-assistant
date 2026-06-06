# 腾昇智和前端交互页使用说明

本项目是一个用于展示与调用「腾昇智和」短视频智能体的前端交互页面：前端只调用本项目的 `/api/agent`，再由服务端转发到你的后端（你的后端再去调用 Coze 智能体 API），避免在浏览器暴露密钥。

## 1. 快速启动

### 1.1 本地运行

```bash
cd <项目目录>
npm run dev
```

打开：
- http://localhost:3000

Windows 说明：
- 由于部分 Windows 环境不支持 Turbopack，本项目已默认使用 Webpack 启动（`next dev --webpack`）。

### 1.2 构建与生产运行

```bash
npm run build
npm run start
```

## 2. 页面交互说明

### 2.1 全屏背景（Layer 0 环境基底）
- 页面采用四层 Z 轴堆栈：背景图（Layer0）→ 动态磨砂光波（Layer1）→ 交互星空粒子（Layer2）→ HUD 组件（Layer3）
- 上传图片后，图片会直接接管为全屏背景（cover + fixed），不再显示为“中心预览框”
- 空态时会显示星空呼吸底；如果存在 `public/backgrounds/hero.png`，它会作为默认背景叠在空态之上

### 2.2 智能体调用与结果展示
- 在“生成控制台”输入框输入需求并提交
- 成功后：
  - 若返回 `videoUrl`：展示可点击的视频 URL + 视频播放器
  - 若返回 `imageUrls`：展示“图片链接数组”（可点击打开）+ 图片网格预览，点击任意缩略图可放大预览
- 失败时：显示错误信息，并提供“重试”按钮（重试上一次提交）

### 2.3 底部 Dock（背景管理）
- 空态时：左下角显示“上传背景”胶囊按钮（折叠态），点击展开 Dock
- Dock 展开后支持：
  - 上传多张背景图（拖拽到页面也可）
  - 上一张/下一张切换
  - 选择指定背景
  - 比例（3:2 / 16:9）与适配（cover / contain）
  - 清空背景（清空后会回到折叠态入口）

## 3. 桌面快捷方式（PWA 安装）

本项目已提供 PWA 必要文件（manifest + service worker），你可以在浏览器里安装成“桌面应用”，生成可点击启动图标。

### 3.1 Chrome / Edge（Windows / macOS）
1. 用 HTTPS 或本地 `http://localhost:3000` 打开页面
2. 地址栏右侧会出现“安装”图标（或菜单里有“安装应用/安装此网站为应用”）
3. 安装后会在桌面/开始菜单/Launchpad 中出现图标，点击即可打开

### 3.2 macOS Safari
Safari 对 PWA 支持路径不同，通常使用：
- 分享 → 添加到程序坞 / 添加到主屏幕（不同版本略有差异）

## 4. 前端/服务端配置（你需要填写的地方）

### 4.0 默认背景图（可选）

本项目会默认尝试加载：
- `public/backgrounds/hero.png`（以 cover + fixed 方式作为全屏背景叠加）

你只需要把你的背景图片复制到：
- `<项目目录>/public/backgrounds/hero.png`

如果该文件不存在，页面会自动回退到星空呼吸底（不白屏）。

### 4.1 本项目的环境变量（Next.js）

本项目提供 `POST /api/agent` 作为前端调用入口。

你可以通过环境变量把它转发到你的后端：
- `AGENT_BACKEND_URL`

写法示例（推荐放到 `.env.local`，不要提交到仓库）：

```bash
AGENT_BACKEND_URL="https://your-backend.example.com"
```

转发规则：
- 本项目会把请求转发到 `${AGENT_BACKEND_URL}/api/agent`
- 如果你写的 `AGENT_BACKEND_URL` 已经以 `/api/agent` 结尾，则不会重复拼接

实现文件：
- Next 路由：[route.ts](file:///workspace/app/api/agent/route.ts)

### 4.2 你的后端需要提供什么接口（对接 Coze）

你的后端只需要提供一个 HTTP 接口：
- `POST /api/agent`

请求体（本项目当前发送）：

```json
{ "prompt": "用户输入文本" }
```

建议你的后端返回（最小兼容）：
- 视频结果：
  ```json
  { "requestId": "xxx", "createdAt": "2026-05-02T00:00:00Z", "videoUrl": "https://..." }
  ```
- 图片结果：
  ```json
  { "requestId": "xxx", "createdAt": "2026-05-02T00:00:00Z", "imageUrls": ["https://...", "https://..."] }
  ```

说明：
- `requestId` 用于前端显示与排查问题（建议每次请求生成）
- `createdAt` 可选，用于展示
- `videoUrl` 与 `imageUrls` 至少返回其一

## 5. 后端如何填写 Coze 的 API Key / Bot 信息（示例）

强烈建议把 Coze 的密钥与 Bot 配置放在后端环境变量中，不要发到前端。

一个常见的后端配置方式如下（变量名可自行调整）：

```bash
COZE_API_KEY="xxx"
COZE_BOT_ID="xxx"
COZE_BASE_URL="https://api.coze.cn"
```

你的后端在 `POST /api/agent` 里读取这些环境变量，调用 Coze 的智能体 API，把结果整理成前端需要的 `videoUrl` 或 `imageUrls` 返回即可。

如果你愿意，我可以在你指定的后端技术栈（Node/Express、NestJS、Python/FastAPI、Go 等）下，给你一份可直接运行的 `/api/agent` 示例实现，并把“Coze API Key/Token 应该写在哪里、如何注入到部署环境”写成对应的配置说明。

## 6. 常见问题

### 6.1 为什么要走“前端 → 本项目 /api/agent → 你的后端 → Coze”？
- 避免在浏览器端暴露 Coze API Key/Token
- 便于在后端做鉴权、限流、日志、缓存、格式标准化

### 6.2 我想让前端直接调用 Coze 可以吗？
不推荐。除非你有可以短期下发、可撤销、权限隔离的令牌机制，否则会有密钥泄露风险。
