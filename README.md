# 腾昇智和 · Video Workspace

AI 创作工作区与手机远程控制端。当前 `feature/realtime-notifications-task-history` 是源码分支，重点是桌面/手机任务联动、应用内实时通知和任务历史入口；包含 Web、Express、Electron、Expo/Capacitor 与可选 RAG 源码。

## 当前功能

| 能力 | 代码中已有的行为 |
| --- | --- |
| 创作工作区 | Coze 对话与流式输出、图片/视频结果展示、作品记录和模板；OPC 助手提供模型配置与工作流入口。实际生成需要配置可用的 Coze/模型服务。 |
| 账户与数据 | 注册/登录、JWT 鉴权、按账户隔离任务与会话；访客可浏览和配置，生成、云同步、配对与远程控制需要登录。 |
| 任务联动 | 创建任务、桌面认领/执行、进度与阶段展示、暂停/继续/取消/重试；状态通过 `task.updated` 更新，桌面另有 15 秒轮询兜底。 |
| 实时通知 | 后端把新增通知写入 SQLite 并广播 `notification.created`；手机通知页收到事件后刷新，保留 30 秒轮询，以及已读/全部已读/清空操作。这里指保持登录和连接时的应用内通知。 |
| 任务历史 | 桌面任务中心有“历史归档”入口、20 条分页与加载更多；手机任务列表也有分页、状态筛选和详情。当前归档筛选存在后端限制，见下文。 |
| 手机配对与桌面托盘 | 桌面生成配对二维码，手机连接同一后端并绑定设备；Electron 关闭窗口后保留托盘与后台联动服务，可从托盘退出。 |
| 定时任务 | `server/start.js` 启动到期任务检查与失联任务回收；桌面创作中心负责执行，后端调度器只发布到期状态。 |

通知创建和任务状态更新是不同事件；当前代码不能保证每个任务状态变化都会自动产生通知。

## 技术栈与前置条件

| 部分 | 当前依赖/入口 |
| --- | --- |
| Web | Next.js 16.2.4、React 19.2.4、TypeScript、Tailwind CSS 4；`app/` |
| 后端 | Express 5、SQLite/better-sqlite3、JWT、ws；`server/app.js` 为统一应用入口 |
| 桌面（可选） | Electron 35、electron-builder；`electron/main.js` |
| 手机（可选） | Expo 56、React Native 0.85、Expo Router；另保留 Capacitor 8 的 `www` 入口 |
| RAG（可选） | FastAPI、ChromaDB、sentence-transformers；`rag-service/` |

- 推荐 Node.js 22.18+ 或更新的兼容版本、npm。Next.js 最低要求为 20.9.0，但现有测试还会直接导入 `.ts`，需要 Node 的[类型剥离支持](https://nodejs.org/docs/latest-v22.x/api/typescript.html#type-stripping)。此前源码校验环境为 Node.js 25.9.0 / npm 11.12.1。
- `better-sqlite3` 需要匹配 Node 版本与系统的原生模块。没有预编译包时，Windows 需要 Python 和 Visual Studio C++ Build Tools。
- 构建时 `next/font/google` 会获取字体，需要可访问字体服务的网络。
- 运行基本界面、账户与任务接口不需要启动手机端、Electron 或 RAG。

## 快速开始：Web 开发

### 1. 获取本分支并安装依赖

```bash
git clone --branch feature/realtime-notifications-task-history --single-branch https://github.com/fms211/Stzh-video-agent-assistant.git
cd Stzh-video-agent-assistant
npm ci
npm --prefix server ci
```

根目录和后端各有锁文件，两处依赖都需要安装。

### 2. 配置后端

仓库没有跟踪 `.env.example`。按需手动创建 `server/.env.local`；以下均为占位值：

```dotenv
PORT=8080
JWT_SECRET=replace_with_a_unique_random_secret_at_least_32_chars
COZE_API_TOKEN=replace_with_your_coze_token
COZE_BOT_ID=replace_with_your_published_bot_id
COZE_BASE_URL=https://api.coze.cn
COZE_USER_ID=stzh_user
```

- `COZE_API_TOKEN` / `COZE_BOT_ID`：调用 Coze 时需要；只测试界面、账户和任务接口可以暂不填写。
- `JWT_SECRET`：若填写，至少 32 字符；若不设置，后端生成并持久化 `.jwt-secret`。不要把生成的数据或密钥提交到仓库。
- `COZE_BASE_URL` 默认 `https://api.coze.cn`；`COZE_USER_ID` 默认 `stzh_user`。
- 可选 `STZH_DATA_DIR` 指定 SQLite 和自动生成 JWT 密钥的目录；默认在 `server/`，Electron 使用其用户数据目录。

### 3. 配置开发前端

创建根目录 `.env.local`：

```dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
AGENT_BACKEND_URL=http://localhost:8080
```

`NEXT_PUBLIC_AGENT_BACKEND_URL` 是浏览器访问 Express HTTP/WebSocket 的地址；开发时必须指向后端，而不是 Next.js 的 3000 端口。`AGENT_BACKEND_URL` 是 Next 开发 API 的服务端转发地址；如后端代理需要鉴权，可另设 `AGENT_API_KEY`。

公开前端变量只放服务地址。Coze、LLM 和搜索密钥应通过后端环境或对应的模型配置流程管理。

### 4. 分别启动后端与前端

终端一（在仓库根目录）：

```bash
npm --prefix server start
```

终端二：

```bash
npm run dev
```

打开 `http://localhost:3000`；后端健康检查为 `http://localhost:8080/health`。注册/登录后进入任务中心；配对手机时，手机应使用电脑的局域网地址和后端端口，且网络能访问该端口。

需要观察后端文件变化时可用 `npm --prefix server run dev`。这两个后端 npm 入口均使用 `server/server.js`，包含 HTTP 与 WebSocket，但不会自动启动定时调度和失联任务回收；需要这些行为时使用下面的 `server/start.js` 入口，避免同时占用同一端口。

## 生产运行：静态前端 + Express

`next.config.ts` 设置了 `output: "export"`。构建产物在 `out/`，由 Express 提供静态文件和 API；当前根目录 `npm run start` 虽然存在，但其 `next start` 命令不适用于这个导出配置。

构建前，移除根目录 `.env.local` 中开发专用的 `NEXT_PUBLIC_AGENT_BACKEND_URL`，或改成真实生产后端地址。该变量会写入前端构建产物：使用同源 Express 部署时保持未设置即可；`AGENT_BACKEND_URL` 只用于 Next 服务端转发，不替代静态前端的连接配置。

```bash
npm run build
node server/start.js
```

`server/start.js` 会加载 `server/.env.local`：设置 `PORT=8080` 时访问 `http://localhost:8080`，未设端口时默认 80。它同时启动 WebSocket、15 秒定时任务检查和失联任务回收。部署后端时保留 `server/` 及其依赖、`out/`、数据库/密钥的持久化目录；可用 `STZH_OUT_DIR` 指向其他静态产物目录。

发布到公网前配置 HTTPS/WSS 与持久化存储。`deploy/` 内保留的打包、PM2 和 Docker 说明有历史路径与文件清单假设，应按实际部署目录检查；本分支没有现成 Dockerfile、Compose 或 GitHub Actions 部署流水线。

## 可选组件

### Expo 手机端

```bash
npm --prefix Tszh-App ci
npm --prefix Tszh-App start
```

在手机应用的连接页设置后端地址，登录与桌面端相同的账户，再扫描桌面配对二维码。示例为 `http://<电脑局域网 IP>:8080`；真机的 `localhost` 指向手机本身。代码内默认服务器地址仅是开发示例，需要覆盖。

对应的原生入口脚本是 `npm --prefix Tszh-App run android` 和 `npm --prefix Tszh-App run ios`，分别需要 Android 开发环境和 macOS/Xcode。`Tszh-App/capacitor.config.ts` 另将 `www/` 指定为 Capacitor Web 入口，这 7 个 HTML 不属于可以随意删除的构建缓存。

### Electron 桌面端

```bash
npm run build
npm run electron:dev
```

Electron 内嵌 Express 并从 8080 起寻找可用端口，直接展示构建后的 `out/`，不是 Next.js 热更新模式。其入口未启动 `server/start.js` 中的调度器/回收器。

Windows 打包脚本为 `npm run electron:build` 或 `npm run electron:build:portable`，输出到 `dist/`。现有配置要求 `build/icon.ico`，当前源码分支没有该文件；`npm run icons:generate` 还需要未随仓库提供的 `design-assets/app-icon/final/` 母版。因此桌面打包不能视为克隆后即可完成。

### RAG 检索服务

```bash
python -m pip install -r rag-service/requirements.txt
npm run rag:ingest
npm run rag:start
```

导入前先按本机环境调整 `ingest.py` 的 `KB_ROOT` / `MODEL_CACHE`，并检查 `retriever.py` 的模型缓存路径；知识库和模型未随源码提供。`rag:ingest` 会重建知识库集合，应在准备好的外部数据上执行。

服务默认监听 5000；Web 客户端访问 `http://localhost:5000`，手机经 Express 的 `/api/rag/*` 代理访问。RAG 的现有 CORS 只允许 localhost 的 3000/3001 开发地址，其他部署方式需要额外配置。

## 源码目录

```text
app/                 Web 页面、组件、任务中心、创作/同步工具
server/              统一 Express 应用、SQLite、HTTP API、WebSocket、调度
electron/            桌面窗口、内嵌后端、托盘
Tszh-App/            Expo/Capacitor 配置、移动源码、www、字体图标
rag-service/         检索、导入和 Wiki 知识层源码
public/              PWA、图标、字体与规范背景资源
scripts/             图标生成脚本
test/                Web/手机接口与 UI 契约测试
server/test/         鉴权、任务联动、配对与实时连接测试
deploy/              部署参考脚本和说明
```

源码分支已移除演示文稿、设计截图、资料副本和部署 ZIP，README 不依赖这些材料。`hello-agents-fms` 是保留的外部仓库 Gitlink，常规应用启动不依赖其检出。

## 测试与当前限制

```bash
npm run test:p0
npm --prefix server test
npm run lint
npm run build
```

`test:p0` 已包含后端测试；第二条可单独验证后端。此前源码清理校验中，21 项前端/手机契约测试与 14 项后端测试通过，生产构建通过；这不是移动真机、Electron 安装包或真实 Coze/LLM 调用的验证。

当前代码还需要注意：

- **历史归档筛选尚不完整。**桌面传入 `completed,failed,cancelled`，但 `db.taskList` 目前按单个 `status = ?` 查询；归档入口可能返回空结果。`/api/tasks` 的 `total` 也是账户全部任务数，不是筛选后的总数。分页/筛选入口已存在，不能据此认为完整归档查询已验证。
- **任务执行依赖桌面在线。**定时调度只唤醒任务，实际 Coze 创作由桌面任务中心认领执行；不同启动入口是否包含调度器见上文。
- **静态导出需要 Express API。**Next 开发 API 路由不会变成静态后端；生产时通过 Express 提供业务接口。
- **Lint 有既有问题。**此前校验报告 280 个错误、109 个警告；测试和构建通过并不表示 lint 全部通过。
- **可选打包/检索有外部条件。**桌面图标母版、原生平台环境、RAG 模型与知识库需要另行准备。旧的 `USAGE.md`、`BACKEND_SETUP.md` 和部署指南部分内容未完全同步，启动方式以本 README 和现有入口代码为准。

## 许可证

本项目为深圳职业技术大学比赛作品，仅供学习交流使用。已有许可证文件保留于 [Tszh-App/LICENSE](./Tszh-App/LICENSE) 和 [.claude/skills/algorithmic-art/LICENSE.txt](./.claude/skills/algorithmic-art/LICENSE.txt)。
