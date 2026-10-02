# 腾昇智和 · Video Workspace

基于 Coze 的 AI 短视频创作应用，包含 Next.js 前端、Express 后端、Electron 桌面入口、Expo/Capacitor 移动端和可选 RAG 服务。

## 环境与安装

- Node.js >= 20.9、npm。
- 后端使用 better-sqlite3 原生模块；如当前 Node.js 版本没有对应预编译包，需要本机编译环境。
- 移动端原生构建和 Electron 打包需要对应平台的开发环境。

```bash
git clone --branch feature/realtime-notifications-task-history --single-branch https://github.com/fms211/Stzh-video-agent-assistant.git
cd Stzh-video-agent-assistant
npm ci
npm --prefix server ci
```

## 本地运行

按需创建 `server/.env.local`，配置后端使用的 Coze 和鉴权参数：

```dotenv
COZE_API_TOKEN=your_token
COZE_BOT_ID=your_bot_id
COZE_BASE_URL=https://api.coze.cn
JWT_SECRET=your_random_secret
PORT=8080
```

前端连接地址可在根目录 `.env.local` 中设置：

```dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
AGENT_BACKEND_URL=http://localhost:8080
```

环境文件、用户数据库和密钥应保存在本地，不要提交。分别在两个终端启动：

```bash
npm --prefix server start
```

```bash
npm run dev
```

前端默认地址为 http://localhost:3000，后端为 http://localhost:8080。

## 验证与构建

```bash
npm run test:p0
npm run lint
npm run build
```

`test:p0` 包含前端/移动端接口契约及后端鉴权、实时通知、任务联动和配对测试。构建配置使用静态导出；生产服务入口为 `server/start.js`，部署说明见 deploy/。

桌面入口为 `electron/main.js`，现有打包命令是 `npm run electron:build`。图标重生成脚本 `npm run icons:generate` 需要本地设计母版 `design-assets/app-icon/final/`；常规运行直接使用仓库中保留的图标。

## 移动端与 RAG

```bash
npm --prefix Tszh-App ci
npm --prefix Tszh-App start
```

移动端源码位于 Tszh-App/app/ 和 Tszh-App/src/。`Tszh-App/www/` 是 Capacitor 配置的 Web 入口，因此随源码保留。通过移动端连接页面与桌面端配对。

RAG 服务为可选 Python 服务：

```bash
pip install -r rag-service/requirements.txt
npm run rag:start
```

`npm run rag:ingest` 加载外部知识库；运行前需按本机路径配置 `rag-service/ingest.py` 中的知识库和模型目录。

## 源码结构与说明

- app/、server/、electron/：主站、后端与桌面入口。
- Tszh-App/：移动端源码、配置、资源和许可证。
- rag-service/：检索服务及知识库导入源码。
- public/：字体、PWA 文件、图标和规范背景资源。
- scripts/、test/、server/test/：图标生成源码和现有测试。
- deploy/：部署脚本与指南；部署 ZIP 由构建/打包流程另行生成。

保留的使用说明：[USAGE.md](./USAGE.md)、[BACKEND_SETUP.md](./BACKEND_SETUP.md)、[服务器部署](./deploy/DEPLOY.md)、[Docker 部署](./deploy/DOCKER-DEPLOY.md)。

`hello-agents-fms` 是已有的外部仓库 Gitlink，应用启动不依赖其检出内容。

## 许可证

本项目为深圳职业技术大学比赛作品，仅供学习交流使用。移动端附带的许可证保留于 [Tszh-App/LICENSE](./Tszh-App/LICENSE)。
