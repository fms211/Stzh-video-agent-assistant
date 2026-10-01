// 多引擎网页搜索 — Google(SerpApi) → 搜狗 → Bing + GitHub
// 通过已鉴权的 Web 后端代理。
import { retrieveReferences, type ReferenceOutcome } from "./reference-retrieval.ts";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  source?: string;
};

// 需要搜索的关键词
const SEARCH_TRIGGERS = [
  "搜索", "查一下", "查找", "搜一下", "帮我搜", "网上", "最新", "新闻",
  "资讯", "趋势", "动态", "进展", "前沿", "最近", "今年", "2024", "2025", "2026",
  "search", "find", "look up", "latest", "news", "trend", "recent",
  "github", "开源", "工具", "推荐", "对比", "评测",
];

// 判断是否需要搜索
export function shouldSearch(query: string): boolean {
  const lower = query.toLowerCase();
  return SEARCH_TRIGGERS.some((t) => lower.includes(t));
}

// 搜索结果格式化为 LLM 可读的文本
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "";
  const lines = ["## 网络搜索结果（实时获取）", ""];
  results.forEach((r, i) => {
    const score = r.score !== undefined ? ` [质量分:${r.score}]` : "";
    const source = r.source ? ` (${r.source})` : "";
    lines.push(`${i + 1}. **${r.title}**${score}${source}`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push(`   来源: ${r.url}`);
    lines.push("");
  });
  return lines.join("\n");
}

// 通过后端代理执行搜索
export async function searchWeb(query: string): Promise<SearchResult[]> {
  return (await searchWebOutcome(query)).results;
}

export async function searchWebOutcome(query: string): Promise<ReferenceOutcome<SearchResult>> {
  if (!query.trim()) return { status: "skipped", results: [], note: "本步骤未请求网络搜索。" };
  return retrieveReferences("/api/search", {
    method: "POST", body: JSON.stringify({ query }), signal: AbortSignal.timeout(12000),
  }, isSearchResult, "网络搜索");
}

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SearchResult>;
  if (typeof row.title !== "string" || typeof row.url !== "string" || typeof row.snippet !== "string"
    || (row.score !== undefined && (typeof row.score !== "number" || !Number.isFinite(row.score)))
    || (row.source !== undefined && typeof row.source !== "string")) return false;
  try { return ["http:", "https:"].includes(new URL(row.url).protocol); } catch { return false; }
}

// 搜索 + 格式化（一步到位）
export async function searchAndFormat(query: string): Promise<string> {
  const results = await searchWeb(query);
  return formatSearchResults(results);
}
