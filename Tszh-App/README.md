# Tszh Remote · 移动端源码

main当前是Expo56/React Native0.85.3客户端，React19.2.3、Expo Router，包及app版本1.0.0。文档核对2026-10-02；Web/服务端1.40.0不代表手机同版本或已验收。手机阶段5完整体验仍待完成，阶段4也尚未结束。

## 当前源码与启动

[package.json](package.json)与锁文件提供依赖；[index.ts](index.ts)加载Expo Router：

~~~bash
cd Tszh-App
npm ci
npm start
~~~

该命令启动Expo开发服务，还需兼容的设备/开发构建及权限。已有脚本：

| 命令（Tszh-App目录） | 含义/条件 |
|---|---|
| `npm run android` | `expo run:android`，需要Android SDK/设备及原生构建环境 |
| `npm run ios` | `expo run:ios`，本地原生构建需要macOS/Xcode |
| `npm run web` | Expo Web开发入口；有该脚本不代表其可选Web依赖/运行已由本轮验证 |

根目录Node包基线见[README](../README.zh-CN.md)；mobile还有自己的Expo/TypeScript版本要求，按其锁文件安装。AGENTS的版本指引在写手机代码时适用；本次只改Markdown，没有修改代码或依赖。

## 后端连接与配对

先准备当前Express服务，默认8080。在手机连接/设置页填写 **手机可访问** 的 `http://<电脑局域网地址>:8080` 或实际HTTPS后端；手机localhost是手机自己。源码默认服务器仍是开发机地址，不应照搬。

登录自己的后端账户，再从桌面配对入口取得一次性码/二维码。扫码需要相机权限，手动配对可避免扫码；应用scheme为 `tszh-remote`，连接页处理对应深链。

设备ID按服务器与账户保存，提供设备ID建立WS时服务端复核归属。手机实时路径 `/ws/mobile`，服务端JWT/设备与API共用；断线重连及轮询提供状态校准，不能以重连成功证明媒体任务完成。

## 已有页面和数据

源码包含任务/dashboard、AI聊天、画廊、通知、模板、个人设置，以及连接、模型配置、聊天历史和定时任务页面。依据 `app/` 文件存在说明，不代表每个真机交互通过。

[api.ts](src/lib/api.ts)管理服务器、身份、任务/通知与离线内容，[ws.ts](src/lib/ws.ts)处理实时事件。AsyncStorage持久化token、配置和分仓数据；更换服务器会清理旧身份，设备和待发内容还按服务器/账户隔离。

移动端仍有自身的LLM/RAG/搜索实现与平台差异，不能假定与Web所有模式、权限和模型密钥链路完全等价。网络探测使用外部连通性地址，不等于后端健康检查；后端是否可用应读实际API。

## Capacitor与交付边界

package包含Capacitor8依赖，[capacitor.config.ts](capacitor.config.ts)指向 `www`。这是独立包装配置，不是Expo native命令的同义路径；仓库没有统一可复现的Capacitor导出/发布npm脚本，不据已有android目录宣称新APK已构建。

真实手机权限、推送、深链、触屏/IME/缩放、后台/断线恢复、端到端媒体以及平台打包均需单独验证。本次未安装手机依赖、启动Expo或构建/发布APK。

相关：[手机设计](DESIGN.md)、[设计要求](DESIGN_REQUIREMENTS.md)、[API](../API调用.md)、[验证指南](../docs/TESTING.md)。
