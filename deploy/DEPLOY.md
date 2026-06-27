# 腾昇智和 · 云服务器部署指南

> 服务器：阿里云 ECS Windows  
> IP：121.199.20.161  
> 端口：8080  
> 最后更新：2026-06-07

---

## 前置条件

- 阿里云 ECS Windows 服务器
- 本地电脑已安装 Node.js v25.x

---

## 第一步：本地构建前端

```powershell
cd D:\fms688_stzh-Agent
npm run build
```

---

## 第二步：打包部署文件

### 方法一：PowerShell 命令
```powershell
cd D:\fms688_stzh-Agent
Compress-Archive -Path server\start.js,server\server-express.js,server\db.js,server\routes,server\package.json,server\node_modules,out,deploy\ecosystem.config.js,deploy\.env.example -DestinationPath deploy\stzh-full.zip -Force
```

### 方法二：手动压缩
选中以下文件/文件夹，右键「发送到 → 压缩文件夹」：
```
server/start.js
server/server-express.js
server/db.js
server/routes/
server/package.json
server/node_modules/    ← 必须包含，服务器编译 native 模块很麻烦
out/
deploy/ecosystem.config.js
deploy/.env.example
```

---

## 第三步：上传到服务器

### 方式 A：远程桌面拖拽
```powershell
mstsc /v:121.199.20.161
```
登录后直接把 zip 拖进服务器窗口。

### 方式 B：scp 命令
```powershell
scp D:\fms688_stzh-Agent\deploy\stzh-full.zip Administrator@121.199.20.161:C:\stzh\
```

---

## 第四步：服务器上解压

在服务器 CMD 里：
```cmd
cd C:\stzh
powershell Expand-Archive -Path stzh-full.zip -DestinationPath . -Force
```

解压后结构：
```
C:\stzh\
├── start.js
├── server-express.js
├── db.js
├── routes\
├── package.json
├── node_modules\
├── ecosystem.config.js
├── .env.example
└── out\
    ├── index.html
    └── ...
```

---

## 第五步：安装 Node.js

1. 下载 https://nodejs.org/zh-cn （**v25.x LTS**，必须和本地版本一致）
2. 安装时勾选「Add to PATH」
3. **关掉 CMD 重新打开**
4. 验证：`node -v` 应显示 `v25.x.x`

---

## 第六步：安装编译工具（better-sqlite3 需要）

### 安装 Python
1. 下载 https://www.python.org/downloads/ （Python 3.12，下载 .exe 安装包，不是 .tgz）
2. 安装时**勾选 "Add python.exe to PATH"**
3. 点 Install Now

### 安装 Visual Studio Build Tools
1. 下载 https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. 点 "Download Build Tools"
3. 运行安装程序，选择 **"Desktop development with C++"**
4. 点底部 "安装"
5. **关掉 CMD 重新打开**

---

## 第七步：配置环境变量

在 `C:\stzh\` 下创建 `.env.local` 文件：

```
COZE_API_TOKEN=你的token
COZE_BOT_ID=你的bot_id
COZE_USER_ID=stzh_user
COZE_BASE_URL=https://api.coze.cn
JWT_SECRET=改成一个随机长字符串至少32位
API_SECRET_KEY=
PORT=80
```

> 可以从本地 `server/.env.local` 复制内容，只改 PORT=80

---

## 第八步：编译 native 模块 + 启动

```cmd
cd C:\stzh\node_modules\better-sqlite3
npx node-gyp rebuild --release
cd C:\stzh
npm install -g pm2
pm2 start start.js --name stzh
pm2 save
```

验证：
```cmd
pm2 list
```
状态应为 `online`。

---

## 第九步：配置防火墙

### 阿里云安全组
```
阿里云控制台 → ECS 实例 → 安全组 → 入方向 → 手动添加：
  协议类型: 自定义 TCP
  端口范围: 8080/8080
  授权对象: 0.0.0.0/0
  描述: STZH 应用
```

### Windows 防火墙
```cmd
netsh advfirewall firewall add rule name="STZH 8080" dir=in action=allow protocol=TCP localport=8080
```

---

## 第十步：验证

浏览器打开 http://121.199.20.161:8080

看到页面 → 注册 → 登录 → 使用 ✅

---

## 日常维护

```cmd
pm2 list              查看进程状态
pm2 logs stzh         查看实时日志
pm2 logs stzh --err   只看错误日志
pm2 restart stzh      重启服务
pm2 stop stzh         停止服务
pm2 flush stzh        清空日志
```

---

## 更新部署

当代码有更新时：

### 本地
```powershell
cd D:\fms688_stzh-Agent
npm run build
```

### 上传新的 out/ 到服务器
```powershell
scp -r D:\fms688_stzh-Agent\out Administrator@121.199.20.161:C:\stzh\
```

### 服务器上重启
```cmd
pm2 restart stzh
```

> 注意：不要覆盖 `C:\stzh\.env.local` 和 `C:\stzh\stzh.db`（数据库）

---

## 常见问题

### better-sqlite3 报错 ERR_DLOPEN_FAILED
原因：Node.js 版本不匹配  
解决：本地和服务器都要用 v25.x，然后在服务器上重新编译：
```cmd
cd C:\stzh\node_modules\better-sqlite3
npx node-gyp rebuild --release
pm2 restart stzh
```

### 页面能打开但注册/登录报错
原因：前端 JS 里 API 地址写死了 localhost  
解决：本地重新 `npm run build`，上传新的 `out/` 到服务器

### 浏览器访问不了
检查清单：
1. 阿里云安全组是否放行了 8080 端口
2. Windows 防火墙是否放行了 8080 端口
3. PM2 进程是否在线：`pm2 list`

---

## SSH 远程连接

### 开启 SSH（服务器上执行）
```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

### 连接（本地 PowerShell）
```powershell
ssh Administrator@121.199.20.161
```

### scp 上传文件
```powershell
scp D:\fms688_stzh-Agent\deploy\stzh-full.zip Administrator@121.199.20.161:C:\stzh\
scp -r D:\fms688_stzh-Agent\out Administrator@121.199.20.161:C:\stzh\
```

### WinSCP（图形化拖拽）
下载 https://winscp.net/ ，新建连接输入 IP 和密码即可。

---

## 完整命令速查（从零开始）

```cmd
:: 服务器上依次执行（前提：Node.js、Python、VS Build Tools 已安装）

:: 1. 解压
cd C:\stzh
powershell Expand-Archive -Path stzh-full.zip -DestinationPath . -Force

:: 2. 编译 native 模块
cd C:\stzh\node_modules\better-sqlite3
npx node-gyp rebuild --release

:: 3. 安装 PM2 并启动
cd C:\stzh
npm install -g pm2
pm2 start start.js --name stzh
pm2 save

:: 4. 防火墙
netsh advfirewall firewall add rule name="STZH 8080" dir=in action=allow protocol=TCP localport=8080

:: 5. 验证
pm2 list
:: 浏览器打开 http://121.199.20.161:8080
```
