# 创意工坊机制与求证边界

按main当前源码核对：2026-10-02。稳定ID用于定位模式；本说明不改变 [studio-mechanism-reference.js](../../server/studio-mechanism-reference.js) 的运行时卡片修订，也不宣称线上部署已经更新。阶段4尚未完成。

| 稳定ID | 结果含义 | 首先核对 |
|---|---|---|
| `studio.coze.v1` | 本账户创作有明确业务结束及结果 | task、chat/conversation、媒体/文本与警告 |
| `studio.assistant.v1` | 当前模型回复当前会话，保存状态明确 | provider、消息ID、同步回执 |
| `studio.workflow.v1` | 普通步骤结果或已批准研究计划的产物 | 流程类型、计划版本、步骤、来源/事件 |
| `studio.collaboration.v1` | 讨论、人工最终指令、确认后的下游任务 | team/run、final指令、关联task |

机制参考、项目笔记和记忆都是资料，不代替当次服务端状态或审批。默认shadow仅观测；trace记录选择/预算/范围，不能证明模型实际采纳或结论正确。

## studio.coze.v1

账户包装器按账户、命名空间和本地会话管理远端关联，不能任意复用别人的conversation。首次可转换本地历史，续轮使用远端历史，不重复全部本地消息。

主创作通过服务端可靠任务与附件执行器；即时API另有JSON/SSE路径。上游流没有业务完成事件时不能判成功，有警告且没有媒体时按适配器错误语义处理。

本地流结束、远端停止和业务成功是三个事实。取消尝试远端cancel，本地Abort不证明撤销或未消费。远端调用、上传、会话映射与本地任务保存没有跨系统事务；失败先读权威task/会话及已知远端ID，不自动重发。

代码：[账户适配](../../server/account-agent-service.js)、[Agent服务](../../server/agent-service.js)、[任务Runtime](../../server/task-runtime.js)、[媒体执行器](../../server/video-generate-executor.js)。

## studio.assistant.v1

页面校验账户、会话和模型，把本轮参数、近期完整轮次及新输入交给 `/api/model/chat`。有studioContext的路径在服务端复核范围与预算；兼容调用的历史限制不同，不混用。

当前模型回复是完整JSON，不是SSE。消息先本地保存，再按账户/会话同步稳定ID；同步失败保留副本和提示。看到正文不代表云端保存，空占位也不证明模型未执行。

模型推理、客户端和消息同步没有同一事务。仅保存失败优先重试同步，不为保存再次推理。代码：[助手面板](../../app/components/ModelAssistantPanel.tsx)、[创作路由](../../server/routes/creative-agent.js)、[会话持久化](../../app/lib/opc-agent-persist.ts)。

## studio.workflow.v1

**普通流程**由浏览器编排，保存原输入、步骤顺序、定义hash及模型/项目配置快照。服务端核对前序步骤结果；已完成的同请求复用结果，running/uncertain拒绝重复调用。恢复先只读，核对连续完成前缀和配置；只有显式继续才执行剩余步骤，关闭页面不后台续跑。缺快照的旧运行、配置变化或未知执行不能自动重放。

**研究流程**由服务器运行。创建计划进入 `awaiting_plan_approval`；编辑和批准核对expectedRevision，实际批准版本写入approvedPlanRevision。修改失败步骤输入后需重新批准；重启恢复为paused。外部工具与模型分别有执行状态，资料、产物和事件保留run来源。

研究产物、引用和对应事件使用本地事务整体提交，外部消费不在事务内。导出内容保留 `model_output/unverified` 及来源，报告完成不等于事实或媒体完成。研究批准不赋予媒体批准。

代码：[普通流程](../../app/lib/opc-workflows.ts)、[恢复](../../app/lib/workflow-resume.ts)、[计划](../../server/studio-workflow-plans.js)、[步骤结果](../../server/studio-workflow-results.js)、[研究运行时](../../server/research-runtime.js)。

## studio.collaboration.v1

项目团队、角色模型及预算保存到run，角色输出形成待确认指令。用户编辑/确认后才创建幂等关联Coze任务；角色讨论完成、待确认、已提交和媒体完成分开记录。

角色检索以原始任务和职责为依据，不用前序模型产物扩大授权。服务端状态含实际运行/关联任务，旧记忆不能成为批准证据。讨论和下游任务没有跨系统事务，网络错误先核对run和task。

代码：[创作服务](../../server/creative-agent-service.js)、[创作路由](../../server/routes/creative-agent.js)、[任务关联](../../server/agent-run-linkage.js)。

## 公共求证规则

账户/项目/会话/运行、来源指纹、最新revision、启用/确认/过期和当前约束在每次请求重新核对。默认 `shadow` 不替换消息；`enforce` 的实际应用看trace，历史trace只记录当时状态。Coze远端用量和旧引用不可观测，不能保证远端已“忘记”。

现场问题记录预期、实际偏离、可定位代码/请求、影响与未知项。源码测试、合成样本、有限外部文字结果和生产媒体是不同证据；不要引用历史通过数宣称当前运行成功。当前可运行检查见[TESTING.md](../TESTING.md)，历史阶段/研究报告保留在[文档导航](../README.md)列出的范围。
