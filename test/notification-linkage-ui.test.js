"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("desktop and mobile notifications reload the server source of truth on realtime events", () => {
  const navigation = read("app/components/NavigationBar.tsx");
  const serverSync = read("app/lib/server-sync.ts");
  const mobileApi = read("Tszh-App/src/lib/api.ts");
  const mobileScreen = read("Tszh-App/app/(tabs)/notifications.tsx");
  assert.match(navigation, /createNotificationFeed/);
  assert.match(navigation, /notification\.created/);
  assert.match(navigation, /mutate\("read"\)/);
  assert.match(navigation, /mutate\("clear"\)/);
  assert.match(serverSync, /captureNotificationClient/);
  assert.match(mobileScreen, /wsClient\.on\('notification\.created'/);
  assert.match(mobileApi, /notification\.created_at \* 1000/);
});
