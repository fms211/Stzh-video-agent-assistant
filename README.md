# Stzh·video agent assistant

**Give an idea a direction. Keep the creative process in one workspace.**

[简体中文](README.zh-CN.md) · **Version 1.40** · [Release notes](docs/releases/v1.40.en.md)

Stzh is an AI video creation workspace for creators. Bring prompts, references, model connections, project memory and task progress together in a cinematic Web interface. Move from a conversation to an organized creative result with fewer tool changes.

![Web workspace · local UI fixture](docs/releases/images/v1.40/welcome.png)

## Four ways to create

| Mode | Purpose |
|---|---|
| Coze creation | Connect a published agent or workflow, submit a prompt and reference files, and follow task results |
| Single assistant | Discuss ideas, refine prompts and handle text tasks with your chosen model |
| Workflow | Organize a multi-step creative process and inspect execution state and saved results |
| Role collaboration | Configure project roles to collaborate on the same creative brief |

The model center supports provider presets, connection editing, model-discovery controls and role management. Project notes, temporary memory exclusions and context inspection make each request easier to understand. The task center, statistics and gallery help track and organize outputs.

## What's new in 1.40

- **A conversation that opens with your intent.** A new conversation starts as an observation card near the orbit center. The first accepted submission expands the glass surface, moves the title to the upper left and reveals the message flow.
- **Adjustable border glow.** Tune intensity, cone spread, edge sensitivity, radius and colors in Appearance → Conversation border glow. Changes update the preview and workspace immediately.
- **A cohesive visual language.** Smoky glass, a mouse-responsive galaxy, orbit rings, silver title lettering, rounded controls and restrained state highlights.
- **Session-aware transitions.** Saved conversations open directly into the reading layout. IME composition does not accidentally submit a prompt. Reduced-motion and reduced-transparency preferences remain available.

## Run locally

Requires Node.js 22.18+ (tests load TypeScript directly). The repository includes Web, Express and Electron entry points; this release focuses on Web.

```bash
git clone https://github.com/fms211/Stzh-video-agent-assistant.git
cd Stzh-video-agent-assistant
npm ci
npm --prefix server ci
```

Create `.env.local` at the repository root:

```dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
```

Configure `server/.env.local` locally:

```dotenv
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
STZH_LLM_ENCRYPTION_KEY=replace-with-an-independent-random-secret
COZE_API_TOKEN=your-coze-token
COZE_BOT_ID=your-published-bot-id
COZE_BASE_URL=https://api.coze.cn
```

```bash
# Terminal 1: backend
npm --prefix server start
# Terminal 2: Web
npm run dev
```

Open `http://localhost:3000`. Guests can browse and draft; submitting a request requires signing in. Configure model connections in the model center. Live AI functions depend on provider credentials, permissions, network access and quota.

## Build and validation

```bash
npm run build
npm run test:p0
```

Static output is written to `out/`. For same-origin deployment, set `NEXT_PUBLIC_AGENT_BACKEND_URL` to an empty value and rebuild; for a separate backend, use its reachable HTTPS URL. Electron packaging requires a matching native SQLite binding under `server/native/electron-v<ABI>/`, prepared separately. This source release does not ship or validate a new desktop installer or mobile app.

Model discovery depends on provider compatibility and network access. Video generation, paid media calls and production Coze quota validation are outside the local UI acceptance scope. Mocked replies in acceptance images are layout fixtures, not generated content. See the release notes for actual checks and deferred items.

## Explore the project

[Product scope](PRODUCT.md) · [Design](DESIGN.md) · [Usage](USAGE.md) · [Backend setup](BACKEND_SETUP.md) · [Project memory API](docs/knowledge/studio-memory-api.md)

Visual interaction references include [React Bits](https://reactbits.dev/) and [Aceternity UI](https://ui.aceternity.com/). Third-party notices are retained in `public/licenses/`. The repository does not currently declare a project-wide root license; do not assume unrestricted redistribution of all source code.
