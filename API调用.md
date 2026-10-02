# 腾昇智和 · 应用 API

本文说明 main 的 **Express API**（2026-10-02源码核对），不是Coze官方API字段镜像。应用阶段4尚未完成；调用媒体、模型或插件可能产生外部消费，须按实际配置和权限执行。

## 基址与身份

默认开发后端 `http://localhost:8080`；静态同源部署使用页面所在域名。客户端基址见[后端配置](BACKEND_SETUP.md)。除健康检查和注册/登录等入口外，业务接口要求：

~~~http
Authorization: Bearer <当前账户JWT>
Content-Type: application/json
~~~

登录：

~~~http
POST /api/auth/login
~~~

~~~json
{"username":"<你的用户名>","password":"<你的密码>"}
~~~

返回 `token` 和 `user`；Token默认7天有效。注册为 `POST /api/auth/register`，字段 `username/password/displayName`；当前用户名2–20字符、密码至少6字符。`GET /api/auth/me` 核对身份，`POST /api/auth/change-password` 使用 `oldPassword/newPassword`。不要把JWT、Coze令牌或模型密钥放进共享示例。

## 可靠任务与历史

主创作界面通过服务端队列执行 `video.generate`。先上传附件（如有），再创建任务：

~~~http
POST /api/tasks
~~~

~~~json
{
  "kind":"video.generate",
  "title":"示例创作任务",
  "origin":"desktop",
  "idempotencyKey":"<本次提交的稳定唯一键>",
  "input":{"prompt":"<当前创作要求>"},
  "attachmentIds":[]
}
~~~

新任务返回201及 `{task, created:true}`；相同键和相同内容复用任务，内容改变返回409。返回排队状态不表示媒体已生成。缺少Coze运行配置时执行器不启动。

| 请求 | 用途与限制 |
|---|---|
| `GET /api/tasks?status=completed,failed,cancelled&limit=20` | 按账户查询历史；返回 `tasks/total/nextCursor`，继续查询时使用 `cursor`，不要解码后修改游标 |
| `GET /api/tasks/:id` | 单任务，结果包含状态、input/output、进度、时间及revision |
| `POST /api/tasks/:id/actions` | `{"action":"pause|resume|cancel|retry"}`；许可取决于当前状态 |
| `POST /api/attachments` | `multipart/form-data`，字段 `file`；返回附件描述符，绑定任务时校验账户归属 |

状态：`queued / running / paused / completed / failed / cancelled`。`claim`、`lease/renew`、`progress` 及 `complete/fail` 是执行/兼容契约，需要设备/租约校验；已启用服务端Runtime时客户端不能接管服务器任务。详细依据：[任务路由](server/routes/tasks.js)、[执行器](server/video-generate-executor.js)。

## Coze即时接口与SSE

`POST /api/agent` 为即时接口，不等于可靠任务历史。基础输入 `prompt`，可选 `history/historyOmitted/currentConstraints/excludedMemoryIds/projectId/conversationId`；兼容 `conversation_id`。附件实际执行走任务附件链路，即时路由不把任意客户端附件对象转给上游。

成功JSON含 `requestId/createdAt/text/conversationId/chatId/followUps`，可选 `videoUrl/imageUrls/contextTrace/warnings`。纯文本结果合法，不能要求每次返回媒体。

`POST /api/agent/stream` 接收同类输入，返回 `text/event-stream`：

| SSE事件 | 数据 |
|---|---|
| `delta` | `{content}` 文本增量 |
| `follow_up` | `{suggestions:[...]}` |
| `done` | 完成结果，含 `done:true` 和可选媒体/上下文 |
| `error` | 流已开始后的错误说明 |

流开始前仍可返回HTTP错误。客户端断开会尝试停止本地处理/远端调用，但不证明上游撤销或未计费；先核对任务和会话，不能自动重发。Coze配置与上游路径见[Coze指南](Coze智能体配置与调用.md)。

## 其他已挂载接口

| 路由组 | 主要入口 | 源码 |
|---|---|---|
| 会话/消息 | `/api/conversations`、`/api/opc/sessions`、消息batch、compress | [会话](server/routes/conversations.js)、[统一应用](server/server-express.js) |
| 模板/统计 | `/api/templates`、`/api/generations`、`/api/generations/stats` | [模板](server/routes/templates.js)、[生成记录](server/routes/generations.js) |
| 模型连接/角色 | `/api/model-providers`、`/discover-models`、`/:id/test`、`/api/model/chat`、`/api/agent-roles` | [创作路由](server/routes/creative-agent.js) |
| 协作/项目 | `/api/creative-projects`、项目team、`/api/agent-runs`、start/finalize/confirm-coze | [创作路由](server/routes/creative-agent.js) |
| 工作流恢复 | `/api/opc/sessions/:sessionId/workflow-runs/:runId`，计划写入为同路径 `/plan` | [工作流结果](server/studio-workflow-results.js) |
| 研究 | `/api/research/runs`、`/:id/events`、计划PATCH、`/:id/actions` | [研究路由](server/routes/research.js) |
| 记忆/摘要/笔记 | `/api/studio/memories`、`/summaries`、`/project-notes/:projectId` | [记忆契约](docs/knowledge/studio-memory-api.md) |
| 检索 | `POST /api/rag/retrieve`、`GET /api/rag/health`、`POST /api/search` | [检索路由](server/routes/retrieval.js) |
| 账户插件 | `/api/plugins/*`；插件UI另有token路径 | [插件路由](server/routes/plugins.js) |
| 系统插件登记 | `/api/admin/plugins`，管理账户权限 | [创作路由](server/routes/creative-agent.js) |
| 设备 | `/api/devices`、register、network-targets、pairing-codes、pair、heartbeat | [设备路由](server/routes/devices.js) |
| 通知/偏好 | `/api/notifications`、`/api/prefs`、`/api/settings`；`/api/app-settings`为应用级设置 | [统一应用](server/server-express.js)、[账户设置](server/routes/settings.js) |

表中路由组是导航索引，具体方法/字段以链接源码为准。旧 `/api/llm/providers` 兼容路由仍存在；新模型中心使用 `/api/model-providers`。

## 实时事件与错误

Web客户端使用 `/ws/desktop`，手机使用 `/ws/mobile`，传当前JWT及设备ID。提供设备ID时服务器核对当前账户设备，未配对/已撤销设备拒绝。事件含 `task.updated`、`notification.created`、`ready`；实时消息配合只读重拉取和轮询，不是可靠事件日志的替代。

通知列表 `GET /api/notifications`，单条已读 `POST /api/notifications/:id/read`、全部已读 `POST /api/notifications/read-all`、清空 `DELETE /api/notifications`。服务端SQLite为账户通知事实源，本地只是缓存。

常见错误：400输入格式；401身份；404不存在或无权；409版本/状态/幂等冲突；429并发或上游限额；502上游响应错误；503检索暂不可用。不同路由错误结构有差异，通常为 `error.message` 与可选 `error.code`。HTTP500或断线不证明写入、模型调用未生效，应先读取权威记录。

接口存在、模拟测试通过和真实外部验收分别记录；本次没有调用真实媒体、模型或账户接口。见[验证指南](docs/TESTING.md)。
