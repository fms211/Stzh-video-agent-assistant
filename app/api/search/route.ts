import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Bing 搜索代理 — 国内可访问，服务端请求无 CORS 限制

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const query = body?.query?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.bing.com/search?q=${encoded}&count=8`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ results: [], error: `Search failed: ${res.status}` });
    }

    const buffer = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buffer);
    const results = parseBingHtml(html);

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({
      results: [],
      error: err instanceof Error ? err.message : "Search failed",
    });
  }
}

function parseBingHtml(html: string): { title: string; url: string; snippet: string }[] {
  const results: { title: string; url: string; snippet: string }[] = [];

  // Bing 结果在 <li class="b_algo"> 中
  const itemRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null && results.length < 8) {
    const block = match[1];

    // 提取标题和链接 — <h2><a href="...">title</a></h2>
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = linkMatch[1];
    const title = linkMatch[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&ensp;/g, " ")
      .replace(/&#\d+;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

    // 提取摘要 — <p> 或 <div class="b_caption"><p>
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch
      ? snippetMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&ensp;/g, " ")
          .replace(/&#\d+;/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .trim()
      : "";

    if (title && url && url.startsWith("http")) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}
