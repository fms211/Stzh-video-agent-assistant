@echo off
chcp 65001 >nul
echo.
echo  打包部署文件...
echo.

cd /d "%~dp0.."

REM 清理旧包
if exist "deploy\stzh-deploy.zip" del "deploy\stzh-deploy.zip"

REM 打包 server + out + deploy 到 zip
powershell -Command "Compress-Archive -Path 'server\start.js','server\server-express.js','server\db.js','server\routes','server\package.json','server\.env.example','out','deploy\ecosystem.config.js','deploy\setup-server.bat' -DestinationPath 'deploy\stzh-deploy.zip' -Force"

if exist "deploy\stzh-deploy.zip" (
    for %%A in ("deploy\stzh-deploy.zip") do echo  [√] 打包完成: deploy\stzh-deploy.zip (%%~zA bytes)
    echo.
    echo  接下来:
    echo  1. 把 stzh-deploy.zip 上传到云服务器
    echo  2. 解压到 C:\stzh\
    echo  3. 创建 C:\stzh\server\.env.local（参考 deploy\.env.example）
    echo  4. 运行 deploy\setup-server.bat
) else (
    echo  [×] 打包失败
)

echo.
pause
