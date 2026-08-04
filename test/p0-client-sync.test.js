const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTypeScriptModule(filePath, mocks = {}, transformSource = (source) => source) {
  const source = transformSource(fs.readFileSync(filePath, "utf8"));
  const output = ts.transpileModule(source, {
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
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : realRequire(request)
  );
  loaded._compile(output, filePath);
  return loaded.exports;
}

function createLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("desktop OPC persistence uploads a newly appended message", async () => {
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;
  global.window = {};
  global.localStorage = createLocalStorage();

  const batchCalls = [];
  const apiMock = {
    apiCreateSession: async () => {},
    apiListSessions: async () => [],
    apiDeleteSession: async () => {},
    apiGetMessages: async () => [],
    apiAddMessage: async () => null,
    apiBatchAddMessages: async (sessionId, messages) => {
      batchCalls.push({ sessionId, messages });
      return messages.length;
    },
  };

  try {
    const persist = loadTypeScriptModule(
      path.resolve("app/lib/opc-agent-persist.ts"),
      {
        "./opc-agent-api": apiMock,
        "./data-owner": {
          currentDataOwner: () => ({ kind: "guest" }),
          ownerScope: (owner) => (owner.kind === "guest" ? "guest" : `user:${owner.userId}`),
        },
      }
    );

    await persist.saveMessages("session-1", [{
      id: "message-1",
      role: "user",
      content: "new message",
    }]);

    assert.equal(batchCalls.length, 1);
    assert.equal(batchCalls[0].sessionId, "session-1");
    assert.equal(batchCalls[0].messages.length, 1);
    assert.equal(batchCalls[0].messages[0].content, "new message");
  } finally {
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  }
});

test("mobile restores persisted workflow cards as an action-card message", () => {
  const asyncStorage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  };
  const apiMock = {
    getServerUrl: async () => "http://127.0.0.1:8080",
    getToken: async () => "token",
  };

  const opcAgent = loadTypeScriptModule(
    path.resolve("Tszh-App/src/lib/opc-agent.ts"),
    {
      "./api": apiMock,
      "@react-native-async-storage/async-storage": asyncStorage,
    },
    (source) => source.replace(
      "function serverMessageToOpc(raw: any): OpcMessage",
      "export function serverMessageToOpc(raw: any): OpcMessage"
    )
  );

  const message = opcAgent.serverMessageToOpc({
    id: "card-1",
    role: "assistant",
    content: "final report",
    metadata: {
      workflowName: "广告脚本工厂",
      cards: [{
        id: "save",
        type: "save-report",
        title: "保存报告",
        desc: "保存结果",
        icon: "file",
      }],
    },
  });

  assert.equal(message.role, "action-cards");
  assert.equal(message.cards.length, 1);
});
