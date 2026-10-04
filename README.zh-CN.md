# Stzh·video agent assistant

**从创意讨论到任务追踪，把 AI 视频创作放进同一个工作台。**

[English](README.md) · **版本 1.40** · [历史发布与验收记录](docs/releases/v1.40.zh-CN.md)

腾昇智和面向短视频与 AIGC 创作者：统一管理提示词、参考文件、模型连接、项目记忆、角色和结果。**阶段四仍在开发与体验收尾，1.40是阶段成果，不代表Web开发结束。** Web功能、交互、美观与安全完成并经用户实际满意确认后，才进入阶段五手机端开发。本轮已恢复本地构建、相关回归与视觉冒烟；仍有未覆盖项，详见下方证据。

![1.40 创作工作台](docs/releases/images/v1.40/current-web/welcome.jpg)

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
- **历史保留**：默认关闭自动清理；明确开启后只处理当前账号过期对话，保护当前会话和未结束任务关联记录，不删除作品、记忆、研究及协作记录。离线和结果未确认的工作流暂保留。
- **个性化**：主题、壁纸、液态玻璃、保留星环的鼠标交互银河、可调边缘光、琉璃方块等待动效及颜色/节奏参数、圆角开关、统一文字；减少动画／透明度、键盘关闭和焦点恢复。1.40新增银色标题扫光、原位展开及状态辉光。

## 功能截图

以下**23张截图来自2026-10-03当前工作区**，在独立演示库中拍摄，未读取原账号私人资料。预写对话、角色、任务与品牌图标仅展示功能，**未调用模型或生成媒体**；静态截图不代替动效、设备或端到端验收。[逐图来源与实际尺寸](docs/releases/images/v1.40/current-web/README.md)；[10月1日旧发布截图归档](docs/releases/images/v1.40/features/README.md)。

<details open>
<summary>创作：四模式、研究计划与协作结果</summary>

![Coze分镜讨论与历史](docs/releases/images/v1.40/current-web/coze.jpg)
![单助手创意笔记](docs/releases/images/v1.40/current-web/assistant.jpg)
![工作流选择与项目入口](docs/releases/images/v1.40/current-web/workflow.jpg)
![可编辑研究计划工作台](docs/releases/images/v1.40/current-web/research.jpg)
![项目角色编队与协作预算](docs/releases/images/v1.40/current-web/collaboration.jpg)
![协作最终指令与风险](docs/releases/images/v1.40/current-web/collaboration-result.jpg)

</details>

<details>
<summary>管理：模型、角色、插件、记忆与账号</summary>

![厂商预设与模型连接表单](docs/releases/images/v1.40/current-web/models.jpg)
![个人角色库与编辑入口](docs/releases/images/v1.40/current-web/roles.jpg)
![插件发现与安装入口](docs/releases/images/v1.40/current-web/plugins.jpg)
![记忆管理与shadow说明](docs/releases/images/v1.40/current-web/memory.jpg)
![登录与注册入口](docs/releases/images/v1.40/current-web/login.jpg)

</details>

<details>
<summary>产出与个性化：任务、统计、画廊及参数设置</summary>

![任务列表与当前详情](docs/releases/images/v1.40/current-web/tasks.jpg)
![频率统计与图例](docs/releases/images/v1.40/current-web/statistics.jpg)
![图片画廊与下载入口](docs/releases/images/v1.40/current-web/gallery.jpg)
![素材预览弹窗](docs/releases/images/v1.40/current-web/gallery-preview.jpg)
![主题设置与预览](docs/releases/images/v1.40/current-web/appearance.jpg)
![液态玻璃参数](docs/releases/images/v1.40/current-web/glass.jpg)
![银河鼠标交互参数](docs/releases/images/v1.40/current-web/galaxy.jpg)
![边缘光参数与预览](docs/releases/images/v1.40/current-web/glow.jpg)
![琉璃方块等待参数](docs/releases/images/v1.40/current-web/loader.jpg)
![导出格式与时间戳](docs/releases/images/v1.40/current-web/export-settings.jpg)
![历史保留与保护范围](docs/releases/images/v1.40/current-web/retention.jpg)

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
| Web | Next.js **16.3.8**静态导出、React **19.2.4**、TypeScript、Tailwind CSS 4；React Aria Components交互、Lucide图标 |
| 视觉 / 内容 | Motion、GSAP / @gsap/react；Three.js、React Three Fiber / Drei、OGL；react-markdown、remark-gfm、rehype-highlight / sanitize。React Bits / Aceternity为视觉及注明来源的实现参考 |
| 后端 / 安全 / 数据 | Node.js、Express 5、CORS、dotenv；SQLite / better-sqlite3、JWT / jsonwebtoken、bcryptjs、Node crypto AES-256-GCM；Multer上传、ws实时通信、Undici HTTP |
| 编排 / 插件 / 导出 | @langchain/langgraph状态图，自有TaskRuntime、研究运行时及插件子进程；AJV契约、semver / tar / yauzl版本归档；qrcode；docx用于仓库报告脚本，并非Web的DOCX/PPT导出功能文档、演示与配对能力 |
| 下游 | Coze Bot / Workflow API、OpenAI兼容和Anthropic Messages多厂商模型；搜索、网页读取等研究工具依赖具体适配器或插件及各自配额 |
| 可选 RAG | Python、FastAPI / Uvicorn、ChromaDB、Sentence Transformers / BAAI bge-large-zh-v1.5；pandas、openpyxl、python-docx；检索、Wiki式组织、MQE / HyDE按配置启用 |
| 桌面 / 手机 | Electron 35、electron-builder；Expo 56、React Native 0.85、Expo Router、AsyncStorage、WebView、相机／通知／手势／安全区组件，含Capacitor安卓依赖。源码存在不等于本版安装包或手机已验收 |
| 开发 / 验证 | npm锁文件、Node test runner、Playwright依赖、ESLint 9、TypeScript与Next构建；另有原生浏览器操作验收记录 |

全部直接依赖和精确版本见[Web](package.json)、[服务端](server/package.json)、[手机端](Tszh-App/package.json)、[RAG](rag-service/requirements.txt)及锁文件。`hello-agents-fms/`是参考资料，非启动依赖。

## 克隆、配置与启动

需要Git与npm；推荐 **Node.js22.18+**，本批干净克隆实际使用Windows x64/Node25.9.0，其他环境未验证；根项目最低版本20.9.0。Python仅用于可选RAG。SQLite是原生依赖，安装可能需要匹配的编译工具链。当前阶段四按下方开发分支验证；main保留已发布阶段成果。

```bash
git clone --branch fms688/v1.40 https://github.com/fms211/Stzh-video-agent-assistant.git
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
STZH_MEDIA_EXECUTOR_ENABLED=0
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

本机验收原账号与历史时，必须在服务端环境设置 `STZH_MEDIA_EXECUTOR_ENABLED=0` 后启动；此进程不领取 `video.generate` 任务，也不启动该执行器的附件清理定时器。支持 `0/false/off` 关闭、`1/true/on` 开启；未设置沿用原启动方式，无Coze配置仍禁用，非法值禁用并显示原因。该开关只控制此进程启动，不会取消运行中的任务或停止其他进程；单助手、研究及插件仍需分别控制调用。变更后需重启对应服务。

天气为可选功能：仅在`server/.env.local`设置`QWEATHER_API_HOST`、`QWEATHER_API_KEY`、`QWEATHER_LOCATION`与`QWEATHER_CITY`，浏览器只读取`/api/weather`。未配置时显示“天气暂不可用”。旧前端密钥已公开，须由拥有者撤销并换新；本机验收禁用天气出站，本轮未做真实天气服务验收。

4. 注册自己的账号并登录 → 模型中心选厂商、填API地址与密钥、获取并选模型、保存 → 工坊选模式、项目和参数 → 提交 → 任务中心、画廊查看结果。Coze需发布、权限与余额；未配置执行器时任务不会自行生成媒体。新克隆没有开发者账号或历史库。

**静态部署**：本项目 `output: export`，用Express托管 `out/`，不要用 `npm start`（`next start`）。将根目录 `.env.local` 改为 `NEXT_PUBLIC_AGENT_BACKEND_URL=`（留空），清除终端同名旧变量：

```bash
npm run build -- --webpack
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

Electron需 `server/native/electron-v<ABI>/better_sqlite3.node` 绑定，不能以Node二进制替代；源码不提供自动准备脚本。Expo真机需可访问的后端及设备权限，手机package版本1.0.0。详见[Electron](electron/README.md)、[手机](Tszh-App/README.md)、[RAG](rag-service/RAG学习笔记.md)；本轮未验证这些可选安装流程。

</details>

## 进度、检查与待办

**2026-10-04**：历史清理已阻止迟到正文、列表和上传确认恢复已删记录。main技术说明已协调合入开发分支，草稿PR冲突已消除、尚未合并main。已提供普通前后端复查和开发交接；安全插件正式报告封存失败，不能作为验收通过结果。

| 最新检查 | 实际范围/结果 |
|---|---|
| 相关回归 | **43/43通过**，含5项删除竞态；未宣称最终全量重跑 |
| 构建 | 生产及同源Webpack预览构建通过；首个默认产物含开发API地址，没有部署它 |
| 接口冒烟 | 独立本机合成数据库 **26项通过**，无真实模型/媒体调用 |
| 浏览器冒烟 | 五页1440/960/390共15组根布局；四模式、Escape焦点、刷新登录通过，代表截图复查 |
| 原库预览 |18080已更新，HTML及21资源与冻结构建一致；原9条历史不变、数据库完整性ok、媒体关闭 |

[交接与各部分状态](docs/handoffs/stage4-web-20261004.md) · [普通复查与工具故障](docs/reviews/stage4-web-20261004.md) · [本轮公开证据](docs/releases/evidence/v1.40/stage4-20261004-closeout.json) · [草稿PR #1](https://github.com/fms211/Stzh-video-agent-assistant/pull/1)。

此前全量计数及更广主题/文字检查按各批范围保留在[61批](更新md/2026-10-04-61-工作流排版与天气凭据保护.md)和历史发布记录，不与本轮相加。复现：`npm run build -- --webpack`、`npm run test:p0`，或`npm --prefix server test`。只读冒烟需另配隔离环境和测试账号，见[验证指南](docs/TESTING.md)；不能指向媒体执行器开启的生产环境。

- **仍未完成**：真实模型发现、Coze权限/配额和第三方工具；默认shadow下的记忆独立质量与enforce灰度；实体触屏/IME/原生字号及剩余UI状态；工具链15项高危、旧天气凭据撤销、生产/Electron/手机交付及用户确认。阶段四仍在继续。
- **媒体事实**：用户确认此前两条混剪链路成功生成，连贯模式曾在Coze底层试用成功；后续未生成因额度不足，不能据此说功能坏了。本轮没有重新核验这些历史结果。画廊有记录、链接有效和当前播放须分别验证；视频和付费媒体调用继续排除。

## 代码导航与许可

`app/` Web · `server/` API/任务/插件 · `shared/`契约/上下文 · `rag-service/`检索 · `electron/`桌面 · `Tszh-App/`手机 · `test/`及`server/test/`回归 · `docs/releases/`证据。

[记忆API](docs/knowledge/studio-memory-api.md) · [1.40更新与回退](更新md/2026-10-01-15-Web1.40视觉交互与发布.md)。当前技术说明见[文档导航](docs/README.md)、[后端配置](BACKEND_SETUP.md)和[使用指南](USAGE.md)；历史发布、研究和阶段记录保持原文。第三方许可见 `public/licenses/`和 `docs/third-party-notices/`；尚无统一根许可证，不应推定全部源码可自由再分发。
