const { app, BrowserWindow } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");

let mainWindow = null;

// ── 端口检测 ──
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => { srv.close(); resolve(true); });
    srv.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start) {
  for (let p = start; p < start + 100; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error("找不到可用端口");
}

function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const sock = net.createConnection(port, "127.0.0.1");
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error", () => {
        if (Date.now() - start > timeout) { reject(new Error(`端口 ${port} 超时`)); return; }
        setTimeout(check, 500);
      });
    };
    check();
  });
}

// ── 内嵌 Express 后端 ──
let backendServer = null;

function startBackend() {
  return new Promise(async (resolve, reject) => {
    const port = await findFreePort(8080);
    console.log(`[Electron] 后端端口: ${port}`);

    try {
      // 加载 dotenv
      const dotenvPath = path.join(SERVER_DIR, ".env.local");
      if (fs.existsSync(dotenvPath)) {
        const envContent = fs.readFileSync(dotenvPath, "utf-8");
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }

      process.env.PORT = String(port);
      process.env.API_SECRET_KEY = "";

      // 数据库写入目录（asar 内不可写，使用 userData）
      const dataDir = app.getPath("userData");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      process.env.STZH_DATA_DIR = dataDir;
      console.log(`[Electron] 数据目录: ${dataDir}`);

      // 直接 require Express 应用
      const expressApp = require(path.join(SERVER_DIR, "server-express.js"));
      backendServer = expressApp.listen(port, () => {
        console.log(`[Electron] 后端已启动: http://localhost:${port}`);
        resolve(port);
      });

      backendServer.on("error", (e) => {
        console.error("[Electron] 后端启动失败:", e.message);
        reject(e);
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ── 创建窗口 ──
function createWindow(frontendUrl) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "腾昇智和 · Video Workspace",
    backgroundColor: "#050a14",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.loadURL(frontendUrl);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── 清理 ──
function cleanup() {
  if (backendServer) {
    try { backendServer.close(); } catch {}
  }
}

// ── 主流程 ──
app.whenReady().then(async () => {
  try {
    console.log("[Electron] 启动后端...");
    const backendPort = await startBackend();

    // 前端由 Express 内嵌的静态文件服务提供
    const frontendUrl = `http://localhost:${backendPort}`;
    console.log("[Electron] 打开窗口...");
    createWindow(frontendUrl);
  } catch (e) {
    console.error("[Electron] 启动失败:", e.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  cleanup();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow(`http://localhost:8080`);
  }
});

app.on("before-quit", () => {
  cleanup();
});
