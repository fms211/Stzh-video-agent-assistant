# 腾昇智和 · Docker部署示例

main当前没有受跟踪的Dockerfile、Compose配置或Docker发布workflow。本文提供需自行落地/验证的模板，**不是仓库已经完成的部署功能**；阶段4尚未完成，本次没有构建镜像或发布容器。

基础运行方式先看[静态Web与Express部署](DEPLOY.md)。容器只承载Express与 `out/`，Python RAG另行部署。

## 构建上下文

从完整干净main源码准备以下本地文件；这些模板本次仅写在文档中。环境文件、数据库、附件、缓存和开发机依赖不得进入镜像构建上下文。

根目录 `.dockerignore` 示例：

~~~dockerignore
.git
.env*
**/.env*
node_modules
**/node_modules
.next
out
dist
output
data
**/*.db
**/*.db-*
**/.jwt-secret
server/attachments
server/native
rag-service/chroma_db
deploy/*.zip
claude-flow.config.json
.mcp.json
~~~

最后两项属于本地工具配置，不是应用依赖。还有其他本地密钥文件时须显式排除，不能只依靠Git忽略规则。

## Dockerfile模板

~~~dockerfile
FROM node:22-bookworm-slim AS web
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_PUBLIC_AGENT_BACKEND_URL=""
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /src/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STZH_DATA_DIR=/data
COPY server ./server
COPY shared ./shared
COPY --from=server-deps /src/server/node_modules ./server/node_modules
COPY --from=web /src/out ./out
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8080
CMD ["node", "server/server.js"]
~~~

构建依赖与运行环境使用相同Linux/Node系列，SQLite须在镜像目标平台安装。选定实际Node22镜像须满足项目验证基线22.18+；上线前锁定测试过的补丁版本或镜像digest。模板未包含插件运行所需的额外系统工具或RAG模型。

## Compose模板

~~~yaml
services:
  stzh:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    env_file:
      - .env.runtime
    volumes:
      - stzh-data:/data
volumes:
  stzh-data:
~~~

在自己的未跟踪 `.env.runtime` 中填占位项对应的真实配置：

~~~dotenv
JWT_SECRET=<至少32字符随机材料>
STZH_LLM_ENCRYPTION_KEY=<另一项至少32字符随机材料>
STZH_CONTEXT_MODE=shadow
# COZE_API_TOKEN=<仅真实Coze执行需要>
# COZE_BOT_ID=<已发布BotID>
# COZE_BASE_URL=https://api.coze.cn
~~~

必须替换占位值，并在Docker构建忽略文件中排除运行环境文件。不要把密钥放到 `ARG`、公开Web变量或镜像层。持久卷应允许容器node用户写入；使用bind mount时自行核对UID及目录权限。

完成本地文件和配置后，候选命令为：

~~~bash
docker compose build
docker compose up -d
docker compose logs stzh
~~~

这些命令依赖上述自行创建的模板，不是可在未经配置的新克隆直接执行的仓库脚本。宿主机HTTPS代理转发到8080，并支持 `/ws/*` Upgrade和SSE；手机访问外部HTTPS地址。

## 独立服务与未验证项

- 容器内 `127.0.0.1:5000` 指向容器自身。外置RAG时设置能从应用容器访问的 `STZH_RAG_URL`；Python路径、语料和模型先独立准备，见[RAG说明](../rag-service/RAG学习笔记.md)。
- 不复制Windows `better_sqlite3.node` 到Linux镜像，不把Electron绑定当Node服务绑定。
- 构建成功只证明镜像构建，不证明Coze、厂商模型、插件或手机验收。逐项检查健康、登录、数据持久化、WS重连及外部依赖。
- 当前没有已核验的GitHub Actions镜像发布流程；注册表、Secrets、镜像权限和自动部署须另行配置，不能照抄旧文档声称已自动发布。
- 升级/回退保留持久卷及加密材料；删除容器不是数据回退方案。备份、迁移和回退要求同[部署指南](DEPLOY.md)。
