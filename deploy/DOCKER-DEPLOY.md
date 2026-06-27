# 腾昇智和 · Docker + GitHub 部署指南

> 适用于：已有阿里云 ECS 服务器（Windows/Linux），希望通过 Docker 容器化部署。

---

## 目录

1. [架构概览](#1-架构概览)
2. [前置准备](#2-前置准备)
3. [编写 Dockerfile](#3-编写-dockerfile)
4. [GitHub Actions 自动构建](#4-github-actions-自动构建)
5. [服务器部署](#5-服务器部署)
6. [域名与 HTTPS](#6-域名与-https)
7. [运维命令速查](#7-运维命令速查)
8. [常见问题](#8-常见问题)

---

## 1. 架构概览

```
┌──────────────┐     git push      ┌──────────────┐    docker pull     ┌──────────────┐
│   本地开发     │ ──────────────→ │   GitHub      │ ──────────────→ │  阿里云 ECS    │
│              │                   │  ├── 源码      │                   │  公网 IP       │
│              │                   │  ├── Actions  │                   │  Docker 运行   │
│              │                   │  └── 镜像仓库  │                   │  Nginx 反代    │
└──────────────┘                   └──────────────┘                   └──────────────┘
```

### 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | Next.js 16（静态导出 → `out/`） |
| 后端 | Express 4（`server/server-express.js`） |
| 数据库 | SQLite（better-sqlite3，WAL 模式） |
| 容器 | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| 反向代理 | Nginx（容器内或宿主机） |

---

## 2. 前置准备

### 2.1 本地环境

本地**不需要**安装 Docker Desktop。镜像构建由 GitHub Actions 自动完成。

如需本地测试镜像，可选装：
```bash
# 可选：安装 Docker Desktop（Windows）
# 下载：https://www.docker.com/products/docker-desktop/
docker --version
```

### 2.2 GitHub 仓库

确保项目已推送到 GitHub：
```bash
git remote -v
# 应显示：origin https://github.com/你的用户名/stzh-agent.git
```

### 2.3 阿里云 ECS

| 配置项 | 最低要求 | 推荐 |
|--------|---------|------|
| CPU | 2 核 | 4 核 |
| 内存 | 2 GB | 4 GB |
| 系统盘 | 40 GB | 60 GB |
| 操作系统 | Ubuntu 22.04 / CentOS 8 | Ubuntu 22.04 |
| 公网带宽 | 3 Mbps | 5 Mbps |
| 安全组 | 开放 80、443、22 端口 | — |

---

## 3. 编写 Dockerfile

### 3.1 项目根目录创建 `Dockerfile`

```dockerfile
# ============ 阶段 1：构建前端 ============
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件（利用 Docker 缓存层）
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci

# 复制源码
COPY . .

# 构建 Next.js 静态导出
RUN npm run build

# ============ 阶段 2：生产镜像 ============
FROM node:20-alpine AS production

WORKDIR /app

# 安装生产依赖（不含 devDependencies）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从构建阶段复制产物
COPY --from=builder /app/out ./out
COPY --from=builder /app/server ./server

# SQLite 数据目录
RUN mkdir -p /app/data

# 环境变量
ENV NODE_ENV=production
ENV PORT=80
ENV STZH_DATA_DIR=/app/data
ENV STZH_OUT_DIR=/app/out

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# 启动
CMD ["node", "server/start.js"]
```

### 3.2 创建 `.dockerignore`

```dockerignore
node_modules
.git
.env
.env.local
*.md
deploy/
Tszh-App/
.claude/
.electron/
dist/
out/
coverage/
*.log
```

### 3.3 创建 `docker-compose.yml`

```yaml
version: "3.8"

services:
  stzh-agent:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: stzh-agent
    restart: always
    ports:
      - "80:80"
    volumes:
      # SQLite 数据持久化
      - stzh-data:/app/data
      # 环境变量文件
      - ./.env.production:/app/.env.local:ro
    environment:
      - NODE_ENV=production
      - PORT=80
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:80/"]
      interval: 30s
      timeout: 3s
      retries: 3

volumes:
  stzh-data:
    driver: local
```

### 3.4 创建 `.env.production`

```env
# Coze API 配置
COZE_API_KEY=你的API密钥
COZE_BOT_ID=你的BotID
COZE_BASE_URL=https://api.coze.cn

# Express 配置
JWT_SECRET=你的JWT密钥
API_SECRET_KEY=你的API密钥
PORT=80
```

---

## 4. GitHub Actions 自动构建

### 4.1 创建 workflow 文件

创建 `.github/workflows/docker-build.yml`：

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      # 1. 检出代码
      - name: Checkout
        uses: actions/checkout@v4

      # 2. 登录 GitHub Container Registry
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # 3. 设置 Docker Buildx
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # 4. 构建并推送镜像
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 4.2 启用 GitHub Actions

```bash
# 推送 workflow 文件
git add .github/workflows/docker-build.yml
git commit -m "ci: add Docker build workflow"
git push origin main
```

在 GitHub 仓库 → Settings → Actions → General 中：
- 选择 "Allow all actions"
- Workflow permissions 选择 "Read and write permissions"

### 4.3 设置镜像可见性

GitHub → Packages → 你的镜像 → Package settings：
- 将 Visibility 改为 **Public**（如果仓库是公开的）

---

## 5. 服务器部署

### 5.1 安装 Docker（Linux ECS）

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker

# 验证
docker --version
docker compose version
```

### 5.2 拉取并运行

```bash
# 登录 GitHub Container Registry
docker login ghcr.io -u 你的GitHub用户名 -p 你的GitHub Token

# 拉取镜像
docker pull ghcr.io/你的用户名/stzh-agent:latest

# 创建数据目录
mkdir -p /opt/stzh/data

# 创建环境变量文件
cat > /opt/stzh/.env.production << 'EOF'
COZE_API_KEY=你的API密钥
COZE_BOT_ID=你的BotID
COZE_BASE_URL=https://api.coze.cn
JWT_SECRET=你的JWT密钥
API_SECRET_KEY=你的API密钥
PORT=80
EOF

# 运行容器
docker run -d \
  --name stzh-agent \
  --restart=always \
  -p 80:80 \
  -v /opt/stzh/data:/app/data \
  -v /opt/stzh/.env.production:/app/.env.local:ro \
  ghcr.io/你的用户名/stzh-agent:latest
```

### 5.3 验证部署

```bash
# 检查容器状态
docker ps

# 查看日志
docker logs -f stzh-agent

# 测试访问
curl http://localhost:80/
```

浏览器访问：`http://121.199.20.161`

---

## 6. 域名与 HTTPS

### 6.1 配置 Nginx 反向代理

在宿主机安装 Nginx：

```bash
sudo apt install -y nginx
```

创建 `/etc/nginx/sites-available/stzh`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（如果需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/stzh /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.2 申请 HTTPS 证书（Let's Encrypt）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 7. 运维命令速查

### 日常操作

```bash
# 查看容器状态
docker ps -a

# 查看实时日志
docker logs -f --tail 100 stzh-agent

# 重启容器
docker restart stzh-agent

# 停止容器
docker stop stzh-agent

# 进入容器调试
docker exec -it stzh-agent sh
```

### 更新部署

```bash
# 拉取最新镜像
docker pull ghcr.io/你的用户名/stzh-agent:latest

# 停止并删除旧容器
docker stop stzh-agent
docker rm stzh-agent

# 用新镜像启动（数据不会丢失，因为用了 volume）
docker run -d \
  --name stzh-agent \
  --restart=always \
  -p 80:80 \
  -v /opt/stzh/data:/app/data \
  -v /opt/stzh/.env.production:/app/.env.local:ro \
  ghcr.io/你的用户名/stzh-agent:latest

# 清理旧镜像
docker image prune -f
```

### 一键更新脚本

创建 `/opt/stzh/update.sh`：

```bash
#!/bin/bash
set -e

echo "🔄 拉取最新镜像..."
docker pull ghcr.io/你的用户名/stzh-agent:latest

echo "🛑 停止旧容器..."
docker stop stzh-agent 2>/dev/null || true
docker rm stzh-agent 2>/dev/null || true

echo "🚀 启动新容器..."
docker run -d \
  --name stzh-agent \
  --restart=always \
  -p 80:80 \
  -v /opt/stzh/data:/app/data \
  -v /opt/stzh/.env.production:/app/.env.local:ro \
  ghcr.io/你的用户名/stzh-agent:latest

echo "🧹 清理旧镜像..."
docker image prune -f

echo "✅ 更新完成！"
docker ps
```

```bash
chmod +x /opt/stzh/update.sh
# 以后更新只需执行：
/opt/stzh/update.sh
```

---

## 8. 常见问题

### Q1: SQLite 在 Docker 中性能会下降吗？

不会。better-sqlite3 使用 WAL 模式，文件存储在 volume 中，性能与裸机一致。

### Q2: 数据会丢失吗？

不会。SQLite 数据通过 `-v /opt/stzh/data:/app/data` 持久化到宿主机。删除容器不会删除数据。

### Q3: 如何备份数据？

```bash
# 备份
cp -r /opt/stzh/data /opt/stzh/data-backup-$(date +%Y%m%d)

# 恢复
docker stop stzh-agent
cp -r /opt/stzh/data-backup-20260621/* /opt/stzh/data/
docker start stzh-agent
```

### Q4: 如何查看容器资源占用？

```bash
docker stats stzh-agent
```

### Q5: 容器启动失败怎么办？

```bash
# 查看错误日志
docker logs stzh-agent

# 检查端口占用
sudo lsof -i :80

# 进入容器调试
docker run -it --rm ghcr.io/你的用户名/stzh-agent:latest sh
```

### Q6: 如何从裸部署迁移到 Docker？

```bash
# 1. 备份现有数据
cp -r /path/to/server/data /opt/stzh/data

# 2. 停止旧进程
pm2 stop stzh-agent  # 或 kill node 进程

# 3. 启动 Docker 容器
docker run -d ...（如上）

# 4. 验证
curl http://localhost:80/
```

---

## 附录：Dockerfile 多阶段构建原理

```
┌─────────────────────────────────────────┐
│ 阶段 1: builder                          │
│  ├── node:20-alpine                      │
│  ├── npm ci（安装所有依赖）                │
│  ├── npm run build（Next.js 静态导出）    │
│  └── 产物：out/ + server/                │
├─────────────────────────────────────────┤
│ 阶段 2: production                       │
│  ├── node:20-alpine（干净的基础镜像）      │
│  ├── npm ci --omit=dev（仅生产依赖）       │
│  ├── 复制 out/ 和 server/                │
│  └── 最终镜像：约 150MB                   │
└─────────────────────────────────────────┘
```

**优势**：
- 最终镜像不包含 devDependencies、源码、构建工具
- 镜像体积小，启动快
- 构建缓存层复用，CI 速度快
