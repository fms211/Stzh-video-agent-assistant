# 创意工坊 · 记忆、摘要与项目笔记 API

按main当前实现核对：2026-10-02。四模式请求与管理UI已有接线，部署默认shadow。阶段4尚未完成；本文是当前契约，历史批次验收保留在[更新索引](../../更新md/README.md)，不将其通过数当成本次执行。

## 身份与存储

端点要求当前账户JWT，设置no-store；身份来自中间件。客户端不能指定owner、status或verification。模式名为 `coze / assistant / workflow / collaboration`，OPC会话目录的 `chat` 对应assistant。

`studio_memories` 存稳定ID、revision、JSON内容和账户时间；每账户最多1000条，正文最多4000字符。`studio_memory_requests` 存请求键hash/payload hash映射，与新建同事务；删除正文后保留映射，迟到请求不复活记录。旧 `opc_memory` 不自动迁移到统一记忆。

检索为SQLite FTS候选召回及当前权限/版本/约束筛选，不是向量数据库。工作记忆默认1小时有效期，显式expiresAt可覆盖；过期不注入，仍可管理/导出，不删除原历史。

## 记忆端点

基址 `/api/studio/memories`：

| 请求 | 输入/语义 |
|---|---|
| `POST /` | `requestKey/mode/content`，可选scope、kind、claimKind、importance、expiresAt、slot、source；新建candidate，重复相同请求复用 |
| `GET /?limit=50&after=…` | limit1–100，返回items及nextCursor，按稳定ID分页 |
| `GET /:id` | 当前账户记录，不存在或无权404 |
| `PATCH /:id` | expectedRevision及允许的正文/范围/重要性/有效期/slot/enabled；意义变化重新candidate并清空核验结论 |
| `POST /:id/confirm` | 仅expectedRevision；允许使用，不提高verification或自动启用 |
| `DELETE /:id` | 仅expectedRevision；删除正文，204；旧保存重试410 |
| `GET /export` | 账户存储记录，含候选/停用/过期；schemaVersion与导出时间 |
| `POST /search` | query、mode，可选项目/会话/run、currentConstraints、limit、excludedMemoryIds；只检索，不调用模型 |
| `GET /context-status` | 当前 `off/shadow/enforce`；单次应用仍看trace |
| `GET /:id/source` | 来源预览、指纹和截断状态 |
| `POST /:id/refresh-source` | expectedRevision及expectedSourceFingerprint；成功重新candidate/unverified，正文不自动重写 |

创建最小示例：

~~~json
{
  "requestKey":"<本次保存的稳定唯一键>",
  "mode":"assistant",
  "content":"此项目的海报优先保留负空间",
  "scope":{"kind":"user"}
}
~~~

同requestKey不同payload409；过期revision409；非法字段400。单独停用/删除可用于管理来源已失效记录。有限令牌格式检查不等于完整敏感信息识别，不应保存密钥或私有凭证。

## 来源、范围与版本

scope支持user、project、带mode的session/run。project必须属于当前账户；运行查询从权威run派生项目，显式项目不一致时拒绝。没有新增项目成员共享权限。

未给source由服务端生成manual入口。来源记录需真实mode、recordId及对应sessionId/runId；研究artifactIds必须属于该账户运行，协作不能伪造研究产物。每次检索重读权限及内容指纹。

sourceState为manual/current/changed/untracked/unavailable，sourceAvailable只表示可读。来源改变、缺指纹或被撤回时停止使用；相同来源版本、内容、scope和设置的精确保存可复用记录，不等于语义整合，不自动恢复停用记录。

用户确认只表示允许保存/使用；候选、手工摘要和模型产物继续保持未核验。响应码、来源可读或运行completed都不能自动成为事实验证。

## 临时排除与请求观测

`excludedMemoryIds` 最多100项，在授权/来源/相关性检查后、top-k截取前排除；只影响本轮，不改变enabled/status/revision。未知或他人ID不能泄露内容。

消息同步、协作结果和研究产物可按固定规则生成candidate/unverified；不隐式理解所有偏好，也不在生成后立即强制使用。四模式按本轮范围选择候选，trace记录来源、核验状态、过滤原因、预算及检索依据。

当前检索选择版本 `creative-lexical-v7`，索引词法版本 `creative-lexical-v4`，两者用途不同。受控词法规则处理部分中英文创作概念、否定和改稿，不保证任意自然语言语义理解。召回文本至多前8000字符，完整约束检查另有内部上限；完整约束检查不等于全文召回。

部署默认 `STZH_CONTEXT_MODE=shadow`：拟采用方案不替换实际模型请求。`enforce` 应用，`off` 回退。`STZH_CONTEXT_INPUT_BYTES` 默认65536，范围4096–1048576；provider配置还保留输出余量，均为保守估算而非实际token计数。规则和本轮完整输入无法容纳时明确失败，不删历史。

单助手/普通工作流通过studioContext给出模式、范围和当前约束；协作与研究由内部适配器给出检索依据/状态，浏览器不能覆盖内部retrievalQuery。历史trace随对应消息/事件保存，不重新计算为当前事实。

## 非破坏性摘要

基址 `/api/studio/summaries`：

| 请求 | 用途 |
|---|---|
| `POST /` | mode/sessionId，可选query/keepRecent；从已同步原文建立/复用摘要 |
| `GET /?mode=…&sessionId=…&before=…` | 版本倒序，每页20，nextCursor用于before |
| `GET /:id` | 当前账户摘要及current/stale状态 |
| `GET /:id/sources?offset=0` | 来源原文分页及指纹校验；变更409要求重建 |
| `DELETE /:id` | 仅删除摘要，不删除会话 |

当前自动算法 `extractive-turns-v3` 选择完整用户轮次及相关回复，失败消息过滤，最多6条/正文3000字节预算；没有可用用户原文的助手回复不单独入选。它是原文摘录，不是额外模型生成的语义总结。原文保持，旧版本可读；每账户上限1000摘要，单会话支持范围上限2000条消息。

旧 `/api/opc/sessions/:id/compress` 也改为非破坏性摘要，用户提供内容标为user-supplied/unverified，不自动注入。未同步消息无法靠服务端摘要找回；Coze续轮不重复补发本地摘要。

## 项目笔记与工作流

`GET/PUT/DELETE /api/studio/project-notes/:projectId` 核对项目账户。写入/删除使用expectedRevision；taskState/conclusion/blocker/action/reference各≤4000字符，enabled由用户选择，内容未核验。删除保留递增空版本，防旧写覆盖。

笔记只在明确项目且启用时引用，预算不足整份省略。它不改变计划批准、运行状态或媒体权限。

普通工作流计划写入 `POST /api/opc/sessions/:sessionId/workflow-runs/:runId/plan`；读取同路径去掉 `/plan`。冻结原输入、定义和配置，服务端核对前序结果与同请求复用；current/changed/legacy仅表示恢复条件，续跑需显式操作。详见[机制](studio-mechanisms.md)。

## 验证与仍开放的边界

源码：[路由](../../server/routes/studio-memory.js)、[存储](../../server/studio-memory-store.js)、[索引](../../server/studio-memory-index.js)、[摘要](../../server/studio-summary-store.js)、[笔记](../../server/studio-project-notes.js)、[上下文](../../server/studio-context-service.js)。定向测试位于server/test与test，见[验证指南](../TESTING.md)。

独立质量盲评、真实模型效果/延迟、生产enforce灰度、部署/桌面完整安装包和真实媒体仍未由本次文档任务验证。旧本机脚本和output报告未随库分发，不作为新克隆直接可运行的命令。
