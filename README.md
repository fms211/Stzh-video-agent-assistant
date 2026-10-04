# Stzh·video agent assistant

**One workspace for creative briefs, AI conversations and production tracking.**

[简体中文](README.zh-CN.md) · **Version 1.40** · [Historical release and acceptance notes](docs/releases/v1.40.en.md)

Stzh brings prompts, reference files, model connections, project memory, roles and results together for short-video and AIGC creators. **Web phase four is still in development and experience refinement; 1.40 is a milestone, not the end of Web development.** Phase five mobile work follows completion of Web functionality, interaction, visual polish and security, plus user acceptance. Local build, focused regression and visual smoke checks have resumed; uncovered cases remain explicit below.

![1.40 creative workspace](docs/releases/images/v1.40/current-web/welcome.jpg)

## Features: what you can do

- **Coze creation:** choose style, camera movement, duration and aspect ratio; attach references, associate projects and memory, track server tasks, restore history, retry and export. The observation card expands into a conversation supporting Markdown, code, tables and media results.
- **Single assistant:** discuss ideas and refine prompts with your own model connection; retain history, summaries and drafts, inspect request context and export Markdown.
- **Workflows and research:** creative, optimization, research and script chains with step results and recovery records. Style research starts with a plan for confirmation; a separate workbench retains sources, execution and reports. Project plugins can contribute tools and workflows.
- **Role collaboration:** select a project, role team and economy/standard/deep budget; discuss and review a brief, edit the final instruction and hand it to Coze. Role cards contain prompts, capabilities, default models and enabled states; runs retain history.
- **Model and role center:** presets for MiMo, DeepSeek, OpenAI, Anthropic, Qwen, SiliconFlow, OpenRouter and custom services; separate website/API URLs, model discovery and selection, output/context limits, save and cancel. Secrets are encrypted server-side; connections are account-scoped. A website URL is not a model-list API.
- **Memory and context:** project notes, user/project memories, enabled states, temporary exclusions and request inspection across account, project and session boundaries. Default `shadow` mode observes context; it does not imply enforced injection. Check the configured rollout mode.
- **Tasks, notifications and devices:** queued/running/paused/completed/failed states, filters, pause/cancel/requeue, WebSocket updates and polling reconciliation, plus phone pairing. APIs exist; the complete mobile experience is not accepted yet.
- **Statistics and gallery:** daily/weekly/monthly successful-media trends and activity calendar; image/video filtering, existing result preview and download. Text-only tasks do not count as media; old playback depends on source URL availability.
- **Plugins:** discovery, source installation, permissions, account library, project activation and recovery diagnostics. System-trusted registrations and account packages are distinct; third-party integrations require their own configuration and checks.
- **History retention:** automatic cleanup is off by default. When explicitly enabled, it removes only expired conversations for the current account, protecting the current conversation and unfinished-task records. Works, memories, research and collaboration records remain; offline or unconfirmed workflow sessions are retained.
- **Appearance:** themes, wallpapers, liquid glass, orbit rings with a mouse-responsive galaxy, adjustable border glow, glass-cube waiting animations with color/timing controls, rounded switches and consistent typography. Reduced motion/transparency and keyboard focus recovery are supported. 1.40 adds silver title highlights, in-place expansion and state glow.

## Feature screenshots

These **23 captures show the current working tree on 2026-10-03**, using an isolated demo database without private original-account data. Prewritten conversations, roles, tasks and the existing brand icon demonstrate interfaces; **no models or media generation were called**. Still images do not replace animation, device or end-to-end acceptance. [Per-image scope and actual dimensions](docs/releases/images/v1.40/current-web/README.md) · [October 1 release-image archive](docs/releases/images/v1.40/features/README.md).

<details open>
<summary>Creation: four modes, research plans and collaboration results</summary>

![Coze storyboard discussion and history](docs/releases/images/v1.40/current-web/coze.jpg)
![Assistant creative notes](docs/releases/images/v1.40/current-web/assistant.jpg)
![Workflow selection and project entry](docs/releases/images/v1.40/current-web/workflow.jpg)
![Editable research-plan workbench](docs/releases/images/v1.40/current-web/research.jpg)
![Project team and collaboration budget](docs/releases/images/v1.40/current-web/collaboration.jpg)
![Collaboration final instruction and risks](docs/releases/images/v1.40/current-web/collaboration-result.jpg)

</details>

<details>
<summary>Management: models, roles, plugins, memory and account</summary>

![Provider presets and model form](docs/releases/images/v1.40/current-web/models.jpg)
![Personal roles and editing entry](docs/releases/images/v1.40/current-web/roles.jpg)
![Plugin discovery and installation entry](docs/releases/images/v1.40/current-web/plugins.jpg)
![Memory management and shadow notice](docs/releases/images/v1.40/current-web/memory.jpg)
![Login and registration entry](docs/releases/images/v1.40/current-web/login.jpg)

</details>

<details>
<summary>Results and appearance: tasks, statistics, gallery and settings</summary>

![Tasks and selected details](docs/releases/images/v1.40/current-web/tasks.jpg)
![Frequency statistics and legend](docs/releases/images/v1.40/current-web/statistics.jpg)
![Image gallery and download entry](docs/releases/images/v1.40/current-web/gallery.jpg)
![Asset preview dialog](docs/releases/images/v1.40/current-web/gallery-preview.jpg)
![Themes and preview](docs/releases/images/v1.40/current-web/appearance.jpg)
![Liquid-glass parameters](docs/releases/images/v1.40/current-web/glass.jpg)
![Galaxy pointer-interaction parameters](docs/releases/images/v1.40/current-web/galaxy.jpg)
![Border-glow controls and preview](docs/releases/images/v1.40/current-web/glow.jpg)
![Glass-cube waiting controls](docs/releases/images/v1.40/current-web/loader.jpg)
![Export format and timestamps](docs/releases/images/v1.40/current-web/export-settings.jpg)
![History retention and protected scope](docs/releases/images/v1.40/current-web/retention.jpg)

</details>

## Stack and integration flow

```text
Web / Electron / Expo clients
 → Express API + JWT → SQLite, attachments, task executor, WebSocket
 → model adapters / LangGraph collaboration / research runtime / project plugins
 → Coze Bot & workflows / OpenAI-compatible or Anthropic models / optional Python RAG
 → text, storyboards, prompts, media URLs → conversation, tasks, statistics, gallery, export
```

| Layer | Technology and purpose |
|---|---|
| Web | Next.js **16.3.8** static export, React **19.2.4**, TypeScript, Tailwind CSS 4; React Aria Components and Lucide |
| Visuals / content | Motion, GSAP / @gsap/react; Three.js, React Three Fiber / Drei, OGL; react-markdown, remark-gfm, rehype-highlight / sanitize. React Bits / Aceternity are visual and attributed implementation references |
| Backend / security / data | Node.js, Express 5, CORS, dotenv; SQLite / better-sqlite3, JWT / jsonwebtoken, bcryptjs, Node crypto AES-256-GCM; Multer uploads, ws realtime, Undici HTTP |
| Orchestration / plugins / export | @langchain/langgraph state graphs, custom TaskRuntime and research runtime, plugin subprocesses; AJV contracts, semver / tar / yauzl packages; qrcode pairing; the repository report script uses docx, which is not a Web DOCX/PPT export feature |
| Downstream | Coze Bot / Workflow APIs, OpenAI-compatible and Anthropic Messages providers; research search/page-reading depends on configured adapters or plugins and their quotas |
| Optional RAG | Python, FastAPI / Uvicorn, ChromaDB, Sentence Transformers / BAAI bge-large-zh-v1.5; pandas, openpyxl, python-docx; retrieval, Wiki organization, configured MQE / HyDE |
| Desktop / mobile | Electron 35, electron-builder; Expo 56, React Native 0.85, Expo Router, AsyncStorage, WebView, camera/notification/gesture/safe-area components and Capacitor Android dependencies. Source availability is not installer or mobile acceptance |
| Development / checks | npm lockfiles, Node test runner, Playwright dependency, ESLint 9, TypeScript and Next builds; separate native-browser acceptance records |

All direct dependencies and exact versions: [Web](package.json), [server](server/package.json), [mobile](Tszh-App/package.json), [RAG](rag-service/requirements.txt) and lockfiles. `hello-agents-fms/` contains reference material; it is not needed to start Web.

## Clone, configure and run

Current phase-four setup uses the draft development branch below; main retains the published milestone. Requires Git and npm; **Node.js 22.18+ is recommended** (clean-clone acceptance uses 25.9.0 on Windows; other environments remain unverified); Python is only needed for RAG. SQLite is a native dependency: installation may require a matching Node/platform toolchain.

```bash
git clone --branch fms688/v1.40 https://github.com/fms211/Stzh-video-agent-assistant.git
cd Stzh-video-agent-assistant
npm ci
npm --prefix server ci
```

1. Create root `.env.local`:

```dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
```

2. Run this command **twice** and place distinct values in `server/.env.local`. Both secrets require at least 32 characters. Keep them stable to preserve sessions and decrypt stored model keys.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

```dotenv
JWT_SECRET=first-generated-value
STZH_LLM_ENCRYPTION_KEY=second-generated-value
PORT=8080
# Only needed for real Coze execution; never put secrets in NEXT_PUBLIC variables
# COZE_API_TOKEN=your-token
# COZE_BOT_ID=your-published-bot-id
# COZE_BASE_URL=https://api.coze.cn
```

3. Start two terminals; open **http://localhost:3000**:

```bash
# Terminal 1
npm --prefix server start
# Terminal 2
npm run dev
```

For local account/history acceptance, set `STZH_MEDIA_EXECUTOR_ENABLED=0` in the server environment before startup. This process will not claim `video.generate` tasks or start that worker’s attachment-cleanup timer. `0/false/off` disables it; `1/true/on` enables it. Unset preserves existing startup behavior (missing Coze configuration still disables it); invalid values disable it with a diagnostic reason. This startup gate does not cancel active tasks or stop other processes; assistant, research and plugin calls remain separate. Restart the relevant service after changing the setting.

Optional weather: configure `QWEATHER_API_HOST`, `QWEATHER_API_KEY`, `QWEATHER_LOCATION` and `QWEATHER_CITY` only in `server/.env.local`. The browser reads `/api/weather`; missing configuration displays weather unavailable. The legacy source credential was exposed and must be revoked/replaced by its owner. Local acceptance disables weather requests; this change has not been live-provider tested.

4. Register and sign in → select provider/API/key in the model center → fetch and select model → save → choose workspace mode/project/parameters → submit → inspect tasks and gallery. Coze requires publication, permissions and quota; without a configured executor, queued tasks will not generate media. A fresh clone has no developer accounts or historical database.

**Static deployment:** `output: export` produces `out/`, served by Express. Do not use `npm start` (`next start`) for this export. Set root `.env.local` to `NEXT_PUBLIC_AGENT_BACKEND_URL=` (blank), remove any stale shell variable of that name, then:

```bash
npm run build -- --webpack
npm --prefix server start
```

Open **http://localhost:8080**. For separate hosts, set the reachable HTTPS API URL before building; public-variable changes require rebuilding. Default database: `server/stzh.db`; `STZH_DATA_DIR` selects another directory. Changing ports or fixture databases does not migrate accounts. 18080/18081 are developer preview ports, not clone defaults.

<details>
<summary>Optional: RAG, desktop and mobile source entry points</summary>

Adjust `KB_ROOT` and model-cache paths in `rag-service/ingest.py` and `retriever.py` to your machine: current source contains developer paths. Initial model downloads need network, storage and memory; real corpus and performance require separate acceptance.

```powershell
python -m venv .venv
# Windows; on macOS/Linux: source .venv/bin/activate
.\.venv\Scripts\Activate.ps1
python -m pip install -r rag-service/requirements.txt
npm run rag:ingest
npm run rag:start
```

RAG listens on 5000; set backend `STZH_RAG_URL=http://127.0.0.1:5000` when needed. Configure HyDE model URL/name/key through its environment variables.

```bash
# Build Web first as above
npm run electron:dev
# Windows: prepare the Electron-ABI SQLite binding before packaging
npm run electron:build
# Mobile source; phase five is not accepted
cd Tszh-App
npm ci
npm start
```

Electron requires a matching SQLite binding under server/native/electron-v<ABI>/better_sqlite3.node; Node binaries cannot replace it and no automatic preparation script is provided. Expo devices need a reachable backend and permissions; the mobile package version is 1.0.0. See [Electron](electron/README.md), [mobile](Tszh-App/README.md) and [RAG](rag-service/RAG学习笔记.md). These optional installation flows are not validated in this update.

</details>

## Development status, checks and remaining work

**Current progress (2026-10-04, batch 61):** Fixed workflow field/action layout and accessible labels, moved optional weather credentials to the server, and scoped Tailwind scanning to application sources for stable clean/incremental builds. Backend 390 passed; frontend initial 652/656, followed by 4 lifecycle and 7 weather/resolver checks passing without another full run. Independent-browser checks covered 45 theme/page/width geometries, six workflow text/layout cases and30-second chart stability. Nine original histories are preserved. Full final review/handoff, live model/memory verification, touch/remaining UI states, tooling15 high findings, legacy weather-key revocation and user/main acceptance remain open. [Batch notes](更新md/2026-10-04-61-工作流排版与天气凭据保护.md) · [Draft PR #1](https://github.com/fms211/Stzh-video-agent-assistant/pull/1).

**The table below records the 2026-10-01 release snapshot only. It does not cover the uncommitted 2026-10-03 changes.**

Reproducible source commands: `npm run build`, `npm run lint`, `npm run test:p0` (frontend followed by backend), or `npm --prefix server test`. The tracked read-only smoke script requires a separately prepared isolated environment and test account; see [validation guide](docs/TESTING.md). This documentation update checks source, links, paths, commands and configuration; it does not rerun full business regression, builds or paid external calls.

Reproduce code checks with `npm run build -- --webpack` and `npm run test:p0` (frontend then backend); backend only: `npm --prefix server test`. Read-only smoke `scripts/stage4-readonly-smoke.cjs` needs a separately prepared isolated preview plus `STZH_SMOKE_BASE`, `STZH_SMOKE_USER`, `STZH_SMOKE_PASSWORD`; it does not create the environment. [UI evidence](docs/releases/evidence/v1.40/browser-smoke.json), [API evidence](docs/releases/evidence/v1.40/api-smoke.json), [full acceptance notes](docs/releases/v1.40.en.md). Those artifacts cover the historical snapshot. The latest dated batch records contain current commands, failure retests and environment limits; do not run acceptance scripts on a production service with media execution enabled.

- **Pending integrations:** real provider model lists, production Coze permissions/quota, StylePromptMaster and LinkReader tools; authentication, rate limits and network security blocks prevent an all-passed claim.
- **Media history:** the user confirms two earlier montage chains generated successfully and coherent mode worked in the underlying Coze service. The later coherent-mode run lacked quota; this does not establish a broken feature. These historical outcomes were not reverified in this round. Video and paid-media calls remain excluded; gallery records, valid links and current playback require separate checks.
- **Pending device checks:** physical touch, OS-native font scaling, remaining state/theme combinations at 200% text size, real IME confirmation and glow after actual provider verification.
- **Pending delivery:** mobile phase five, a new Electron installer, production deployment acceptance, portable RAG paths and real-corpus checks. Research/plugins require per-service acceptance; local UI checks do not validate every third-party workflow.

## Source map and licensing

`app/` Web · `server/` API/tasks/plugins · `shared/` contracts/context · `rag-service/` retrieval · `electron/` desktop · `Tszh-App/` mobile · `test/` and `server/test/` regression · `docs/releases/` evidence.

[Memory API](docs/knowledge/studio-memory-api.md) · [1.40 changes and rollback](更新md/2026-10-01-15-Web1.40视觉交互与发布.md). Current technical guides are indexed in [documentation navigation](docs/README.md), [backend setup](BACKEND_SETUP.md) and [usage](USAGE.md); historical releases, research and phase records keep their original scope. Third-party notices: `public/licenses/`, `docs/third-party-notices/`. There is no project-wide root license; unrestricted redistribution of all source should not be assumed.
