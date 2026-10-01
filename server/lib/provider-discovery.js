"use strict";
const dns = require("node:dns/promises");
const net = require("node:net");
const { Agent } = require("undici");
const fail = (code, message, status = 502) => { throw Object.assign(new Error(message), { code, status }); };

function trustedModelGateway(url, addresses) {
  // Deployment-owned exceptions bind an HTTPS hostname to exact gateway IPs.
  // A submitted API URL cannot grant itself access to private addresses.
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || net.isIP(url.hostname)) return false;
  let rules;
  try { rules = JSON.parse(process.env.STZH_TRUSTED_MODEL_GATEWAYS || "{}"); } catch { return false; }
  const permitted = rules && Object.hasOwn(rules, url.hostname) ? rules[url.hostname] : null;
  return Array.isArray(permitted) && permitted.length > 0 && permitted.every(address => typeof address === "string" && net.isIP(address))
    && addresses.length > 0 && addresses.every(item => permitted.includes(item.address));
}

async function createProviderDispatcher(url, { isPrivateHost, signal, resolveHost = dns.lookup } = {}) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let onAbort;
  let addresses;
  try {
    if (signal?.aborted) throw signal.reason;
    addresses = await Promise.race([
      net.isIP(host) ? Promise.resolve([{ address: host, family: net.isIP(host) }]) : resolveHost(host, { all: true, verbatim: true }),
      new Promise((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally { if (onAbort) signal?.removeEventListener("abort", onAbort); }
  if (!addresses.length) fail("MODEL_LIST_NETWORK_ERROR", "API 地址无法解析，请检查网络与地址");
  const allowPrivate = ["1", "true"].includes(String(process.env.STZH_ALLOW_PRIVATE_MODEL_URLS).toLowerCase());
  if (!allowPrivate && addresses.some(item => isPrivateHost(item.address)) && !trustedModelGateway(url, addresses)) {
    fail("INVALID_MODEL_ENDPOINT", "API 地址解析到本机或内网，已阻止请求；若使用代理网关，请由部署者核对域名与网关配置", 400);
  }
  // Pin the checked addresses and retain normal TLS certificate/hostname checks.
  return new Agent({ connect: { lookup: (_hostname, options, callback) => {
    const candidates = options.family ? addresses.filter(item => item.family === options.family) : addresses;
    if (!candidates.length) return callback(Object.assign(new Error("address unavailable"), { code: "ENOTFOUND" }));
    if (options.all) callback(null, candidates); else callback(null, candidates[0].address, candidates[0].family);
  } } });
}

function modelListEndpoint(config) {
  const base = config.baseUrl.replace(/\/$/, "");
  return config.protocol === "anthropic" ? `${base.endsWith("/v1") ? base : base + "/v1"}/models?limit=1000` : `${base}/models`;
}
function normalizeModelList(body) {
  if (!body || !Array.isArray(body.data)) fail("MODEL_LIST_INVALID", "厂商返回的模型列表格式无法识别，可手动填写模型标识");
  const models = new Map();
  for (const item of body.data) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || item.id.length > 256 || /[\u0000-\u001f\u007f]/.test(item.id)) continue;
    const id = item.id.trim();
    models.set(id, { id, name: typeof item.display_name === "string" ? item.display_name.slice(0, 200) : typeof item.name === "string" ? item.name.slice(0, 200) : id });
  }
  if (body.data.length && !models.size) fail("MODEL_LIST_INVALID", "厂商未返回可识别的模型标识");
  return { models: [...models.values()].sort((a,b)=>a.id.localeCompare(b.id)).slice(0,2000),
    partial: body.has_more === true || models.size > 2000 };
}
async function discoverProviderModels(config, apiKey, { assertBaseUrl, isPrivateHost, signal, resolveHost = dns.lookup } = {}) {
  config = { ...config, baseUrl: assertBaseUrl(config.baseUrl) };
  const url = new URL(config.baseUrl);
  if (url.search || url.hash) fail("INVALID_MODEL_ENDPOINT", "API 地址不能包含查询参数或片段", 400);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 20000);
  let dispatcher;
  try {
    dispatcher = await createProviderDispatcher(url, { isPrivateHost, signal: controller.signal, resolveHost });
    const headers = config.protocol === "anthropic" ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${apiKey}` };
    const response = await fetch(modelListEndpoint(config), { method: "GET", headers, redirect: "error", signal: controller.signal, dispatcher });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401,403].includes(response.status)) fail("MODEL_LIST_AUTH_FAILED", "厂商拒绝认证，请检查密钥与模型列表权限");
      if ([404,405].includes(response.status)) fail("MODEL_LIST_UNSUPPORTED", "该 API 地址未提供模型列表，请检查地址或使用手动填写");
      fail("MODEL_LIST_UPSTREAM_ERROR", `获取模型列表失败（HTTP ${response.status}）`);
    }
    const chunks=[];let size=0;
    if (response.body) for await (const chunk of response.body) {
      size+=chunk.byteLength;
      if (size>2097152) {controller.abort();fail("MODEL_LIST_TOO_LARGE", "厂商列表超过读取上限，请缩小服务范围或手动填写");}
      chunks.push(chunk);
    }
    let body;try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch {fail("MODEL_LIST_INVALID","厂商返回的模型列表不是有效 JSON");}
    return normalizeModelList(body);
  } catch(error) {
    if ((typeof error?.code === "string" && error.code.startsWith("MODEL_LIST_")) || ["INVALID_MODEL_ENDPOINT", "PREVIEW_PROVIDER_BLOCKED"].includes(error?.code)) throw error;
    if (controller.signal.aborted) fail("MODEL_LIST_TIMEOUT", "获取模型已超时或取消，请稍后重试",504);
    fail("MODEL_LIST_NETWORK_ERROR", "无法读取厂商模型列表，请检查 API 地址与网络");
  } finally {clearTimeout(timer);signal?.removeEventListener("abort",abort);await dispatcher?.destroy();}
}
module.exports = { discoverProviderModels, normalizeModelList, modelListEndpoint, createProviderDispatcher };
