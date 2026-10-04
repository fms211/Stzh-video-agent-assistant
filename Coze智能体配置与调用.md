# 腾昇智和 · Coze 配置与执行

本文按main当前 `server/agent-service.js`、账户适配器和任务执行器说明集成（2026-10-02）。原文的官方Bot详情字段镜像已由项目实际用法替代，避免把外部平台说明当成本项目API契约。

## 配置

在Coze平台准备已发布且可访问的Bot，核对令牌权限、工作空间、区域、相关工具及余额。在 `server/.env.local` 填写：

~~~dotenv
COZE_API_TOKEN=<Coze服务端令牌>
COZE_BOT_ID=<已发布Bot的ID>
COZE_BASE_URL=https://api.coze.cn
~~~

使用与自己的服务区域匹配的地址。不要把令牌放入 `NEXT_PUBLIC_*`、Web代码、参考文件或文档；模型中心的个人LLM密钥与这组Coze配置用途不同。

缺少token或Bot ID时 `startProductionTaskRuntime` 返回 `MISSING_CONFIG`，媒体执行器禁用，健康接口仍可访问、任务仍可排队。查看 `/health` 中 `taskRuntime`，不要以页面打开证明Coze可用。其余环境配置见[后端指南](BACKEND_SETUP.md)。

## 当前链路

~~~text
登录用户 → 上传参考附件 → 创建video.generate任务
  → 服务端Runtime领取及续租
  → 账户/本地会话/远端conversation归属校验
  → Coze文件上传与流式chat
  → 解析文本、媒体URL、追问和上下文观测
  → 保存任务结果、会话、终态通知
  → 客户端重拉取任务/历史并展示
~~~

Coze上游实际调用路径是 `POST /v1/files/upload`、`POST /v3/chat` 和取消时的 `POST /v3/chat/cancel`。本地即时接口 `/api/agent` 与 `/api/agent/stream` 见[应用API](API调用.md)；不要在前端直接使用平台令牌。

账户适配器管理本地与远端会话关联，续轮不能任意复用其他账户的conversation ID。历史转换在 [shared/coze-history.cjs](shared/coze-history.cjs)，不是把所有旧消息无条件重新发给Coze。

## Bot、工具和工作流的区别

- 服务端媒体任务通过配置的Bot执行。最终是否生成视频/图片取决于已发布Bot的流程、工具、权限和返回内容，文本回复也可能是合法结果。
- 工坊普通工作流是本项目的模型步骤编排；风格研究有独立服务端研究运行时；项目插件可以贡献工具和工作流。它们不自动等同于Coze平台Workflow ID。
- 代码与历史记录提及的StylePromptMaster、LinkReader等工具不能仅凭名称认定已获授权、可调用或通过验收；需要逐项核对真实平台配置。
- 当前创作参数、参考资料和记忆只提供本轮上下文。确认记忆、确认研究计划与批准媒体生成是不同动作。

## 取消、失败和重试

任务中心支持按实际状态暂停、继续、取消和重试。暂停/取消会通知服务端中止当前执行；上游取消采用有限超时的尝试。浏览器断线、本地Abort或HTTP报错不能证明远端执行已撤销、未扣费或没有生成产物。

先核对任务、会话及远端平台记录；相同业务提交使用稳定幂等键。幂等队列只避免本地重复任务，不构成上游全局“恰好一次”保证。旧媒体URL失效时历史仍保留，但播放/下载可能不可用。

## 上下文与验收边界

默认 `STZH_CONTEXT_MODE=shadow`。具体本轮记忆、项目笔记、来源、排除和预算以 `contextTrace` 为准；Coze远端历史token用量不可观测，删除本地记忆不等于删除已发给远端的历史。

阶段4尚未完成，真实付费媒体完整链路、全部平台工具和生产部署验收仍开放。本次文档核对没有消耗Coze额度，也未生成阶段4完整开发记录。测试替身、HTTP夹具和过去的有限文字联调不能替代真实Coze媒体验收。

源码入口：[Agent服务](server/agent-service.js)、[账户会话适配](server/account-agent-service.js)、[任务启动](server/task-runtime-bootstrap.js)、[媒体执行器](server/video-generate-executor.js)、[四模式机制](docs/knowledge/studio-mechanisms.md)。
