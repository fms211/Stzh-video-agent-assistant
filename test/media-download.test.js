"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const load = () => import("../app/lib/media-download.ts");
const item = (url) => ({ url, type: "image", id: "item-1", sessionTitle: '作品:/第一张' });

async function fixture(t, handle) {
  const server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("media download reads an existing local fixture with no account headers and safe filename", async (t) => {
  const { prepareMediaDownload } = await load();
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const base = await fixture(t, (req, res) => {
    assert.equal(req.method, "GET");
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    res.writeHead(200, { "Content-Type": "image/png" }); res.end(bytes);
  });
  let requestOptions;
  const result = await prepareMediaDownload(item(`${base}/image.png`), { fetchImpl: (url, options) => { requestOptions=options; return fetch(url, options); } });
  assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), bytes);
  assert.equal(result.filename, "作品__第一张-item-1.png");
  assert.equal(requestOptions.credentials, "omit");
  assert.equal(requestOptions.referrerPolicy, "no-referrer");
  assert.equal(requestOptions.mode, "cors");
});

test("media download rejects HTTP errors, empty bodies and HTML masquerading as an image URL", async (t) => {
  const { prepareMediaDownload } = await load();
  const base = await fixture(t, (req, res) => {
    if (req.url === "/missing.png") { res.writeHead(404); res.end(); }
    else if (req.url === "/empty.png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(); }
    else { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html>expired link</html>"); }
  });
  await assert.rejects(prepareMediaDownload(item(`${base}/missing.png`)), /HTTP 404/);
  await assert.rejects(prepareMediaDownload(item(`${base}/empty.png`)), /内容为空/);
  await assert.rejects(prepareMediaDownload(item(`${base}/login.png`)), /不是支持的媒体/);
});

test("media download bounds both announced and chunked data without loading a large fixture", async (t) => {
  const { prepareMediaDownload } = await load();
  const base = await fixture(t, (req, res) => {
    res.writeHead(200, { "Content-Type": "image/png", ...(req.url === "/length.png" ? { "Content-Length": "10" } : {}) });
    res.write("12345"); res.end("67890");
  });
  for (const path of ["/length.png", "/chunks.png"]) {
    await assert.rejects(prepareMediaDownload(item(base+path), { maxBytes: 8 }), /超过直接下载上限/);
  }
});

test("media download cancellation and timeout stop waiting for an unfinished asset", async (t) => {
  const { prepareMediaDownload } = await load();
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const base = await fixture(t, (_req, res) => { res.writeHead(200, { "Content-Type": "image/png" }); res.write("data"); began(); });
  const controller = new AbortController();
  const pending = prepareMediaDownload(item(`${base}/slow.png`), { signal: controller.signal });
  const rejected = assert.rejects(pending, error => error.name === "AbortError");
  await started;
  controller.abort();
  await rejected;
  await assert.rejects(prepareMediaDownload(item(`${base}/timeout.png`), { timeoutMs: 30 }), error => /超时|abort/i.test(error.message));
});

test("media download refuses unsafe URLs and already cancelled requests before fetching", async () => {
  const { prepareMediaDownload } = await load();
  let calls = 0;
  const options = { fetchImpl: async () => { calls++; throw new Error("must not fetch"); } };
  for (const url of ["javascript:alert(1)", "file:///private.png", "https://name:secret@example.invalid/x.png"]) {
    await assert.rejects(prepareMediaDownload(item(url), options), /地址无效/);
  }
  await assert.rejects(prepareMediaDownload(item("https://example.invalid/x.png"), { ...options, signal: AbortSignal.abort() }), error => error.name === "AbortError");
  assert.equal(calls, 0);
});

test("media download accepts binary media extensions but not executable names or a mismatched media type", async () => {
  const { prepareMediaDownload } = await load();
  const options = { fetchImpl: async () => new Response("fixture", { headers: { "Content-Type": "application/octet-stream" } }) };
  const result = await prepareMediaDownload(item("https://media.invalid/original.jpeg?signature=keep"), options);
  assert.match(result.filename, /\.jpg$/);
  await assert.rejects(prepareMediaDownload(item("https://media.invalid/file.exe"), options), /不是支持的媒体/);
  await assert.rejects(prepareMediaDownload(item("https://media.invalid/file.mp4"), { fetchImpl: async () => new Response("fixture", { headers: { "Content-Type": "video/mp4" } }) }), /不是支持的媒体/);
});
