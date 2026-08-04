const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

async function load(relativePath) {
  const url = pathToFileURL(path.join(root, relativePath));
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  try {
    return await import(url.href);
  } catch (error) {
    assert.fail(`${relativePath} 应可被加载：${error instanceof Error ? error.message : error}`);
  }
}

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

test("entry flow opens the gateway and can enter a real guest workspace", async () => {
  const { createInitialEntryState, reduceEntryState } = await load("app/lib/entry-flow.ts");
  const initial = createInitialEntryState(null, false);

  assert.deepEqual(initial, {
    phase: "splash",
    accessMode: null,
    authView: "login",
  });

  const gateway = reduceEntryState(initial, {
    type: "SPLASH_COMPLETE",
    authenticated: false,
  });
  assert.deepEqual(gateway, {
    phase: "gateway",
    accessMode: null,
    authView: "login",
  });
  assert.deepEqual(reduceEntryState(gateway, { type: "ENTER_GUEST" }), {
    phase: "workspace",
    accessMode: "guest",
    authView: "login",
  });
});

test("entry flow restores guest workspaces but protects authenticated workspaces", async () => {
  const { createInitialEntryState, serializeEntryState } = await load("app/lib/entry-flow.ts");

  const guest = createInitialEntryState("workspace:guest", false);
  assert.deepEqual(guest, {
    phase: "workspace",
    accessMode: "guest",
    authView: "login",
  });
  assert.equal(serializeEntryState(guest), "workspace:guest");

  assert.deepEqual(createInitialEntryState("workspace:authenticated", false), {
    phase: "gateway",
    accessMode: null,
    authView: "login",
  });
});

test("guest access allows navigation and configuration but blocks remote actions", async () => {
  const { canUseWorkspaceCapability } = await load("app/lib/access-policy.ts");

  assert.equal(canUseWorkspaceCapability("guest", "navigate"), true);
  assert.equal(canUseWorkspaceCapability("guest", "configure"), true);
  assert.equal(canUseWorkspaceCapability("guest", "generate"), false);
  assert.equal(canUseWorkspaceCapability("guest", "cloud-sync"), false);
  assert.equal(canUseWorkspaceCapability("guest", "pair-device"), false);
  assert.equal(canUseWorkspaceCapability("guest", "task-control"), false);
  assert.equal(canUseWorkspaceCapability("authenticated", "generate"), true);
});

test("legacy workspace data is copied into an owner namespace without deletion", async () => {
  const {
    migrateLegacyWorkspaceData,
    workspaceDataKey,
    hasWorkspaceData,
  } = await load("app/lib/data-owner.ts");
  const storage = new MemoryStorage({
    tszh_sessions: JSON.stringify([{ id: "session-a", title: "访客草稿" }]),
    tszh_active: "session-a",
    "tszh_msgs_session-a": JSON.stringify([{ id: "m1", role: "user", text: "保留我" }]),
  });
  const owner = { kind: "guest" };

  migrateLegacyWorkspaceData(storage, owner);

  assert.equal(storage.getItem("tszh_sessions") !== null, true);
  assert.equal(storage.getItem("tszh_msgs_session-a") !== null, true);
  assert.equal(storage.getItem(workspaceDataKey(owner, "sessions")) !== null, true);
  assert.equal(storage.getItem(workspaceDataKey(owner, "messages", "session-a")) !== null, true);
  assert.equal(hasWorkspaceData(storage, owner), true);
});

test("guest data can be copied to an account while the guest copy remains", async () => {
  const {
    copyWorkspaceData,
    workspaceDataKey,
  } = await load("app/lib/data-owner.ts");
  const guest = { kind: "guest" };
  const account = { kind: "account", userId: 42 };
  const sessions = [{ id: "session-a", title: "本机访客内容" }];
  const storage = new MemoryStorage({
    ["tszh:v2:guest:sessions"]: JSON.stringify(sessions),
    ["tszh:v2:guest:active"]: "session-a",
    ["tszh:v2:guest:messages:session-a"]: JSON.stringify([{ id: "m1", role: "user" }]),
  });

  copyWorkspaceData(storage, guest, account);

  assert.equal(storage.getItem(workspaceDataKey(guest, "sessions")) !== null, true);
  assert.deepEqual(
    JSON.parse(storage.getItem(workspaceDataKey(account, "sessions"))),
    sessions,
  );
  assert.equal(storage.getItem(workspaceDataKey(account, "messages", "session-a")) !== null, true);
});

test("guest import merges with existing account sessions instead of skipping the guest copy", async () => {
  const {
    copyWorkspaceData,
    workspaceDataKey,
  } = await load("app/lib/data-owner.ts");
  const guest = { kind: "guest" };
  const account = { kind: "account", userId: 42 };
  const storage = new MemoryStorage({
    ["tszh:v2:guest:sessions"]: JSON.stringify([
      { id: "guest-session", title: "访客草稿" },
    ]),
    ["tszh:v2:guest:messages:guest-session"]: JSON.stringify([
      { id: "guest-message", role: "user", text: "保留这个草稿" },
    ]),
    ["tszh:v2:user:42:sessions"]: JSON.stringify([
      { id: "account-session", title: "账户历史" },
    ]),
  });

  copyWorkspaceData(storage, guest, account);

  assert.deepEqual(
    JSON.parse(storage.getItem(workspaceDataKey(account, "sessions"))).map((item) => item.id),
    ["account-session", "guest-session"],
  );
  assert.equal(
    storage.getItem(workspaceDataKey(account, "messages", "guest-session")) !== null,
    true,
  );
  assert.equal(storage.getItem(workspaceDataKey(guest, "sessions")) !== null, true);
});

test("guest import remaps colliding session ids without losing either conversation", async () => {
  const {
    copyWorkspaceData,
    workspaceDataKey,
  } = await load("app/lib/data-owner.ts");
  const guest = { kind: "guest" };
  const account = { kind: "account", userId: 9 };
  const storage = new MemoryStorage({
    ["tszh:v2:guest:sessions"]: JSON.stringify([{ id: "same-id", title: "访客版本" }]),
    ["tszh:v2:guest:active"]: "same-id",
    ["tszh:v2:guest:messages:same-id"]: JSON.stringify([{ id: "guest-message" }]),
    ["tszh:v2:user:9:sessions"]: JSON.stringify([{ id: "same-id", title: "账户版本" }]),
  });

  copyWorkspaceData(storage, guest, account);

  assert.deepEqual(
    JSON.parse(storage.getItem(workspaceDataKey(account, "sessions"))).map((item) => item.id),
    ["same-id", "same-id-imported"],
  );
  assert.equal(storage.getItem(workspaceDataKey(account, "active")), "same-id-imported");
  assert.equal(
    storage.getItem(workspaceDataKey(account, "messages", "same-id-imported")) !== null,
    true,
  );
});

test("shared product shell replaces the conflicted standalone splash", () => {
  const splash = read("app/components/SplashScreen.tsx");
  const shell = read("app/components/ProductShell.tsx");

  assert.doesNotMatch(splash, /<<<<<<<|=======|>>>>>>>/);
  assert.match(splash, /layoutId=["']brand-core["']/);
  assert.doesNotMatch(splash, /QRCodeAccess|canvasRef|fillRect|GeistPixel|准备好进入您的工作区了嘛/);
  assert.match(shell, /LayoutGroup/);
  assert.match(shell, /MotionConfig/);
  assert.match(shell, /StarfieldBackground/);
  assert.match(shell, /OrbitRings/);
});

test("desktop auth routes reuse one identity gateway", () => {
  assert.equal(exists("app/login/page.tsx"), true);
  assert.equal(exists("app/register/page.tsx"), true);
  const loginPage = read("app/login/page.tsx");
  const registerPage = read("app/register/page.tsx");

  assert.match(loginPage, /AuthEntryPage/);
  assert.match(registerPage, /AuthEntryPage/);
  assert.doesNotMatch(loginPage, /<style>|auth-porthole/);
  assert.doesNotMatch(registerPage, /<style>|auth-porthole/);
});

test("home client uses guest access without any read-only tour", () => {
  const home = read("app/components/HomeClient.tsx");

  assert.match(home, /ProductShell/);
  assert.match(home, /EntryGateway/);
  assert.match(home, /reduceEntryState/);
  assert.match(home, /accessMode/);
  assert.doesNotMatch(home, /TourWorkspace|tourStep|ENTER_TOUR|tszh_entered/);
  assert.equal(exists("app/components/TourWorkspace.tsx"), false);
});
