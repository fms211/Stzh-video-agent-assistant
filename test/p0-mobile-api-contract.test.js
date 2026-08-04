const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadApi(asyncStorage) {
  const filePath = path.resolve("Tszh-App/src/lib/api.ts");
  const output = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;

  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  const realRequire = loaded.require.bind(loaded);
  loaded.require = (request) => (
    request === "@react-native-async-storage/async-storage"
      ? asyncStorage
      : realRequire(request)
  );
  loaded._compile(output, filePath);
  return loaded.exports;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createStorage() {
  const values = new Map([["tszh_server_url", "http://127.0.0.1:8080"]]);
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async (key) => values.delete(key),
  };
}

test("mobile registration uses the server displayName contract", async () => {
  const api = loadApi(createStorage());
  let sentBody;
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return jsonResponse({ token: "token", user: { id: 1 } });
  };

  await api.register("pilot", "password", "Pilot Name");
  assert.equal(sentBody.displayName, "Pilot Name");
  assert.equal(Object.hasOwn(sentBody, "display_name"), false);
});

test("mobile createConversation accepts the server's direct conversation payload", async () => {
  const api = loadApi(createStorage());
  global.fetch = async () => jsonResponse({
    id: "conversation-1",
    title: "New conversation",
  });

  const conversation = await api.createConversation("New conversation");
  assert.equal(conversation.id, "conversation-1");
});

test("mobile createTemplate accepts the server's direct template payload", async () => {
  const api = loadApi(createStorage());
  global.fetch = async () => jsonResponse({
    id: 7,
    category: "video",
    icon: "template",
    label: "Trailer",
    prompt: "Create a trailer",
  });

  const template = await api.createTemplate({
    category: "video",
    icon: "template",
    label: "Trailer",
    prompt: "Create a trailer",
  });
  assert.equal(template.id, 7);
});

test("mobile generation pagination sends offset rather than page", async () => {
  const api = loadApi(createStorage());
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return jsonResponse({ generations: [], total: 0 });
  };

  await api.getGenerations(3, 20);
  assert.match(requestedUrl, /limit=20/);
  assert.match(requestedUrl, /offset=40/);
  assert.doesNotMatch(requestedUrl, /[?&]page=/);
});

test("mobile normalizes legacy generation media and stats fields", async () => {
  const api = loadApi(createStorage());
  global.fetch = async (url) => {
    if (String(url).endsWith("/api/generations/stats")) {
      return jsonResponse({ total: 3, today: 1, totalVideos: 2 });
    }
    return jsonResponse({
      generations: [{
        id: 1,
        prompt: "demo",
        imageUrls: ["https://example.com/image.png"],
        video_url: "https://example.com/video.mp4",
        status: "completed",
        created_at: "2026-07-30 10:00:00",
      }],
      total: 1,
    });
  };

  const generations = await api.getGenerations();
  const stats = await api.getGenerationStats();

  assert.deepEqual(generations.generations[0].image_urls, ["https://example.com/image.png"]);
  assert.equal(stats.videos, 2);
});

test("mobile API errors surface the nested server message", async () => {
  const api = loadApi(createStorage());
  global.fetch = async () => jsonResponse({
    error: { message: "会话不存在" },
  }, 404);

  await assert.rejects(
    () => api.getConversation("missing"),
    /会话不存在/
  );
});
