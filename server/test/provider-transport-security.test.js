"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const dns = require("node:dns/promises");
const callbackDns = require("node:dns");
const http = require("node:http");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-provider-transport-"));
process.env.STZH_DATA_DIR = dataDir;
process.env.JWT_SECRET = "provider-transport-fixture-jwt-over-thirty-two-characters";
process.env.STZH_LLM_ENCRYPTION_KEY = "provider-transport-fixture-encryption-over-thirty-two-characters";
const { encryptSecret } = require("../lib/secret-crypto.js");
const { providerServices } = require("../routes/creative-agent.js");
const db = require("../db.js");
const nativeFetch = global.fetch;
const nativeLookup = dns.lookup;
const initialPrivate = process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
const initialGateway = process.env.STZH_TRUSTED_MODEL_GATEWAYS;
const syntheticKey = "synthetic-transport-key-only";
const messages = [{ role: "user", content: "只检查模拟文字传输" }];
let sent;
let resolved;

function provider(config = {}) {
  return {
    secret: encryptSecret(syntheticKey),
    config: JSON.stringify({ protocol: "openai", baseUrl: "https://transport-fixture.invalid/v1", model: "fixture", ...config }),
  };
}

test.beforeEach(() => {
  sent = 0;
  resolved = 0;
  delete process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
  delete process.env.STZH_TRUSTED_MODEL_GATEWAYS;
  dns.lookup = async () => { resolved++; return [{ address: "1.1.1.1", family: 4 }]; };
  global.fetch = async () => { sent++; return Response.json({ choices: [{ message: { content: "synthetic reply" } }] }); };
});

test.afterEach(() => {
  global.fetch = nativeFetch;
  dns.lookup = nativeLookup;
  if (initialPrivate === undefined) delete process.env.STZH_ALLOW_PRIVATE_MODEL_URLS;
  else process.env.STZH_ALLOW_PRIVATE_MODEL_URLS = initialPrivate;
  if (initialGateway === undefined) delete process.env.STZH_TRUSTED_MODEL_GATEWAYS;
  else process.env.STZH_TRUSTED_MODEL_GATEWAYS = initialGateway;
});

test.after(() => {
  db.close();
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dataDir));
  assert.ok(relative && !path.isAbsolute(relative) && !relative.startsWith("..") && path.basename(dataDir).startsWith("stzh-provider-transport-"));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("a public-looking model hostname resolving privately is rejected before credentials leave", async () => {
  dns.lookup = async () => { resolved++; return [{ address: "127.0.0.1", family: 4 }]; };
  await assert.rejects(providerServices.invokeProvider(provider(), messages), { code: "INVALID_MODEL_ENDPOINT" });
  assert.equal(sent, 0);
  assert.equal(resolved, 1);
});

test("mixed public/private and mapped loopback DNS answers cannot reach model transport", async () => {
  for (const addresses of [
    [{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }],
    [{ address: "::ffff:7f00:1", family: 6 }],
  ]) {
    dns.lookup = async () => addresses;
    await assert.rejects(providerServices.invokeProvider(provider(), messages), { code: "INVALID_MODEL_ENDPOINT" });
  }
  assert.equal(sent, 0);
});

test("OpenAI and Anthropic send credentials only with the checked dispatcher and redirects disabled", async () => {
  const destroyed = new Set();
  for (const protocol of ["openai", "anthropic"]) {
    global.fetch = async (url, options) => {
      sent++;
      assert.equal(options.redirect, "error");
      assert.ok(options.dispatcher);
      const originalDestroy = options.dispatcher.destroy.bind(options.dispatcher);
      options.dispatcher.destroy = async (...args) => { const result = await originalDestroy(...args); destroyed.add(options.dispatcher); return result; };
      assert.equal(options.method, "POST");
      assert.equal(protocol === "anthropic" ? options.headers["x-api-key"] : options.headers.Authorization, protocol === "anthropic" ? syntheticKey : `Bearer ${syntheticKey}`);
      assert.equal(url, `https://transport-fixture.invalid/v1/${protocol === "anthropic" ? "messages" : "chat/completions"}`);
      return Response.json(protocol === "anthropic" ? { content: [{ type: "text", text: "synthetic reply" }] } : { choices: [{ message: { content: "synthetic reply" } }] });
    };
    assert.equal(await providerServices.invokeProvider(provider({ protocol }), messages), "synthetic reply");
  }
  assert.equal(resolved, 2);
  assert.equal(sent, 2);
  assert.equal(destroyed.size, 2);
});

test("redirect/transport diagnostics cannot disclose credentials or internal targets", async () => {
  let followedRedirect = false;
  global.fetch = async (_url, options) => {
    sent++;
    if (options.redirect !== "error") {
      followedRedirect = true;
      return Response.json({ choices: [{ message: { content: "private target reached" } }] });
    }
    throw new TypeError(`redirect blocked: ${syntheticKey} http://127.0.0.1/private`);
  };
  await assert.rejects(providerServices.invokeProvider(provider(), messages), error => {
    assert.equal(error.code, "MODEL_NETWORK_ERROR");
    assert.ok(!error.message.includes(syntheticKey));
    assert.ok(!error.message.includes("127.0.0.1"));
    return true;
  });
  assert.equal(followedRedirect, false);
  assert.equal(sent, 1);
});

test("DNS failure is sanitized and never starts credential transport", async () => {
  dns.lookup = async () => { throw new Error(`private resolver diagnostic ${syntheticKey}`); };
  await assert.rejects(providerServices.invokeProvider(provider(), messages), error => error.code === "MODEL_NETWORK_ERROR" && !error.message.includes(syntheticKey));
  assert.equal(sent, 0);
});

test("a cancelled request stops before DNS and transport", async () => {
  const controller = new AbortController();
  controller.abort(new Error(`private cancellation ${syntheticKey}`));
  await assert.rejects(providerServices.invokeProvider(provider(), messages, { signal: controller.signal }), { code: "MODEL_REQUEST_CANCELLED" });
  assert.equal(resolved, 0);
  assert.equal(sent, 0);
});

test("upstream HTTP errors cancel their bodies, release the dispatcher and do not echo the response", async () => {
  let cancelled = 0;
  const destroyed = new Set();
  global.fetch = async (_url, options) => {
    const originalDestroy = options.dispatcher.destroy.bind(options.dispatcher);
    options.dispatcher.destroy = async (...args) => { const result = await originalDestroy(...args); destroyed.add(options.dispatcher); return result; };
    return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 401 });
  };
  await assert.rejects(providerServices.invokeProvider(provider(), messages), { code: "MODEL_UPSTREAM_ERROR", message: "模型服务返回 HTTP 401" });
  assert.equal(cancelled, 1);
  assert.equal(destroyed.size, 1);
});

test("malformed JSON is reported without upstream parsing details", async () => {
  global.fetch = async () => new Response(syntheticKey, { status: 200 });
  await assert.rejects(providerServices.invokeProvider(provider(), messages), error => error.code === "MODEL_RESPONSE_INVALID" && !error.message.includes(syntheticKey));
});

test("queries and fragments are rejected consistently before credential transport", async () => {
  for (const suffix of ["?api_key=synthetic", "#fragment"]) {
    await assert.rejects(providerServices.invokeProvider(provider({ baseUrl: `https://transport-fixture.invalid/v1${suffix}` }), messages), { code: "INVALID_MODEL_ENDPOINT" });
  }
  assert.equal(resolved, 0);
  assert.equal(sent, 0);
});

test("operator-approved private models keep working with redirects still disabled", async () => {
  process.env.STZH_ALLOW_PRIVATE_MODEL_URLS = "1";
  global.fetch = async (_url, options) => {
    sent++;
    assert.equal(options.redirect, "error");
    assert.ok(options.dispatcher);
    return Response.json({ choices: [{ message: { content: "local synthetic reply" } }] });
  };
  assert.equal(await providerServices.invokeProvider(provider({ baseUrl: "http://127.0.0.1:11434/v1" }), messages), "local synthetic reply");
  assert.equal(sent, 1);
  assert.equal(resolved, 0);
});

test("text calls honor an exact HTTPS gateway exception but reject a changed private IP", async () => {
  process.env.STZH_TRUSTED_MODEL_GATEWAYS = JSON.stringify({ "transport-fixture.invalid": ["172.29.0.66"] });
  dns.lookup = async () => [{ address: "172.29.0.66", family: 4 }];
  assert.equal(await providerServices.invokeProvider(provider(), messages), "synthetic reply");
  dns.lookup = async () => [{ address: "172.29.0.67", family: 4 }];
  await assert.rejects(providerServices.invokeProvider(provider(), messages), { code: "INVALID_MODEL_ENDPOINT" });
  assert.equal(sent, 1);
});

test("a real local model connection uses the checked DNS answer without resolving again", { timeout: 5000 }, async () => {
  process.env.STZH_ALLOW_PRIVATE_MODEL_URLS = "1";
  dns.lookup = async () => { resolved++; return [{ address: "127.0.0.1", family: 4 }]; };
  const priorCallbackLookup = callbackDns.lookup;
  let uncheckedLookups = 0, received = 0;
  const fixture = http.createServer((req, res) => {
    received++;
    assert.equal(req.headers.authorization, `Bearer ${syntheticKey}`);
    assert.equal(req.url, "/v1/chat/completions");
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "local socket reply" } }] }));
  });
  try {
    await new Promise((resolve, reject) => { fixture.once("error", reject); fixture.listen(0, "127.0.0.1", resolve); });
    callbackDns.lookup = (_host, options, callback) => {
      uncheckedLookups++;
      const complete = typeof options === "function" ? options : callback;
      queueMicrotask(() => complete(new Error("Unchecked DNS lookup is forbidden in this local fixture")));
    };
    global.fetch = nativeFetch;
    const result = await providerServices.invokeProvider(provider({ baseUrl: `http://transport-fixture.invalid:${fixture.address().port}/v1` }), messages, { signal: AbortSignal.timeout(3000) });
    assert.equal(result, "local socket reply");
    assert.equal(resolved, 1);
    assert.equal(uncheckedLookups, 0);
    assert.equal(received, 1);
  } finally {
    callbackDns.lookup = priorCallbackLookup;
    await new Promise(resolve => fixture.close(resolve));
  }
});
