"use strict";
const { createProviderDispatcher } = require("./provider-discovery.js");
const { isPrivateModelHost } = require("./provider-host.js");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

function loadPreviewEncryptionKey(dataDir) {
  const file = path.join(dataDir, ".model-provider-encryption-key");
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, crypto.randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  const key = fs.readFileSync(file, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("预览模型加密材料无效；请核对原文件，不能自动覆盖已有密钥");
  return key;
}

function createLocalModelPreviewFetch(nativeFetch, { resolveHost } = {}) {
  const counts = { blockedOutbound: 0, modelListRequests: 0, textRequests: 0, mediaGenerationCalls: 0 };
  const block = message => {
    counts.blockedOutbound++;
    throw Object.assign(new Error(message), { code: "PREVIEW_PROVIDER_BLOCKED", status: 400 });
  };
  async function previewFetch(input, options = {}) {
    let url;
    try { url = new URL(input); } catch { return block("当前验收预览无法识别该模型地址"); }
    const method = String(options.method || "GET").toUpperCase();
    if (url.protocol !== "https:" || url.hostname !== "api.xiaomimimo.com" || url.port || url.username || url.password || url.search || url.hash) {
      return block("当前验收预览仅开放小米 MiMo 官方模型列表与文字接口");
    }
    const isList = url.pathname === "/v1/models" && method === "GET";
    const isText = url.pathname === "/v1/chat/completions" && method === "POST";
    if (!isList && !isText) return block("当前验收预览仅开放模型列表与文字请求，媒体接口尚未开放");
    if (isText) {
      let payload;
      try { payload = JSON.parse(options.body); } catch { return block("文字请求格式无效"); }
      const budget = payload.max_completion_tokens ?? payload.max_tokens;
      if (payload.model !== "mimo-v2.6-flash" || payload.thinking?.type !== "disabled"
        || !Number.isSafeInteger(budget) || budget < 1 || budget > 4096 || payload.stream
        || payload.tools || payload.tool_choice || payload.functions || payload.function_call
        || !Array.isArray(payload.messages) || !payload.messages.length || payload.messages.length > 200
        || payload.messages.some(message => !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string")
        || Buffer.byteLength(options.body, "utf8") > 131072) {
        return block("当前验收预览支持 mimo-v2.6-flash 的纯文字请求：关闭思考，回复上限不超过4096，且不调用工具");
      }
    }
    let dispatcher;
    try {
      // Discovery already pins its checked DNS result. Text calls need the same
      // hostname/IP check here before any credential leaves the preview.
      dispatcher = options.dispatcher || await createProviderDispatcher(url, {
        isPrivateHost: isPrivateModelHost,
        resolveHost,
        signal: options.signal || AbortSignal.timeout(20000),
      });
      if (isList) counts.modelListRequests++; else counts.textRequests++;
      const response = await nativeFetch(url.href, { ...options, method, redirect: "error", dispatcher });
      // Consume the small JSON response before closing an owned dispatcher.
      if (options.dispatcher) return response;
      const body = await response.arrayBuffer();
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally { if (dispatcher && !options.dispatcher) await dispatcher.destroy(); }
  }
  return { fetch: previewFetch, counts };
}

module.exports = { createLocalModelPreviewFetch, loadPreviewEncryptionKey };
