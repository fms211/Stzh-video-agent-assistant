const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const httpFetch = global.fetch;

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-p0-"));
process.env.STZH_DATA_DIR = testDataDir;
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";

const app = require("../server-express.js");
const db = require("../db.js");

let server;
let baseUrl;
let tokenA;
let tokenB;

async function request(route, options = {}) {
  const response = await httpFetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function register(username) {
  const { response, body } = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: "test-password",
      displayName: username,
    }),
  });
  assert.equal(response.status, 200);
  const decoded = jwt.decode(body.token);
  assert.ok(decoded.exp - decoded.iat <= 7 * 24 * 60 * 60);
  return body.token;
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  tokenA = await register("p0-user-a");
  tokenB = await register("p0-user-b");
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  db.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("protected OPC routes reject unauthenticated requests", async () => {
  const { response } = await request("/api/opc/sessions");
  assert.equal(response.status, 401);
});

test("a user cannot read or append messages in another user's OPC session", async () => {
  const sessionId = "p0-private-opc";
  let result = await request("/api/opc/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ id: sessionId, title: "private" }),
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/opc/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ role: "user", content: "owner message" }),
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/opc/sessions/${sessionId}/messages`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(result.response.status, 404);

  result = await request(`/api/opc/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ role: "user", content: "intruder message" }),
  });
  assert.equal(result.response.status, 404);
});

test("deleting another user's conversation is rejected without deleting messages", async () => {
  const conversationId = "p0-private-conversation";
  let result = await request("/api/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ id: conversationId, title: "private" }),
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      messages: [{ id: "p0-message", role: "user", content: "keep me" }],
    }),
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/conversations/${conversationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(result.response.status, 404);

  result = await request(`/api/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.messages.length, 1);
});

test("creating an existing conversation idempotently updates its title", async () => {
  const conversationId = "p0-upsert-conversation";
  let result = await request("/api/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ id: conversationId, title: "first" }),
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ id: conversationId, title: "second" }),
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.conversation.title, "second");
});

test("username-only password reset is not exposed", async () => {
  const { response } = await request("/api/auth/reset-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      username: "p0-user-a",
      newPassword: "hijacked-password",
    }),
  });
  assert.equal(response.status, 404);
});

test("canonical server exposes authenticated SSE agent streaming", async () => {
  const previousService = app.locals.agentService;
  app.locals.agentService = {
    async generate(options) {
      await options.onDelta?.("hello ");
      return {
        text: "hello world",
        followUps: [],
        conversationId: "p0-mock-conversation",
        chatId: "p0-mock-chat",
      };
    },
  };

  try {
    const { response, body } = await request("/api/agent/stream", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ prompt: "stream this" }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    assert.match(body, /event: delta/);
    assert.match(body, /hello /);
    assert.match(body, /event: done/);
    assert.match(body, /hello world/);
  } finally {
    if (previousService === undefined) delete app.locals.agentService;
    else app.locals.agentService = previousService;
  }
});

test("canonical app module exports the complete Express application", () => {
  const canonicalPath = path.resolve(__dirname, "..", "app.js");
  assert.equal(fs.existsSync(canonicalPath), true);
  assert.equal(require(canonicalPath), app);
});
