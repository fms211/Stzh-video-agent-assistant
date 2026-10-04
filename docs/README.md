# 腾昇智和 · 文档导航

当前技术说明按main源码核对，日期2026-10-02；Web与服务端package版本1.40.0，手机package仍为1.0.0。**阶段4尚未完成**，版本号、发布截图和局部验收不能替代整阶段完成记录。

## 开始使用

| 文档 | 内容 |
|---|---|
| [English README](../README.md) / [中文README](../README.zh-CN.md) | 功能、技术栈、快速启动与限制 |
| [使用指南](../USAGE.md) | 五个工作区、四模式、历史、通知及常见问题 |
| [后端配置](../BACKEND_SETUP.md) | 当前入口、环境变量、开发/静态生产 |
| [源码更新步骤](../步骤.md) | Git/源码包同步、数据保护与重建 |
| [静态部署](../deploy/DEPLOY.md) / [Docker示例](../deploy/DOCKER-DEPLOY.md) | 完整部署结构、旧脚本缺口及可选容器模板 |
| [验证指南](TESTING.md) | 可用检查、环境要求和证据边界 |

## 实现与扩展

| 文档 | 内容 |
|---|---|
| [产品说明](../PRODUCT.md) / [Web设计实现](../DESIGN.md) | 当前能力和账户/页面结构 |
| [创作助手与工作流](../AI助手设计文档.md) | 模型调用、普通工作流、研究与协作 |
| [应用API](../API调用.md) / [Coze集成](../Coze智能体配置与调用.md) | Express契约、任务与上游执行 |
| [数据库说明](../腾昇智和%20·%20数据库技术说明.md) | 表组、事实源、迁移、备份及限制 |
| [模型连接](knowledge/model-provider-connections.md) | 列表、保存、验证及地址策略 |
| [四模式机制](knowledge/studio-mechanisms.md) / [记忆API](knowledge/studio-memory-api.md) | 模式边界、来源/版本、摘要与请求观测 |
| [公共上下文层](../shared/studio-context/README.md) | 纯函数契约、检索与离线测试 |
| [RAG学习与运行](../rag-service/RAG学习笔记.md) | BGE/Chroma、路径、入库及共享资料边界 |
| [Electron](../electron/README.md) / [Tszh Remote](../Tszh-App/README.md) | 桌面原生依赖、手机源码与设备联动 |
| [手机设计](../Tszh-App/DESIGN.md) / [手机需求](../Tszh-App/DESIGN_REQUIREMENTS.md) | 当前组件及尚需设备验收的要求 |
| [前端维护参考](../前端UI技能全栈总结.md) | 仓库技术与可选工具，不承诺读者已安装技能 |

## 保留的历史与研究材料

- 根目录“全流程开发记录（1）/（2）”保留历史原文。原用户工作区的阶段3文件也不改动；本次不补录、不纳入未跟踪阶段文件，不生成阶段4记录。
- [更新记录索引](../更新md/README.md)和[未来记录模板](../更新md/模板.md)用于查历史批次；既有日期记录和通过数保留当时含义。
- `docs/releases/` 是发布与截图证据快照，`docs/research/` 是研究报告，`docs/superpowers/plans/` 是阶段计划；均不改写成当前完成状态。
- [上下文审查方案](knowledge/studio-context-review-proposal.md)、[新样本质量方案](knowledge/studio-task-quality-review-proposal.md)、[有限留出协议](knowledge/studio-retrieval-holdout-protocol.md)及[2026-09-30效果对照](knowledge/studio-context-effects-2026-09-30.md)是对应日期的研究/验收材料，保留原范围；不是执行新审查的授权或本次测试报告。
- `AGENTS.md`、`CLAUDE.md`、`.claude/` 的代理/技能/工具指令保留；`docs/third-party-notices/` 和许可证保留归属。

历史文件可能引用未提交的本机脚本或被Git忽略的 `output/`，新克隆未必具有这些材料。复现当前技术流程以本导航下的活跃指南和受跟踪源码为准；历史链接不构成资源随库分发的保证。
