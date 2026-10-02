# 腾昇智和 · 前端维护与可选技能参考

本文按main当前工程核对（2026-10-02），替代早期“开发机已安装技能”清单和未经本项目验证的效果/成本数字。开发辅助技能不是应用启动依赖，也不能推定其他读者已经安装。

## 实际前端栈

| 层次 | 当前依赖/入口 |
|---|---|
| 页面 | Next16.2.4静态导出、React19.2.4、TypeScript |
| 样式 | Tailwind CSS4、全局CSS及主题/文字/圆角/上下文规则 |
| 交互 | React Aria Components、Lucide、账户与草稿客户端 |
| 动效/场景 | Motion、GSAP、OGL、Three.js、React Three Fiber/Drei |
| 内容 | react-markdown、remark-gfm、rehype-highlight/sanitize |
| 检查 | ESLint9、Node test runner、Playwright依赖及构建 |

完整版本以[package.json](package.json)和锁文件为准。已安装依赖不证明每个页面使用所有库。Web和React Native组件结构不同，手机设计见[Tszh-App/DESIGN.md](Tszh-App/DESIGN.md)。

## 维护流程

1. 先看[当前设计实现](DESIGN.md)、页面组件和样式，确认是行为、排版、状态还是性能问题。
2. 保留账户隔离、真实运行状态、草稿/历史恢复和来源说明；视觉不能把未批准或未知结果改为完成。
3. 复用主题Token和已有组件；新效果同时考虑减少动画/透明度、键盘、焦点、缩放和窄屏。
4. 根据改动做对应组件/浏览器检查，再核对构建；测试替身和DOM布局分别报告，见[验证指南](docs/TESTING.md)。

## 可选技能与设计资源

仓库 `AGENTS.md/CLAUDE.md/.claude/` 以及个人工具中的技能只作用于对应开发环境。UI审查、设计灵感、图像或浏览器工具可辅助特定任务，但安装情况、版本、权限和适用范围需在当次环境查询。

不把过往全局技能安装命令、工具磁盘位置、固定提升百分比或商用服务价格当作当前工程事实；本次不会安装/升级技能或重写工具自带指令。

## 部署和归属

当前Web导出仍需要Express账户/API、任务及实时服务，单独托管静态文件不会提供完整应用。部署看[DEPLOY.md](deploy/DEPLOY.md)，不要按通用前端托管清单推定后端可用。

引用第三方效果、字体或素材时保留相应许可证和来源。现有归属见 `docs/third-party-notices/` 与 `public/licenses/`；根仓库缺统一源码许可证，不能以依赖开源推定整仓库可自由再分发。阶段4尚未完成，发布图片只证明相应历史界面展示。
