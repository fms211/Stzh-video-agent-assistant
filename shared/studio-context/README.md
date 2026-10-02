# 创意工坊上下文公共层

main源码核对2026-10-02。供离线检查和服务端四模式构建使用；HTTP/SQLite、来源校验、项目笔记、摘要与请求观测已接入，详见[记忆API](../../docs/knowledge/studio-memory-api.md)。阶段4尚未完成，默认shadow。

[index.cjs](index.cjs)是无数据库、网络和浏览器依赖的纯函数实现，类型在[index.d.cts](index.d.cts)。模式为coze/assistant/workflow/collaboration，旧chat由会话适配映射到assistant。

## 权限与参考边界

服务端先鉴权并读取最新记录、revision、scope、source及附件权限，再调用selectMemories/buildStudioContext。authorize必须同步明确返回true；省略、异步或不明确结果不能替代数据库权限核对。

同ID先决定最新合法版本再核验账户/来源、确认/启用/有效期、当前约束与相关性。无法确定版本顺序、同版本冲突或坏新副本时整组拒绝，旧副本不能复活。范围/核验字段白名单不能夹带伪造approved状态。

纯函数不能证明调用方传入记录真实；浏览器预览不能替代服务端重新构建。用户确认只允许使用，不代表事实已验证。参考packet保留原文、来源、版本和未知项，不升级为系统指令或工具权限；数据分区也不保证模型免疫提示注入。

## 预算与适配器

必需规则、本轮任务、当前约束和状态完整保留；超预算返回不可发送结果，可选记忆整条取舍，不删除数据库原文。

纯构建器测量本地JSON UTF-8字节及余量；服务端provider层还估算完整出站协议并预留输出。不是精确token计数，Coze远端历史用量未知。服务端按需附机制参考、完整轮次摘录和项目笔记，不在此模块执行额外模型摘要。

默认shadow只观测；单次应用以contextTrace.applied为准。off回退，enforce应用需独立验收。

## 当前检索

[retrieval.cjs](retrieval.cjs)选择版本为 `creative-lexical-v7`，FTS词法版本为 `creative-lexical-v4`。两者分别标记筛选规则与入库词项；索引变化由账户级惰性重建处理。

中英文先归一化，中文字片段与受控创作概念用于召回；英文别名检查边界。规则区分部分景深、反差、否定、改稿及产物用途，通用词不单独证明相关。它没有embedding或任意同义理解，不将固定合成样本成绩当独立线上Precision@5。

服务端召回前8000字符，完整支持输入的限制检查另行进行；约束覆盖不等于全文召回。词法匹配只提供线索，不能改写事实核验或批准。

## 仓库可复现检查

从项目根目录：

~~~bash
node --test test/studio-context.test.js test/studio-retrieval.test.js test/studio-retrieval-corpus.test.js
~~~

输入/标签在 `test/fixtures/`。其他server范围、来源与索引检查见[验证指南](../../docs/TESTING.md)。旧本机 `stage4-memory-eval.cjs` 未跟踪，新克隆不提供该脚本。

本次仅更新Markdown与静态一致性；真实质量、灰度、新桌面包和生产媒体仍需分别验收。
