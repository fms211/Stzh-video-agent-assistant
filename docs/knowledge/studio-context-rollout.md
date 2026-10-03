# 四模式上下文门禁与状态契约

2026-10-03源码新增，实际环境未修改，真实模型效果与逐模式启用／回退未验收。

## 配置顺序

| 环境变量 | 作用 |
|---|---|
| STZH_CONTEXT_MODE | 兼容既有全局模式，缺省为shadow；显式off统一关闭全部模式 |
| STZH_CONTEXT_MODE_ASSISTANT | 单助手 |
| STZH_CONTEXT_MODE_WORKFLOW | 普通工作流和研究计划共用 |
| STZH_CONTEXT_MODE_COLLABORATION | 协作编排 |
| STZH_CONTEXT_MODE_COZE | Coze新请求 |

可选值off／shadow／enforce，区分大小写。模式覆盖值去除首尾空白；缺失或空白继承全局。无效全局值维持旧版shadow回退并标明配置异常；显式无效模式覆盖值关闭该模式，不继承全局enforce。有效模式覆盖值可独立于无效全局配置生效；总开关off始终优先。未知模式仍由既有范围授权拒绝，不能借关闭状态跳过权限核对。

shadow只构建拟引用方案，外发消息保持原样；enforce才采用经过授权和预算处理的方案。开启不保证命中记忆，不表示模型效果已通过，也不追溯修改旧回复。总开关off不删除记忆或历史、不撤回已发送给Coze的远端内容、不取消正在执行的请求，也不改变此前缓存的工作流结果。

## 只读状态

鉴权GET /api/studio/memories/context-status保留顶层rollout；新增source、configurationValid和byMode（coze、assistant、workflow、collaboration）。每个模式含rollout、source和configurationValid。只读且Cache-Control:no-store；query/body不能改变服务器环境，不新增网页启用按钮。只返回固定枚举，不泄露环境原值、密钥或其他用户记忆。

source为default／global／global_off／mode_override／invalid_override／invalid_global／invalid_mode。客户端遇旧接口只有rollout时标明“旧版全局状态”；新接口缺失或损坏的模式状态显示未确认，不从顶层enforce猜测已启用。

每次prepare返回trace.mode、rollout、rolloutSource、rolloutConfigurationValid和applied；off和shadow超预算路径也保留配置来源。请求快照与当前设置分开看，历史trace没有新字段仍可展示。是否实际用于本次请求仍只由rollout和applied共同判定，不能依据配置或候选数量宣称已经应用。

## 部署与验收边界

此批只修改示例环境文件，没有读写server/.env.local、运行配置、凭据或数据库。示例不是当前生效环境；由部署维护者明确配置并重启服务才影响后续请求。先Web验收，再冻结文字样本、逐模式效果对照及回退；未通过模式保持shadow，不自动将全部模式开启。

准备了纯配置、实际消息构建、只读鉴权接口及客户端兼容用例。此记录编写时尚未运行，后续实际结果独立记录；不把旧快照覆盖新代码。不得调用视频或付费媒体验证。
