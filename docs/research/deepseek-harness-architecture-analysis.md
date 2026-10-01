# DeepSeek Harness 架构与功能分析报告

> 数据来源：`git clone https://github.com/deepseek-ai/deepseek-harness.git`（master，v0.1.0-rc.5，7412 文件）
> 分析日期：2026-08-17
> 用途：作为腾昇智和 Agent 后续能力提升的架构借鉴点

---

## 一、总体定位与核心思想

DeepSeek Harness（简称 `dsh`）是 DeepSeek AI 开源的 **agent 运行时框架**（developer preview，明确标注「会有破坏性变更」）。它的架构可以用一句话概括：

> **一切皆插件（everything is a plugin），没有任何特权核心可被 patch。**

它构建在 vendored（源码内嵌）的 **Cordis** 插件框架之上。Cordis 的核心思想来自论文《A Programming Paradigm for Spatiotemporal Composability》。

关键设计哲学（来自 `AGENTS.md` 和 `docs/architecture.md`）：

1. **没有特权核心**：模型适配器、工具注册表、会话日志、甚至 agent 循环本身——每一个都是插件，都可以从配置替换。
2. **注册即副作用（Registrations are effects）**：所有贡献通过 `ctx.effect()` / `ctx.on()` 安装，卸载插件时这些副作用自动逆转。
3. **模型可见 ⟺ 已记录（Model-visible ⟺ logged）**：任何进入模型请求的内容，都必须能从会话日志重建——这是运行时 invariant 强制的。

---

## 二、技术栈与工程规模

| 维度 | 内容 |
|------|------|
| 语言 | TypeScript（`strict: true`，ESM everywhere），`node ^22.19 \|\| >=24` |
| 包管理 | pnpm 11.7 workspaces（monorepo） |
| 规模 | **约 150 个 npm 包**，全部 `@deepseek-ai/dsh-*` 命名 |
| 测试 | Vitest（单测 + e2e + snapshot + web），per-file 100% 覆盖率门禁 |
| 代码规范 | oxlint + knip + jscpd（克隆检测）+ 大量自研 `verify-*` 脚本 |
| 关键依赖 | vendored Cordis/cosmokit/schemastery、@langchain 无、直接 fetch + SSE |
| 运行时形态 | CLI（`dsh web` / `dsh --profile headless`）、ACP 自动化服务、Web UI（端口 3080）、Python SDK |

**工程纪律的极致程度**值得注意：`package.json` 里有 60+ 个 `verify-*` / `gen-*` 脚本，覆盖包不变量、导出 JSDoc、工具目录、Cordis 配置、持久化目录、翻译配对、文档预算等。这是「框架型仓库」的典型姿态——靠自动化门禁而非人工 review 保证 150 个包的一致性。

---

## 三、仓库目录结构

```
deepseek-harness/
├── vendor/           vendored Cordis/cosmokit/schemastery（源码内嵌，有同步流程）
├── packages/         @deepseek-ai/dsh-<pkg>，按 packages/<group>/<pkg> 组织
│   ├── core/         产品 API 主干：session / system-prompt / tools / agent / agent-loop / scope
│   ├── llm/          LLM 能力：Service Definition + DeepSeek/pi-ai provider + retry + token-meter
│   ├── shell/ bash/pwsh 执行（Definition + local/sandbox provider + tool consumer）
│   ├── subprocess/   子进程能力（local / e2b provider）
│   ├── terminal/     持久 PTY 会话
│   ├── fs/           文件系统能力 + policy + 沙箱 fence
│   ├── lsp/          语言服务器导航
│   ├── skill/        技能 provider 注册表 + 目录/加载工具
│   ├── web/          web 搜索/抓取 provider + tool consumer
│   ├── subagent/     子代理能力（6 种 provider + 3 个 tool）
│   ├── workflow/     工作流引擎（worker-thread）+ tool consumer
│   ├── compaction/   上下文压缩能力
│   ├── session/      持久化/投影/标题/遥测
│   ├── sandbox/      进程沙箱 + policy
│   ├── storage/      非会话存储（json/sqlite）
│   ├── api/          Remote BFF 装配 + Typert RPC 网关
│   ├── typert/       类型图生成器/加载器/注册表
│   ├── sdk/          JSON-RPC 协议 + 服务端 + TS 客户端
│   ├── bundle/       可安装的 profile 补丁层 bundle（base/web-app/headless）
│   ├── preset/       会话级 agent 组合（agent-presets + persona）
│   ├── host/         主机运行时（webserver / apiproxy / plugin-inventory）
│   ├── client/       Web 客户端（web / web-react / 全部 ui-* 组件）
│   ├── interaction/  审批/权限/命令/ask-user
│   ├── boot/         应用启动胶水（app-boot / cmdline）
│   ├── credentials/  凭据引用（env/.env provider）
│   ├── identity/     匿名用户 ID
│   ├── settings/     用户设置 + 文件 provider
│   ├── hooks/        Claude Code / Codex hook 桥接
│   ├── e2b/          E2B 远程沙箱（fs-e2b / subprocess-e2b）
│   └── util/         零依赖工具（brand / atomic-write / home-paths 等）
├── apps/
│   ├── cli/          `dsh` 命令行入口（bin）
│   └── web/          Web 前端应用
├── native/landlock-run/   Linux Landlock 沙箱启动器（原生 addon）
├── python/           Python SDK + bundled runtime
├── examples/         可运行的 cordis.yml demo（agent-spine / acp / jsonrpc）
├── website/          VitePress 文档站
├── docs/             架构文档 + 子系统文档（60+ 篇）+ cookbook
└── .agents/          Agent 工作流 + Agent Notes（决策记录，100+ 篇）
```

一个极具借鉴价值的点：**`.agents/notes/` 是「Agent Note」机制**——每个非平凡代码变更必须在同一 PR 内写一篇 Agent Note（决策记录，含 rationale），归档后冻结。这解决了「为什么这样设计」的知识流失问题。

---

## 四、Cordis 插件框架：五个核心思想

`docs/cordis-primer.md` 把 Cordis 浓缩为五个思想，这是理解整个框架的钥匙：

### 4.1 五个思想

1. **插件是实现 Service 的对象** —— 可以是一个带 `inject`/`apply(ctx)` 字段的函数，或一个 `Service` 子类。
2. **上下文是服务的仓库** —— 服务声明稳定的 `ctx.<key>`（如 `ctx.tools`、`ctx.llm`、`ctx.sessions`），其他插件按 key 查找服务，而不是 import 具体实现。
3. **通过 `inject` 声明服务依赖** —— 声明了所需服务的插件会等待这些服务存在，所以**加载顺序通过服务依赖表达**，而不是手动排序启动。
4. **类型化事件通信** —— 服务通过 TS 声明合并（declaration merging）声明事件名，然后以 `emit`/`waterfall`/`parallel`/`serial` 分发。
5. **注册是可逆副作用** —— prompt section、tool schema、adapter、listener 都通过 `ctx.effect()`/`ctx.on()` 安装，卸载时自动逆转。

### 4.2 四种事件分发模式

| 模式 | 是否 await | 分发顺序 | 有无返回值 |
|------|-----------|---------|-----------|
| `emit` | 否 | 观察者按注册顺序 | 无 |
| `waterfall` | 否 | 观察者按注册顺序（可拦截） | 有 |
| `parallel` | 是 | 所有观察者并行 | 无 |
| `serial` | 是 | 观察者按注册顺序 | 有 |

**waterfall 语义是精髓**（`cordis-primer.md:28-34`）：监听器收到 `(...args, next)`，调用 `next()` 委托到下一层，不调用则短路。这正是 middleware 模式，让策略层可以拦截/改写/拒绝请求，而无需修改核心循环。

---

## 五、核心 Spine 详解

核心 spine 是 `packages/core/` 下的 7 个包，对应 `docs/architecture.md` 的核心包表格：

| 包 | 职责 | `ctx` key |
|----|------|-----------|
| `core/session` | 追加式 `SessionEvent` 日志 + 内存 store | `ctx.sessions` |
| `core/system-prompt` | prompt section / tool schema 组装 | `ctx.systemPrompt` |
| `core/tools` | 作用域工具注册表 + 守卫执行管线 | `ctx.tools` |
| `core/agent` | `Agent` 接口 + 实时注册表 + `agent/*` 事件 | `ctx.agents` |
| `core/agent-loop` | 默认驱动（实现 Agent 接口） | `ctx.agentLoop` |
| `core/scope` | 每-agent 作用域注册原语 | 库，无 key |
| `llm/llm` | 消息/流词汇 + adapter seam | `ctx.llm` |

### 5.1 Session：事件溯源核心（`packages/core/session/src/index.ts`）

这是整个框架最重要的数据层设计。核心类 `Session`（`index.ts:425`）：

- **追加式日志**：`log: SessionEvent[]`，`append(type, data, opts)` 方法（`index.ts:604`）是唯一写入点。
- **seq = log.length** 连续性契约（`index.ts:565`）：每个事件的 seq 就是数组长度，全系统依赖这个不变式。
- **深度冻结**：事件在接收时 `deepFreeze`（`index.ts:627`），普通 JS 无法改写持久化历史。
- **lossless JSON 强制**：`snapshotJsonValue` 一次性递归读取+校验+拷贝，拒绝 BigInt/函数/symbol/undefined/循环引用/Map/Set/Date 等（`index.ts:598-603`）。**坏事件在 append 点失败**，而不是之后 backend flush 时才失败。
- **deriveMessages()**（`index.ts:726`）：从日志「表面」（surface）投影出 LLM 消息历史，带缓存，每个 surface 节点只投影一次。
- **fork**（`index.ts:1081`）：从 live session 的稳定前缀创建子会话，边界必须落在 turn 之间（`OPEN_TURN` 拒绝）。
- **持久化是插件职责**：`SessionStore` 明确「不实现持久化」，持久化插件订阅 `session/event`、在 `session/flush` 刷盘。

**关键事件**：`session/created`（同步 throw 可否决并回滚）、`session/event`（post-commit fire-and-forget feed）、`session/flush`（awaited parallel 持久化检查点）。

### 5.2 Agent Loop 驱动（`packages/core/agent-loop/src/agent.ts`）

`ReactLoopAgent`（`agent.ts:64`）实现 `Agent` 接口，是默认驱动。核心状态机：

```ts
type Phase = idle | maintenance | running
```

**turn/step 两级边界**（来自 `docs/glossary.md`）：
- **step** = 一次模型请求 + 它触发的工具执行
- **turn** = 0+ 个 step，从打开到「没有欠账」关闭

关键流程（`agent.ts:210-400`）：
1. `kick()` 循环 `turn()`
2. `turn()` 打开 `turn/start`，循环调用 `preStep()` → `step()`
3. `preStep()`（`agent.ts:225`）：claim 收件箱消息 → `systemPrompt.assemble()` 组装 → `agent/pre-step` waterfall（可 reject 或改写消息）
4. `step()`（`agent.ts:332`）：`buildRequest()` 组装请求 → `llm.stream()` → 收集 chunk → `assistant/message` → 若含 tool-call 则 `executeToolCalls()`
5. 每次请求都 `deriveMessages()` 从日志重建历史（**模型历史永远从日志派生**）

**收件箱（Inbox）** 有两个有序队列：`next-turn` 和 `next-step`。三种输入方式：
- `followup()` → next-turn（下一轮）
- `steer()` → next-step（当前轮的下一个 step，改写进行中的工作）
- `inject()` → next-step（注入上下文，不唤醒）

**取消语义**（`agent.ts:134`）：`cancel(cause, {keepInbox})` 中止当前 activity，可选保留收件箱。

### 5.3 ToolRuntime 执行管线（`packages/core/tools/src/index.ts`）

这是整个框架最精密的执行引擎，`ToolRuntime`（`index.ts:787`）实现了完整的工具执行管线，配合 `docs/tool-execution-pipeline.md` 的流程图：

```
tools/pre-execute (waterfall: 权限/沙箱/审批)
  → 单调 guard（deny 或弃权，身份受保护）
  → ctx.approval 一次性审批（缺省或不可回答则 deny）
  → tools/execute (waterfall: 超时/重试/指标)
  → 工具 body execute()
  → fs/write-intent 或 fs/edit-intent（tool-fs 写操作）
  → tools/post-execute (waterfall: accept/block/replace/加上下文)
  → ToolDefinition.finalizeContent（同步内容不变式）
  → tools/result（同步通知，冻结的权威结果）
```

关键设计（都有 `file:line`）：

- **作用域分层注册**（`ScopedLayers`，`index.ts:811`）：工具可全局注册或通过 `agent.ctx` 按作用域注册；**作用域工具遮蔽同名全局工具**（shadowing，`index.ts:1037` 的 `register` 注释）。
- **restrict()**（`index.ts:1071`）：按作用域过滤全局工具（`allow`/`deny` 交集），受限工具从 prompt 和执行层都不可见。
- **guard()**（`index.ts:1110`）：单调守卫，在 pre-execute 后、body 前执行，只能 deny 不能 allow。
- **并发分类**（`isConcurrencySafe`，`index.ts:1276`）：工具可声明可并行执行，调度器据此决定 `parallel`/`exclusive` 模式。
- **取消语义精分**（`index.ts:1919-1944`）：`ABORTED`（body 已调用）vs `ABORTED_BEFORE_DISPATCH`（body 未调用），两者错误码不同。
- **信号融合**（`fuseToolSignals`，`index.ts:1889`）：合并 caller signal 和 wrapper signal，不用 `AbortSignal.any` 嵌套。
- **Code Mode**（`code-mode.ts`）：可选的「代码执行」工具呈现模式——模型只看到 `run_code` 一个工具 + 生成的 SDK prompt，所有真实工具从 run_code 程序内部子调用。`mode: 'native' | 'code' | 'both'`。

**工具定义契约**（`ToolDefinition`，`index.ts:222`）：每个工具声明 `output.schema`（强制 JSON Schema）+ `render`（纯投影）+ `execute` + 可选 `finalizeContent`/`presentCall`/`presentResult`/`timeoutMs`/`isConcurrencySafe`。**UI 渲染意图是工具设计的一部分**（`presentCall`/`presentResult` 返回 `ToolCallView`/`ToolResultView`）。

### 5.4 SystemPrompt 组装（`packages/core/system-prompt/src/index.ts`）

`SystemPrompt`（`index.ts:338`）注册表组装每次 step 前的 prompt。四类贡献：

- **section**（有序段落）：`order` 排序，约定 `-100`=harness 身份、`0`=deployment persona、`100-199`=工具引导。支持 `complete` 标志（作为完整 prompt）。
- **context**（动态上下文）：materialize 为 durable user-role 快照。
- **tools**（tool schema provider）：`ToolRuntime` 通过它贡献 schema。
- **variable**（prompt 变量）：`{{variable}}` 严格插值（`index.ts:258` 的 `interpolate`，未知变量 throw）。

作用域遮蔽：作用域 section 遮蔽全局同名 section（`index.ts:483-485`）。`system-prompt/assemble` waterfall 让专家监听器可改写整个 assembly。

### 5.5 Scope 原语（`packages/core/scope/src/index.ts`）

`dsh-scope` 是「每-agent 注册」的原语，是整个多代理架构的基石：

- **createScope(ctx, key)**（`index.ts:137`）：mint 一个作用域 context，继承 minting 插件的依赖 API。
- **scope chain**（`scopeChainOf`，`index.ts:98`）：父子作用域通过 `bindScopeParent` 形成链。
- **两个方向**（`index.ts:33-38`）：注册视图**向下继承**（子作用域看祖先的层）；事件接纳**向上延伸**（祖先 listener 收到后代事件）。
- **scopeTarget(base, key)**（`index.ts:170`）：构建 routing-only 事件载体，带过滤函数决定哪些 listener 收到。

这解决了「一个进程内多个 agent 各自拥有不同工具集/prompt/persona」的问题——通过 scope 而非 fork 进程。

### 5.6 LLM Adapter Seam（`packages/llm/llm/src/index.ts`）

`LlmRuntime`（`index.ts:284`）是 adapter 注册表 + 流式调用 API：

- **registerAdapter(providers, adapter)**（`index.ts:338`）：按 provider route 注册 adapter，all-or-nothing，重复 provider 抛 `DUPLICATE_ADAPTER`。
- **prepareCall()**（`index.ts:779`）：解析 config + adapter 默认值，返回一次性 handle——把 adapter 注册**绑定**到这一次调用，避免 HMR 期间混用两个 adapter 的能力结果。
- **`llm/stream` waterfall**（`index.ts:64`）：包裹每次流式调用，可拦截/重放/路由。
- **结构化错误**（`LlmError`，`index.ts:83`）：共享错误分类 `AUTH`/`RATE_LIMIT`/`NO_ADAPTER`/`CONTEXT_WINDOW_EXCEEDED` 等。
- **attribution headers**：每个请求必须带 `attributionHeaders()`（App 归因 + 匿名用户 ID + session ID）。

**DeepSeek adapter**（`packages/llm/llm-deepseek/README.md`）：直接 `fetch` + SSE，翻译官方 wire format。**动态配置**——connection 事实不冻结在加载时，通过 `ctx.settings`（注册 namespace schema，用户设置覆盖）和 `ctx.credentials`（API key 按请求解析）两个 seam 每次操作重读。这意味着「改模型/key 无需重启」。

---

## 六、Capability Seam 全景（最重要的一页）

`docs/capability-seams.md` 给出了完整的能力 seam 图，这是整个框架「可组合性」的来源。**seam 三角色**：

- **Service Definition**：声明接口的 Cordis `Service`（拥有 `ctx.<key>` 和词汇类型）
- **Service Provider**：实现该接口
- **Consumer**：注入并使用该 service

**一个 seam 是完整的三角色，永远不是一个角色**。举 `shell` 为例：`dsh-shell`（Definition）、`dsh-bash-local`/`dsh-bash-sandbox`/`dsh-pwsh-local`（Provider）、`dsh-tool-bash`/`dsh-tool-pwsh`（Consumer）。

关键 seam（`ctx` key → 说明）：

| seam | 说明 | Provider 示例 |
|------|------|--------------|
| `ctx.llm` | LLM adapter | deepseek-official / pi-ai / replay |
| `ctx.sessionPersistence` | 会话持久化 | jsonl / sqlite |
| `ctx.shell` | bash 执行 | bash-local / bash-sandbox / pwsh-local |
| `ctx.subprocess` | 子进程 | local / e2b |
| `ctx.terminals` | 持久 PTY | terminal-bash |
| `ctx.fs` | 文件系统 | fs-local / fs-sandbox / fs-e2b |
| `ctx.sandbox` | 进程沙箱 | sandbox-local |
| `ctx.compaction` | 上下文压缩 | compaction-basic |
| `ctx.subagents` | 子代理 | 6 种 provider |
| `ctx.web` | web 搜索/抓取 | web-search-deepseek/exa/perplexity / web-fetch-http |
| `ctx.skills` | 技能 | skill-badge / skill-filesystem |
| `ctx.jobs` | 后台任务 | jobs-local |
| `ctx.credentials` | 凭据 | credentials-local |
| `ctx.settings` | 用户设置 | settings-file |
| `ctx.workflowEngine` | 工作流脚本引擎 | workflow-worker-thread |
| `ctx.lsp` | 语言服务器 | lsp-stdio |
| `ctx.codeRuntime` | 代码执行 | code-runtime-worker-thread |
| `ctx.storage` | 非会话存储 | storage-json / storage-sqlite |
| `ctx.spillStore` | 超长文本外溢 | spill-local |
| `ctx.sessionQuery` | 会话查询/搜索 | session-query-sqlite |
| `ctx.approval` | 审批 | acp |
| `ctx.directoryPicker` | 目录选择 | directory-picker-native / -browse |
| `ctx.webServer` | HTTP route | webserver |

**seam 的意义**（`docs/architecture.md:99-102`）：换一个 provider 改变整个产品。例如把 fs + subprocess 都指向 E2B 远程沙箱，Bash、PTY、LSP 一起移到远程，无需 provider fork。

---

## 七、组合系统：Profile / Bundle / Patch

`docs/architecture.md:15-37` 定义了运行时的「插件树」是如何从有序层组合出来的：

- **profile**：命名的组合，存于 Harness home，列出它叠加的 bundles、装的外树插件、用户的 `cordis.patch.yml`。`web`/`headless` 是模板。
- **bundle**：Cordis 配置行 + 代码的发行格式。每个包在 `package.json` 的 `dsh` 字段声明自己：`dsh.profile` 列 profile 的 bundles，`dsh.bundle` 指向 bundle 的 patch 文件。
- **分层顺序**（从空 entry 列表开始）：profile 列出的每个 bundle → profile 的 `cordis.patch.yml` → home 级 patch → `--patch` overlay。patch 按 row id 定位，替换整个 config 或插入新行。

`dsh-base`（`packages/bundle/base/README.md`）是每个 profile 的第一层：模型 adapter、工具、持久化、沙箱/审批策略、settings/credentials、遥测。它用**一个 patch 文件通过平台门控两种 shell 栈**（bash-sandbox vs pwsh-sandbox）。

**关键洞察**：`dsh --profile web --dump-config` 可 dump 当前机器实际启动的插件树，任何 row 都可被 patch 替换。

---

## 八、子代理（Subagent）与工作流（Workflow）

### 8.1 Subagent Seam（`packages/subagent/README.md`）

子代理能力是最值得借鉴的部分——**6 种 provider 共存于一个接口背后**：

| Provider | 说明 |
|----------|------|
| `subagent-spawn-in-process` | 进程内启动全新子 agent |
| `subagent-fork-in-process` | 从父的完整历史 fork 进程内子 agent |
| `subagent-acp` | 通过 ACP 协议启动进程外子 agent |
| `subagent-codex` | 启动真实 Codex app-server 子进程 |
| `subagent-claude-code` | 通过官方 Claude Agent SDK 启动真实 Claude Code 子进程 |
| `subagent-dsh-sdk` | 通过 TS SDK 启动进程外 Harness 子进程 |

**one-shot vs continuable**（`subagent/README.md`）：
- **one-shot**：一次性前台委托，`SubagentRun`，有 `result` 和 `dispose()`。
- **continuable**：持久子 agent，有自己的 Session，通过 `followup()` 发后续消息、`interrupt()` 中断、`reportFrom()` 上报。冷恢复（cold resume）从持久化 Session 重建。

**委派策略继承**（`README.md:60`）：委派边界固定子 agent 的权限范围——`captureDelegatedPolicyOverrides` 快照父的沙箱 override，把子的审批策略钉为 `'never'`，所以委派的子 agent 只能在其继承的沙箱范围内行动，任何 escalation 请求被确定性拒绝。这是**多 agent 安全的教科书设计**。

**子 agent 的 delegation-scope 声明**（`README.md:133`）——每个子 agent 的 runtime-context 快照带这句固定声明：

> You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session — operations that require approval are rejected automatically.

### 8.2 Workflow Seam（`packages/workflow/workflow/README.md`）

`ctx.workflowEngine` 执行**模型编写的编排脚本**，可 fan out 子代理。`WorkflowStartRequest` 含 `{meta, script, args, subagentProvider, maxTotalAgents, parent, signal}`。失败纪律：`WorkflowError` 带 `code` + `fatal` 标志，致命错误逃逸 `parallel()`/`pipeline()`。

**已知限制**（README:53-60）：仅前台收集、无 journaling/resume、无嵌套 workflow、无 token 预算词汇、runs 由 holder 拥有而非 service 追踪。

---

## 九、沙箱与安全

`packages/sandbox/` + `packages/fs/` 是实现「安全执行」的核心：

- **sandbox seam**：`ctx.sandbox` 应用 per-session 限制策略。consumer 把「即将 spawn 的 argv」交给 backend，backend 按 per-call policy 包装。
- **sandbox-policy**：`ctx.sandboxPolicy` 是部署默认模式 + workspace root 的唯一 home。bash 和 fs 都读它，所以两者不会限制到不同的 root。
- **Windows ACL**：`native/landlock-run`（Linux Landlock）+ `dsh-sandbox-windows-acl`（Windows 受限 token runner）。`workspace-write` 限制写操作到 workspace + 会话自己的 temp 子目录。
- **fs 观察策略**：`fs-observation-policy` 通过 `fs/*` 事件门提供 read-before-edit + version-guarded write/edit 保护。
- **权限预设**：`permission-presets` 提供 `workspace-write`/`danger-full-access` 预设表，一个开关写一个 `permission/preset` 事件。

**fail-closed 哲学**：审批缺省或不可回答则 deny；未知工具报 `UNKNOWN_TOOL`；凭证无效则 `MISSING_CREDENTIAL` 且不泄露 key 的任何部分。

---

## 十、多运行时形态

- **CLI**（`apps/cli/src/bin.ts`）：`dsh web` / `dsh --profile headless "task"`。headless 是一次性 runner，无 server。
- **ACP**（`packages/acp/acp`）：Agent Client Protocol 自动化服务，纯自动化接口，无 UI。
- **Web UI**（`apps/web` + `packages/client/*`）：浏览器应用，通过 loopback HTTP/WebSocket 连接 Host。
- **Python SDK**（`python/sdk` + `python/sdk-runtime`）：Python 客户端 + bundled runtime。
- **SDK**（`packages/sdk/`）：JSON-RPC 协议 + 服务端 + TS 客户端。

---

## 十一、对腾昇智和 Agent 的借鉴点总结

以下是从本框架提炼、可直接映射到我们项目「后续 agent 提升」的设计决策：

### 1. 事件溯源会话日志（最重要）
**「模型可见 ⟺ 已记录」** + append-only `SessionEvent` 日志，是解决我们当前「会话历史丢失」「localStorage 消息计数时序 bug」（见 `docs/research/deepseek-hermes-functional-analysis.md` 提到的两个风险）的根本方案。我们当前的对话状态散落在 localStorage / sessionStorage / SQLite 多处，缺少单一权威日志。**借鉴**：建立 append-only 事件日志，消息历史永远从日志派生（`deriveMessages`），fork/恢复/遥测/压缩全部派生自此。

### 2. Capability Seam 三角色
「Service Definition / Provider / Consumer」三角色 + `ctx.<key>` 服务查找，让「换 provider」成为配置操作而非代码改动。我们当前 `app/lib/llm-providers.ts` + `llm-client.ts` 已经是雏形，但工具（搜索、生图、生视频）未统一到 seam。**借鉴**：为搜索、生图、生视频、附件建立统一 seam，各 provider（Coze/DeepSeek/OpenAI 兼容）实现同一接口。

### 3. 作用域注册原语（dsh-scope）
「每-agent 工具集/prompt/persona」通过 scope 而非 fork 进程实现，shadowing + restriction 两个机制。我们当前多 agent（创意协作的 supervisor/research/creative/review）如果用这套，每个角色可有不同工具集。

### 4. 工具执行管线
`pre-execute` → guard → approval → `execute` → `post-execute` → `finalize` → `result` 的多阶段 waterfall，让权限/沙箱/超时/指标都作为「围绕调度」的监听器插入，工具本身不耦合策略。这是比我们当前「工具内硬编码校验」优雅得多的方案。

### 5. 作用域化事件分发
事件「向下继承注册、向上延伸监听」，用 `scopeTarget` 构建 routing-only 载体。这解决了「多个并发 agent 各自的工具/事件互不干扰」的隔离问题。

### 6. 子代理委派策略继承
`captureDelegatedPolicyOverrides` + 审批钉为 `'never'` + delegation-scope 声明，是「子 agent 不能越权」的标准实现。我们的 `CollaborativeRunPanel` 多角色编排可直接借鉴。

### 7. 可逆副作用 + `ctx.effect()`
所有注册返回 disposer，卸载自动逆转。配合 HMR 和 profile 切换（desktop 的场景）尤其关键。

### 8. Agent Note 决策记录
`.agents/notes/` 机制——每个非平凡变更配一篇决策记录，解决「为什么这样设计」的知识流失。我们项目的 memory 系统可对标。

### 9. 结构化错误分类
`LlmError` 共享错误 code 分类（`AUTH`/`RATE_LIMIT`/`NO_ADAPTER`/`CONTEXT_WINDOW_EXCEEDED`）+ `LlmFailure` 保留 HTTP status + Retry-After。我们当前的错误处理是散落的字符串比较，可统一为结构化错误。

### 10. 自动化门禁
150 个包靠 60+ `verify-*` 脚本（包不变量、导出 JSDoc、工具目录、Cordis 配置一致性）保证一致性。我们项目虽然规模小，但「靠自动化而非人工 review」保证不变量（如「颜色只用 CSS 变量」「Canvas 监听 data-theme」）值得借鉴。
