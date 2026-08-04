"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("desktop exposes a task center and secure device pairing", () => {
  const home = read("app/components/HomeClient.tsx");
  const navigation = read("app/components/NavigationBar.tsx");
  const pairing = read("app/components/QRCodeAccess.tsx");
  const api = read("app/lib/auth.ts");

  assert.match(home, /TaskCenter/);
  assert.match(navigation, /key:\s*"tasks"/);
  assert.match(pairing, /createPairingCode/);
  assert.match(pairing, /tszh-remote:\/\/connection/);
  assert.match(pairing, /getPairingNetworkTargets/);
  assert.match(api, /\/api\/devices\/pairing-codes/);
  assert.match(read("app/components/TaskCenter.tsx"), /executeTask/);
});

test("mobile process screen uses unified tasks, realtime updates, and real controls", () => {
  const processScreen = read("Tszh-App/app/(tabs)/index.tsx");
  const api = read("Tszh-App/src/lib/api.ts");
  const ws = read("Tszh-App/src/lib/ws.ts");

  assert.match(processScreen, /getTasks/);
  assert.match(processScreen, /wsClient/);
  assert.match(processScreen, /taskAction/);
  assert.match(api, /\/api\/tasks/);
  assert.match(api, /\/api\/devices\/pair/);
  assert.match(ws, /params\.set\('deviceId'/);
  assert.match(read("Tszh-App/app/connection.tsx"), /CameraView/);
  assert.match(read("Tszh-App/app/connection.tsx"), /parsePairingPayload/);
  assert.match(processScreen, /FlatList/);
});

test("Electron keeps the creation center available from the system tray", () => {
  const electronMain = read("electron/main.js");
  assert.match(electronMain, /\bTray\b/);
  assert.match(electronMain, /最小化到托盘/);
});
