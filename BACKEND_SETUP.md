# 腾昇智和 · 后端配置与启动

本文对应 main 的当前源码（文档核对日期：2026-10-02，Web/服务端包版本 1.40.0）。阶段 4 尚未完成；本文说明已有入口，不代表生产或真实媒体验收通过。

## 实际调用链

~~~text
Web 静态页面 / Electron / Tszh Remote
  → Express app.js → server-express.js
  → JWT 鉴权后的 API、SQLite、附件、WebSocket
  → 服务端 TaskRuntime / 模型适配器 / 研究运行时 / 项目插件
  → Coze、模型厂商、可选 Python RAG
~~~

Next 配置是 `output: "export"`。浏览器直接请求 Express；仓库保留的 `app/api/agent/route.ts`、`AGENT_BACKEND_URL` 与 `AGENT_API_KEY` 属于旧 Next 路由实现，不能作为静态生产部署的 API 服务。当前调用契约见 [API调用.md](API调用.md)。

## 安装与开发

项目包声明 Node.js ≥20；本仓库部分测试使用 `node:sqlite`，统一开发/验证基线采用 Node.js **22.18+**。从仓库根目录执行：

~~~bash
npm ci
npm --prefix server ci
~~~

根目录新建 `.env.local`：

~~~dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=http://localhost:8080
~~~

服务端启动器明确读取 `server/.env.local`。仓库目前没有可复制的 `server/.env.example` 或 `deploy/.env.example`，请手动建立：

~~~dotenv
PORT=8080
JWT_SECRET=<独立随机密钥，至少32字符>
STZH_LLM_ENCRYPTION_KEY=<另一项独立随机密钥，至少32字符>
STZH_CONTEXT_MODE=shadow
# 仅在需要真实 Coze 执行时填写
# COZE_API_TOKEN=<服务端令牌>
# COZE_BOT_ID=<已发布智能体ID>
# COZE_BASE_URL=https://api.coze.cn
~~~

占位值必须替换。可在自己的终端运行下面命令两次，分别生成上述密钥；不要提交输出或环境文件：

~~~bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
~~~

两个终端分别执行：

~~~bash
npm --prefix server start
~~~

~~~bash
npm run dev
~~~

访问 `http://localhost:3000`；健康检查为 `http://localhost:8080/health`。开发后端也可用 `npm --prefix server run dev` 启用 Node watch。

## 配置表

| 配置 | 生效位置与行为 |
|---|---|
| `NEXT_PUBLIC_AGENT_BACKEND_URL` | Web 构建时公开 API 基址；开发指向8080，同源静态部署留空。修改后重建 Web，不放密钥 |
| `PORT` | `server/server.js` 默认8080；旧云启动器 `server/start.js` 默认80；Electron自行选择8080起的空闲端口 |
| `JWT_SECRET` | 至少32字符。未设置时在数据目录创建并复用 `.jwt-secret`，不是固定默认密码；配置过短启动失败 |
| `STZH_LLM_ENCRYPTION_KEY` | 至少32字符，模型密钥 AES-256-GCM 加密材料。保存/解密模型连接需要它；已有密文时不能随意替换 |
| `STZH_DATA_DIR` | SQLite、附件等数据目录；普通启动默认 `server/`，Electron使用自己的 userData |
| `STZH_OUT_DIR` | 静态文件目录；默认查找 `server/out/`，否则根目录 `out/` |
| `COZE_API_TOKEN`、`COZE_BOT_ID` | 真实 Coze 服务与 `video.generate` 执行器的配置。缺少任一项时媒体执行器禁用，任务安全保持排队 |
| `COZE_BASE_URL` | 默认 `https://api.coze.cn`；必须匹配令牌、Bot及区域 |
| `COZE_USER_ID` | 底层适配器兼容值；账户服务会进行账户身份与会话归属处理，不用它代替本地JWT |
| `STZH_CONTEXT_MODE` | `off / shadow / enforce`，默认shadow。shadow计算观测信息，单次实际应用看 `contextTrace.applied` |
| `STZH_CONTEXT_INPUT_BYTES` | 本地输入预算，4096–1048576，默认65536；不是厂商实际token窗口 |
| `STZH_RAG_URL` | 服务端访问Python RAG，默认 `http://127.0.0.1:5000` |
| `SERPAPI_API_KEY`、`GITHUB_TOKEN`、`BAIDU_API_KEY` | 可选搜索引擎凭证；实际可用性取决于对应服务 |
| `STZH_TRUSTED_MODEL_GATEWAYS`、`STZH_ALLOW_PRIVATE_MODEL_URLS` | 模型地址策略的部署配置，详见[模型连接](docs/knowledge/model-provider-connections.md) |
| `STZH_ADMIN_USER_IDS` | 系统受信插件登记所需的管理账户配置；不等于账户插件安装权限 |
| `STZH_PUBLIC_API_URL` | 项目插件对外访问地址配置；按实际HTTPS后端设置 |
| `STZH_PLUGIN_NPM_CLI` | 插件构建器的可选npm命令路径 |

模型厂商地址、协议、模型和个人密钥通常在“模型与角色中心”保存到当前账户，不能用 Coze 的环境变量替代所有模型连接。

## 静态生产入口

构建前将根目录 `.env.local` 中的公开基址改成空值，并清除终端里覆盖它的旧变量：

~~~dotenv
NEXT_PUBLIC_AGENT_BACKEND_URL=
~~~

~~~bash
npm run build
npm --prefix server start
~~~

Express在8080同时提供 `out/` 和API。根目录 `npm start` 实际是 `next start`，不适用于本配置。分域部署必须在构建前填写可访问的HTTPS API基址，并验证WebSocket与SSE代理。详见[部署指南](deploy/DEPLOY.md)。

## 验证与故障

- `/health` 返回服务状态和 `taskRuntime`；服务存活不代表Coze、模型或RAG可用。
- 注册/登录使用 `/api/auth/*`；业务 `/api` 受JWT保护。`API_SECRET_KEY` 的旧提示不能代替当前JWT鉴权。
- 原生SQLite加载失败：分别核对Node与Electron ABI、平台及依赖安装，见[桌面指南](electron/README.md)。
- 切换数据目录不会迁移原账户、历史和附件；保留对应JWT和模型加密材料。
- 缺少Coze配置不通过提交更多任务解决；恢复配置并重启后再检查执行器。
- 本次文档更新不修改服务器、部署脚本或实际凭证；可复现检查与未验证项见[验证指南](docs/TESTING.md)。
