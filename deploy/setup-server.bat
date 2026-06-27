@echo off
chcp 65001 >nul
echo.
echo  ====================================
echo   腾昇智和 · 云服务器部署脚本
echo  ====================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js！
    echo 请先安装: https://nodejs.org/zh-cn 下载 LTS 版本
    echo 安装后重新运行此脚本
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [√] Node.js 版本: %NODE_VER%

REM 进入 server 目录
cd /d "%~dp0..\server"
if not exist "start.js" (
    echo [错误] 未找到 start.js，请确认脚本位于 deploy 目录下
    pause
    exit /b 1
)

echo.
echo [1/4] 安装依赖...
call npm install --production
if %errorlevel% neq 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)
echo [√] 依赖安装完成

REM 检查 .env.local
if not exist ".env.local" (
    echo.
    echo [!] 未找到 .env.local
    echo 请创建 server\.env.local 文件，内容参考 deploy\.env.example
    echo.
    echo 必填项:
    echo   COZE_API_TOKEN=你的token
    echo   COZE_BOT_ID=你的bot_id
    echo   JWT_SECRET=随机长字符串
    echo.
    pause
    exit /b 1
)
echo [√] .env.local 已存在

echo.
echo [2/4] 安装 PM2...
call npm install -g pm2
if %errorlevel% neq 0 (
    echo [错误] PM2 安装失败
    pause
    exit /b 1
)
echo [√] PM2 安装完成

echo.
echo [3/4] 启动服务...
cd /d "%~dp0.."
call pm2 delete stzh 2>nul
call pm2 start deploy\ecosystem.config.js
if %errorlevel% neq 0 (
    echo [错误] 启动失败
    pause
    exit /b 1
)
echo [√] 服务已启动

echo.
echo [4/4] 保存 PM2 进程列表（开机自启）...
call pm2 save
call pm2-startup install 2>nul
echo [√] 已配置开机自启

echo.
echo  ====================================
echo   部署完成！
echo  ====================================
echo.
echo   访问地址: http://121.199.20.161
echo.
echo   PM2 常用命令:
echo     pm2 list        查看进程
echo     pm2 logs stzh   查看日志
echo     pm2 restart stzh 重启服务
echo     pm2 stop stzh   停止服务
echo.
pause
