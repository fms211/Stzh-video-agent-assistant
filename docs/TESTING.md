# 腾昇智和 · 检查与验收指南

本文区分可运行的仓库检查和真实产品验收（main，2026-10-02）。阶段4尚未完成；历史开发/发布文件中的通过数只属于对应批次，不能当作本次执行结果。

## 环境与命令

Node.js22.18+、npm以及目标平台可加载的SQLite依赖。先从根目录执行 `npm ci`、`npm --prefix server ci`。

| 命令（根目录） | 作用与边界 |
|---|---|
| `npm run lint` | 当前ESLint配置；并不验证HTTP、数据库、外部模型或设备 |
| `npm run build` | Next静态导出/构建检查；API运行与媒体结果另测 |
| `npm run test:p0` | `node --test test/*.test.js` 后接服务端测试；前一段失败时后端段不会自动执行 |
| `npm --prefix server test` | 单独后端Node测试 |
| `node --test test/studio-context.test.js test/studio-retrieval.test.js test/studio-retrieval-corpus.test.js` | 公共上下文/检索的定向离线回归 |

测试文件可能使用临时SQLite、真实本地HTTP、受控模型/插件替身或编译后的组件。分别记录所用环境，不能把fake adapter的通过视为真实厂商/媒体验收。Electron原生绑定检查还依赖匹配ABI文件，见[桌面指南](../electron/README.md)。

## 已跟踪的只读冒烟

[stage4-readonly-smoke.cjs](../scripts/stage4-readonly-smoke.cjs)针对**已经启动且配置好**的隔离环境，不会创建全部预览资源。自行设置：

~~~dotenv
STZH_SMOKE_BASE=<隔离预览地址>
STZH_SMOKE_USER=<测试账号>
STZH_SMOKE_PASSWORD=<测试账号密码>
~~~

~~~bash
node scripts/stage4-readonly-smoke.cjs
~~~

脚本按现有账号登录并读取页面/API；先阅读脚本的检查范围，确认目标为自己的隔离预览，不能将“只读”理解为无需账户、环境或完全没有请求。本机旧文档提到的 `stage4-memory-eval.cjs`、`stage4-local-preview.cjs` 等未跟踪脚本并不在新克隆中提供。

## 文档变更校验

文档维护应至少核对：

1. 改动仅限约定Markdown；阶段记录、发布日期快照、第三方许可和工具指令的内容保持原样。
2. 相对链接与图片目标存在，当前命令引用真实package scripts/受跟踪文件，不依赖本机未跟踪脚本。
3. 环境变量名称、读取位置、默认端口、静态导出和运行入口与源码一致。
4. 中英文README的功能、快速启动、状态和未验证项一致。
5. 不把密钥、用户数据、真实服务地址或历史测试通过数写成当前执行证据。
6. `git diff --check`，提交后核对远端SHA及文档变更范围。

文档的路径/脚本静态检查不能证明候选Docker模板、生产部署或可选组件安装可运行。

## 阶段4仍开放的验收

- 真实Coze Bot、平台工具权限/配额、付费视频/图片与完整媒体任务链。
- 不同模型厂商、网络环境和真实语料下的质量、成本及延迟；列表可读不等于推理已通过。
- 独立的任务质量/检索盲评、生产灰度；默认shadow不能当作已启用enforce。
- RAG路径可移植化、模型/语料准备及真实部署；共享资料不等于账户私有记忆。
- 新Electron安装包、Node/Electron双ABI、目标机部署与跨设备恢复。
- 手机阶段5完整体验、真机权限、触屏/IME/文字放大等专项检查。

这些项目只在实际执行后记录结果；本次统一文档更新不自动启动真实付费模型、媒体调用或阶段4开发记录生成。
