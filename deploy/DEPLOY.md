# 腾昇智和 · 静态Web与Express部署

本文按main版本1.40.0源码核对（2026-10-02）。推荐使用完整干净检出或受跟踪源码包，确保server/shared/out版本一致。阶段4仍未完成，本次只更新说明，未做实际服务器部署。

## 部署结构与前提

~~~text
HTTPS入口/反向代理
  → Node server/server.js（API、SSE、WebSocket、out静态页面）
  → 可写数据目录（SQLite、附件、插件数据、JWT材料）
  → 可选独立Python RAG / 外部Coze和模型服务
~~~

准备Node.js22.18+与npm、目标平台SQLite原生依赖运行/编译环境、持久数据目录和HTTPS入口。前端构建需要根目录开发依赖；服务端运行依赖在 `server/package.json`。源代码和前端导出不包含用户账户、知识库或外部密钥。

## 构建

从干净main检出安装两组依赖：

~~~bash
npm ci
npm --prefix server ci
~~~

根目录 `.env.local` 设置：

~~~dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=
~~~

确保终端不存在覆盖它的同名旧变量，然后：

~~~bash
npm run build
~~~

产物为根目录 `out/`。当前 `output: "export"`，不能用根目录 `npm start`（next start）托管生产API或页面。分域托管时在构建前填实际HTTPS后端；浏览器始终需要独立Express。

## 上传与目标机安装

完整源码可通过Git检出或 `git archive` 导出，再将对应 `out/` 一并传输。保留 `server/` 全部受跟踪源码及锁文件、`shared/`、`out/`。不要上传开发机 `node_modules` 或将其当成目标平台原生依赖。

在目标机项目根目录：

~~~bash
npm --prefix server ci --omit=dev
~~~

手动创建 `server/.env.local`：

~~~dotenv
PORT=8080
JWT_SECRET=<至少32字符的独立随机材料>
STZH_LLM_ENCRYPTION_KEY=<至少32字符的另一项随机材料>
STZH_CONTEXT_MODE=shadow
# 采用绝对路径，替换为目标机实际可写目录
# STZH_DATA_DIR=<绝对数据目录>
# 真实媒体执行需要Coze配置
# COZE_API_TOKEN=<服务端令牌>
# COZE_BOT_ID=<已发布BotID>
# COZE_BASE_URL=https://api.coze.cn
# 独立RAG服务可选
# STZH_RAG_URL=http://127.0.0.1:5000
~~~

环境文件没有随库提供的example可复制，密钥生成及其他变量见[后端配置](../BACKEND_SETUP.md)。仅启动Web/账户功能不要求Coze令牌；未配置媒体执行器时任务会排队。

## 启动与进程管理

~~~bash
npm --prefix server start
~~~

访问8080页面及 `/health`。需要已有PM2管理时，在根目录采用明确入口：

~~~bash
pm2 start server/server.js --name stzh --cwd .
pm2 logs stzh
pm2 save
~~~

PM2安装和系统开机启动需按目标机已有运维方式配置；`pm2 save` 只保存进程列表，不证明已完成Windows开机启动。

反向代理需保持 `/api/*` 与 `/ws/*` 可达、支持WebSocket Upgrade及SSE流式响应，合理设置长任务超时。使用HTTPS页面时API/WS也应使用HTTPS/WSS。公网仅暴露业务入口，RAG作为内部服务；当前Python服务没有本项目JWT鉴权。

## 仓库旧脚本的已知缺口

| 文件 | 当前实际问题 |
|---|---|
| [package.bat](package.bat) | 引用不存在的 `server/.env.example`；白名单漏掉 `app.js`、安全/鉴权、任务/插件/研究等依赖和shared/服务端锁文件；不能作为当前完整部署包 |
| [setup-server.bat](setup-server.bat) | 引用不存在的 `deploy/.env.example`；采用旧安装/PM2入口及写死的访问提示；结尾的自启提示不构成目标机验证 |
| [ecosystem.config.js](ecosystem.config.js) | cwd为deploy，script为 `./start.js`，但实际启动器在server；不能原样作为当前部署配置 |
| `server/start.js` | 旧云启动器默认80，仍加载统一app/Runtime；日志中的API_SECRET_KEY提示不是当前JWT权限状态 |
| `deploy/stzh-full.zip` | 已跟踪归档不能推定与最新main一致，按当前干净源码重建交付包 |

本任务不修改这些脚本；上面的手动流程使用当前真实入口，运行旧脚本前需要独立修复与验证。

## 检查、升级与回退

1. 记录提交、Node版本、实际端口/数据目录；确认 `out/index.html` 存在。
2. 验证 `/health`、登录、静态资源、任务只读查询、通知与WS重连；缺少Coze配置时执行器禁用属于预期。
3. 真实模型、Coze媒体、RAG语料、插件外部链路和手机配对分别验收，不从服务存活推导全部可用。
4. 升级前做数据库与附件的一致性备份，同时保留加密材料；不以复制一个活跃WAL主文件充当完整备份。
5. 用新的源码/产物目录切换版本，保持独立数据目录。遇错误恢复匹配的旧代码/产物；若涉及源码已有迁移，先核对兼容性，不删表或删除用户数据。

Docker可选方案见[DOCKER-DEPLOY.md](DOCKER-DEPLOY.md)；本轮验证范围见[TESTING.md](../docs/TESTING.md)。
