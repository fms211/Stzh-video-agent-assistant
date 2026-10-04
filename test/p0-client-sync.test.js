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
    captureOpcRequestContext: () => ({ token: "owner-42", base: "" }),
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
          currentDataOwner: () => ({ kind: "account", userId: 42 }),
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


async function withOpcPersistence(run) {
  const originalWindow = global.window, originalStorage = global.localStorage;
  const events = [];
  global.window = new EventTarget();
  global.window.addEventListener("tszh_active_session_changed", event => events.push(event.type));
  global.localStorage = createLocalStorage();
  let userId = 42;
  const calls = [];
  const api = {
    captureOpcRequestContext: () => ({ token: `owner-${userId}`, base: "" }),
    apiCreateSession: async (...args) => { calls.push(["create", ...args]); },
    apiListSessions: async () => [], apiDeleteSession: async () => {}, apiGetMessages: async () => [],
    apiBatchAddMessages: async (...args) => { calls.push(["batch", ...args]); return args[1].length; },
  };
  const persist = loadTypeScriptModule(path.resolve("app/lib/opc-agent-persist.ts"), {
    "./opc-agent-api": api,
    "./data-owner": { currentDataOwner: () => ({ kind: "account", userId }), ownerScope: owner => `user:${owner.userId}` },
  });
  try { await run({persist, api, calls, events, storage: global.localStorage, switchOwner: id => { userId = id; }}); }
  finally { global.window = originalWindow; global.localStorage = originalStorage; }
}
const opcMessage = (content, id = "reply") => ({ id, role: "assistant", content, timestamp: 1720000000000 });

test("OPC saves the completed reply after its placeholder and skips acknowledged snapshots", async () => {
  await withOpcPersistence(async ({persist,calls}) => {
    await persist.saveMessages("session", [opcMessage("")]);
    await persist.saveMessages("session", [opcMessage("完成的回复")]);
    await persist.saveMessages("session", [opcMessage("完成的回复")]);
    assert.deepEqual(calls.map(call=>call[0]), ["create","batch","create","batch"]);
    assert.deepEqual(calls.filter(call=>call[0]==="batch").map(call=>call[2][0].content), ["","完成的回复"]);
    assert.equal(calls.at(-1)[2][0].id,"reply");
  });
});

test("OPC retries failed uploads even though the same message already exists locally", async () => {
  await withOpcPersistence(async ({persist,api,storage}) => {
    let attempts=0;
    api.apiBatchAddMessages=async (_,messages)=> { if (++attempts===1) throw new Error("offline"); return messages.length; };
    await assert.rejects(persist.saveMessages("session",[opcMessage("reply")]),/offline/);
    assert.match(storage.getItem("tszh:v2:opc:user:42:msg_session"),/reply/);
    await persist.saveMessages("session",[opcMessage("reply")]);
    assert.equal(attempts,2);
  });
});

test("OPC serializes reply edits and creates the session before the first upload", async () => {
  await withOpcPersistence(async ({persist,api}) => {
    let release; const gate=new Promise(resolve=>{release=resolve;}); const written=[];
    api.apiCreateSession=async()=>{await gate;};
    api.apiBatchAddMessages=async(_,messages)=>{written.push(messages[0].content); return messages.length;};
    const first=persist.saveMessages("session",[opcMessage("partial")]);
    const second=persist.saveMessages("session",[opcMessage("final")]);
    await new Promise(resolve=>setImmediate(resolve)); assert.deepEqual(written,[]);
    release(); await Promise.all([first,second]); assert.deepEqual(written,["partial","final"]);
  });
});

test("OPC old-owner reads cannot write into the next account and queued writes stop on switch", async () => {
  await withOpcPersistence(async ({persist,api,storage,switchOwner}) => {
    api.apiGetMessages=async()=>{switchOwner(99);return [opcMessage("private")];};
    assert.deepEqual(await persist.loadMessages("session"),[]);
    assert.equal(storage.getItem("tszh:v2:opc:user:99:msg_session"),null);
    switchOwner(42); let batches=0;
    api.apiCreateSession=async()=>{switchOwner(99);};
    api.apiBatchAddMessages=async()=>{batches++;return 1;};
    await persist.saveMessages("session",[opcMessage("private")]);
    assert.equal(batches,0);
    assert.equal(storage.getItem("tszh:v2:opc:user:99:msg_session"),null);
  });
});

test("OPC failed local edits survive loading an older server snapshot and modes keep distinct active sessions", async () => {
  await withOpcPersistence(async ({persist,api,events}) => {
    api.apiBatchAddMessages=async()=>{throw new Error("offline");};
    await assert.rejects(persist.saveMessages("session",[opcMessage("latest")]),/offline/);
    api.apiGetMessages=async()=>[opcMessage("old")];
    assert.equal((await persist.loadMessages("session"))[0].content,"latest");
    persist.setActiveSessionId("chat-session");persist.setActiveSessionId("workflow-session","workflow");
    assert.equal(persist.getActiveSessionId(),"chat-session");assert.equal(persist.getActiveSessionId("workflow"),"workflow-session");
    assert.deepEqual(events, ["tszh_active_session_changed", "tszh_active_session_changed"]);
  });
});

test("OPC HTTP adapter preserves stable IDs, pins credentials, rejects write errors and ignores reserved metadata", async () => {
  const oldFetch=global.fetch;
  const calls=[]; let token="first";
  try {
    const api=loadTypeScriptModule(path.resolve("app/lib/opc-agent-api.ts"),{"./auth":{getToken:()=>token,resolveApiBase:()=>"http://local.test"}});
    const context=api.captureOpcRequestContext();token="second";
    global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({messages:[{id:"server-id",role:"assistant",content:"actual",timestamp:100,metadata:JSON.stringify({clientMessageId:"client-id",content:"spoof",role:"system",timestamp:9,cards:[],workflowRunId:"local-run",workflowStepId:"local-step",contextTrace:{rollout:"shadow",applied:false,selected:[{id:"memory-1",revision:2}]}})}]})};};
    const [message]=await api.apiGetMessages("session",200,context);
    assert.equal(calls[0].options.headers.Authorization,"Bearer first");assert.equal(message.id,"client-id");assert.equal(message.content,"actual");assert.equal(message.role,"assistant");assert.equal(message.timestamp,100000);
    assert.equal(message.workflowRunId,"local-run"); assert.equal(message.workflowStepId,"local-step");
    assert.deepEqual(message.contextTrace,{rollout:"shadow",applied:false,selected:[{id:"memory-1",revision:2}]});
    global.fetch=async()=>({ok:false,status:503,json:async()=>({error:"offline"})});
    await assert.rejects(api.apiCreateSession("session"),/offline/);
  } finally {global.fetch=oldFetch;}
});


test("OPC history reads beyond one page without truncating returned messages or sessions", async () => {
  await withOpcPersistence(async ({persist,api}) => {
    const offsets=[];
    api.apiGetMessages=async(_id,_limit,_context,offset)=>{
      offsets.push(offset);
      return offset===0?Array.from({length:200},(_,i)=>opcMessage(`text${i+1}`,`id${i+1}`)):[opcMessage("oldest","id0")];
    };
    const messages=await persist.loadMessages("long",true);
    assert.equal(messages.length,201);assert.equal(messages[0].content,"oldest");assert.deepEqual(offsets,[0,200]);
    api.apiListSessions=async(_context,offset)=>offset===0?Array.from({length:100},(_,i)=>({id:`s${i}`,title:`session${i}`,updated_at:200-i,message_count:1,mode:"chat"})):[{id:"oldest",title:"oldest",updated_at:1,message_count:1,mode:"workflow"}];
    const sessions=await persist.getSessions(true);
    assert.equal(sessions.length,101);assert.equal(sessions.at(-1).mode,"workflow");
    assert.equal(persist.getLocalSessions().length,50);
  });
});

test("authoritative session modes correct a newer local cache without overwriting its title", async () => {
  await withOpcPersistence(async ({persist,api,storage}) => {
    storage.setItem("tszh:v2:opc:user:42:sessions",JSON.stringify([
      {id:"coze-history",title:"local title",timestamp:300000,messageCount:2,mode:"chat"},
    ]));
    api.apiListSessions=async()=>[{id:"coze-history",title:"server title",updated_at:100,message_count:2,mode:"coze"}];
    const [session]=await persist.getSessions(true);
    assert.equal(session.mode,"coze");
    assert.equal(session.title,"local title");
    assert.equal(persist.getLocalSessions()[0].mode,"coze");
  });
});

test("explicit history navigation reports unavailable cloud data instead of opening an empty conversation", async () => {
  await withOpcPersistence(async({persist,api})=>{
    api.apiGetMessages=async()=>{throw new Error("unavailable");};
    api.apiListSessions=async()=>{throw new Error("unavailable");};
    await assert.rejects(persist.loadMessages("unknown",true),/unavailable/);
    await assert.rejects(persist.getSessions(true),/unavailable/);
    assert.deepEqual(await persist.loadMessages("unknown"),[]);
  });
});
