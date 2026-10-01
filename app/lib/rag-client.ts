// RAG 检索客户端 — 通过已鉴权的 Web 后端访问共享知识库。
import { authFetch, getToken } from "./auth.ts";
import { retrieveReferences, type ReferenceOutcome } from "./reference-retrieval.ts";

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

// The Web backend owns the Python service address; visitors use the same origin.
const RAG_BASE_URL = "/api";

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
 * @returns 兼容原有数组接口；界面应使用 ragRetrieveOutcome 展示资料状态。
 */
export async function ragRetrieve(
  query: string,
  topK: number = 5,
  scoreThreshold: number = 0.45,
  force: boolean = false,
): Promise<RagResult[]> {
  return (await ragRetrieveOutcome(query, topK, scoreThreshold, force)).results;
}

export async function ragRetrieveOutcome(query: string, topK = 5, scoreThreshold = 0.45, force = false): Promise<ReferenceOutcome<RagResult>> {
  if (!force && !shouldRetrieve(query)) return { status: "skipped", results: [], note: "本步骤未请求知识库。" };
  return retrieveReferences(`${RAG_BASE_URL}/rag/retrieve`, {
    method: "POST", body: JSON.stringify({ query, top_k: topK, score_threshold: scoreThreshold }),
    signal: AbortSignal.timeout(120000),
  }, isRagResult, "知识库");
}

function isRagResult(value: unknown): value is RagResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RagResult>, metadata = row.metadata;
  return typeof row.id === "string" && typeof row.content === "string" && typeof row.score === "number" && Number.isFinite(row.score)
    && !!metadata && typeof metadata.source === "string" && typeof metadata.kb_type === "string"
    && (metadata.name_cn === undefined || typeof metadata.name_cn === "string")
    && (metadata.name_en === undefined || typeof metadata.name_en === "string");
}

/**
 * ReAct 多轮检索（简化版）
 *
 * 如果第一轮检索结果质量不高（最高分 < 0.6 或结果数 < 2），
 * 自动进行第二轮检索，使用更具体的查询。
 *
 * @param query 原始用户查询
 * @param topK 返回条数
 * @param force 是否强制检索
 * @returns 合并后的检索结果
 */
export async function ragRetrieveWithReact(
  query: string,
  topK: number = 5,
  force: boolean = false,
): Promise<RagResult[]> {
  // 第一轮检索
  const firstRound = await ragRetrieve(query, topK, 0.45, force);

  // 如果第一轮结果质量好，直接返回
  if (firstRound.length >= 2 && firstRound[0]?.score >= 0.6) {
    return firstRound;
  }

  // 第二轮：尝试更具体的查询
  const refinedQuery = refineQuery(query, firstRound);
  if (refinedQuery === query) {
    // 没有改进空间，返回第一轮结果
    return firstRound;
  }

  const secondRound = await ragRetrieve(refinedQuery, topK, 0.45, force);

  // 合并两轮结果，去重，保留最高分
  const merged = new Map<string, RagResult>();
  for (const r of firstRound) {
    merged.set(r.id, r);
  }
  for (const r of secondRound) {
    const existing = merged.get(r.id);
    if (!existing || r.score > existing.score) {
      merged.set(r.id, r);
    }
  }

  // 按分数排序，返回 topK
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * 根据第一轮结果优化查询
 * 如果第一轮找到了相关知识，用该知识的关键词补充查询
 */
function refineQuery(originalQuery: string, firstRoundResults: RagResult[]): string {
  if (firstRoundResults.length === 0) {
    return originalQuery;
  }

  // 从第一轮结果中提取关键词
  const topResult = firstRoundResults[0];
  const nameCn = topResult.metadata.name_cn;
  const nameEn = topResult.metadata.name_en;

  // 如果已经有很好的匹配，不需要改进
  if (topResult.score >= 0.7) {
    return originalQuery;
  }

  // 用找到的知识名称补充查询
  if (nameCn && !originalQuery.includes(nameCn)) {
    return `${originalQuery} ${nameCn}`;
  }
  if (nameEn && !originalQuery.includes(nameEn)) {
    return `${originalQuery} ${nameEn}`;
  }

  return originalQuery;
}

/**
 * 检查 RAG 服务是否可用
 */
export async function ragHealthCheck(): Promise<{ ok: boolean; entries: number }> {
  const token = getToken();
  try {
    const data = await authFetch<{ ok: boolean; entries: number }>(`${RAG_BASE_URL}/rag/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (token !== getToken() || data.ok !== true || !Number.isInteger(data.entries) || data.entries < 0) return { ok: false, entries: 0 };
    return { ok: true, entries: data.entries };
  } catch {
    return { ok: false, entries: 0 };
  }
}

/**
 * 将 RAG 结果格式化为可注入 system prompt 的文本
 */
export function formatRagContext(results: RagResult[]): string {
  if (results.length === 0) return "";

  const lines = ["## 共享知识库参考（检索资料，不代表当前项目的私有记录或已核验事实）", ""];
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
