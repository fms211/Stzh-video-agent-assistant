# DeepSeek × Hermes 功能解构与「腾昇智和」演进规划

> 调研日期：2026-08-14；
> 调研目标：从 GitHub 上可复核的 DeepSeek 与 Hermes 开源实现中提炼智能体能力，并映射到本项目，而不是直接复制模型代码。

## 0. 名称与调研边界

GitHub 上没有一个可唯一定位、官方命名为 `deepseek-hermes` 的仓库；这个名称通常混用了两类项目：

1. **DeepSeek 模型与推理服务**：负责推理、生成和 OpenAI 兼容接口；
2. **Hermes 智能体生态**：负责工具定义、函数调用、任务循环与上下文管理。

因此，本报告将“deepseek-hermes”定义为 **DeepSeek 推理底座 + Hermes 工具型智能体范式**。如果后续指定了某个同名 fork，应先做依赖、许可证和提交差异审计，再修订本报告，避免把第三方 fork 的特性误认为上游能力。

### 主要 GitHub 参考源

| 参考源 | 用途 | 本报告采用的内容 |
|---|---|---|
| [deepseek-ai/DeepSeek-V3](https://github.com/deepseek-ai/DeepSeek-V3) | DeepSeek 官方模型仓库 | 推理模型定位、部署边界、开放权重能力 |
| [deepseek-ai/DeepSeek-R1](https://github.com/deepseek-ai/DeepSeek-R1) | DeepSeek 官方推理模型仓库 | reasoning 与普通回答分离、蒸馏模型边界 |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Hermes 智能体实现 | 工具发现、任务执行循环、终端/外部工具接入思路 |
| [NousResearch/Hermes-Function-Calling](https://github.com/NousResearch/Hermes-Function-Calling) | Hermes 函数调用示例 | JSON Schema 工具契约、调用解析和结果回注模式 |
| [NousResearch/DeepHermes-3](https://github.com/NousResearch/DeepHermes-3) | DeepHermes 训练/推理资料 | 可切换深度推理的交互范式（仅作产品交互参考） |

> **证据等级说明**：仓库 README/代码可证明“开源项目怎样实现”，不能证明某种方案在本业务上一定提升效果；下文所有收益均需通过本项目评测集验证。

## 1. 一句话结论

本项目已经具备多模型流式对话、动态工作流、Reflection、联网搜索、RAG 和分层记忆的雏形；最有价值的下一步不是再接一个聊天模型，而是把当前“提示词驱动的链式生成”升级为 **受控的工具调用运行时**：统一工具契约、显式计划、可暂停执行、结构化事件、权限确认、证据追踪和可回放评测。

## 2. DeepSeek × Hermes 的能力拆解

### 2.1 推理层：快答与深度推理是两条可观测路径

DeepSeek-R1 类模型会产生推理内容与最终内容；DeepHermes 的产品启发则是允许用户按任务切换普通模式和深度思考模式。对本项目而言，应抽象出统一的 `reasoningMode`，而不是仅靠“请深入思考”的提示词：

- `fast`：低时延，适合改写、标题和简单参数推荐；
- `balanced`：默认创作对话；
- `deep`：分镜规划、约束冲突检查和复杂研究；
- 展示层只呈现**简短推理摘要/进度**，不依赖或存储模型的私有思维链；
- 记录首 token 时间、总耗时、token 用量和取消率，才能判断深度模式是否值得。

### 2.2 工具层：JSON Schema 是模型与业务能力的边界

Hermes Function Calling 的关键不是特定标签语法，而是把工具描述为机器可校验的契约。每个工具至少包含：

```ts
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  risk: "read" | "write" | "external";
  timeoutMs: number;
};
```

运行时必须完成 `模型提出调用 → schema 校验 → 权限判断 → 执行 → 结构化结果回注 → 模型继续`。这比当前通过关键词判断联网、通过自然语言串联工作流更可靠，也使视频生成、素材检索、RAG、网页搜索和项目保存能共享一套协议。

### 2.3 编排层：Agent Loop 不等于无限自治

一个可生产化的循环应具有严格上限：

```text
用户目标
  → 规划（可选）
  → 选择工具
  → 参数校验 / 风险确认
  → 执行并记录 observation
  → 判断完成、继续、重试或降级
  → 输出带证据的结果
```

必须限制最大步数、单步超时、总预算、重复调用次数，并用 `AbortSignal` 支持取消。写操作与外部发布操作不能让模型自行授权。

### 2.4 上下文层：只给当前一步所需信息

Hermes 式任务执行会快速累积工具输出。本项目已有 GSSC（Gather → Select → Structure → Compress）方向，但还需要：

- 将搜索/RAG 结果保存为带 `sourceId`、URL、时间和摘要的 artifact；
- 工具原始输出留在运行记录中，只把摘要回注模型；
- 每一步声明所需 artifact，避免把全部对话和全部工具输出重复发送；
- 压缩后保留事实、用户约束、未完成任务和来源引用，不只保留自然语言摘要。

### 2.5 可观测层：流输出应是事件，而不只是文本 token

Hermes 式工具循环需要前端理解执行状态。建议统一 SSE 事件：

| 事件 | 关键字段 | UI 表现 |
|---|---|---|
| `run.started` | `runId`, `mode` | 创建任务时间线 |
| `plan.updated` | `steps[]` | 展示可折叠计划 |
| `tool.requested` | `callId`, `tool`, `argsPreview`, `risk` | 展示待执行/待确认卡片 |
| `tool.completed` | `callId`, `durationMs`, `artifactIds[]` | 展示结果和来源 |
| `tool.failed` | `callId`, `code`, `retryable` | 提供重试/跳过 |
| `message.delta` | `text` | 流式正文 |
| `run.completed` | `usage`, `citations[]` | 完成态与成本摘要 |

## 3. 与当前项目的差距映射

| 领域 | 当前已有 | 主要差距 | 优先级 |
|---|---|---|---|
| 模型接入 | OpenAI/Anthropic 协议，多厂商配置，DeepSeek 深度模式切换 | provider 能力靠名称字符串猜测；未统一 reasoning/tool-call delta | P0 |
| 工作流 | 6 个链式流程、动态选步、Reflection | 步骤仍是 prompt 函数；无 schema、权限、幂等、断点恢复 | P0 |
| 联网/RAG | 搜索触发词、服务端代理、RAG 上下文 | 来源未成为一等 artifact；引用不可系统验证 | P0 |
| 流式接口 | 对上游 SSE 透明转发 | 只有传输层代理；缺少领域事件和 run 状态 | P0 |
| 记忆 | working/episodic/semantic 分层和 SQLite 持久化 | 主要是关键词命中；缺少用户确认、来源、过期与删除策略 | P1 |
| 安全 | API key 位于 provider 配置/服务端代理 | 缺少工具风险分级、参数白名单、提示注入隔离和审计日志 | P0 |
| 评测 | Reflection 自评 | 自评不能替代离线基准；缺少任务成功率/成本/延迟回归 | P0 |
| UI | 工作流步骤卡、Action Cards、取消流 | 缺少工具确认、计划编辑、来源抽屉和失败恢复 | P1 |

### 当前实现中应优先修正的两个技术风险

1. **工具“声明”并不等于工具“执行”**：向 DeepSeek 请求附带 `web_search` function schema 后，流解析器目前只读取文本 `delta.content`；若模型返回 tool call，没有调度器执行并回注结果，用户会得到空响应或不完整回答。
2. **持久化增量判断存在时序风险**：消息先写入 localStorage，再读取 localStorage 计算新增 ID，会使 `newMessages` 为空；升级运行记录前应补充同步测试并采用服务端游标或“写前快照”。

## 4. 目标架构

```text
OpcAgentChat / Workflow UI
          │  POST goal + context + policy
          ▼
      Agent Runtime ───── Run Store (run/step/call/artifact/event)
       │    │    │
       │    │    └── Policy Engine (risk/budget/approval)
       │    └─────── Context Builder (GSSC + artifact summaries)
       └──────────── Provider Adapter (text/reasoning/tool calls)
                         │
             Tool Registry / Executor
         ┌────────┬────────┬─────────┬──────────┐
       Search     RAG    Prompt QA  Storyboard  Video Job
```

### 核心领域对象

- `Run`：一次用户目标，包含状态、预算、模式和最终输出；
- `Step`：计划中的可重试单元，状态机为 `pending/running/waiting_approval/succeeded/failed/cancelled`；
- `ToolCall`：工具名、校验后的参数、风险、幂等键、耗时与错误码；
- `Artifact`：搜索证据、分镜 JSON、提示词包、图片或视频任务等可复用产物；
- `Event`：用于 SSE、审计与回放的 append-only 事件。

## 5. 分阶段实施路线图

### Phase 0：基线与契约（2–3 天）

**目标**：先能测量，再改架构。

- 建立 30 条中文短视频任务集：提示词优化 8、分镜 8、事实研究 6、工具失败 4、恶意提示注入 4；
- 定义 `ProviderCapabilities`，显式声明 `reasoning`、`tools`、`streamToolCalls`、`nativeSearch`；
- 定义上述 SSE event schema，并为旧纯文本流保留适配器；
- 修复消息增量同步并增加测试；
- 基线指标：任务完成率、schema 合法率、引用覆盖率、P50/P95 延迟、平均调用数和估算成本。

**验收**：同一评测命令可输出 JSON 报告；旧聊天流程无回归；provider 不再通过显示名称判断关键能力。

### Phase 1：最小工具运行时（5–7 天）

**目标**：实现一个有边界、可取消、可审计的 Agent Loop。

- 建立 Tool Registry 与 JSON Schema 校验；
- 首批只注册只读工具：`web_search`、`rag_search`、`get_opc_config`；
- 解析 OpenAI 兼容的分片 `tool_calls`，合并 arguments 后再执行；
- 设置默认 `maxSteps=6`、单工具超时 20 秒、同参数最多重试 1 次；
- 输出结构化 SSE 事件并保存 run/call/event；
- 将网页/RAG 返回内容视为**不可信数据**，用边界标签隔离，不允许其覆盖 system/tool policy。

**验收**：工具参数 schema 合法率 ≥ 98%；取消信号 1 秒内停止下一步；任何 run 均可从事件记录复盘；未注册工具永不执行。

### Phase 2：视频创作原生工具（5–8 天）

**目标**：让智能体产出可编辑资产，而非一大段 Markdown。

- `create_storyboard` 返回结构化镜头数组；
- `lint_prompt` 检查主体、风格、镜头、时长、负面约束和冲突；
- `create_generation_job` 创建图片/视频任务，但提交前必须显示参数确认卡；
- 每个镜头、提示词和生成任务都保存为 artifact，可在后续对话复用；
- 现有 6 个工作流改为“模板计划”，由运行时执行，而不是直接拼 prompt。

**验收**：结构化分镜可编辑并重新生成单镜头；失败任务可从失败步骤重试；重复提交使用幂等键不会创建两份任务。

### Phase 3：计划、记忆与证据（5–7 天）

**目标**：提升长任务可控性与事实可靠性。

- 复杂目标先生成可编辑计划，简单目标跳过规划以降低延迟；
- 研究类回答逐段绑定 `artifact.sourceId`，不存在来源时明确标注“模型推断”；
- 记忆写入增加来源、有效期、敏感等级和用户确认；
- 将“用户偏好”与“模型推断的偏好”分开，用户可查看和删除；
- 对超长工具输出采用“原文 artifact + 校验摘要”，不丢失原始证据。

**验收**：研究任务引用覆盖率 ≥ 90%；被删除的记忆不会再次注入；计划经用户修改后只执行批准版本。

### Phase 4：灰度与优化（持续）

- 10% 会话开启工具运行时，按 provider/任务类型比较旧流程；
- 仅当任务成功率提升且 P95/成本在预算内时扩大灰度；
- 对深度推理采用路由策略：复杂度分类器判定 + 用户手动覆盖；
- 增加 replay 测试、故障注入（超时、429、畸形 JSON、断流）与安全红队集；
- Reflection 只用于建议，不作为唯一质量分数，最终采用确定性 lint + 人工盲评 + 任务指标。

## 6. 建议的首批工具目录

| 工具 | 风险 | 输入 | 输出 | 是否确认 |
|---|---|---|---|---|
| `web_search` | read | `query`, `freshness`, `limit` | 带 URL/标题/日期的 source artifacts | 否 |
| `rag_search` | read | `query`, `topK`, `filters` | 文档片段与 score | 否 |
| `get_opc_config` | read | 无 | 当前风格、运镜、时长、画幅 | 否 |
| `create_storyboard` | write | 主题、时长、镜头约束 | storyboard artifact | 否（仅草稿） |
| `lint_prompt` | read | prompt、目标模型 | issues、score、建议 | 否 |
| `create_generation_job` | external | prompt、参数、镜头 ID | job ID、状态 | **是** |
| `publish_video` | external | asset ID、渠道、文案 | publish result | **始终确认** |

不建议首期开放 shell、任意 URL 抓取、任意文件写入或自动发布。这些能力扩大攻击面，却不是验证创作闭环的必要条件。

## 7. 数据与安全要求

1. **最小权限**：工具按用户、工作区和环境授权，服务端忽略模型自行声称的权限；
2. **参数校验**：拒绝未知字段，限制字符串长度、URL 协议、文件类型、搜索条数和生成成本；
3. **提示注入隔离**：网页、RAG、上传文件均标为 untrusted；工具输出不得成为 system message；
4. **密钥隔离**：API key 只在服务端 provider/tool adapter 使用，不写入事件、artifact 或客户端日志；
5. **审计与隐私**：记录谁在何时批准了哪次外部写操作；用户能导出/删除自己的 run 与记忆；
6. **成本护栏**：run 创建时锁定 token、工具次数和生成任务预算，超限进入 `waiting_approval`；
7. **许可证复核**：借鉴架构可以直接实施；复制任何上游代码、权重或提示模板前必须逐仓库确认许可证和模型使用条款。

## 8. 功能收益与验证假设

| 假设 | 预期收益 | 验证方式 | 失败时回退 |
|---|---|---|---|
| schema 工具调用优于提示词串联 | 少空响应、少格式错误 | 评测集 schema 合法率/任务成功率 | 回退固定工作流模板 |
| artifact 化分镜优于 Markdown | 可编辑、可重试、可复用 | 单镜头修改完成时间 | 同时保留 Markdown 导出 |
| 深度模式按复杂度路由 | 复杂任务质量提升，简单任务不变慢 | 盲评 + P95 + token 成本 | 仅保留手动开关 |
| 来源绑定减少幻觉 | 研究输出更可信 | 引用覆盖率与引用有效率 | 无来源即禁用事实性断言 |
| 显式权限确认降低风险 | 防止误生成/误发布/超预算 | 未确认写操作执行数必须为 0 | 全部写工具默认关闭 |

## 9. 明确不做的事情

- 不把展示完整思维链当作功能目标；展示计划、证据、工具状态和简短解释已经足够；
- 不让 Agent 无限循环或自行扩大预算；
- 不以“支持更多模型数量”代替工具闭环和评测；
- 不直接把第三方 Hermes 代码嵌入 Next.js 客户端；运行时、密钥和工具必须在服务端；
- 不在首版同时实现多智能体。单 Agent + 确定性工具和步骤状态机更容易测试、审计与恢复。

## 10. 下一次迭代的可执行清单

建议立即创建一个纵向切片，而不是同时改造所有工作流：

1. 选择“风格研究与应用”作为试点；
2. 实现 `ProviderCapabilities`、`web_search` schema 和 tool-call 分片解析；
3. 把搜索结果保存为 source artifact；
4. 前端展示 `plan.updated/tool.completed/message.delta` 三类事件；
5. 最终回答必须引用 source artifact；
6. 用 6 条研究任务 + 2 条提示注入任务做旧/新流程对比；
7. 达到 Phase 1 指标后，再迁移“短视频全链路生成”。

这个切片能够同时验证 DeepSeek 推理适配、Hermes 式工具调用、证据链和结构化流事件，是风险最低、信息增益最高的第一步。
