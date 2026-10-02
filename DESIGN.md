# 腾昇智和 · Web架构与设计实现

对应main当前代码，文档核对2026-10-02；Web包版本1.40.0。本文是维护说明，不是阶段4完成报告或新的视觉改造任务。

## 页面与运行架构

~~~text
HomeClient / ProductShell
  ├─ splash / gateway / workspace（访客或账户）
  ├─ 创意工坊：Coze / 单助手 / 工作流 / 协作
  ├─ 模型与角色中心
  ├─ 任务中心 / 工作统计 / 创作画廊
  └─ 通知、主题/壁纸/玻璃、记忆/摘要/笔记及身份弹层
      → 账户API客户端 → Express app.js
      → SQLite + 服务端运行时 + WS + 可选外部服务
~~~

根页管理入口状态和sessionStorage恢复；登录/注册复用身份交接结构。外壳承载背景和导航，业务页面在同一工作区切换，账户操作统一门控。前端静态导出，运行API来自Express，不依赖Next路由在线执行。

## 当前样式来源

| 位置 | 职责 |
|---|---|
| [app/layout.tsx](app/layout.tsx) | 自托管Geist Sans、Geist Mono、FusionPixel及全局样式入口 |
| [app/globals.css](app/globals.css) | 页面/主题基础与现有组件样式 |
| [app/typography.css](app/typography.css) | 统一文字层级 |
| [app/rounding.css](app/rounding.css) | 圆角规则 |
| [app/studio-context-ui.css](app/studio-context-ui.css) | 上下文/记忆详情样式 |
| [app/squish-switch.css](app/squish-switch.css) | 开关交互样式 |
| [app/coze-dialogue.css](app/coze-dialogue.css) | Coze对话材质、排版与状态反馈 |
| [theme-registry.ts](app/lib/theme-registry.ts) | 主题Token与能量状态 |
| [galaxy-settings.ts](app/lib/galaxy-settings.ts) | 银河参数及偏好契约 |

深空、暖恒星和冷色构成现有视觉语言。主题、壁纸、玻璃、银河和边缘光可以按偏好调整；固定色值和组件例外仍存在，不声称所有颜色已Token化。

Motion用于布局与交互，GSAP用于部分场景动画，CSS及requestAnimationFrame用于局部循环/反馈，OGL/Three相关依赖承载视觉实现。银河与轨道效果保留运行时开关；减少动画/透明度会降级部分效果，具体覆盖依组件而定。

## 创作与数据结构

- Coze输入上传附件后创建可靠任务，服务端执行。页面显示任务/会话的实际状态，结果可带文本、媒体和上下文；排队不等于已交付。
- 单助手走账户模型API，回复是JSON，当前接口不是SSE；先本地保存，再同步会话。
- 普通工作流由浏览器编排，保存冻结计划、模型配置指纹及步骤结果，恢复需显式操作；风格研究另走服务端研究运行时和计划审批。
- 协作保存角色编队和运行，最终指令经人工确认后创建关联Coze任务，两个完成状态分开。
- 记忆/项目笔记/摘要是带来源的参考，默认shadow。上下文详情属于对应回复或事件，不用最后一次trace覆盖历史。
- 服务端SQLite维护账户、会话、运行、任务、通知及模型密文；localStorage/sessionStorage保留按账户/模式划分的缓存和草稿。

## 实时与交互恢复

账户设备登记后建立WebSocket，事件触发任务/通知重拉取，断线或重连配合轮询。服务端是任务事实源；客户端不能用旧缓存覆盖最新任务状态。切换账户/卸载时的请求生命周期需防止迟到更新，详见[模型连接](docs/knowledge/model-provider-connections.md)。

身份交接支持访客数据复制导入，失败保留本机副本。历史删除、模态框关闭等已有焦点恢复路径；不能以源码中的属性断言所有浏览器/设备可访问性已通过。

## 维护与已知边界

界面依据当前组件、样式和运行结果维护，不按发布截图反向推断数据/媒体能力。阶段4尚未完成；真实媒体、独立质量、手机完整体验、新Electron安装包和生产环境仍需各自验收。

[产品说明](PRODUCT.md)、[创作助手](AI助手设计文档.md)、[数据库](腾昇智和%20·%20数据库技术说明.md)、[验证指南](docs/TESTING.md)提供相应契约。[手机设计](Tszh-App/DESIGN.md)是独立React Native说明。历史批次记录保留原文，不因本文更新而重写阶段记录。
