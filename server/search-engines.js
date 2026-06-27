// ═══ 多引擎搜索模块 ═══
// 支持：Google(SerpApi) / 百度API / GitHub / 搜狗 / Bing(兜底) / Yahoo / Yandex / DuckDuckGo
// 共享质量门 + 10 分钟缓存 + 混合搜索

// ─── 配置（从环境变量读取） ───

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || "";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── 缓存（10 分钟 TTL，LRU 淘汰，最多 200 条） ───

const CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_SIZE = 200;

function getCached(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return entry.result;
}

function setCache(key, result) {
  if (CACHE.size >= CACHE_MAX_SIZE) {
    const oldestKey = CACHE.keys().next().value;
    if (oldestKey !== undefined) CACHE.delete(oldestKey);
  }
  CACHE.set(key, { result, ts: Date.now() });
}

// ─── 质量门（参考 TaskFlow search-quality.ts） ───

// 垃圾域名黑名单
const SPAM_DOMAINS = new Set([
  "youtube.com", "facebook.com", "twitter.com", "instagram.com",
  "tiktok.com", "pinterest.com", "reddit.com",
]);

// 来源权威度评分
function sourceAuthority(url) {
  const domain = url.toLowerCase();
  if (domain.includes("github.com") || domain.includes("arxiv.org")) return 1.0;
  if (domain.includes("stackoverflow.com") || domain.includes("medium.com")) return 0.8;
  if (domain.includes("csdn.net") || domain.includes("cnblogs.com") || domain.includes("zhihu.com")) return 0.7;
  if (domain.includes("baidu.com") || domain.includes("wikipedia.org")) return 0.6;
  if (domain.includes("blog") || domain.includes("docs")) return 0.5;
  return 0.3;
}

// 标题/摘要与查询的相关性（简单关键词匹配）
function textRelevance(text, query) {
  if (!text || !query) return 0;
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
  }
  return keywords.length > 0 ? hits / keywords.length : 0;
}

function applyQualityGate(results, query, maxResults = 5) {
  // 1. 垃圾过滤
  let filtered = results.filter(r => {
    if (!r.title || r.title.length < 3) return false;
    if (!r.url || !r.url.startsWith("http")) return false;
    const domain = r.url.toLowerCase();
    for (const spam of SPAM_DOMAINS) {
      if (domain.includes(spam)) return false;
    }
    return true;
  });

  // 2. URL 去重
  const seen = new Set();
  filtered = filtered.filter(r => {
    const key = r.url.split("?")[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 3. 加权打分（满分 100）
  filtered = filtered.map(r => {
    const titleRel = textRelevance(r.title, query) * 30;
    const snippetRel = textRelevance(r.snippet, query) * 15;
    const authority = sourceAuthority(r.url) * 25;
    const snippetRich = Math.min((r.snippet || "").length / 100, 1) * 10;
    const isContentPage = r.url.split("/").length > 3 ? 10 : 0;
    const score = Math.round(titleRel + snippetRel + authority + snippetRich + isContentPage);
    return { ...r, score: Math.min(score, 100) };
  });

  // 4. 按分排序
  filtered.sort((a, b) => b.score - a.score);

  // 5. 同域名限制（最多 2 条）
  const domainCount = {};
  filtered = filtered.filter(r => {
    const domain = new URL(r.url).hostname;
    domainCount[domain] = (domainCount[domain] || 0) + 1;
    return domainCount[domain] <= 2;
  });

  return filtered.slice(0, maxResults);
}

// ─── SerpApi 通用搜索（支持 Google/Yahoo/Yandex/DuckDuckGo/Bing） ───

async function searchSerpApi(query, engine = "google", maxResults = 5) {
  if (!SERPAPI_KEY) return [];
  try {
    const params = new URLSearchParams({
      q: query,
      api_key: SERPAPI_KEY,
      engine,
      num: String(maxResults),
    });
    // Google 特有参数
    if (engine === "google") { params.set("gl", "cn"); params.set("hl", "zh-cn"); }
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic_results || data.results || []).map(r => ({
      title: r.title || "",
      snippet: (r.snippet || r.description || "").slice(0, 300),
      url: r.link || r.url || "",
      source: engine,
    }));
  } catch {
    return [];
  }
}

// ─── 百度搜索 API（官方 API，免费 100次/天） ───
// web_search: 返回原始搜索结果（更适合注入 LLM）
// chat/completions: 返回 AI 生成答案 + 引用（备用）

async function searchBaiduApi(query, maxResults = 5) {
  if (!BAIDU_API_KEY) return [];
  try {
    // 优先用 web_search（原始搜索结果）
    const res = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BAIDU_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: query }],
        search_source: "baidu_search_v2",
        resource_type_filter: [{ type: "web", top_k: maxResults }],
        search_recency_filter: "year",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.references || []).slice(0, maxResults).map(r => ({
      title: r.title || "",
      snippet: (r.content || "").slice(0, 300),
      url: r.url || "",
      source: "baidu",
    }));
  } catch {
    return [];
  }
}

// ─── GitHub 搜索（官方 Search API，免费） ───

async function searchGitHub(query, maxResults = 5) {
  try {
    const headers = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "STZH-Agent/1.0",
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    // 搜仓库
    const params = new URLSearchParams({
      q: query,
      sort: "stars",
      order: "desc",
      per_page: String(maxResults),
    });
    const res = await fetch(`https://api.github.com/search/repositories?${params}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(r => ({
      title: `${r.full_name} ⭐${r.stargazers_count}`,
      snippet: (r.description || "(无描述)").slice(0, 300),
      url: r.html_url,
      source: "github",
    }));
  } catch {
    return [];
  }
}

// ─── 搜狗搜索（国内直连，免费） ───

function decodeSogouUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const decoded = decodeURIComponent(rawUrl);
    const linkMatch = decoded.match(/(?:sogou\.com)?\/link\?url=([^&"\s]+)/i);
    if (linkMatch) return decodeURIComponent(linkMatch[1]);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {}
  return "";
}

async function searchSogou(query, maxResults = 5) {
  try {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // 检测反爬验证码
    if (html.includes("antispider") || html.includes("验证码")) return [];

    const results = [];
    const seen = new Set();

    // 方法 1: vrwrap/rb 容器分块解析
    const blockRegex = /<(?:div|section)[^>]*class="[^"]*(?:vrwrap|rb)[^"]*"[\s\S]*?(?=<(?:div|section)[^>]*class="[^"]*(?:vrwrap|rb)|<\/body)/gi;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(html)) !== null && results.length < maxResults) {
      const block = blockMatch[0];
      const titleMatch = block.match(/<a[^>]*(?:class="[^"]*(?:vrTitle|og)[^"]*"|href="[^"]*")[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      if (!title || title.includes("搜狗")) continue;
      const dataUrlMatch = block.match(/data-url="([^"]+)"/);
      const hrefMatch = block.match(/<a[^>]+href="([^"]+)"/);
      const rawUrl = dataUrlMatch?.[1] || hrefMatch?.[1] || "";
      const decodedUrl = decodeSogouUrl(rawUrl);
      if (!decodedUrl || seen.has(decodedUrl)) continue;
      const snippetMatch = block.match(/<(?:p|div|span)[^>]*class="[^"]*(?:vrDesc|str[_-]?info|space-txt|desc|summary)[^"]*"[\s\S]*?>([\s\S]*?)<\/(?:p|div|span)>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 300) : "";
      seen.add(decodedUrl);
      results.push({ title, snippet, url: decodedUrl, source: "sogou" });
    }

    // 方法 2: 通用兜底
    if (results.length === 0) {
      const genericRegex = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>([\s\S]*?)(?=<h3|<\/div>\s*<\/div>)/gi;
      let m;
      while ((m = genericRegex.exec(html)) !== null && results.length < maxResults) {
        const decodedUrl = decodeSogouUrl(m[1]);
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        const snippetBlock = m[3];
        const spMatch = snippetBlock.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const snippet = spMatch ? spMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 300) : "";
        if (title && decodedUrl && !seen.has(decodedUrl) && !title.includes("搜狗")) {
          seen.add(decodedUrl);
          results.push({ title, snippet, url: decodedUrl, source: "sogou" });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Bing 搜索（HTML 抓取，兜底） ───

async function searchBing(query, maxResults = 5) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.bing.com/search?q=${encoded}&count=${maxResults}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const buffer = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buffer);

    const results = [];
    const itemRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null && results.length < maxResults) {
      const block = match[1];
      const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const linkUrl = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]+>/g, "").replace(/&ensp;/g, " ").replace(/&#\d+;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").replace(/&ensp;/g, " ").replace(/&#\d+;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim().slice(0, 300) : "";
      if (title && linkUrl && linkUrl.startsWith("http")) results.push({ title, snippet, url: linkUrl, source: "bing" });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── 搜索意图判断 ───

function isGitHubQuery(query) {
  const lower = query.toLowerCase();
  return lower.includes("github") || lower.includes("开源") || lower.includes("项目") ||
    lower.includes("repo") || lower.includes("仓库") || lower.includes("star") ||
    lower.includes("工具") || lower.includes("框架") || lower.includes("库");
}

// ─── 主搜索函数（混合搜索 + 质量门） ───

async function search(query, options = {}) {
  const { maxResults = 5 } = options;
  const cacheKey = `search:${query.trim().toLowerCase()}`;

  // 缓存检查
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 混合搜索：并行调用多个引擎
  const tasks = [];

  // GitHub 相关查询加 GitHub 搜索
  if (isGitHubQuery(query)) {
    tasks.push(searchGitHub(query, maxResults));
  }

  // 并行调用 3 个主要引擎
  tasks.push(searchSerpApi(query, "google", maxResults));
  tasks.push(searchBaiduApi(query, maxResults));
  tasks.push(searchSogou(query, maxResults));

  // 并行执行，取所有结果
  const allResults = await Promise.allSettled(tasks);
  let rawResults = [];
  const providers = [];

  for (const r of allResults) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      rawResults.push(...r.value);
      providers.push(r.value[0]?.source || "unknown");
    }
  }

  // 质量门（合并后统一打分、去重、排序）
  const results = applyQualityGate(rawResults, query, maxResults);
  const result = {
    provider: [...new Set(providers)].join("+") || "none",
    query,
    results,
    total: results.length,
  };

  setCache(cacheKey, result);
  return result;
}

module.exports = {
  search,
  searchSerpApi,
  searchBaiduApi,
  searchGitHub,
  searchSogou,
  searchBing,
  applyQualityGate,
};
