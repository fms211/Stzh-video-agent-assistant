# Hermes 风格研究运行工作台与 Harness 式外部插件系统实施规划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先在现有“创意工坊”内生成接口就绪的风格研究运行工作台，再在“模型与角色”页生成插件中心 Web 原型，最终为用户自由安装 npm、Git 和本地插件提供账户级多版本仓库、项目级启用、独立插件宿主、权限代理、全站 UI 槽位和安全恢复能力。

**Architecture:** 阶段 A 保留现有创意工坊和另外五个工作流，通过 `ResearchRuntimeAdapter` 隔离页面与运行时。阶段 B 通过 `PluginCenterAdapter` 生成接口就绪的插件中心和 sandboxed iframe 槽位原型。阶段 C 才实现真实 package store、安装流水线、项目插件 Generation 和独立 Node 插件宿主；两套 Web 原型均先使用确定性 Mock Adapter，后端接入时不重写组件。

**Tech Stack:** Next.js 16.2.4、React 19.2.4、TypeScript 5、Motion 12、CSS Modules、Lucide React、Express 5、Node child process/RPC、SQLite、Node `node:test`、现有本地字体和视觉 token。

## Global Constraints

- 阶段 A/B 只生成 Web 原型，不修改 Electron、Expo、Express 路由、SQLite schema、Coze Runtime 或真实模型配置；阶段 C 才按 Task 16–20 实现服务端插件运行时，仍不修改 Electron/Expo。
- GM 5.3 Flash 的执行顺序固定为：先完成并验收阶段 A 风格研究工作台，再生成阶段 B 插件中心；阶段 C 的真实安装器、数据库和插件宿主由后端工程阶段完成。
- 原型不得请求真实 Coze、模型、RAG、搜索或第三方接口；所有运行数据由 Mock Adapter 产生，并清楚标注为演示数据。
- 插件中心原型不得真的调用 npm、Git、文件系统、构建脚本或第三方插件代码；真实插件能力只通过接口和状态机演示。
- 保留现有深空主题、星轨背景、FusionPixel-CJK 像素标题、暖橙/冷蓝/极光紫、流动边框和辉光，不改成 DSH 黑白中性风。
- 保留“主工作区”、普通创意助手、协作编排、模型与角色、任务中心及另外五个工作流的现有行为。
- 不新增 npm 依赖；复用 `motion/react`、Lucide、现有 CSS token、`currentDataOwner()` 与 `ownerScope()`。
- 原型状态必须来自事件投影，不允许使用与运行事实无关的轮播文案模拟执行阶段。
- 减少动画偏好必须关闭位移、缩放、扫光和宽度弹簧，只保留即时状态切换或短淡入。
- 当前工作树存在大量未提交内容；实施时不得重置、覆盖或批量格式化无关文件。Git 提交须另获用户授权，获准后也只能暂存本任务文件。
- 页面生成完成后，按项目约定新增一份真实的 `更新md/` 记录；不得把未执行的检查写成已通过。

---

## 1. 当前项目复审结论

### 1.1 已经吸收的 Hermes / Harness 特点

- 服务端已有可靠 `TaskRuntime`：SQLite 租约、全局/账户并发、续租、暂停、取消、重试、优雅停止和三入口装配均已有测试。
- `agent_run_events` 已能记录多角色协作阶段；LangGraph 已具备主管、研究、创意、审校和预算上限。
- 模型与角色中心已实现账号隔离、API Key 加密、角色能力标签和角色默认模型。
- 主工作区已经把协作编排嵌入原输入区，并通过人工确认投递到可靠任务队列。
- 任务中心已具备列表/详情、实时 WebSocket、15 秒轮询保障、暂停/继续/取消/重试和手机配对入口。
- 创意工坊已有可拖拽双区、提示词实验台、普通模型助手、六个工作流、RAG、网络搜索和本地记忆雏形。
- Web/Electron 已采用同一 Next.js UI；Electron 已有托盘常驻、内嵌后端、任务 Runtime 与账户数据目录。

### 1.2 本轮真实浏览器审查发现

- 当前 `npm run test:p0` 为根项目 28/28、服务端 82/82；Web 和 Expo TypeScript 检查通过。
- 主工作区在任务真实状态为“已排队，等待服务器调度”时，仍会循环显示“检索知识库”“构建分镜脚本”等假阶段。这会让用户误以为工具已执行，是本次必须首先消除的产品错误。
- “风格研究与应用”仍在 `ModelAssistantPanel` 内顺序调用客户端 RAG、搜索和模型函数；页面卸载后不能可靠继续，也没有计划确认、事件序号、断点恢复和可验证来源产物。
- 当前会话同步会在新建会话初期产生服务端 404；这证明本地 UI 状态与服务端事实仍存在时间窗口。原型必须通过 Adapter 隔离，不能再把组件与存储时序绑死。
- 创意工坊双区视觉成熟，但提示词实验台内容密度很高；再直接塞入轨迹会压缩中央阅读区域，因此采用折叠轨 + 中央运行区 + 右侧检查器。
- 设置抽屉和会话侧栏可以同时展开，覆盖大部分页面；原型的双侧面板必须有清晰的互斥、层级和焦点恢复规则。
- 顶部导航在收起时部分图标按钮缺少稳定可访问名称；本任务不改变导航视觉，但所有新增图标按钮必须显式提供 `aria-label`。
- LibTV 仍是 Coming Soon 页面，却占用一级导航；这属于后续信息架构整理，不进入本原型生成范围。
- Electron 仍缺 DSH Desktop 的 Safe Mode、启动恢复、诊断导出、单实例、导航限制和更新体验；用户已选择“仅 Web 原型”，这些列入后续路线，不在本次页面生成中混做。

### 1.3 本次采用的上游借鉴

- DeepSeek Harness 的 append-only SessionEvent、计划/审批、工具卡、来源/产物、Trajectory 和“模型可见即已记录”原则。
- DSH Desktop 的最小中心宽度保护、可折叠侧栏、可拖拽详情栏、`useSyncExternalStore` 外部布局状态和 reduced-motion 降级。
- 不照搬上游品牌、完整 Workspace/Session 左侧树、Preset 打包、Subagent 目录、Electron 恢复窗口或移动端桥接；插件市场和插件生命周期则按本产品账户/项目模型重新设计。

参考资料：

- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Tool execution pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)
- [Trajectory UI](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-trajectory/README.zh.md)
- [Workspace UI](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-workspace/README.zh.md)
- [DSH Desktop architecture](https://github.com/anywhere-labs/dsh-desktop/blob/master/docs/architecture.md)

---

## 2. 已确认的产品设计

### 2.1 入口与范围

1. 保留现有“创意工坊 → 创意助手 → 工作流”入口。
2. `风格研究与应用` 增加“运行工作台试点”标记；用户填写“风格名称”和“应用场景”后，按钮文案改为“生成研究计划”。
3. 点击后进入 `research-run` 模式。普通对话和另外五个工作流继续走现有路径。
4. 退出运行工作台后恢复进入前的双区宽度与焦点，不清空研究 Run。
5. Header 提供最近 20 个风格研究 Run 的切换菜单；切换只改变订阅，不暂停后台 Run。

### 2.2 页面几何

- 左侧提示词轨：收起宽度 56px；浮层展开宽度 320px；固定后允许 300–420px。
- 中央运行主视图：在可停靠布局中保证 640px 最小宽度；承载输入摘要、计划确认、运行阶段、最终回答和继续提问。
- 右侧检查器：默认 360px，可拖拽 300–480px；四个标签依次为“计划、资料、产物、轨迹”。
- `viewport >= 1280px`：左轨收起、中央区、右检查器三列停靠。
- `1024px <= viewport < 1280px`：右检查器默认收起为边缘按钮，打开时覆盖在中央右侧；左轨只允许浮层展开。
- `viewport < 1024px`：中央单列；提示词轨与检查器均以全高侧滑层打开，禁止宽度拖拽。该规则只保证响应式 Web，不等同于 Expo 移动端实现。
- 布局降级顺序固定为：收回固定提示词面板 → 压缩右检查器到 300px → 收起右检查器。不得把中央区压到 640px 以下后仍保留双侧停靠。

### 2.3 动效与视觉

- 完全复用现有背景、色彩、字体、标题、卡片、流动边框和辉光工具类。
- 左轨浮层：从左侧滑入，`spring { stiffness: 260, damping: 30, mass: 0.8 }`。
- 右检查器：从右侧滑入；拖拽期间宽度即时跟随 Pointer，不叠加 spring；释放后只对越界修正使用 160ms easing。
- 进入运行工作台：中央内容从 `scale: 0.985, opacity: 0` 到 `scale: 1, opacity: 1`，不做大幅飞入。
- 运行状态只在真实事件到达时变化；进行中工具卡允许使用现有低强度扫光，已完成卡立即停止动画。
- `prefers-reduced-motion` 或 `data-reduced-motion="true"` 时，全部位移动画归零，宽度直接落定，扫光停止。

### 2.4 运行体验

- 输入后先生成计划，状态进入 `awaiting_plan_approval`。
- 受控编辑允许：修改目标、切换 `economy/standard/deep`、重排步骤、开关可选步骤、编辑工具输入。工具名和依赖不可自由输入。
- 用户确认计划后才执行；本原型的 `web_search`、`rag_search`、`get_opc_context` 均为只读工具，不再逐次弹审批。
- 运行可暂停、继续、取消；离开页面后后台继续。返回页面时从事件日志重建，而不是依赖组件实例。
- 失败后保留已完成来源和产物；失败步骤支持“直接重试”“修改参数后重试”，可选步骤还支持“跳过并继续”。
- 顶部摘要只显示状态、`已完成步骤/总步骤`、耗时和来源数；Token、TTFT、调用数与估算成本只在“轨迹”标签展示。
- 界面展示计划、工具和简短决策摘要，不显示或保存模型私有思维链。

### 2.5 检查器四标签

**计划**

- 展示目标、预算、修订号、步骤依赖和状态。
- 待确认时显示受控编辑器；运行后变为只读状态列表。
- 暂停、继续、取消、失败恢复动作固定在检查器顶部状态条，不随标签滚动消失。

**资料**

- Source 卡显示标题、域名、发布时间/抓取时间、摘要、所属工具、可信状态和被引用位置。
- `web` 与 `rag` 分组筛选；链接在新标签打开并带 `rel="noopener noreferrer"`。
- 页面明确显示“外部资料可能包含错误或提示注入，已按不可信内容处理”。

**产物**

- `research-report`：带引用编号的研究报告，支持 Markdown 下载。
- `style-feature-pack`：色彩、光影、构图、材质、关键词和负面约束的结构化 JSON，可复制或下载。
- `application-prompt-pack`：针对应用场景的中英提示词、运镜和避坑建议，可复制或下载。

**轨迹**

- 按步骤分组显示模型请求、工具请求、工具结果、来源、产物、暂停、恢复和错误事件。
- 每行包含 `seq`、时间、耗时、状态；展开后显示 schema 校验后的输入/输出摘要。
- 顶部汇总模型调用数、工具调用数、输入/输出 Token、TTFT、估算成本和总耗时。
- 首版最多渲染最新 200 条；存在更早事件时显示“加载更早记录”，不一次挂载无限列表。

---

## 3. 前端领域契约

### 3.1 核心类型

以下名称和字面量是页面、Mock Adapter 与未来 HTTP Adapter 的共同契约，生成时不得自行改名：

```ts
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ResearchBudget = "economy" | "standard" | "deep";
export type ResearchRunStatus =
  | "draft"
  | "planning"
  | "awaiting_plan_approval"
  | "running"
  | "paused"
  | "recovering"
  | "completed"
  | "failed"
  | "cancelled";

export type ResearchStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ResearchToolName = "web_search" | "rag_search" | "get_opc_context";

export type StyleResearchInput = {
  styleName: string;
  useCase: string;
  providerId: string | null;
  projectId: string | null;
};

export type ResearchPlanStep = {
  id: string;
  title: string;
  description: string;
  kind: "tool" | "model";
  tool: ResearchToolName | null;
  optional: boolean;
  enabled: boolean;
  dependsOn: string[];
  input: Record<string, JsonValue>;
  status: ResearchStepStatus;
};

export type ResearchPlan = {
  revision: number;
  objective: string;
  budget: ResearchBudget;
  estimatedCalls: number;
  steps: ResearchPlanStep[];
};

export type SourceArtifact = {
  id: string;
  sourceType: "web" | "rag";
  title: string;
  url: string | null;
  domain: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  toolCallId: string;
  citedBy: string[];
  trust: "untrusted" | "project_knowledge";
};

export type OutputArtifact = {
  id: string;
  type: "research-report" | "style-feature-pack" | "application-prompt-pack";
  title: string;
  mimeType: "text/markdown" | "application/json";
  fileName: string;
  content: string;
  createdAt: string;
  sourceIds: string[];
};

export type ResearchRunMetrics = {
  elapsedMs: number;
  completedSteps: number;
  totalSteps: number;
  sourceCount: number;
  modelCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  ttftMs: number | null;
  estimatedCostCny: number | null;
};

export type ResearchRunSnapshot = {
  runId: string;
  workflowId: "style-research";
  input: StyleResearchInput;
  status: ResearchRunStatus;
  plan: ResearchPlan | null;
  activeStepId: string | null;
  sources: SourceArtifact[];
  artifacts: OutputArtifact[];
  metrics: ResearchRunMetrics;
  error: { code: ResearchErrorCode; message: string; stepId: string | null } | null;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type ResearchErrorCode =
  | "RUN_NOT_FOUND"
  | "PLAN_REVISION_CONFLICT"
  | "INVALID_PLAN_OPERATION"
  | "INVALID_STATE_TRANSITION"
  | "TOOL_NOT_REGISTERED"
  | "BUDGET_EXCEEDED"
  | "UPSTREAM_TIMEOUT"
  | "STREAM_GAP"
  | "AUTH_REQUIRED";
```

### 3.2 计划操作与运行动作

```ts
export type PlanOperation =
  | { type: "set_objective"; value: string }
  | { type: "set_budget"; value: ResearchBudget }
  | { type: "move_step"; stepId: string; toIndex: number }
  | { type: "set_optional_enabled"; stepId: string; enabled: boolean }
  | { type: "set_step_input"; stepId: string; input: Record<string, JsonValue> };

export type ResearchRunAction =
  | { type: "approve_plan"; expectedRevision: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "cancel" }
  | { type: "retry_step"; stepId: string; input?: Record<string, JsonValue> }
  | { type: "skip_step"; stepId: string };
```

### 3.3 事件 envelope

所有事件都使用以下 envelope；`seq` 对单个 Run 严格递增，`version` 首版固定为 `1`：

```ts
export type ResearchEventType =
  | "run.created"
  | "plan.generated"
  | "plan.updated"
  | "plan.approved"
  | "run.started"
  | "run.paused"
  | "run.resumed"
  | "run.recovering"
  | "run.cancelled"
  | "run.completed"
  | "run.failed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "step.skipped"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "source.added"
  | "artifact.created"
  | "metrics.updated";

export type RunEvent = {
  version: 1;
  runId: string;
  seq: number;
  type: ResearchEventType;
  occurredAt: string;
  payload: Record<string, JsonValue>;
};
```

投影规则：

- `event.seq <= snapshot.lastSeq`：视为重复帧并忽略。
- `event.seq === snapshot.lastSeq + 1`：应用事件并更新 `lastSeq`。
- `event.seq > snapshot.lastSeq + 1`：不猜测中间状态，返回 `needsResync: true`，Adapter 重新获取完整 Snapshot 后再订阅。
- 任何非法状态跃迁都产生 `INVALID_STATE_TRANSITION`，UI 保留最后一个有效 Snapshot。

### 3.4 Adapter

```ts
export type ResearchRunSummary = Pick<
  ResearchRunSnapshot,
  "runId" | "workflowId" | "status" | "input" | "metrics" | "createdAt" | "updatedAt"
>;

export type ResearchSubscription = {
  close(): void;
};

export interface ResearchRuntimeAdapter {
  createRun(input: StyleResearchInput): Promise<ResearchRunSnapshot>;
  getRun(runId: string): Promise<ResearchRunSnapshot>;
  listRuns(limit: number): Promise<ResearchRunSummary[]>;
  updatePlan(
    runId: string,
    expectedRevision: number,
    operations: PlanOperation[],
  ): Promise<ResearchPlan>;
  act(runId: string, action: ResearchRunAction): Promise<void>;
  subscribe(
    runId: string,
    afterSeq: number,
    handlers: {
      onEvent(event: RunEvent): void;
      onError(error: Error): void;
    },
  ): ResearchSubscription;
  dispose(): void;
}
```

### 3.5 未来 REST + SSE 契约

原型不调用这些接口，但 Mock Adapter 的方法与数据必须一一对应：

| Method | Path | 语义 |
|---|---|---|
| `POST` | `/api/research-runs` | 创建 Run 并开始生成计划，返回初始 Snapshot |
| `GET` | `/api/research-runs/:runId` | 获取权威 Snapshot，用于首次加载和断流重同步 |
| `GET` | `/api/research-runs?workflowId=style-research&limit=20&cursor=` | 获取最近运行 |
| `PATCH` | `/api/research-runs/:runId/plan` | `{ expectedRevision, operations }`，返回新 Plan |
| `POST` | `/api/research-runs/:runId/actions` | 提交 `ResearchRunAction` |
| `GET` | `/api/research-runs/:runId/events?afterSeq=N` | SSE 事件流；`id` 使用十进制 seq，`event` 固定为 `run.event` |

SSE 重连规则：浏览器同时发送 `Last-Event-ID` 和 `afterSeq`；服务端从较大值之后发送。断线后指数退避为 1s、2s、4s、8s、最长 15s；收到事件 gap 时立即停止应用增量并获取 Snapshot。

---

## 4. 文件职责图

### 新建

| 文件 | 单一职责 |
|---|---|
| `app/lib/research-runtime/types.ts` | 上述共享类型与状态字面量 |
| `app/lib/research-runtime/adapter.ts` | Adapter interface、Provider 和 React hook 边界 |
| `app/lib/research-runtime/projector.ts` | 纯函数事件投影与状态跃迁校验 |
| `app/lib/research-runtime/mock-adapter.ts` | 确定性计时器、动作处理、订阅和本地恢复 |
| `app/lib/research-runtime/mock-fixtures.ts` | 风格研究演示计划、来源、产物和失败场景 |
| `app/components/research-workbench/layout-store.ts` | `useSyncExternalStore` 布局状态和列宽计算 |
| `app/components/research-workbench/ResearchWorkbench.tsx` | 组合左轨、中央运行区、右检查器，不实现业务细节 |
| `app/components/research-workbench/PromptRail.tsx` | 提示词实验台折叠/浮层/固定外壳 |
| `app/components/research-workbench/ResearchRunSurface.tsx` | 输入摘要、计划确认、运行、完成与继续提问主视图 |
| `app/components/research-workbench/RunInspector.tsx` | 四标签、状态条、宽度拖拽和收起 |
| `app/components/research-workbench/ResearchWorkbench.module.css` | 工作台专属响应式、布局与动效 |
| `test/research-runtime-projector.test.js` | 事件顺序、去重、gap、状态跃迁和恢复测试 |
| `test/research-workbench-ui-contract.test.js` | 页面入口、范围隔离、可访问性和视觉契约静态测试 |

### 修改

| 文件 | 变更边界 |
|---|---|
| `app/lib/opc-workflows.ts` | 给 `style-research` 增加 `runtimeMode: "research-workbench"`；另外五项不变 |
| `app/components/ModelAssistantPanel.tsx` | 运行时试点 workflow 通过 callback 交给 Workbench；保留现有 chat 和链式 workflow |
| `app/components/CreativeStudio.tsx` | 在 classic 与 research-run 两种视图间切换，复用同一个 `OPCPanel` |
| `app/components/HomeClient.tsx` | 在 workspace 生命周期内创建并提供 Mock Adapter，避免页面切换销毁运行 |
| `app/globals.css` | 只复用/补充全局 token 或 reduced-motion 联动，不复制整套工作台样式 |

不得把上述新组件继续堆进 `ModelAssistantPanel.tsx` 或 `CreativeStudio.tsx`；这两个文件只负责路由与组合。

---

## 5. 分任务执行规划

### Task 1: 固化运行时类型与事件投影

**Files:**

- Create: `app/lib/research-runtime/types.ts`
- Create: `app/lib/research-runtime/projector.ts`
- Create: `test/research-runtime-projector.test.js`

**Interfaces:**

- Produces: `ResearchRunSnapshot`、`RunEvent`、`projectRunEvent(snapshot, event)`。
- `projectRunEvent` 返回 `{ snapshot, duplicate: boolean, needsResync: boolean }`。

- [ ] **Step 1: 写事件投影失败测试**

  覆盖按序应用、重复 seq、gap、完成后拒绝 `step.started`、失败后进入 `recovering`、来源和产物幂等插入。

  ```js
  test("a sequence gap requires resync without mutating the snapshot", async () => {
    const { projectRunEvent } = await import(`../app/lib/research-runtime/projector.ts?gap=${Date.now()}`);
    const snapshot = createSnapshot({ lastSeq: 3 });
    const result = projectRunEvent(snapshot, createEvent({ seq: 5, type: "run.paused" }));
    assert.equal(result.needsResync, true);
    assert.equal(result.snapshot, snapshot);
  });
  ```

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/research-runtime-projector.test.js`

  Expected: FAIL，原因是 `projector.ts` 尚不存在。

- [ ] **Step 3: 实现类型和纯投影函数**

  严格使用第 3 节类型；每个事件 handler 返回新对象，不原地修改数组。`source.added` 与 `artifact.created` 按 id 替换或追加，不能产生重复卡片。

- [ ] **Step 4: 运行投影测试**

  Run: `node --test test/research-runtime-projector.test.js`

  Expected: PASS，且无未处理 Promise rejection。

- [ ] **Step 5: 类型检查**

  Run: `npx tsc --noEmit`

  Expected: exit 0。

### Task 2: 建立 Adapter 与可刷新恢复的 Mock Runtime

**Files:**

- Create: `app/lib/research-runtime/adapter.ts`
- Create: `app/lib/research-runtime/mock-adapter.ts`
- Create: `app/lib/research-runtime/mock-fixtures.ts`
- Test: `test/research-runtime-projector.test.js`

**Interfaces:**

- Consumes: Task 1 类型与 `projectRunEvent()`。
- Produces: `createMockResearchRuntimeAdapter({ owner, storage, clock? })`；其 `dispose()` 必须清理 timer 和全部订阅。

- [ ] **Step 1: 增加 Adapter 行为测试**

  测试 create → plan、计划 revision conflict、approve、pause、resume、cancel、failure、retry、跨实例恢复和离开页面后继续产生事件。

- [ ] **Step 2: 运行测试并确认新增场景失败**

  Run: `node --test test/research-runtime-projector.test.js`

  Expected: 新增 Adapter 用例 FAIL，投影用例仍 PASS。

- [ ] **Step 3: 实现 Mock 数据存储**

  存储 key 固定为 `tszh:v2:${ownerScope(owner)}:research-runtime`。值包含 `{ runs, events }`；每个 Run 只保存 JSON 可序列化数据。Adapter 作为 HomeClient 生命周期内的单例持有计时器和订阅者，组件卸载只关闭订阅，不停止 Run。

- [ ] **Step 4: 实现确定性演示流程**

  演示输入使用“赛博朋克”和“国产工业机器人 8 秒产品短片”。确认后依次产生：OPC 上下文、Web 搜索、RAG 核对、特征提取、应用方案；至少 6 条演示来源、3 个产物和完整 metrics。所有来源卡显示“演示来源”，不得伪装为当前联网结果。

- [ ] **Step 5: 实现故障开关**

  在轨迹开发控件中提供“下一步模拟超时”动作，仅在 Mock Adapter 下出现；触发 `UPSTREAM_TIMEOUT`，随后可原位重试。该控件不得出现在未来 HTTP Adapter。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `node --test test/research-runtime-projector.test.js && npx tsc --noEmit`

  Expected: 全部 PASS。

### Task 3: 实现自适应工作台布局状态

**Files:**

- Create: `app/components/research-workbench/layout-store.ts`
- Create: `app/components/research-workbench/ResearchWorkbench.tsx`
- Create: `app/components/research-workbench/ResearchWorkbench.module.css`
- Test: `test/research-workbench-ui-contract.test.js`

**Interfaces:**

- Produces: `createResearchLayoutStore()`、`computeResearchColumns(snapshot)`、`ResearchWorkbench`。

- [ ] **Step 1: 写布局计算测试**

  覆盖 1600、1366、1180、1024、960 宽度；断言中央区最小宽度、检查器 300–480 限制和降级顺序。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/research-workbench-ui-contract.test.js`

  Expected: FAIL，缺少布局模块。

- [ ] **Step 3: 实现 external store**

  Snapshot 字段固定为 `viewportWidth`、`promptMode`、`promptWidth`、`inspectorOpen`、`inspectorWidth`、`activeInspectorTab`。使用 `Object.freeze` 发布新 snapshot；React 通过 `useSyncExternalStore` 订阅。

- [ ] **Step 4: 实现拖拽与键盘调整**

  Pointer handle 使用 `setPointerCapture`。ArrowLeft/ArrowRight 每次调整 16px，Home 设 300px，End 设 480px；handle 具有 `role="separator"`、`aria-orientation="vertical"`、`aria-valuemin/max/now`。

- [ ] **Step 5: 实现 responsive 与 reduced-motion**

  使用 ResizeObserver 更新 store。低于 1280 收起检查器；低于 1024 禁止停靠和拖拽。减少动画时移除 transform/width transition。

- [ ] **Step 6: 验证**

  Run: `node --test test/research-workbench-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 4: 实现中央 Run Surface 与受控计划编辑

**Files:**

- Create: `app/components/research-workbench/ResearchRunSurface.tsx`
- Create: `app/components/research-workbench/ResearchPlanEditor.tsx`
- Modify: `app/components/research-workbench/ResearchWorkbench.module.css`
- Test: `test/research-workbench-ui-contract.test.js`

**Interfaces:**

- Consumes: `ResearchRunSnapshot`、`ResearchRuntimeAdapter.updatePlan()`、`act()`。
- Produces: 不向外暴露新 store；全部动作经 Adapter。

- [ ] **Step 1: 增加 UI contract 测试**

  静态断言页面具有“生成研究计划”“确认并开始”“暂停”“继续”“取消”“修改参数后重试”，并断言不存在现有 `thinkingStages` 轮播的复用。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/research-workbench-ui-contract.test.js`

  Expected: 新断言 FAIL。

- [ ] **Step 3: 实现五种主视图**

  分别渲染输入/规划中、待确认计划、运行/暂停、失败恢复、完成。计划编辑器只能产生第 3.2 节 `PlanOperation`；保存时携带当前 revision，冲突时重新读取 Snapshot 并显示“计划已在其他位置更新”。

- [ ] **Step 4: 实现后台返回体验**

  Run header 显示最近运行菜单、状态、步骤、耗时和来源数。切换 Run 时关闭旧订阅并从新 Run 的 `lastSeq` 继续，不能调用 pause。

- [ ] **Step 5: 验证**

  Run: `node --test test/research-workbench-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 5: 实现四标签检查器

**Files:**

- Create: `app/components/research-workbench/RunInspector.tsx`
- Create: `app/components/research-workbench/PlanTab.tsx`
- Create: `app/components/research-workbench/SourcesTab.tsx`
- Create: `app/components/research-workbench/ArtifactsTab.tsx`
- Create: `app/components/research-workbench/TrajectoryTab.tsx`
- Modify: `app/components/research-workbench/ResearchWorkbench.module.css`

**Interfaces:**

- Consumes: 一个只读 `ResearchRunSnapshot` 和 Adapter actions。
- `activeInspectorTab` 字面量固定为 `plan | sources | artifacts | trajectory`。

- [ ] **Step 1: 增加检查器 contract 测试**

  断言四个 tab 的 ARIA 名称、独立状态条、来源安全提示、三类 artifact、轨迹 metrics 和 200 事件上限文案。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/research-workbench-ui-contract.test.js`

  Expected: 新断言 FAIL。

- [ ] **Step 3: 实现标签与状态条**

  首次打开 Run 默认 Plan；用户手动切换后不得因新事件强制跳 tab。完成时只给 Artifacts tab 增加数量徽标。审批、暂停、失败和取消确认放在 tabs 上方。

- [ ] **Step 4: 实现来源与产物动作**

  下载使用 Blob 和 `URL.createObjectURL`，完成后 revoke；复制动作写入 Clipboard 并提供可见成功状态。Source 外链严格使用 `_blank` 与 `noopener,noreferrer`。

- [ ] **Step 5: 实现轨迹折叠**

  按 stepId 分组；行只显示摘要，展开显示 JSON 格式化内容。默认显示最新 200 条；演示数据不足 200 时不显示“加载更早记录”。

- [ ] **Step 6: 验证**

  Run: `node --test test/research-workbench-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 6: 实现提示词折叠轨并复用 OPCPanel

**Files:**

- Create: `app/components/research-workbench/PromptRail.tsx`
- Modify: `app/components/CreativeStudio.tsx`
- Modify: `app/components/research-workbench/ResearchWorkbench.module.css`

**Interfaces:**

- Consumes: 现有 `OPCPanel` callbacks 和 Task 3 layout store。
- Produces: `PromptRail` 的 `overlay`、`pinned`、`rail` 三态。

- [ ] **Step 1: 增加复用测试**

  断言 `CreativeStudio` 仍只有一个 OPCPanel 实例来源，运行模式下通过 PromptRail 承载；不得复制模板、风格和镜头数据。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/creative-workspace-ui-contract.test.js test/research-workbench-ui-contract.test.js`

  Expected: 新 PromptRail 断言 FAIL，原测试 PASS。

- [ ] **Step 3: 实现 rail/overlay/pinned**

  Rail 使用 Lucide 图标和显式 aria-label；点击展开 overlay，用户点击“固定”后占据列宽。外部点击和 Escape 只关闭 overlay，不取消 pinned。关闭后焦点返回触发按钮。

- [ ] **Step 4: 保持 OPC 上下文联动**

  现有 `stylePrefix`、`duration`、`aspect`、`cameraMove`、`selectedParams` 继续由 CreativeStudio 持有，并作为 `get_opc_context` 演示工具结果写入事件。

- [ ] **Step 5: 验证**

  Run: `node --test test/creative-workspace-ui-contract.test.js test/research-workbench-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 7: 将 style-research 接入 Workbench，隔离其他工作流

**Files:**

- Modify: `app/lib/opc-workflows.ts`
- Modify: `app/components/ModelAssistantPanel.tsx`
- Modify: `app/components/CreativeStudio.tsx`
- Modify: `app/components/HomeClient.tsx`
- Test: `test/creative-workspace-ui-contract.test.js`

**Interfaces:**

- `WorkflowDefinition` 新增可选 `runtimeMode?: "research-workbench"`。
- `ModelAssistantPanel` 新增 `onLaunchRuntime(input: StyleResearchInput): void`。

- [ ] **Step 1: 写范围隔离测试**

  断言只有 `style-research` 带 runtimeMode；另外五个 workflow 仍调用现有 `runWorkflow()`；Coze ChatFlow、协作编排和 TaskCenter 不引用 ResearchRuntimeAdapter。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/creative-workspace-ui-contract.test.js`

  Expected: 新断言 FAIL。

- [ ] **Step 3: 在 HomeClient 创建 Adapter 单例**

  使用当前账户 `dataOwnerFromUser(user)` 创建 Mock Adapter；账户切换时调用旧 Adapter 的 `dispose()` 并创建新 owner scope。Adapter 通过 props 传给 CreativeStudio，不使用全局可变单例。

- [ ] **Step 4: 路由 style-research**

  当 workflow.runtimeMode 存在时，表单按钮调用 `onLaunchRuntime`；否则保持原 `runWorkflow`。运行工作台退出后恢复普通 ModelAssistantPanel 和先前 split width。

- [ ] **Step 5: 验证现有功能无回归**

  Run: `npm run test:p0 && npx tsc --noEmit`

  Expected: 根项目和服务端测试全部 PASS，TypeScript exit 0。

### Task 8: 完成视觉、响应式和可访问性验收

**Files:**

- Modify: `app/components/research-workbench/ResearchWorkbench.module.css`
- Modify only if required: `app/globals.css`
- Test: `test/research-workbench-ui-contract.test.js`

- [ ] **Step 1: 保持现有视觉体系**

  复用 `--space-*`、`--foreground*`、`--border-subtle`、`--glow-warm/cool/aurora`、`.page-title`、`.edge-glow` 与 `.collab-border-flow`。不新增第四种品牌色，不复制星空 Canvas。

- [ ] **Step 2: 补齐键盘和焦点**

  Tabs 支持 ArrowLeft/Right、Home/End；侧滑层 Escape 关闭；拖拽 separator 可键盘调整；状态变化通过 `aria-live="polite"`，错误使用 `role="alert"`；所有 icon-only 按钮有中文 aria-label。

- [ ] **Step 3: 浏览器验收**

  使用 Playwright 依次验证 1600×1000、1366×768、1180×820、1024×768：展开/固定左轨、拖拽右栏、自动折叠、计划编辑、后台切页、刷新恢复、失败重试、四标签、下载、复制和 reduced-motion。

- [ ] **Step 4: 保存截图**

  保存至少 8 张：入口、计划待确认、运行中、资料、产物、轨迹、失败恢复、1024 响应式。每张截图必须先打开检查，拒绝空白、加载中或裁切错误的图。

- [ ] **Step 5: 完整门禁**

  Run:

  ```powershell
  npm run test:p0
  npx tsc --noEmit
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: 所有命令 exit 0；lint 只允许项目已记录的既有 warning，不允许新增 error；构建仍为现有 9 个页面，不增加独立 route。

### Task 9: 写真实更新记录并准备交接

**Files:**

- Create: `更新md/2026-08-28-01-Hermes风格研究运行工作台Web原型.md`
- Modify: `更新md/README.md`

- [ ] **Step 1: 记录实际完成内容**

  写明接口就绪原型、Mock 数据边界、未改后端/桌面/移动端、用户可感知变化和实际截图范围。

- [ ] **Step 2: 记录真实验证**

  逐条填写 Task 8 实际执行的命令和结果；未运行的检查必须标为未运行，不能写成通过。

- [ ] **Step 3: 记录回滚边界**

  回滚只涉及第 4 节列出的本任务文件；不得使用 `git reset --hard` 或覆盖其他未提交内容。

- [ ] **Step 4: 用户审查**

  向用户展示阶段 A Web 原型截图、交互入口和更新文档；用户确认后再进入 Task 10–15 的插件中心 Web 原型，不直接跳到真实后端 Runtime。

---

## 6. 验收场景矩阵

| 场景 | 操作 | 必须看到的结果 |
|---|---|---|
| 入口隔离 | 打开另外五个 workflow | 仍使用原链式 UI，不出现运行检查器 |
| 生成计划 | 填“赛博朋克 / 国产工业机器人 8 秒产品短片” | 状态从 planning 到 awaiting_plan_approval，显示可编辑计划 |
| 并发保护 | 用旧 revision 保存计划 | 显示冲突并刷新权威计划，不覆盖新 revision |
| 确认执行 | 点击确认 | 只在确认后产生 run.started 和工具事件 |
| 真实状态 | Run 仍在等待某个事件 | UI 不显示未收到的工具或阶段文案 |
| 后台继续 | 运行中切到任务中心再返回 | Run 继续，返回后从 lastSeq 恢复 |
| 暂停恢复 | 点击暂停、继续 | 不产生新 step 事件直到 resume；已有资料保留 |
| 故障恢复 | 模拟下一步超时 | 状态 failed，可修改参数并从失败步骤继续 |
| 资料安全 | 打开资料 tab | 显示来源、引用关系和“不可信资料”提示 |
| 产物 | 完成运行 | 三类 artifact 均可复制/下载，文件名稳定 |
| 轨迹 | 打开轨迹 tab | 事件按 seq 排序，显示 metrics，重复帧不重复渲染 |
| Gap | 注入跳号事件 | UI 触发 resync，不猜测中间状态 |
| 左轨 | 展开、固定、收起 | OPC 状态不丢失，焦点返回正确 |
| 右栏 | 拖到边界 | 宽度保持 300–480，中央受最小宽度保护 |
| 响应式 | 调整到 1180 和 1024 | 检查器按规则收起/覆盖，无横向溢出 |
| 减少动画 | 开启设置 | 无位移/扫光/弹簧，功能与焦点不变 |
| 刷新恢复 | 刷新页面 | Mock Run 从 owner-scoped storage 重建 |
| 账号隔离 | 切换账户/访客 | 看不到其他 owner 的 Mock Run |
| 无外部调用 | 观察 network | 不出现模型、Coze、RAG、搜索请求 |

---

## 7. 阶段 B / C：Harness 式外部插件系统设计

### 7.1 当前能力真相

当前 `plugin_manifests` 和 `/api/admin/plugins` 只是“受信插件登记册”：管理员能写入 id、版本、入口和完整性字段，模型与角色中心能展示记录，但没有下载包、解析依赖、校验 manifest、加载入口、注册贡献、启停、升级、卸载、沙箱、生命周期或故障恢复。阶段 B/C 不得把现有登记行为描述成真正插件运行时。

现有 `plugin_manifests` 不删除、不重建。阶段 C 将其投影成只读的“系统受信 / legacy”插件；管理员以后可以逐条显式迁移，迁移失败不影响旧记录。

### 7.2 账户插件库、项目绑定和版本

- 插件安装到用户账户插件库，owner 只能从认证后的 `req.user.userId` 获取，客户端不得提交 owner ID。
- 同一插件允许多个版本并存；每个版本以最终包内容 SHA-256 寻址。
- 用户在不同创意项目中自行选择启用哪些插件、固定哪个版本、使用哪一权限档和哪份项目配置。
- 项目切换版本只重建该项目的插件 Generation，不影响同账户的其他项目。
- 检测到更新时只安装新版本，不自动切换任何项目。
- 被项目引用的版本不能直接删除；用户必须先解绑或把所有引用项目切换到其他版本。
- 卸载后删除可执行包，配置和插件项目数据进入隔离区保留 30 天；用户可恢复或立即永久删除。

### 7.3 插件来源与不可变解析

真实安装器支持：

- npm package spec、semver、tag；tag 必须解析为不可变版本和 registry integrity。
- Git URL、branch、tag、commit；branch/tag 必须解析为固定 commit SHA 后写入锁定信息。
- 本地目录和 `.stzhplugin` ZIP；必须计算规范化内容哈希。

Web 插件中心通过 `/api/plugins/local-source` 上传 `.stzhplugin` 或目录文件集并换取短期 uploadToken；服务端/桌面运维入口才允许直接引用经过 containment 校验的本地目录，普通 Web 请求不能提交服务器绝对路径。

每个来源最终都必须得到 `stzh.plugin.json`。拒绝绝对归档路径、`..`、反斜杠逃逸、符号链接、设备文件、压缩炸弹、单文件/总包超限、缺失入口、manifest 与 package 版本不一致和不兼容 engine。

默认安装限制为：压缩包 100 MiB、展开后 500 MiB、最多 10,000 个普通文件、单文件 100 MiB、相对路径 240 字符。部署者可以调低，调高必须记录为运维配置变更。

### 7.4 安装流水线

1. 解析不可变来源。
2. 下载或复制到用户不可见的临时 staging 目录。
3. 校验目录边界、文件类型、数量和大小。
4. 解析 manifest、依赖和 contributions。
5. 计算 SHA-256；签名插件标为“已验证”，未签名插件允许继续但进入高风险确认。
6. 使用项目现有 npm 工具链安装依赖；先解析依赖，再在临时安装沙箱运行 `prepare`、`install`、`postinstall` 等脚本。
7. 构建脚本按用户选择允许开放互联网，但环境中不得包含 API Key、JWT、数据库路径、真实项目目录、用户 home 或主服务环境变量。
8. 对 host/UI entrypoint 和 contributions 做静态校验及最小健康探测。
9. 原子移动到账户 content-addressed store。
10. 安装只增加账户库版本；用户为项目启用后才创建新 Generation。

构建脚本开放互联网提高原生二进制和复杂 Git 插件的兼容性，也允许脚本下载二次载荷。安装预览必须醒目标注此风险，日志必须记录来源、最终解析版本、commit、哈希、签名、脚本和网络模式。

签名存在但校验失败时属于 `SIGNATURE_INVALID`，必须硬拒绝；不能让用户把“签名无效”当作“未签名”继续安装。

### 7.5 Manifest V1

```ts
export type PluginPermissionTier = "safe" | "standard" | "full";

export type PluginSlotName =
  | "home.quickActions"
  | "chat.composer.actions"
  | "chat.message.after"
  | "studio.workflowCatalog"
  | "studio.promptRail"
  | "studio.workbench.toolbar"
  | "studio.workbench.inspector"
  | "modelCenter.actions"
  | "taskCenter.detailActions"
  | "gallery.itemActions"
  | "stats.cards"
  | "settings.sections";

export type ToolContribution = {
  name: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
  outputSchema: Record<string, JsonValue>;
  risk: "read" | "write" | "external";
  timeoutMs: number;
};

export type WorkflowContribution = {
  id: string;
  title: string;
  description: string;
  entryTool: string | null;
  uiSurfaceId: string | null;
};

export type SlotContribution = {
  slot: PluginSlotName;
  uiSurfaceId: string;
  order: number;
};

export type PageContribution = {
  id: string;
  title: string;
  uiSurfaceId: string;
};

export type PluginManifestV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  engine: { stzh: string };
  entrypoints: {
    host?: string;
    ui?: string;
  };
  contributes: {
    tools?: ToolContribution[];
    workflows?: WorkflowContribution[];
    slots?: SlotContribution[];
    pages?: PageContribution[];
  };
  requestedPermissionTier: PluginPermissionTier;
  runtimeNetwork?: {
    publicInternet: boolean;
    allowedDomains?: string[];
  };
};
```

- `id` 使用 npm name 或反向域名风格稳定标识，升级时不可变化。
- `version` 必须是标准 SemVer。
- `engine.stzh` 必须能与当前产品版本做确定性范围判断。
- host 和 ui entrypoint 均须位于最终包目录内。
- V1 允许贡献 Agent 工具、工作流模板和 sandboxed iframe UI；模型 Provider 仍由现有模型中心管理。

### 7.6 权限三档与硬性拒绝

**安全 `safe`**

- 允许纯 UI、纯计算转换和插件私有配置。
- 禁止网络、模型、项目数据、文件写入、任务创建和 subprocess。

**标准 `standard`**

- 允许通过宿主代理访问公开网络。
- 允许读取当前项目授权的 OPC 上下文、来源和产物。
- 允许通过模型代理发起调用，但永远拿不到原始 API Key。
- 允许创建草稿 artifact。
- 禁止 subprocess、任意文件写入、发布和直接任务执行。

**完全 `full`**

- 允许通过能力代理写入插件数据、创建 artifact 和创建受控任务。
- 允许请求沙箱 subprocess 和公开互联网。
- 仍然禁止直接读取服务端环境变量、JWT、模型密钥、SQLite、其他账户/项目、Electron main 和宿主任意文件。

“完全”是受能力代理约束的最高产品权限，不等于操作系统账户权限。插件 manifest 声明最低档；项目不能用低于最低档的权限启用。插件版本新增权限时，所有项目保持旧授权并要求重新确认。

### 7.7 独立插件宿主与 Generation

- 每个项目插件组合运行在独立 Node 插件宿主进程中。
- 主服务与宿主使用版本化 RPC；插件宿主只接收 projectId、generationId、短期能力 token 和最小环境。
- 工具、工作流、UI 槽位和插件页面通过启动握手注册。
- 启用、停用或切换版本时，按依赖逆序 dispose 当前 Generation，再启动新 Generation。
- 新 Generation 通过握手、贡献校验和健康窗口后才提交为 last-known-good。
- 插件宿主设置总内存、每调用超时、并发、输出、日志和重启频率上限。
- 独立进程本身不被描述为强安全边界。系统没有强沙箱后端时，未签名插件仍可在用户确认高风险警告后运行；确认、操作者、项目、包哈希和权限档必须写入审计事件。

默认资源边界固定为：

- 安装/构建：10 分钟、1 GiB 内存、2 GiB staging、stdout/stderr 各 4 MiB。
- 项目插件宿主：512 MiB 总内存、单插件同时 2 个调用、单调用 60 秒、单 RPC 载荷 2 MiB、单工具结果 1 MiB。
- Generation 日志：10 MiB 后轮转，保留最近 5 份。
- 崩溃熔断：同一项目 10 分钟内最多自动重启 3 次，随后进入 failed/recovery。
- iframe bridge：单消息 256 KiB，超限拒绝并记录。

Generation 健康判定固定为：host handshake 完成、manifest contributions 全部注册、入口健康 ping 成功、UI 资产可读取且连续 10 秒未崩溃。只有全部成立才更新 last-known-good。

### 7.8 项目安全模式与恢复

每个项目持久化当前 Generation 和 last-known-good：

```ts
export type PluginGeneration = {
  id: string;
  projectId: string;
  packageSetHash: string;
  bindings: Array<{
    pluginId: string;
    version: string;
    permissionTier: PluginPermissionTier;
  }>;
  status: "starting" | "healthy" | "failed" | "stopped";
  suspectedPluginIds: string[];
};
```

恢复界面提供：项目安全模式、禁用疑似插件、回滚健康快照、切换旧版本、宿主/插件日志、脱敏诊断导出和返回正常模式。安全模式只禁用第三方插件，不删除项目、会话、产物、配置或隔离数据。

### 7.9 Sandboxed iframe UI 与全站槽位

UI contribution 运行于不含 `allow-same-origin` 的 sandboxed iframe，不能读取父 DOM、localStorage、认证 token 或 React context。宿主通过一次性 `MessageChannel` 发送版本化 bridge；每条消息校验 frame、nonce、协议版本、项目、插件版本和动作权限。

首版槽位仅允许追加，不允许替换宿主结构：

- `home.quickActions`
- `chat.composer.actions`
- `chat.message.after`
- `studio.workflowCatalog`
- `studio.promptRail`
- `studio.workbench.toolbar`
- `studio.workbench.inspector`
- `modelCenter.actions`
- `taskCenter.detailActions`
- `gallery.itemActions`
- `stats.cards`
- `settings.sections`

插件不得替换根布局、导航、认证、设置容器或核心输入框。插件独立页面统一从插件中心或业务槽位打开，不占顶部七页导航。当前应用为静态输出和内部页面状态，插件页面使用插件中心内部 viewer 与 URL query 状态，不新增未知 pluginId 的 Next.js 动态 route。

---

## 8. 阶段 B：插件中心 Web 原型设计

### 8.1 入口与页面

“模型与角色”页改为“模型 / 角色 / 插件”三个主标签。模型和角色现有功能不变；插件标签使用完整宽度，包含四个区域：

- **发现**：目录、搜索、分类、发布者、签名、权限、兼容版本和安装预览。
- **账户插件库**：多版本、来源、哈希、安装状态、更新、卸载和 30 天隔离数据。
- **项目插件**：项目选择、启用插件、固定版本、权限档、配置、依赖和 Generation 状态。
- **恢复与诊断**：安全模式、last-known-good、失败 Generation、疑似插件、日志和诊断导出。

安装交互依次展示来源解析、manifest、依赖与脚本、签名/哈希、权限、沙箱可用性和最终风险确认。Mock 原型用确定性演示包和状态机完成全部流程，不访问 npm、Git、本地文件或真实插件代码。

页面几何与交互固定为：

- 插件标签顶部使用“发现 / 账户插件库 / 项目插件 / 恢复与诊断”四段 subnav；右侧固定项目选择器和“从来源安装”按钮。
- 发现页使用响应式卡片网格；选中插件打开 420px 右侧详情抽屉，展示版本、发布者、签名、权限、contributions、依赖和安装入口。
- 安装向导使用页面级模态和四步 stepper，不在小弹窗中塞入完整依赖/脚本/权限信息。
- 账户库按 pluginId 分组，版本以可展开行展示；项目引用数、哈希、签名和来源在折叠状态仍可见。
- 项目插件使用列表 + 360px 详情双栏；详情中编辑固定版本、权限档和配置，保存后显示待重建状态。
- 恢复页使用 Generation 列表 + 诊断详情双栏；失败、Safe Mode 和 last-known-good 使用文字、图标和颜色共同编码。
- `viewport >= 1180px` 使用上述停靠布局；`800–1179px` 的详情改为覆盖抽屉；`<800px` 单列并把 subnav 变为横向可滚动标签。
- 完全复用现有深空主题、像素标题、暖橙/冷蓝/极光紫、卡片和流动边框；不引入 DSH 黑白皮肤。
- reduced-motion 下取消抽屉位移、卡片上浮和安装进度扫光，只保留即时状态和短淡入。

### 8.2 PluginCenterAdapter

```ts
export type PluginSource =
  | { type: "catalog"; catalogId: string; version: string }
  | { type: "npm"; spec: string }
  | { type: "git"; url: string; ref: string | null }
  | { type: "local"; uploadToken: string; fileName: string; contentHash: string };

export type PluginPackage = {
  installationId: string;
  pluginId: string;
  version: string;
  source: PluginSource;
  resolvedRef: string;
  contentHash: string;
  signatureStatus: "verified" | "unsigned" | "invalid";
  manifest: PluginManifestV1;
  installStatus: "resolving" | "installing" | "installed" | "failed" | "quarantined";
  referencedProjectIds: string[];
  installedAt: string;
};

export type ProjectPluginBinding = {
  projectId: string;
  pluginId: string;
  version: string;
  installationId: string;
  permissionTier: PluginPermissionTier;
  enabled: boolean;
  config: Record<string, JsonValue>;
};

export type PluginEvent = {
  version: 1;
  userId: number;
  projectId: string | null;
  generationId: string | null;
  seq: number;
  type:
    | "install.started"
    | "install.completed"
    | "install.failed"
    | "binding.updated"
    | "generation.starting"
    | "generation.healthy"
    | "generation.failed"
    | "generation.stopped"
    | "safe-mode.entered"
    | "safe-mode.exited"
    | "generation.rolled-back"
    | "risk.confirmed"
    | "data.quarantined"
    | "data.restored"
    | "data.purged";
  occurredAt: string;
  payload: Record<string, JsonValue>;
};

export type PluginErrorCode =
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_VERSION_NOT_FOUND"
  | "SOURCE_RESOLUTION_FAILED"
  | "PREVIEW_EXPIRED"
  | "PREVIEW_HASH_MISMATCH"
  | "INVALID_MANIFEST"
  | "INCOMPATIBLE_ENGINE"
  | "PACKAGE_BOUNDARY_VIOLATION"
  | "PACKAGE_TOO_LARGE"
  | "SIGNATURE_INVALID"
  | "PERMISSION_TIER_TOO_LOW"
  | "VERSION_IN_USE"
  | "GENERATION_CONFLICT"
  | "RISK_CONFIRMATION_REQUIRED"
  | "BRIDGE_UNAUTHORIZED"
  | "AUTH_REQUIRED";

export type CatalogQuery = {
  text: string;
  category: string | null;
  signature: "all" | "verified" | "unsigned";
  permissionTier: PluginPermissionTier | null;
  cursor: string | null;
  limit: number;
};

export type CatalogPage = {
  items: Array<{ manifest: PluginManifestV1; source: PluginSource; publisher: string }>;
  nextCursor: string | null;
};

export type InstallPreview = {
  previewId: string;
  previewHash: string;
  expiresAt: string;
  source: PluginSource;
  resolvedRef: string;
  contentHash: string;
  signatureStatus: PluginPackage["signatureStatus"];
  manifest: PluginManifestV1;
  dependencies: Array<{ name: string; version: string }>;
  buildScripts: Array<{ name: string; command: string }>;
  strongSandboxAvailable: boolean;
};

export type InstallConfirmation = {
  previewHash: string;
  acceptedPermissionTier: PluginPermissionTier;
  acceptsUnsignedRisk: boolean;
  acceptsOpenInternetBuildScripts: boolean;
  acceptsWeakSandboxRisk: boolean;
};

export type ProjectPluginBindingInput = Omit<ProjectPluginBinding, "projectId">;
export type UninstallResult = { status: "deleted" | "blocked" | "quarantined"; projectIds: string[] };
export type PluginEventHandler = { onEvent(event: PluginEvent): void; onError(error: Error): void };
export type PluginSubscription = { close(): void };
```

```ts
export interface PluginCenterAdapter {
  searchCatalog(query: CatalogQuery): Promise<CatalogPage>;
  resolveSource(source: PluginSource): Promise<InstallPreview>;
  install(previewId: string, confirmation: InstallConfirmation): Promise<PluginPackage>;
  listAccountPackages(): Promise<PluginPackage[]>;
  listProjectBindings(projectId: string): Promise<ProjectPluginBinding[]>;
  bindProjectPlugin(projectId: string, input: ProjectPluginBindingInput): Promise<void>;
  changeProjectVersion(projectId: string, pluginId: string, version: string): Promise<void>;
  disableProjectPlugin(projectId: string, pluginId: string): Promise<void>;
  uninstallVersion(pluginId: string, version: string): Promise<UninstallResult>;
  restartGeneration(projectId: string): Promise<PluginGeneration>;
  enterSafeMode(projectId: string): Promise<PluginGeneration>;
  rollbackGeneration(projectId: string, generationId: string): Promise<PluginGeneration>;
  subscribe(
    projectId: string | null,
    afterSeq: number,
    handler: PluginEventHandler,
  ): PluginSubscription;
  dispose(): void;
}
```

GM 5.3 Flash 只实现 `MockPluginCenterAdapter`。Mock 需要覆盖已签名市场插件、未签名 npm 插件、Git 插件、本地 `.stzhplugin`、多版本、权限升级、Generation 失败、回滚和隔离数据恢复。

### 8.3 未来 REST + SSE

| Method | Path | 语义 |
|---|---|---|
| `GET` | `/api/plugins/catalog` | 查询聚合插件目录 |
| `POST` | `/api/plugins/resolve` | 解析 npm/Git/本地来源并返回安装预览 |
| `POST` | `/api/plugins/local-source` | 上传 `.stzhplugin` 并返回短期 uploadToken 与内容哈希 |
| `POST` | `/api/plugins/install` | 确认并创建账户安装任务 |
| `GET` | `/api/plugins/library` | 查询账户多版本插件库 |
| `DELETE` | `/api/plugins/:pluginId/versions/:version` | 删除未引用版本或进入隔离区 |
| `GET` | `/api/projects/:projectId/plugins` | 查询项目 bindings 和有效 contributions |
| `PUT` | `/api/projects/:projectId/plugins/:pluginId` | 固定版本、权限和配置 |
| `DELETE` | `/api/projects/:projectId/plugins/:pluginId` | 从项目解绑插件 |
| `POST` | `/api/projects/:projectId/plugin-generation` | 重建项目 Generation |
| `POST` | `/api/projects/:projectId/plugin-safe-mode` | 启动项目安全模式 |
| `POST` | `/api/projects/:projectId/plugin-rollback` | 回滚健康 Generation |
| `GET` | `/api/projects/:projectId/plugin-events?afterSeq=N` | SSE 安装/Generation/恢复事件 |
| `GET` | `/api/plugins/events?afterSeq=N` | SSE 账户级安装、版本和隔离数据事件 |
| `GET` | `/api/plugin-ui/:installationId/*` | 提供经过 CSP 和 sandbox 约束的 UI 资产 |
| `POST` | `/api/plugin-bridge/:frameId` | 受能力 token 约束的 iframe bridge fallback |

所有账户和项目归属由服务端认证与数据库查询确定；未登录、跨账户 projectId、客户端 ownerId 一律拒绝。

---

## 9. 阶段 C：真实插件运行时数据与存储

### 9.1 数据表

- `plugin_packages`：user_id、plugin_id、version、source、resolved_ref、content_hash、signature_status、manifest、install_status、created_at。
- `project_plugin_bindings`：project_id、user_id、plugin package version、permission_tier、config、enabled、updated_at。
- `plugin_generations`：project_id、package_set_hash、bindings snapshot、status、suspected plugins、health timestamps。
- `plugin_events`：user_id、project_id、generation_id、账户单调 seq、type、payload、created_at。
- `plugin_data_quarantine`：user_id、project_id、plugin_id、version、path/token、expires_at、purged_at。

为 `(user_id, plugin_id, version)`、`(project_id, plugin_id)`、唯一 `(user_id, seq)`、查询 `(user_id, project_id, seq)` 和 `expires_at` 建索引。所有外键删除策略以保留项目和审计为先，不级联删除仍被引用的包或 Generation。

### 9.2 文件仓库

```text
STZH_DATA_DIR/plugins/
└── accounts/<userId>/
    ├── store/sha256/<contentHash>/
    ├── installs/<pluginId>/<version>/installation.json
    ├── staging/<installId>/
    ├── projects/<projectId>/plugin-lock.json
    ├── data/<projectId>/<pluginId>/
    └── quarantine/<quarantineId>/
```

最终 store 目录只读；项目 lock 记录精确 content hash、version、权限档和配置摘要。staging、store、data 和 quarantine 的 resolved path 必须保持在对应账户根内。

### 9.3 兼容现有清单

`plugin_manifests` 保留为 legacy 表；插件中心把它显示为“系统受信”，但不伪装成账户安装包。阶段 C 可提供管理员迁移预览，将实际包来源、哈希和 manifest 补齐后再创建 `plugin_packages`；只有数据库清单而没有包内容的记录不能进入插件宿主。

---

## 10. 阶段 B/C 文件职责图

### 阶段 B 新建

- `app/lib/plugin-center/types.ts`：manifest、package、binding、Generation、event 和权限类型。
- `app/lib/plugin-center/adapter.ts`：PluginCenterAdapter 与 React provider。
- `app/lib/plugin-center/mock-adapter.ts`：确定性安装、版本、Generation、恢复状态机。
- `app/lib/plugin-center/mock-fixtures.ts`：市场、npm、Git、本地、签名/未签名和故障包。
- `app/components/plugin-center/PluginCenter.tsx`：四区域路由和项目上下文。
- `app/components/plugin-center/PluginInstallFlow.tsx`：来源、预览、权限、风险确认。
- `app/components/plugin-center/PluginLibrary.tsx`：账户多版本库。
- `app/components/plugin-center/ProjectPlugins.tsx`：项目 bindings、版本和权限。
- `app/components/plugin-center/PluginRecovery.tsx`：安全模式、回滚、日志和隔离数据。
- `app/components/plugin-center/PluginFrame.tsx`：sandboxed iframe 和 MessageChannel mock bridge。
- `app/components/plugin-center/PluginCenter.module.css`：现有视觉体系下的布局、动效和响应式。

### 阶段 B 修改

- `app/components/ModelRoleCenter.tsx`：拆成三个主标签并挂载 PluginCenter；模型/角色 API 和表单语义不变。
- `app/components/HomeClient.tsx`：创建 owner-scoped MockPluginCenterAdapter 单例。
- 各业务页面只增加宿主声明的 additive slot，不把插件业务状态写入页面组件。

### 阶段 C 新建/修改

- `server/plugin-system/`：manifest 校验、source resolver、installer、store、permission broker、generation manager、host RPC、UI asset service、recovery 和 diagnostics。
- `server/routes/plugins.js`：第 8.3 节接口；`server/app.js` 只挂载路由。
- `server/db.js`：增量新增第 9.1 节表与索引，保留旧表。
- `server/plugin-host/entry.js`：最小环境的项目插件宿主入口。

---

## 11. 阶段 B/C 分任务执行规划

后续任务从 Task 10 继续编号；Task 1–9 必须先完成并验收。

### Task 10: 固化插件领域类型与 Mock Adapter

**Files:**

- Create: `app/lib/plugin-center/types.ts`
- Create: `app/lib/plugin-center/adapter.ts`
- Create: `app/lib/plugin-center/mock-adapter.ts`
- Create: `app/lib/plugin-center/mock-fixtures.ts`
- Create: `test/plugin-center-adapter.test.js`

**Interfaces:**

- Produces: 第 7.5 节 manifest、`PluginPackage`、`ProjectPluginBinding`、`PluginGeneration`、`PluginEvent`、`PluginCenterAdapter` 和 `createMockPluginCenterAdapter({ owner, storage, clock? })`。
- Mock storage key: `tszh:v2:${ownerScope(owner)}:plugin-center`。

- [ ] **Step 1: 写 Adapter 失败测试**

  覆盖账户库多版本、项目固定版本、权限不足、权限升级、被引用版本拒绝删除、隔离数据 30 天、Generation 启停、Safe Mode 和 rollback。

  ```js
  const memoryStorage = () => {
    const data = new Map();
    return {
      get length() { return data.size; },
      key(index) { return [...data.keys()][index] ?? null; },
      getItem(key) { return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { data.set(key, String(value)); },
      removeItem(key) { data.delete(key); },
    };
  };

  const accept = (preview) => ({
    previewHash: preview.previewHash,
    acceptedPermissionTier: "standard",
    acceptsUnsignedRisk: true,
    acceptsOpenInternetBuildScripts: true,
    acceptsWeakSandboxRisk: true,
  });

  test("project pins remain unchanged when a new account version is installed", async () => {
    const adapter = createMockPluginCenterAdapter({
      owner: { kind: "account", userId: 17 },
      storage: memoryStorage(),
    });
    const first = await adapter.resolveSource({
      type: "catalog",
      catalogId: "com.stzh.style-kit",
      version: "1.0.0",
    });
    const firstPackage = await adapter.install(first.previewId, accept(first));
    await adapter.bindProjectPlugin("project-a", {
      pluginId: firstPackage.pluginId,
      version: firstPackage.version,
      installationId: firstPackage.installationId,
      permissionTier: "standard",
      enabled: true,
      config: {},
    });
    const second = await adapter.resolveSource({
      type: "catalog",
      catalogId: "com.stzh.style-kit",
      version: "2.0.0",
    });
    await adapter.install(second.previewId, accept(second));
    const bindings = await adapter.listProjectBindings("project-a");
    assert.equal(bindings[0].version, "1.0.0");
  });
  ```

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/plugin-center-adapter.test.js`

  Expected: FAIL，缺少 plugin-center 模块。

- [ ] **Step 3: 实现类型和确定性状态机**

  Mock fixture 至少包含：已签名市场工具、未签名 npm 工作流、Git UI 插件、本地 `.stzhplugin`、请求 full 权限的插件、含新权限的升级版和一个会导致 Generation failed 的包。

- [ ] **Step 4: 实现 owner scope 和 dispose**

  Adapter 按 `ownerScope()` 持久化；`dispose()` 清理 timer 和订阅但不删除已保存数据。账号切换后不得看到其他 owner 的包、项目 binding、Generation 或日志。

- [ ] **Step 5: 运行测试与类型检查**

  Run: `node --test test/plugin-center-adapter.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 11: 将模型与角色页重构为三主标签

**Files:**

- Create: `app/components/plugin-center/PluginCenter.tsx`
- Create: `app/components/plugin-center/PluginCenter.module.css`
- Modify: `app/components/ModelRoleCenter.tsx`
- Modify: `app/components/HomeClient.tsx`
- Create: `test/plugin-center-ui-contract.test.js`

**Interfaces:**

- `ModelRoleCenter` 接收 `pluginCenterAdapter: PluginCenterAdapter`。
- 主标签字面量固定为 `models | roles | plugins`。

- [ ] **Step 1: 写范围隔离测试**

  断言三个主标签存在；模型和角色表单、write-only key、角色默认模型仍在；旧“全局受信插件”卡不再与两张表单挤在三列中，而是在插件标签的“系统受信”分组显示。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/creative-workspace-ui-contract.test.js test/plugin-center-ui-contract.test.js`

  Expected: 新插件中心断言 FAIL，原模型/角色断言 PASS。

- [ ] **Step 3: 实现三标签骨架**

  默认保持 Models；URL query `center=plugins&pluginView=discover|library|project|recovery` 支持刷新恢复。切换标签不卸载 Adapter，不清空模型/角色表单草稿。

- [ ] **Step 4: 挂载 owner-scoped Adapter**

  HomeClient 按当前 user 创建 MockPluginCenterAdapter；账号变化调用旧 adapter.dispose()。访客可浏览演示市场，但安装、项目启用和恢复动作打开现有登录面板。

- [ ] **Step 5: 验证**

  Run: `node --test test/creative-workspace-ui-contract.test.js test/plugin-center-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 12: 实现发现、安装预览和账户多版本库

**Files:**

- Create: `app/components/plugin-center/PluginDiscover.tsx`
- Create: `app/components/plugin-center/PluginInstallFlow.tsx`
- Create: `app/components/plugin-center/PluginLibrary.tsx`
- Modify: `app/components/plugin-center/PluginCenter.tsx`
- Modify: `app/components/plugin-center/PluginCenter.module.css`

- [ ] **Step 1: 增加 UI contract 测试**

  覆盖市场搜索、npm/Git/本地来源选择、不可变解析结果、manifest contributions、脚本、开放互联网、哈希、签名、权限和无强沙箱警告。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/plugin-center-ui-contract.test.js`

  Expected: 新断言 FAIL。

- [ ] **Step 3: 实现发现页面**

  搜索、分类、签名、权限和兼容性筛选均由 Adapter query 驱动；卡片显示发布者、版本、更新时间、requested tier、contribution 数和兼容状态。

- [ ] **Step 4: 实现安装向导**

  固定四步：来源 → manifest/依赖/脚本 → 权限/沙箱 → 最终确认。未签名、开放互联网脚本、full tier 和无强沙箱分别使用独立风险行，不能折叠成一条泛化警告。

- [ ] **Step 5: 实现账户库**

  以 pluginId 分组版本；显示 source、resolved ref、SHA-256、签名、安装时间、引用项目数和更新。被引用版本的卸载按钮打开项目清单并禁用确认。

- [ ] **Step 6: 验证**

  Run: `node --test test/plugin-center-adapter.test.js test/plugin-center-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 13: 实现项目插件、Generation 和权限配置

**Files:**

- Create: `app/components/plugin-center/ProjectPlugins.tsx`
- Create: `app/components/plugin-center/PluginPermissionPicker.tsx`
- Create: `app/components/plugin-center/PluginGenerationStatus.tsx`
- Modify: `app/components/plugin-center/PluginCenter.tsx`

- [ ] **Step 1: 增加项目隔离测试**

  断言 project-a 与 project-b 可固定不同版本/权限；新版本安装不改 binding；低于 manifest requested tier 时确认按钮禁用。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/plugin-center-adapter.test.js test/plugin-center-ui-contract.test.js`

  Expected: 新项目用例 FAIL。

- [ ] **Step 3: 实现项目选择和 binding 编辑**

  项目列表使用现有 creative-projects 语义；每行显示启用状态、固定版本、权限、依赖、配置摘要和有效贡献。保存后显示“等待重建 Generation”，不伪装成已生效。

- [ ] **Step 4: 实现 Generation 重建状态**

  UI 显示 stopping → disposing → starting → health-check → healthy/failed。Generation healthy 前保留旧健康组合；失败时进入恢复状态条。

- [ ] **Step 5: 验证**

  Run: `node --test test/plugin-center-adapter.test.js test/plugin-center-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 14: 实现恢复、隔离数据与 sandboxed iframe 原型

**Files:**

- Create: `app/components/plugin-center/PluginRecovery.tsx`
- Create: `app/components/plugin-center/PluginFrame.tsx`
- Create: `app/lib/plugin-center/bridge.ts`
- Modify: `app/components/plugin-center/PluginCenter.module.css`

- [ ] **Step 1: 增加恢复和 bridge 测试**

  覆盖 safe mode、last-known-good rollback、疑似插件、30 天隔离数据、错误 frameId、错误 nonce、错误 protocol version 和未授权 action。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/plugin-center-adapter.test.js test/plugin-center-ui-contract.test.js`

  Expected: 新恢复/bridge 用例 FAIL。

- [ ] **Step 3: 实现恢复页面**

  四个区块固定为“当前故障、疑似插件、健康快照、诊断日志”。回滚、禁用和退出安全模式均通过 Adapter；不直接改 localStorage 数组。

- [ ] **Step 4: 实现 iframe mock bridge**

  iframe sandbox 属性不含 `allow-same-origin`；创建 MessageChannel 后只传递 port、bridge version、frame token、plugin/project identity 和当前 slot capability。父页拒绝普通 window message 动作。

- [ ] **Step 5: 实现隔离数据恢复/永久删除**

  显示删除日期、剩余天数和原项目；恢复要求目标版本重新安装，永久删除使用二次确认并在 Mock event log 记录操作者和时间。

- [ ] **Step 6: 验证**

  Run: `node --test test/plugin-center-adapter.test.js test/plugin-center-ui-contract.test.js && npx tsc --noEmit`

  Expected: PASS。

### Task 15: 声明全站 additive slots 并完成 Web 原型验收

**Files:**

- Create: `app/components/plugin-slots/PluginSlot.tsx`
- Create: `app/lib/plugin-center/slot-registry.ts`
- Modify: `app/components/WelcomeScreen.tsx`
- Modify: `app/components/ChatFlow.tsx`
- Modify: `app/components/ChatInput.tsx`
- Modify: `app/components/ModelAssistantPanel.tsx`
- Modify: `app/components/research-workbench/PromptRail.tsx`
- Modify: `app/components/research-workbench/ResearchWorkbench.tsx`
- Modify: `app/components/research-workbench/RunInspector.tsx`
- Modify: `app/components/ModelRoleCenter.tsx`
- Modify: `app/components/TaskCenter.tsx`
- Modify: `app/components/GalleryPanel.tsx`
- Modify: `app/components/StatsDashboard.tsx`
- Modify: `app/components/SettingsDrawer.tsx`
- Test: `test/plugin-center-ui-contract.test.js`

- [ ] **Step 1: 写 slot registry 测试**

  断言 12 个固定 slot、版本、尺寸、允许动作和 owner share；拒绝未知 slot、replace mode 和超限 frame。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test test/plugin-center-ui-contract.test.js`

  Expected: slot 用例 FAIL。

- [ ] **Step 3: 实现只追加 slot**

  PluginSlot 只渲染当前项目 effective contributions；错误 iframe 变为带插件名的隔离错误卡，不阻断宿主页面。插件页面只在 PluginCenter 内部 viewer 打开。

- [ ] **Step 4: 浏览器验收**

  验证发现、安装、库、项目启用、版本切换、权限、Generation、安全模式、回滚、隔离数据和至少 6 类页面 slot。所有数据均清楚标为 Mock。

- [ ] **Step 5: 门禁**

  Run:

  ```powershell
  npm run test:p0
  node --test test/plugin-center-adapter.test.js test/plugin-center-ui-contract.test.js
  npx tsc --noEmit
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: 全部 exit 0；构建不增加未知动态 route；无真实 npm/Git/文件网络请求。

### Task 16: 新增账户插件仓库 schema 与文件 store

**Files:**

- Modify: `server/db.js`
- Create: `server/plugin-system/store.js`
- Create: `server/test/plugin-store.test.js`

- [ ] **Step 1: 写迁移与隔离测试**

  使用临时数据库验证新表/索引、旧 plugin_manifests 保留、账户隔离、项目 pin、多版本和被引用版本拒绝删除。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test server/test/plugin-store.test.js`

  Expected: FAIL，缺少新 schema/store。

- [ ] **Step 3: 增量创建第 9.1 节表**

  不重建旧表、不删除旧行。所有数据库 helper 强制 userId/project ownership；文件 store 使用 resolved path containment 和原子 rename。

- [ ] **Step 4: 实现 quarantine reaper**

  删除采用 claim token，崩溃后可回收；30 天过期才物理删除，失败项持久记录并可重试。

- [ ] **Step 5: 验证**

  Run: `node --test server/test/plugin-store.test.js`

  Expected: PASS。

### Task 17: 实现 source resolver、manifest 校验与安装流水线

**Files:**

- Create: `server/plugin-system/manifest.js`
- Create: `server/plugin-system/source-resolver.js`
- Create: `server/plugin-system/installer.js`
- Create: `server/test/plugin-installer.test.js`

- [ ] **Step 1: 写供应链失败测试**

  覆盖 npm tag 固定、Git branch 固定 commit、本地哈希、路径穿越、符号链接、压缩炸弹、超限、manifest/版本冲突、entrypoint 越界、哈希变化和签名状态。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test server/test/plugin-installer.test.js`

  Expected: FAIL。

- [ ] **Step 3: 实现两阶段安装**

  Resolve 只产生 InstallPreview；Install 必须携带 previewId、preview hash 和用户确认。preview 过期、来源变化或哈希变化时必须重新预览。

- [ ] **Step 4: 实现构建脚本环境**

  脚本 cwd 为 staging，使用最小 PATH/TEMP；环境白名单不含服务密钥和数据路径。开放互联网按已确认策略启用，同时记录命令、退出码、耗时和输出摘要。

- [ ] **Step 5: 原子提交**

  构建与健康探测成功后移动到 content-addressed store；失败删除 staging 或放入失败隔离，不创建 installed package 行。

- [ ] **Step 6: 验证**

  Run: `node --test server/test/plugin-installer.test.js server/test/plugin-store.test.js`

  Expected: PASS。

### Task 18: 实现独立插件宿主、RPC 与权限代理

**Files:**

- Create: `server/plugin-host/entry.js`
- Create: `server/plugin-system/host-manager.js`
- Create: `server/plugin-system/permission-broker.js`
- Create: `server/test/plugin-host.test.js`

- [ ] **Step 1: 写宿主隔离测试**

  验证最小 env、握手版本、能力 token、Safe/Standard/Full、超时、输出上限、崩溃隔离、频繁重启熔断和其他项目不可见。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test server/test/plugin-host.test.js`

  Expected: FAIL。

- [ ] **Step 3: 实现版本化 RPC**

  固定消息类型为 hello、register、invoke、result、event、dispose、health、shutdown。每条消息携带 protocolVersion、generationId、requestId 和 capability token；未知字段/类型拒绝。

- [ ] **Step 4: 实现权限 broker**

  插件不得获得 db、process.env、模型 key 或主服务对象。网络、模型、项目数据、artifact、task 和 subprocess 全部通过 broker 方法检查 project binding 和 permission tier。

- [ ] **Step 5: 无强沙箱警告路径**

  未签名包且无强沙箱时，首次启动返回稳定错误 `RISK_CONFIRMATION_REQUIRED`；确认后携带一次性 risk confirmation token 重试 spawn，并写入审计事件。取消保持项目旧 Generation。

- [ ] **Step 6: 验证**

  Run: `node --test server/test/plugin-host.test.js`

  Expected: PASS。

### Task 19: 实现项目 Generation、Safe Mode 与 last-known-good

**Files:**

- Create: `server/plugin-system/generation-manager.js`
- Create: `server/plugin-system/recovery.js`
- Create: `server/test/plugin-generation.test.js`

- [ ] **Step 1: 写生命周期测试**

  覆盖依赖排序、逆序 dispose、项目独立重建、健康提交、启动失败、疑似插件、Safe Mode、rollback 和主服务关闭。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test server/test/plugin-generation.test.js`

  Expected: FAIL。

- [ ] **Step 3: 实现 Generation 事务**

  新 Generation 健康前旧 Generation 保持权威；成功后原子切换并 dispose 旧宿主。失败时旧健康组合继续服务，失败 snapshot 进入 recovery。

- [ ] **Step 4: 实现 Safe Mode**

  Safe Mode 以空第三方 binding 启动项目，仍允许核心模型、会话、项目和产物；退出时可选择原组合、禁用疑似插件或 last-known-good。

- [ ] **Step 5: 验证**

  Run: `node --test server/test/plugin-generation.test.js server/test/plugin-host.test.js`

  Expected: PASS。

### Task 20: 实现后端路由、UI 资产桥和 Runtime 集成

**Files:**

- Create: `server/routes/plugins.js`
- Create: `server/plugin-system/ui-assets.js`
- Create: `server/plugin-system/tool-registry.js`
- Modify: `server/app.js`
- Create: `server/test/plugin-routes.test.js`

- [ ] **Step 1: 写账户/项目路由测试**

  覆盖未登录、跨账户 projectId、客户端 ownerId 注入、preview 重放、版本 pin、SSE afterSeq、Safe Mode、rollback、UI asset traversal 和 bridge token。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `node --test server/test/plugin-routes.test.js`

  Expected: FAIL。

- [ ] **Step 3: 实现第 8.3 节接口**

  路由只编排 plugin-system services；错误使用稳定 code。SSE 以项目单调 seq 为 id，断线可从 afterSeq 恢复。

- [ ] **Step 4: 实现 iframe 资产与 CSP**

  只提供已安装 hash 根内的普通文件；生成不含 allow-same-origin 的 sandbox 建议和按权限档收紧的 CSP。bridge token 短期、单 frame、单项目、单插件版本有效。

- [ ] **Step 5: 接入 Tool Registry 和 workflow catalog**

  仅注册当前项目 healthy Generation 的贡献。工具调用通过现有/规划中的 pre-guard-execute-post-result 管线；插件工作流标记来源、版本和权限，禁用项目插件后立即从下一 Generation 消失。

- [ ] **Step 6: 完整验证**

  Run:

  ```powershell
  npm run test:p0
  npm --prefix server test
  npx tsc --noEmit
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: 全部 exit 0；Node 与 Electron ABI 相关现有测试不回归；未执行真实第三方插件安装的测试必须使用本地 fixture。

---

## 12. 插件系统验收矩阵

| 领域 | 场景 | 必须结果 |
|---|---|---|
| 账户隔离 | 两账户安装同 ID 不同版本 | 包库、配置、项目和日志互不可见 |
| 多版本 | 安装 1.0 后安装 2.0 | 原项目继续固定 1.0 |
| npm | 安装 tag | 锁定精确版本和 integrity |
| Git | 安装 branch | 锁定 commit SHA |
| 本地包 | 重复安装同内容 | 复用同 hash，不重复占 store |
| 签名 | 未签名包 | 风险确认清晰，审计完整 |
| 安装脚本 | 脚本访问互联网 | 可访问，但拿不到宿主密钥/项目目录 |
| 权限 | Safe 插件请求网络 | broker 拒绝并记录 |
| 权限升级 | 新版本增加 Full | 项目不自动升级，需重新确认 |
| 项目 | A/B 选择不同版本 | 各自 Generation 独立 |
| 生命周期 | 切换版本 | 新健康后才替换旧 Generation |
| 崩溃 | 一个项目插件宿主退出 | 主 API 和其他项目继续运行 |
| 无强沙箱 | 未签名插件启用 | 高风险确认后才 spawn |
| Safe Mode | Generation 启动失败 | 核心项目可打开，数据不删除 |
| 回滚 | 选择 last-known-good | 恢复原版本、权限和配置 |
| 卸载 | 删除被引用版本 | 阻止并列出引用项目 |
| 数据保留 | 卸载插件 | 数据进入 30 天隔离区 |
| iframe | 读取 parent DOM/token | 不可访问 |
| bridge | 错误 frame/nonce/version | 拒绝且不执行动作 |
| slot | 插件请求替换根布局 | registry 拒绝 |
| 工具 | 禁用项目插件 | 下一 Generation 不再暴露工具 |
| 原型 | 观察 network | GM 生成的阶段 B 不请求 npm/Git/本地文件 |

---

## 13. 仍不进入本轮生成/实现的内容

- 阶段 A 不把六个 workflow 一次性迁移到 Runtime，不实现真实搜索/RAG/模型 Tool Calling。
- 阶段 B 不执行 npm、Git、本地文件、构建脚本或第三方代码；只生成接口就绪 Mock Web 原型。
- 阶段 C 不扩展模型 Provider，不允许插件读取原始模型密钥。
- 不实现 DSH Workspace/Session 全局侧栏、Preset 导入导出或 Subagent 树。
- 不增加插件顶栏入口，不允许插件替换根布局、认证或核心输入框。
- 不实现 Expo 插件中心或手机插件管理。
- Electron 原生 Safe Mode、自动更新、标题栏和目录选择器仍另行规划；项目级插件 Safe Mode 先由 Web/服务端提供。
- 不展示模型隐藏思维链。

后续顺序固定为：阶段 A Web 工作台 → 阶段 B 插件中心 Web 原型 → 阶段 C 插件运行时 → 真实 Research Runtime 与插件 Tool Registry 融合 → 移动端只读续接 → Electron 原生恢复能力。

---

## 14. 给 GM 5.3 Flash 和后端执行者的规则

1. GM 先严格完成 Task 1–9 并取得用户验收，再执行 Task 10–15；不得一次同时生成两个原型。
2. GM 不执行 Task 16–20，不得调用 npm、Git、文件系统或真实插件代码。
3. 两个原型都必须先实现 types/Adapter/Mock 状态机，再生成 UI；页面组件不得用固定数组直接改安装或 Generation 状态。
4. 模型、角色、普通工作流、主工作区、任务中心和现有品牌保持不变。
5. 后端执行者在 Task 16–20 前重新读取当时的数据库、启动入口、Next 版本文档和平台沙箱能力；不得把普通 child process 宣称为安全沙箱。
6. 构建脚本开放互联网、无强沙箱仍允许运行未签名插件，是用户明确选择的风险政策；实现必须提供不可绕过的确认和审计。
7. 每个任务先写失败测试、验证失败、完成最小实现、运行指定门禁，再进入下一任务。
8. 修改共享文件前读取当前 diff 并手工合并；不得覆盖其他未提交工作。
9. 页面和真实 Runtime 分别完成后，各自新增真实 `更新md/` 记录，列出已执行测试、限制和回滚边界。
10. 不提交代码，除非用户明确授权；授权后只暂存对应阶段文件。

---

## 15. 锁定决策汇总

- 使用一份整合文档管理阶段 A 风格研究工作台、阶段 B 插件中心 Web 原型和阶段 C 真实插件运行时。
- GM 5.3 Flash 先完成阶段 A，用户验收后再完成阶段 B；不执行阶段 C。
- 当前 `plugin_manifests` 只是登记册，不被描述为现成插件运行时，也不删除。
- 每个登录用户可以自由从 npm、Git 和本地 `.stzhplugin`/目录来源安装插件。
- 插件安装到账户插件库；不同项目自行选择是否启用、固定版本、权限档和配置。
- 同一插件多版本并存；新版本不自动切换项目；项目引用的版本不能直接删除。
- 所有包强制 SHA-256；可信签名分级显示；无签名可确认安装；签名无效硬拒绝。
- 构建脚本在临时安装沙箱自动运行，并按用户选择允许开放互联网；宿主密钥、数据库和项目目录不进入脚本环境。
- 真实插件组合运行在每项目独立 Node 宿主进程；Generation 切换不重启主应用或其他项目。
- 无强系统沙箱时，未签名插件可在高风险确认后运行；独立进程不被宣传为强安全边界。
- 权限使用 Safe/Standard/Full 三档；即使 Full 也不能直接读取模型 Key、JWT、SQLite、其他账户或宿主任意文件。
- 首版 contribution 为 Agent 工具、工作流和 sandboxed iframe UI；模型 Provider 不由插件扩展。
- UI 使用版本化 additive slots 覆盖全站；插件不得替换根布局、导航、认证、设置容器或核心输入框。
- 插件独立页面收纳于插件中心内部 viewer，不增加顶部导航入口或未知动态 Next route。
- 项目保存 last-known-good；故障进入项目安全模式，可禁用疑似插件、回滚、查看日志和导出诊断。
- 卸载后的插件配置/项目数据默认隔离保留 30 天，可恢复或立即永久删除。
