# 创意工坊机制入口与求证边界

文档修订：6；稳定机制ID保持不变；研究重试边界最近核验：2026-09-30（第43批），Coze本地流与远端结果的证据边界最近核验：2026-09-30（第45批只读复核与本地代码），其他机制按各自证据范围使用。依据是本地工作树（基础提交 `b71dd74` 加尚未提交的变更）及列出的本地验收记录，**不是线上部署版本**。契约/部署标识目前 unknown；代码或配置变化后需重新核对关联结论。

四种模式的“有结果”分别指不同状态：Coze 需要业务完成事件与产物；单助手需要模型响应与消息同步回执；工作流需要每步结果及运行状态；协作需要讨论完成、人工确认和下游任务分别完成。不要用 HTTP 状态或页面上的一段文字代替这些状态。

| 稳定机制ID | 预期结果 | 首先核对的事实 |
|---|---|---|
| studio.coze.v1 | 当前账户的创作请求得到明确结束状态及可识别结果 | 本地会话映射、chat事件、task状态与产物字段 |
| studio.assistant.v1 | 当前模型回复当前会话；记录同步成功或明确显示同步失败 | provider、消息ID/正文、同步回执、账户身份 |
| studio.workflow.v1 | 普通流程完成逐步结果；研究流程执行已批准版本并生成带引用产物 | 流程类型、plan revision、审批事件、step状态、来源/产物 |
| studio.collaboration.v1 | 角色讨论产生待确认指令，确认后只创建一个关联任务 | team snapshot、run状态、最终指令版本、关联task及事件 |

以下每张卡是正常过程的说明。现场调查须记录“预期—实际偏离—证据—影响—未知”，不能只引用本卡就宣称这次运行正常。

运行时入口：`server/studio-mechanism-reference.js` 保存这些机制的精简参考，按已验证模式及当前问题的运维关键词选取；`studio-context-service.js` 在实际请求容量允许时整体加入user参考区，trace保留ID、修订、来源、适用性与预算省略原因。默认shadow不改变出站内容；off不选择。关键词只是一版按需检索规则，不是语义质量保证，不能由命中推断当前故障原因。机制正文变更时应同步精简卡并递增修订；部署、契约和代码提交适用性目前均unknown。

## studio.coze.v1

**范围与依据**：`server/account-agent-service.js:createAccountAgentService`、`server/agent-service.js:generate`、`server/task-runtime.js`；账户映射与协议行为由 `server/test/account-agent-service.test.js`、`server/test/agent-service.test.js` 的合成调用验证。真实下游四个工作流仍按阶段四验收矩阵记录失败/暂缓，不在此升级结论。

1. 输入由已鉴权账户、本地会话ID、正文及附件构成。账户包装器按 `(user_id, namespace, local_id)` 查询远端会话；丢弃输入中的任意远端 userId，派生账户隔离标识。
2. 同一数据库实例内对账户/命名空间/本地会话加锁，已有调用时返回409。该锁在内存，不能据此承诺多进程互斥。
3. 首次会话可携带文本历史；已知远端 conversation 时不再重复携带本地历史，使用 `auto_save_history=true`。账户包装器先调用统一上下文服务；仅enforce模式把preparedMessages交给Coze适配器，shadow只附带拟采用的trace。远端系统提示、内部历史和工具上下文用量不可观测；本次排除或本地删除无法撤销已经发往远端的旧记忆包。
4. 读取流事件，分别积累正文、工具结果/警告、chat/conversation ID。流结束但没有 `conversation.chat.completed` 时抛出 `INCOMPLETE_STREAM`。本地流结束只说明本地接收结束，不能证明远端生成已经停止，也不能证明业务成功；不能把这三种状态合并。
5. 业务完成后解析媒体链接；有工具警告且无媒体结果会报错。函数成功返回且未取消后，账户包装器才保存远端会话映射。任务执行器另负责将结果写回持有有效租约的任务。

**失败及原子性**：远端调用、附件上传、会话映射和本地任务更新不在同一事务内。远端可能已经创建会话或执行工具，但本地没有收到完整结果。映射只在成功返回后写入，因此失败后的远端结果仍可能未知，不能承诺重试无外部副作用。取消会尝试远端 cancel，失败会保留取消失败信息；本地取消不证明远端已经停止，也不能撤销已完成生成。运行时Coze机制卡修订3保存同一证据边界。

**查证与重试**：先读本账户 task、事件、已知chat/conversation ID与结果字段；对远端不可见部分明确 unknown。没有远端幂等/结果证据时不自动重发生成。用户当前暂停媒体测试，本卡不授权任何付费调用。

**未决事项**：部署版本、远端失败调用查询/计费状态、实际工作流依赖和内部预算仍待核验。

## studio.assistant.v1

**范围与依据**：`app/components/ModelAssistantPanel.tsx:callModel/send/retryReply`、`server/routes/creative-agent.js:/api/model/chat`、`app/lib/opc-agent-persist.ts:saveMessages`；历史同步与账户竞态见第07、08、18批记录及对应行为测试。

1. 页面校验当前账户、会话就绪、模型存在；创建用户消息和空助手占位。占位不是模型已经开始返回内容的证据。
2. 本轮将固定提示、当前创作参数、请求上限内的完整用户/助手消息和新输入发给 `/api/model/chat`，携带studioContext模式、会话、当前约束及临时排除。后端按账户查模型，验证会话范围，再构建上下文；带studioContext的请求不再逐条截断20000字符。不带studioContext的兼容调用仍使用旧的20条/20000字符限制。页面与重试路径不再固定裁剪为10条；总请求最多200条，超出时保留近期完整轮次并标记historyOmitted。
3. 当前接口返回完整 JSON `{text, provider, contextTrace}`，页面替换占位内容。**它不是 SSE 流式回复接口**。失败保留错误状态，最新可重试回复由现有入口显式重试。
4. 消息先保存本机，再进入按账户/会话串行的同步队列。先创建远端会话，上传稳定消息ID和内容指纹不同的条目；只有返回数量一致才记录同步回执。同步失败保留本机内容并提示重试。

**失败及原子性**：模型远端消费、页面更新、本机保存和服务端消息同步没有跨系统事务。模型接口502可能发生在远端已消费之后。出现正文也不代表服务器已保存；页面空占位也不能证明模型没执行。同步幂等由稳定消息ID支撑，模型推理重试不具备相同保证。

**查证与重试**：检查provider配置及核验版本、请求所属账户、当前会话消息ID、服务端内容与同步回执。仅同步失败时先重试同步，不为了修复保存而再次推理。

**未决事项**：真实提供商质量/延迟、精确token计数及灰度效果未验证。当前按完整协议JSON的UTF-8字节加余量保守估算，提供商窗口由用户配置；默认shadow不替换请求。长会话自动摘要在服务端裁剪或页面报告historyOmitted时尝试建立；只能从本账户已同步的原文提取，不承诺找回未同步或所有被省略的内容。查证时同时核对rollout、applied、inputBytes与实际发送路径，不以trace里存在记忆证明模型用过它。

## studio.workflow.v1

**范围与依据**：普通工作流位于 `ModelAssistantPanel.tsx:runWorkflow` 与 `app/lib/opc-workflows.ts`；研究工作流位于 `server/research-runtime.js`、`server/routes/research.js`。两条执行路径不同，不能互相套用审批或恢复保证。

**普通流程**：校验表单 → 可选动态规划（失败回退静态步骤）→ 按序构造步骤输入与前序结果 → RAG/搜索增强 → 调用模型 → 保存逐步消息。步骤失败停止本轮。新运行先保存不可修改的计划、输入、定义版本与执行配置快照，再执行步骤；恢复入口先读取服务端结果，核对连续完成前缀、定义版本与配置是否仍匹配。仅用户显式点击继续才执行剩余步骤，不重新规划或重复已完成步骤；全部完成时只恢复完成状态。缺少快照的旧运行只能恢复结果或另开运行；running/uncertain、记录不连续或版本/配置变化时拒绝续跑。完成后保存结果动作卡消息；服务端消息同步可为成功工作流产物生成持久化候选，必须由用户确认后才可能检索使用，不再写入旧的高置信进程内摘要。每次启动有独立workflowRunId与stepId，前序引用由浏览器收到成功响应后追加；当前服务端按账户/会话/run保存模型步骤结果，前序引用必须匹配已完成记录和步骤序号，才以server_result_records标记并携带原文与指纹。相同请求完成后重试直接返回原结果；running/uncertain拒绝重复调用。旧trace中的client_reference_only仍表示当时未经服务端核验。模型正文保存不是内容事实核验或执行批准。RAG与网络资料放在user参考区，不拼进系统指令。此前步骤及外部调用可能已完成，不应把整条流程当作原子事务或可自动重放的检查点。

**研究流程**：

1. 创建 run，初始 `awaiting_plan_approval`、plan revision 1，产生 `run.created/plan.generated`。创建计划本身不调用模型；插件可选步骤默认关闭。
2. 编辑必须是待确认状态且 expectedRevision 匹配；合法修改使revision递增。非法输入和409冲突不得冒充保存成功。
3. `approve_plan` 再核对 expectedRevision，把当前plan revision保存为approvedPlanRevision，记录 `plan.approved` 后进入running。`run.started` 与批准revision共同证明启动依据；页面改稿或计划存在不等于批准。
4. 按依赖执行步骤；来源记录保留本run来源ID，模型产物先验证整体结构和合法引用，再生成产物/引用事件。步骤、产物、sources均可读取核对。
5. 暂停/取消会中止当前调用；重试仅用于失败步骤，跳过仅用于允许的可选失败步骤。修改失败步骤输入时必须提交当前expectedRevision，计划版本递增并回到awaiting_plan_approval；新版本获批前不调用工具或模型。未改输入时允许按原批准版本显式重试。跳过步骤不能修改输入。服务重启将running恢复为paused，等待用户继续。
6. 每步模型请求带服务端toolState：当前状态、planRevision、approvedPlanRevision、activeStepId、completedStepIds及mediaGenerationApproved=false。上下文服务按run/项目隔离，临时排除随创建输入快照保留。context.prepared与memory.candidate事件仅记录观察信息，不能改变审批或完成状态。

**失败及原子性**：研究的 `_emit` 将当前快照和单个事件放在SQLite事务内；整个计划、全部外部工具和所有产物不属于一个大事务。部分步骤或外部调用可能已完成。中止不能撤销已生效的外部副作用；确认/重试前按run、step、seq核对，不能只看一次HTTP错误。

**第43批现场证据**：MiMo文字联调分别通过助手、两步工作流及缓存重放、角色生成、研究产物、协作待确认状态；见`output/stage4/batch43-mimo-text-summary.json`。研究来源是合成资料，实际模型传输为真实MiMo；不是真实搜索或Coze验收。第一次研究回复达到1200-token上限，运行进入recovering且未提交产物；提高本次隔离模型的回复预算并缩短研究要求后，只补测研究和协作。生产适配器现在按finish_reason=length或stop_reason=max_tokens返回UPSTREAM_OUTPUT_TRUNCATED和提高回复上限的提示，不自动付费重试。机制卡studio.workflow.v1修订5记录以上重试约束；不将此次联调扩展为任务质量盲评。

**本地观测**：第19批 `research-plan-final.json` 记录一个浏览器创建、编辑、冲突恢复再取消的合成运行，0已执行步骤、0来源、0产物、无run.started。它证明计划交互，不证明实际搜索/模型研究成功。

**未决事项**：实际搜索/RAG/模型配置与费用、真实提供商中断后的结果核验、真实长任务摘要质量。普通工作流已用隔离假模型完成键盘续跑及刷新验收：恢复已有结果0次调用、剩余3步3次假模型调用、重复恢复不增加调用且只保留1张完成卡；证据为output/stage4/workflow-resume-ui-result.json与browser-20260928/workflow-resume-final-reloaded-dom.txt。这不证明远端消费未知时可以安全重试。审批版本已进入研究请求的服务端状态包，但这不证明模型一定正确理解，也不表示历史run已经有批准版本记录（旧记录可为null）。

## studio.collaboration.v1

**范围与依据**：`server/routes/creative-agent.js` 的create/start/finalize/confirm-coze、`server/creative-agent-service.js:runCreativeGraph`、`server/agent-run-linkage.js:syncAgentRunFromTask`；确认幂等与状态链接由 `server/test/creative-agent-routes.test.js`、`server/test/task-linkage.test.js` 覆盖。

1. 创建run时验证项目归属并快照启用角色、提示及模型绑定。编队存在但全停用时拒绝。当前角色配置变化不能用于重写旧运行事实。
2. 各角色提示保留原始任务；审校直接对照原始限制，避免研究/创意遗漏后失去检查依据。跨角色计划、研究、创意和审校产物以JSON参考传递，保留阶段、角色、原文及unverified/deliveryApproved=false边界；仅传入本阶段依赖的产物，不能将角色自称“已批准”作为授权。

从draft启动采用条件更新抢占；显式选模型或使用快照绑定，绑定已删除时先报冲突。各角色请求按本项目/run准备上下文和提供商容量，携带服务端stage与deliveryApproved=false，写入context.prepared事件；临时排除在启动前校验。产出最终指令后进入 `awaiting_confirmation`，生成的记忆候选仍是未确认、未核验的草稿引用。
3. 用户可编辑最终指令。Web提交原指令比对值；冲突时保留本地草稿，对照最新内容。旧兼容客户端可省略比对值，不能把Web的保护推断为所有客户端都实现了相同协议。
4. 人工确认后，在SQLite事务内按 `agent-run:<runId>` 幂等键创建 `video.generate` 任务、链接run并写 `task.queued` 事件。已queued且有关联任务时返回现有任务。
5. 任务通过独立队列执行；状态链接器要求账户/run/task对应，随后将queued/running/paused/completed/failed/cancelled回写run。确认入队不是生成完成，`coze_delivered_at` 在completed才记录。

**失败及原子性**：最终确认的本地建任务+链接+事件有事务；事务提交后的通知发布或HTTP回包、以及后续远端执行不在事务内。回包丢失时先GET run与task，核对关联ID/状态，再决定是否调用幂等确认端点；不能直接另建任务。主管/子角色模型调用也不是可回滚事务。

**查证**：`GET /api/agent-runs/:id` 的run、按created_at/rowid排序事件及关联task；检查team_snapshot、final_instruction、task_id、幂等键。读取事实不触发确认或执行。

**未决事项**：真实多角色质量和部署状态、进程异常中断的远端推理消费情况。本地故障注入已覆盖确认事务提交后、HTTP响应发出前断开socket：后续读取与重试只关联同一queued任务，cozeDeliveredAt仍为空。该证据不覆盖Coze远端消费后断流或线上部署状态。

## 共享记忆与上下文：查证入口

依据：`server/studio-memory-store.js`、`studio-memory-index.js`、`studio-context-service.js`、`studio-summary-store.js`、`studio-project-notes.js`；实现契约见 [记忆API](studio-memory-api.md)，最近自动检查见 [第24批](../../更新md/2026-09-28-24-记忆检索项目笔记与集中验收.md)。以下属于本地实现，不证明线上配置。

1. 保存产生candidate/unverified，确认仅授权使用；内容含义改变后重新变成候选。稳定请求台账防止同一次保存重试复活已删除条目。
2. FTS5按统一词法召回本账户候选；索引是可重建派生数据。随后再次检查范围、来源指纹、最新版本、状态、敏感性、TTL和当前明确约束，再做临时排除、排序与容量选择。索引命中不代表允许注入。
3. 编辑/删除在同一事务中使索引失效；新查询从当前权威记录重建。来源变化会令记忆不可用；用户查看新来源、刷新引用并重新确认之前不能当作当前证据。
4. off保持原请求；shadow返回原请求并附拟采用trace；enforce才替换消息。预算保护系统规则、当前完整输入和服务端工具状态，历史按整轮省略，原文仍存。可选参考不足时省略，不截断否定条件。
5. 摘要保存覆盖消息范围和指纹，原文变动可检出失效。extractive-v2只选原文片段，排除已标失败或无法解析状态的回复但保留原文来源（历史v1仍可查看）；用户自填摘要不会自动注入，不宣称具备语义总结质量。
6. 项目笔记保留五类字段及revision，必须明确启用；用户记下“已完成”不改变真实run。删除保存空内容和递增版本，旧改稿写入返回409；这是并发防护，不是任务撤销。
7. 页面上的请求trace是当时的引用快照；现在删除记忆后，旧trace仍可能显示旧内容。新请求不得再次引用该记忆。区分历史证据、当前可用性与远端不可撤销历史，避免把三者混为一谈。

## 求证与知识维护

每次结论记录机制ID/版本、预期、观察时间、适用代码/配置/契约、原始来源ID、冲突与未知。网页/复盘/用户陈述只是有来源的材料；确认保存不能代替运行核验。解释必须允许反例：若证据指向另一环节，应更新解释而非忽略证据。

正式结论保留唯一ID与权威内容；其他索引只引用，避免多份副本漂移。日期记录保留排查过程；相同假说重复出现不会提升核验状态。变更相关代码、模型配置或契约后复核机制卡并重跑受影响案例。

公共层测试验证的是数据保留、筛选和预算边界，尚不能判断模型是否理解这些机制。第22批已对记忆删除执行HTTP/SQLite故障注入：删除提交后返回500，随后GET/检索证明已删除，同保存请求重试410不复活；另有台账写入失败时的事务回滚测试。协作本地确认回包丢失已做socket故障注入；Coze远端响应丢失及独立盲评仍需专门验收，不能用“文档写了”冒充已执行。
