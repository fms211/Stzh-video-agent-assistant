// DuckDuckGo 网页搜索 — 通过 Next.js API 代理（绕过 CORS）

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
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
    lines.push(`${i + 1}. **${r.title}**`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push(`   来源: ${r.url}`);
    lines.push("");
  });
  return lines.join("\n");
}

// 通过后端代理执行搜索
export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// 搜索 + 格式化（一步到位）
export async function searchAndFormat(query: string): Promise<string> {
  const results = await searchWeb(query);
  return formatSearchResults(results);
}
