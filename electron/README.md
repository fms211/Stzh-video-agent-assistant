# 腾昇智和 · Electron桌面源码

main使用Electron35系列与electron-builder，入口[main.js](main.js)，Web/服务端包版本1.40.0。文档核对2026-10-02；新安装包与目标机完整验收仍开放，阶段4未完成。

## 结构与前提

Electron启动与Web相同的Express应用、TaskRuntime和WebSocket，服务端托管 `out/`，窗口打开本机HTTP地址；不是连接Next开发服务。端口从8080起寻找可用值，数据库/附件数据使用 `app.getPath("userData")`。

窗口关闭会隐藏到托盘，后台服务继续运行；托盘“退出”停止进程/服务。因此关闭窗口不等于取消远端媒体调用。

根目录及server分别安装依赖，Web构建时公开API基址留空，以适应桌面实际端口：

~~~bash
npm ci
npm --prefix server ci
npm run build
~~~

## SQLite双ABI

普通Node依赖安装产生Node ABI绑定；Electron不能直接使用它。[server/db.js](../server/db.js)明确要求：

~~~text
server/native/electron-v<process.versions.modules>/better_sqlite3.node
~~~

该路径文件未随main受跟踪源码分发。需要用与目标Electron版本、架构、平台对应的原生编译环境准备独立绑定，并保留server/node_modules中的Node版本绑定。仓库没有自动完成该步骤的npm脚本，不能把 `electron:build` 当作自动双ABI准备。

打包前核对 [package.json](../package.json) 的files/asarUnpack（包含server、shared和out）及图标。files使用server通配规则，须核对实际候选包是否含本机环境/数据库等个人文件，不能推定Git忽略就等于打包排除。只分发自己的无敏感数据构建目录。

## 已有命令

从根目录，在静态产物和对应Electron绑定准备完成后：

~~~bash
npm run electron:dev
~~~

Windows构建：

~~~bash
npm run electron:build
npm run electron:build:portable
~~~

build脚本会重新构建Web并执行Windows electron-builder，输出到 `dist/`。图标生成脚本为 `npm run icons:generate`，只在需要更新图标时使用；不是启动依赖安装脚本。

## 配置与限制

源码开发会读取 `server/.env.local`，实际桌面数据目录独立于普通Node服务；相同账号名不代表共享数据库。媒体执行仍需要Coze配置，个人模型密文需要固定加密材料。环境说明见[后端配置](../BACKEND_SETUP.md)。

桌面服务、安装包、托盘、ABI和手机联动必须在目标环境分别验证。源码测试不能替代安装、重启、数据保留或真实付费媒体检查。本次没有启动Electron、构建新安装包或读取个人数据。
