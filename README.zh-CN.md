# Stzh·video agent assistant

**从创意讨论到任务追踪，把 AI 视频创作放进同一个工作台。**

[English](README.md) · **版本 1.40** · [发布与验收记录](docs/releases/v1.40.zh-CN.md)

腾昇智和面向短视频与 AIGC 创作者：统一管理提示词、参考文件、模型连接、项目记忆、角色和结果。当前为 **Web 阶段四收尾、本机验收完成部分已发布**；部分外部服务、真实媒体生成和手机端阶段五仍待完成，尚非全链路生产验收。

![1.40 创作工作台](docs/releases/images/v1.40/welcome.png)

## 功能：在哪里做什么

- **Coze 创作**：选择风格、运镜、时长和画幅，上传参考文件，关联项目与记忆；跟踪服务端任务、恢复历史、重试、导出对话。观测卡原位展开，支持Markdown、代码、表格和媒体结果。
- **单助手**：用自己的模型讨论创意、改写提示词；维护历史、摘要与草稿，查看本次上下文并导出Markdown。
- **工作流与研究**：创作、优化、研究、脚本链式流程，分步结果与恢复记录；风格研究先生成计划，经确认后执行，独立工作台保留来源、过程和报告。项目插件可贡献工具或工作流。
- **协作编排**：选择项目、角色编队及节省／标准／深入预算，讨论、审校、编辑最终指令并转交Coze，保存运行历史；个人角色支持提示词、能力标签、默认模型和启停。
- **模型与角色中心**：MiMo、DeepSeek、OpenAI、Anthropic、通义千问、硅基流动、OpenRouter和自定义预设；官网与API地址分别编辑，获取、搜索、选择模型，调整输出与上下文限制、保存或取消。密钥服务端加密、连接按账号隔离；官网链接不能代替模型API。
- **项目记忆与上下文**：项目笔记、用户／项目记忆、启用、临时排除和请求检查，保留四模式的账号、项目与会话边界。默认 `shadow` 为观测模式，不等于强制注入，实际范围看运行配置。
- **任务、通知与设备**：排队／运行／暂停／完成／失败状态，筛选、暂停、取消、重排；WebSocket同步配合轮询校准，提供手机配对入口。接口已存在，手机完整体验尚未验收。
- **统计与画廊**：成功媒体任务的日／周／月趋势和活动日历；视频／图片筛选、已有结果预览、下载。文本任务不计入媒体统计，历史播放取决于原链接可用性。
- **插件中心**：发现、来源安装、权限选择、账户插件库、项目启用、恢复诊断；区分系统受信登记与账户安装包，第三方工具各自配置和联调。
- **个性化**：主题、壁纸、液态玻璃、保留星环的鼠标交互银河、可调边缘光、圆角开关、统一文字；减少动画／透明度、键盘关闭和焦点恢复。1.40新增银色标题扫光、原位展开及状态辉光。

## 功能截图

均为当前Web界面；本地模拟账号、静态素材、访客／空状态展示布局，**不代表调用模型或生成视频**。按组展开，全部保留；见[截图来源与范围](docs/releases/images/v1.40/features/README.md)。

<details open>
<summary>创作：Coze、单助手、工作流、研究与协作</summary>

![Coze 对话与历史](docs/releases/images/v1.40/features/coze.png)
![单助手：模型未配置](docs/releases/images/v1.40/features/assistant.png)
![工作流选择](docs/releases/images/v1.40/features/workflow.png)
![研究计划入口](docs/releases/images/v1.40/features/research.png)
![协作编排：访客入口](docs/releases/images/v1.40/features/collaboration.png)

</details>
<details>
<summary>管理：模型、角色、插件、记忆与账号</summary>

![模型表单](docs/releases/images/v1.40/features/models.png)
![角色库](docs/releases/images/v1.40/features/roles.png)
![插件中心](docs/releases/images/v1.40/features/plugins.png)
![记忆与临时排除](docs/releases/images/v1.40/features/memory.png)
![登录入口](docs/releases/images/v1.40/features/login.png)

</details>
<details>
<summary>产出与外观：任务、统计、画廊、主题、银河与辉光</summary>

![任务中心：模拟任务](docs/releases/images/v1.40/features/tasks.png)
![统计：无媒体任务](docs/releases/images/v1.40/features/statistics.png)
![画廊：空状态](docs/releases/images/v1.40/features/gallery.png)
![主题设置](docs/releases/images/v1.40/features/appearance.png)
![银河参数](docs/releases/images/v1.40/features/galaxy.png)
![辉光参数与预览](docs/releases/images/v1.40/glow-settings.png)

</details>

## 技术栈与上下游

```text
Web / Electron / Expo 客户端
 → Express API + JWT → SQLite、附件、任务执行器、WebSocket
 → 模型适配 / LangGraph协作 / 研究运行时 / 项目插件
 → Coze Bot与工作流 / OpenAI兼容或Anthropic模型 / 可选Python RAG
 → 文本、分镜、提示词、媒体URL → 对话、任务、统计、画廊、导出
```

| 层次 | 技术与用途 |
|---|---|
| Web | Next.js **16.2.4**静态导出、React **19.2.4**、TypeScript、Tailwind CSS 4；React Aria Components交互、Lucide图标 |
| 视觉 / 内容 | Motion、GSAP / @gsap/react；Three.js、React Three Fiber / Drei、OGL；react-markdown、remark-gfm、rehype-highlight / sanitize。React Bits / Aceternity为视觉及注明来源的实现参考 |
| 后端 / 安全 / 数据 | Node.js、Express 5、CORS、dotenv；SQLite / better-sqlite3、JWT / jsonwebtoken、bcryptjs、Node crypto AES-256-GCM；Multer上传、ws实时通信、Undici HTTP |
| 编排 / 插件 / 导出 | @langchain/langgraph状态图，自有TaskRuntime、研究运行时及插件子进程；AJV契约、semver / tar / yauzl版本归档；docx、pptxgenjs / pptx-automizer、qrcode文档、演示与配对能力 |
| 下游 | Coze Bot / Workflow API、OpenAI兼容和Anthropic Messages多厂商模型；搜索、网页读取等研究工具依赖具体适配器或插件及各自配额 |
| 可选 RAG | Python、FastAPI / Uvicorn、ChromaDB、Sentence Transformers / BAAI bge-large-zh-v1.5；pandas、openpyxl、python-docx；检索、Wiki式组织、MQE / HyDE按配置启用 |
| 桌面 / 手机 | Electron 35、electron-builder；Expo 56、React Native 0.85、Expo Router、AsyncStorage、WebView、相机／通知／手势／安全区组件，含Capacitor安卓依赖。源码存在不等于本版安装包或手机已验收 |
| 开发 / 验证 | npm锁文件、Node test runner、Playwright依赖、ESLint 9、TypeScript与Next构建；另有原生浏览器操作验收记录 |

全部直接依赖和精确版本见[Web](package.json)、[服务端](server/package.json)、[手机端](Tszh-App/package.json)、[RAG](rag-service/requirements.txt)及锁文件。`hello-agents-fms/`是参考资料，非启动依赖。

## 克隆、配置与启动

需要Git、Node.js **22.18+**和npm；Python仅RAG需要。SQLite为原生依赖，安装失败需匹配Node版本和平台编译环境。

```bash
git clone https://github.com/fms211/Stzh-video-agent-assistant.git
cd Stzh-video-agent-assistant
npm ci
npm --prefix server ci
```

1. 根目录新建 `.env.local`：

```dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
```

2. 以下命令运行**两次**，把不同结果填入 `server/.env.local`。两项密钥至少32字符，不要随意更换，以免会话失效或模型密钥无法解密。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

```dotenv
JWT_SECRET=填入第一项随机结果
STZH_LLM_ENCRYPTION_KEY=填入第二项随机结果
PORT=8080
# 真实Coze执行才需以下项；密钥不要放进NEXT_PUBLIC变量
# COZE_API_TOKEN=你的令牌
# COZE_BOT_ID=已发布Bot的ID
# COZE_BASE_URL=https://api.coze.cn
```

3. 两个终端分别启动，访问 **http://localhost:3000**：

```bash
# 终端一
npm --prefix server start
# 终端二
npm run dev
```

4. 注册自己的账号并登录 → 模型中心选厂商、填API地址与密钥、获取并选模型、保存 → 工坊选模式、项目和参数 → 提交 → 任务中心、画廊查看结果。Coze需发布、权限与余额；未配置执行器时任务不会自行生成媒体。新克隆没有开发者账号或历史库。

**静态部署**：本项目 `output: export`，用Express托管 `out/`，不要用 `npm start`（`next start`）。将根目录 `.env.local` 改为 `NEXT_PUBLIC_AGENT_BACKEND_URL=`（留空），清除终端同名旧变量：

```bash
npm run build
npm --prefix server start
```

访问 **http://localhost:8080**。分域部署在构建前填实际HTTPS API地址；修改公开变量需重建。数据库默认 `server/stzh.db`，`STZH_DATA_DIR`可切换目录；换端口或验收库不会迁移账号。18080/18081是开发者预览，不是默认端口。

<details>
<summary>可选：RAG、桌面与手机源码运行</summary>

RAG先调整 `rag-service/ingest.py` 的 `KB_ROOT`和模型缓存路径，同时核对 `retriever.py`（当前含开发机路径）。初次模型下载需网络、磁盘与内存，语料和性能需独立验收。

```powershell
python -m venv .venv
# Windows；macOS/Linux用 source .venv/bin/activate
.\.venv\Scripts\Activate.ps1
python -m pip install -r rag-service/requirements.txt
npm run rag:ingest
npm run rag:start
```

RAG端口5000，服务端可设 `STZH_RAG_URL=http://127.0.0.1:5000`；HyDE模型地址、名称及密钥通过环境变量配置。

```bash
# 先按上文构建Web
npm run electron:dev
# Windows打包前准备Electron ABI对应的SQLite绑定
npm run electron:build
# 手机源码；阶段五未验收
cd Tszh-App
npm ci
npm start
```

Electron需 `server/native/electron-v<ABI>/`绑定，不能以Node二进制替代；Expo真机需可访问的后端及设备权限。本轮未验证这些可选安装流程。

</details>

## 进度、回归、冒烟与待办

**截至2026-10-01**：1.40 Web UI与核心业务源码已交付；继续完善外部实测、跨设备和生产发布，不以单一完成百分比替代验收边界。

| 检查 | 真实结果 |
|---|---|
| 构建 | 生产构建通过，同源预览已更新 |
| 前端回归 | 发布快照 **518/518通过**；首轮7项测试替身／旧断言修复后全量复测 |
| 后端回归 | 工作区 **315/315通过**；发布快照首轮314/315，修正Electron检查依赖本机二进制后**2项相关复测通过**；未声称修正后快照再次全量运行 |
| 集中冒烟 | 真实Express＋全新隔离库 **26项通过**；页面入口、账号/API等，生成执行器关闭 |
| 页面 / 视觉 | 五页、四模式、草稿、历史、项目/记忆、Esc焦点、模型表单、辉光参数通过；1440/960/390宽DOM边界、三主题、减少动画／透明度通过 |
| 状态 / 统计 | 模拟排队、运行、暂停、失败、重试成功通过；频率图33秒宽度稳定。模拟不算真实Coze或视频验收 |

复现：`npm run build`、`npm run test:p0`（前端后接后端）；单独后端 `npm --prefix server test`。只读冒烟 `scripts/stage4-readonly-smoke.cjs`需另配隔离预览与 `STZH_SMOKE_BASE`、`STZH_SMOKE_USER`、`STZH_SMOKE_PASSWORD`，不会自动创建环境。见[页面证据](docs/releases/evidence/v1.40/browser-smoke.json)、[接口证据](docs/releases/evidence/v1.40/api-smoke.json)、[详细验收](docs/releases/v1.40.zh-CN.md)。本轮README更新仅核对文档、链接、截图，没有重跑业务回归。

- **待联调**：真实模型列表、生产Coze权限／配额、StylePromptMaster和LinkReader等工具；曾遇鉴权、限流与网络安全拦截，不能标全通过。
- **待媒体实测**：真实视频／图片、付费媒体完整链路和历史视频播放；本轮未调用这些API。
- **待跨设备**：触屏、200%独立文字放大、真实IME确认键、真实厂商验证成功时辉光。
- **待交付完善**：手机阶段五、新Electron安装包、生产部署验收、RAG路径可移植化和真实语料。插件／研究按服务分别验收，本轮UI不能代替全部第三方链路。

## 代码导航与许可

`app/` Web · `server/` API/任务/插件 · `shared/`契约/上下文 · `rag-service/`检索 · `electron/`桌面 · `Tszh-App/`手机 · `test/`及`server/test/`回归 · `docs/releases/`证据。

[记忆API](docs/knowledge/studio-memory-api.md) · [1.40更新与回退](更新md/2026-10-01-15-Web1.40视觉交互与发布.md)。历史使用文档可能早于现实现，启动以本README和源码为准。第三方许可见 `public/licenses/`和 `docs/third-party-notices/`；尚无统一根许可证，不应推定全部源码可自由再分发。
