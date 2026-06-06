// RAG 检索客户端 — 调用本地 Python RAG 服务

export interface RagResult {
  id: string;
  content: string;
  metadata: {
    source: string;
    kb_type: string;
    name_cn?: string;
    name_en?: string;
    kb_id?: string;
  };
  score: number;
}

export interface RagResponse {
  results: RagResult[];
  query: string;
  total: number;
}

const RAG_BASE_URL = "http://localhost:5000";

// 对话性/元请求关键词 — 这些消息不需要检索知识库
const CONVERSATIONAL_PATTERNS = [
  /^(好的?|ok|嗯|哦|知道了|明白|谢谢|感谢|收到)/i,
  /^(继续|总结|接下来|然后呢|还有什么|再来说|回到)/,
  /^(请总结|帮我总结|总结一下|归纳一下|梳理一下)/,
  /^(深入|详细说说|展开讲讲|具体一点)/,
  /^(你觉得|你认为|你怎么看|你的建议)/,
  /^(基于以上|根据上面|承接上文|回到刚才)/,
  /^(清空|重置|重新开始|换个话题)/,
];

/**
 * 判断是否需要 RAG 检索
 * 对话性/元请求消息跳过检索，避免返回不相关的噪音结果
 */
function shouldRetrieve(query: string): boolean {
  const trimmed = query.trim();
  // 太短的消息（< 6字）通常不是知识查询
  if (trimmed.length < 6) return false;
  // 匹配对话性模式
  if (CONVERSATIONAL_PATTERNS.some((p) => p.test(trimmed))) return false;
  return true;
}

/**
 * 调用 RAG 检索服务（带意图判断）
 * @param query 用户查询
 * @param topK 返回条数
 * @param scoreThreshold 最低相似度
 * @param force 是否强制检索（工作流步骤传 true，跳过意图判断）
 * @returns 检索结果，服务不可用或不需要检索时返回空数组
 */
export async function ragRetrieve(
  query: string,
  topK: number = 5,
  scoreThreshold: number = 0.45,
  force: boolean = false,
): Promise<RagResult[]> {
  // 意图判断：非知识查询直接跳过（force=true 时跳过此检查）
  if (!force && !shouldRetrieve(query)) return [];
  try {
    const res = await fetch(`${RAG_BASE_URL}/rag/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: topK, score_threshold: scoreThreshold }),
      signal: AbortSignal.timeout(3000), // 3秒超时，避免阻塞对话
    });

    if (!res.ok) return [];

    const data: RagResponse = await res.json();
    return data.results;
  } catch {
    // RAG 服务不可用时静默降级
    return [];
  }
}

/**
 * 检查 RAG 服务是否可用
 */
export async function ragHealthCheck(): Promise<{ ok: boolean; entries: number }> {
  try {
    const res = await fetch(`${RAG_BASE_URL}/rag/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { ok: false, entries: 0 };
    return await res.json();
  } catch {
    return { ok: false, entries: 0 };
  }
}

/**
 * 将 RAG 结果格式化为可注入 system prompt 的文本
 */
export function formatRagContext(results: RagResult[]): string {
  if (results.length === 0) return "";

  const lines = ["## 相关知识库参考（由 RAG 检索）", ""];
  for (const r of results) {
    const label = r.metadata.name_cn
      ? `${r.metadata.name_cn}${r.metadata.name_en ? ` / ${r.metadata.name_en}` : ""}`
      : r.metadata.source;
    lines.push(`### [${r.metadata.kb_type}] ${label}（相似度: ${(r.score * 100).toFixed(0)}%）`);
    lines.push(r.content);
    lines.push("");
  }
  return lines.join("\n");
}
