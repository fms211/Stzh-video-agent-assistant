import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 多引擎混合搜索 — Google(SerpApi) + 百度API + 搜狗 + GitHub
// Dev 模式下 Next.js API route 处理
// 生产模式下由 server-express.js 的 /api/search 处理

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || "";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── 缓存（10 分钟 TTL） ───
const CACHE = new Map<string, { result: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getCached(key: string) {
  const entry = CACHE.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL) { CACHE.delete(key); return null; }
  return entry.result;
}

function setCache(key: string, result: unknown) {
  if (CACHE.size >= 200) { const oldest = CACHE.keys().next().value; if (oldest) CACHE.delete(oldest); }
  CACHE.set(key, { result, ts: Date.now() });
}

// ─── 质量门 ───

const SPAM_DOMAINS = ["youtube.com", "facebook.com", "twitter.com", "instagram.com", "tiktok.com", "pinterest.com", "reddit.com"];

function sourceAuthority(url: string) {
  const d = url.toLowerCase();
  if (d.includes("github.com") || d.includes("arxiv.org")) return 1.0;
  if (d.includes("stackoverflow.com") || d.includes("medium.com")) return 0.8;
  if (d.includes("csdn.net") || d.includes("cnblogs.com") || d.includes("zhihu.com")) return 0.7;
  if (d.includes("blog") || d.includes("docs")) return 0.5;
  return 0.3;
}

function textRelevance(text: string, query: string) {
  if (!text || !query) return 0;
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) { if (lower.includes(kw)) hits++; }
  return keywords.length > 0 ? hits / keywords.length : 0;
}

interface RawResult { title: string; snippet: string; url: string; source?: string }

function applyQualityGate(results: RawResult[], query: string, max = 5) {
  let filtered = results.filter(r => {
    if (!r.title || r.title.length < 3 || !r.url?.startsWith("http")) return false;
    for (const spam of SPAM_DOMAINS) { if (r.url.toLowerCase().includes(spam)) return false; }
    return true;
  });
  const seen = new Set<string>();
  filtered = filtered.filter(r => { const key = r.url.split("?")[0]; if (seen.has(key)) return false; seen.add(key); return true; });
  filtered = filtered.map(r => {
    const score = Math.round(textRelevance(r.title, query) * 30 + textRelevance(r.snippet, query) * 15 + sourceAuthority(r.url) * 25 + Math.min((r.snippet || "").length / 100, 1) * 10 + (r.url.split("/").length > 3 ? 10 : 0));
    return { ...r, score: Math.min(score, 100) };
  });
  filtered.sort((a, b) => (b as any).score - (a as any).score);
  const domainCount: Record<string, number> = {};
  filtered = filtered.filter(r => { const d = new URL(r.url).hostname; domainCount[d] = (domainCount[d] || 0) + 1; return domainCount[d] <= 2; });
  return filtered.slice(0, max);
}

// ─── 搜索引擎 ───

async function searchSerpApi(query: string, engine = "google", max = 5): Promise<RawResult[]> {
  if (!SERPAPI_KEY) return [];
  try {
    const params = new URLSearchParams({ q: query, api_key: SERPAPI_KEY, engine, num: String(max) });
    if (engine === "google") { params.set("gl", "cn"); params.set("hl", "zh-cn"); }
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data as any).organic_results || (data as any).results || []).map((r: any) => ({
      title: r.title || "", snippet: (r.snippet || r.description || "").slice(0, 300), url: r.link || r.url || "", source: engine,
    }));
  } catch { return []; }
}

async function searchBaiduApi(query: string, max = 5): Promise<RawResult[]> {
  if (!BAIDU_API_KEY) return [];
  try {
    const res = await fetch("https://qianfan.baidubce.com/v2/ai_search/web_search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${BAIDU_API_KEY}` },
      body: JSON.stringify({ messages: [{ role: "user", content: query }], search_source: "baidu_search_v2", resource_type_filter: [{ type: "web", top_k: max }], search_recency_filter: "year" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data as any).references || []).slice(0, max).map((r: any) => ({ title: r.title || "", snippet: (r.content || "").slice(0, 300), url: r.url || "", source: "baidu" }));
  } catch { return []; }
}

async function searchGitHub(query: string, max = 5): Promise<RawResult[]> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json", "User-Agent": "STZH-Agent/1.0" };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const params = new URLSearchParams({ q: query, sort: "stars", order: "desc", per_page: String(max) });
    const res = await fetch(`https://api.github.com/search/repositories?${params}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data as any).items || []).map((r: any) => ({ title: `${r.full_name} ⭐${r.stargazers_count}`, snippet: (r.description || "(无描述)").slice(0, 300), url: r.html_url, source: "github" }));
  } catch { return []; }
}

function decodeSogouUrl(raw: string) {
  if (!raw) return "";
  try {
    const decoded = decodeURIComponent(raw);
    const m = decoded.match(/(?:sogou\.com)?\/link\?url=([^&"\s]+)/i);
    if (m) return decodeURIComponent(m[1]);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {}
  return "";
}

async function searchSogou(query: string, max = 5): Promise<RawResult[]> {
  try {
    const res = await fetch(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow", signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (html.includes("antispider") || html.includes("验证码")) return [];
    const results: RawResult[] = [];
    const seen = new Set<string>();
    const blockRegex = /<(?:div|section)[^>]*class="[^"]*(?:vrwrap|rb)[^"]*"[\s\S]*?(?=<(?:div|section)[^>]*class="[^"]*(?:vrwrap|rb)|<\/body)/gi;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(html)) !== null && results.length < max) {
      const block = blockMatch[0];
      const titleMatch = block.match(/<a[^>]*(?:class="[^"]*(?:vrTitle|og)[^"]*"|href="[^"]*")[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      if (!title || title.includes("搜狗")) continue;
      const dataUrlMatch = block.match(/data-url="([^"]+)"/);
      const hrefMatch = block.match(/<a[^>]+href="([^"]+)"/);
      const rawUrl = dataUrlMatch?.[1] || hrefMatch?.[1] || "";
      const url = decodeSogouUrl(rawUrl);
      if (!url || seen.has(url)) continue;
      const snippetMatch = block.match(/<(?:p|div|span)[^>]*class="[^"]*(?:vrDesc|str[_-]?info|space-txt|desc|summary)[^"]*"[\s\S]*?>([\s\S]*?)<\/(?:p|div|span)>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 300) : "";
      seen.add(url);
      results.push({ title, snippet, url, source: "sogou" });
    }
    return results;
  } catch { return []; }
}

async function searchBing(query: string, max = 5): Promise<RawResult[]> {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${max}`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow", signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = new TextDecoder("utf-8").decode(await res.arrayBuffer());
    const results: RawResult[] = [];
    const itemRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null && results.length < max) {
      const block = match[1];
      const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const title = linkMatch[2].replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, "").trim();
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, "").trim().slice(0, 300) : "";
      if (title && linkMatch[1].startsWith("http")) results.push({ title, snippet, url: linkMatch[1], source: "bing" });
    }
    return results;
  } catch { return []; }
}

function isGitHubQuery(q: string) {
  const l = q.toLowerCase();
  return l.includes("github") || l.includes("开源") || l.includes("项目") || l.includes("repo") || l.includes("仓库") || l.includes("star") || l.includes("工具") || l.includes("框架") || l.includes("库");
}

// ─── 主搜索函数（混合搜索） ───

async function searchMulti(query: string) {
  const cacheKey = `search:${query.trim().toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const tasks: Promise<RawResult[]>[] = [];

  // GitHub 相关查询加 GitHub 搜索
  if (isGitHubQuery(query)) tasks.push(searchGitHub(query));

  // 并行调用 3 个主要引擎
  tasks.push(searchSerpApi(query, "google"));
  tasks.push(searchBaiduApi(query));
  tasks.push(searchSogou(query));

  const allResults = await Promise.allSettled(tasks);
  let rawResults: RawResult[] = [];
  const providers: string[] = [];

  for (const r of allResults) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      rawResults.push(...r.value);
      providers.push(r.value[0]?.source || "unknown");
    }
  }

  const results = applyQualityGate(rawResults, query);
  const result = { provider: [...new Set(providers)].join("+") || "none", query, results, total: results.length };
  setCache(cacheKey, result);
  return result;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const query = body?.query?.trim();
  if (!query) return NextResponse.json({ results: [] });
  try {
    const result = await searchMulti(query);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ results: [], error: err instanceof Error ? err.message : "Search failed" });
  }
}
