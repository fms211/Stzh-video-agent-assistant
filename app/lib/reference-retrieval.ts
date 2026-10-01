import { ApiRequestError, authFetch, getToken } from "./auth.ts";

export type ReferenceOutcome<T> = {
  status: "available" | "empty" | "unavailable" | "invalid" | "skipped" | "discarded";
  results: T[];
  note?: string;
};

// These notes describe retrieval evidence, never approval or fact verification.
export function normalizeReferenceNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((note): note is string => typeof note === "string" && !!note.trim())
    .map(note => note.trim().slice(0, 240)))].slice(0, 12);
}

export function referenceStatusPrompt(notes: string[]): string {
  if (!notes.length) return "";
  return `【本步骤资料状态】\n${notes.map(note => `- ${note}`).join("\n")}\n请明确资料缺口，不要声称已经依据缺失资料核验，也不要编造来源。生成结果仍需核实。`;
}

export async function retrieveReferences<T>(
  path: string, options: RequestInit, isResult: (value: unknown) => value is T, source: "知识库" | "网络搜索",
): Promise<ReferenceOutcome<T>> {
  const token = getToken();
  const missing = source === "知识库" ? "知识库参考" : "网络参考";
  try {
    const data = await authFetch<{ results?: unknown; error?: unknown; provider?: unknown }>(path, options);
    if (token !== getToken()) return { status: "discarded", results: [] };
    if (data?.error || (data?.provider === "none" && Array.isArray(data.results) && !data.results.length)) {
      return { status: "unavailable", results: [], note: `${source}未提供可核验资料，本步骤没有${missing}。` };
    }
    if (!data || !Array.isArray(data.results) || !data.results.every(isResult)) {
      return { status: "invalid", results: [], note: `${source}返回的资料无法读取，本步骤没有${missing}。` };
    }
    return data.results.length
      ? { status: "available", results: data.results }
      : { status: "empty", results: [], note: `${source}未找到匹配资料，本步骤没有${missing}。` };
  } catch (error) {
    if (token !== getToken()) return { status: "discarded", results: [] };
    if (error instanceof ApiRequestError && error.code?.endsWith("_RESPONSE_INVALID")) {
      return { status: "invalid", results: [], note: `${source}返回的资料无法读取，本步骤没有${missing}。` };
    }
    if (error instanceof ApiRequestError && error.code === "SEARCH_UNCONFIRMED") {
      return { status: "unavailable", results: [], note: "网络搜索未提供可核验资料，本步骤没有网络参考。" };
    }
    return { status: "unavailable", results: [], note: `${source}暂不可用，本步骤没有${missing}。` };
  }
}
