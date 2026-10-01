"use strict";

const router = require("express").Router();
const { search } = require("../search-engines.js");
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const upstream = req => req.app.locals.referenceFetch || global.fetch;
const ragBase = () => (process.env.STZH_RAG_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const validQuery = value => typeof value === "string" && !!value.trim() && value.length <= 50_000;
function validRow(row) {
  return row && typeof row.id === "string" && typeof row.content === "string"
    && typeof row.score === "number" && Number.isFinite(row.score)
    && row.metadata && typeof row.metadata.source === "string" && typeof row.metadata.kb_type === "string"
    && (row.metadata.name_cn === undefined || typeof row.metadata.name_cn === "string")
    && (row.metadata.name_en === undefined || typeof row.metadata.name_en === "string");
}

// The Python index is a curated shared library. It does not contain account-private project records.
router.post("/api/rag/retrieve", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { query, top_k = 5, score_threshold = 0.45 } = req.body || {};
  if (!validQuery(query) || !Number.isInteger(top_k) || top_k < 1 || top_k > 20
    || typeof score_threshold !== "number" || !Number.isFinite(score_threshold) || score_threshold < 0 || score_threshold > 1) {
    return fail(res, 400, "RAG_INPUT_INVALID", "请提供有效的检索内容和范围");
  }
  try {
    const response = await upstream(req)(`${ragBase()}/rag/retrieve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), top_k, score_threshold }), signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) return fail(res, 502, "RAG_UPSTREAM_ERROR", "知识库服务未能完成检索");
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.results) || !data.results.every(validRow)) {
      return fail(res, 502, "RAG_RESPONSE_INVALID", "知识库返回的资料无法读取");
    }
    res.json({ results: data.results.slice(0, top_k), query: query.trim(), total: Math.min(data.results.length, top_k), scope: "shared" });
  } catch {
    return fail(res, 503, "RAG_UNAVAILABLE", "知识库暂不可用，请稍后重试");
  }
});

router.get("/api/rag/health", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const response = await upstream(req)(`${ragBase()}/rag/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return fail(res, 502, "RAG_UPSTREAM_ERROR", "知识库服务未能返回状态");
    const data = await response.json().catch(() => null);
    if (!data || !Number.isInteger(data.entries) || data.entries < 0) return fail(res, 502, "RAG_RESPONSE_INVALID", "知识库状态无法读取");
    if (data.status !== "ok" && data.ok !== true) return fail(res, 503, "RAG_UNAVAILABLE", "知识库尚未就绪");
    res.json({ ok: true, entries: data.entries, scope: "shared" });
  } catch { return fail(res, 503, "RAG_UNAVAILABLE", "知识库暂不可用，请稍后重试"); }
});

router.post("/api/search", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!validQuery(req.body?.query)) return fail(res, 400, "SEARCH_INPUT_INVALID", "请提供有效的搜索内容");
  try {
    const result = await (req.app.locals.referenceSearch || search)(req.body.query.trim(), { maxResults: 5 });
    if (!result || result.error || !Array.isArray(result.results)) return fail(res, 502, "SEARCH_RESPONSE_INVALID", "搜索返回的资料无法读取");
    // Current engines swallow individual provider errors. An empty 'none' result does not prove a successful search.
    if (result.provider === "none" && !result.results.length) return fail(res, 503, "SEARCH_UNCONFIRMED", "本次搜索未取得可核验资料，请稍后重试");
    res.json(result);
  } catch { return fail(res, 503, "SEARCH_UNAVAILABLE", "网络搜索暂不可用，请稍后重试"); }
});

module.exports = router;
