import { getToken, resolveApiBase } from "./auth";
import { currentDataOwner, ownerScope } from "./data-owner";

export type RetentionPolicy = { enabled: boolean; days: number };
const scope = () => ownerScope(currentDataOwner(localStorage));
async function request<T>(path = "", body?: unknown): Promise<T> {
  const token = getToken(), originalScope = scope();
  if (!token || originalScope === "guest") throw new Error("请登录后设置历史清理");
  const base = resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location);
  const response = await fetch(`${base}/api/history-retention${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (token !== getToken() || originalScope !== scope()) throw new Error("账户已切换，旧账户操作结果未应用");
  if (!response.ok) throw new Error(data?.error?.message || `历史清理服务暂不可用（${response.status}）`);
  return data as T;
}
function checkPolicy(data: { policy: RetentionPolicy }) {
  if (typeof data?.policy?.enabled !== "boolean" || !Number.isSafeInteger(data?.policy?.days) || data.policy.days < 1 || data.policy.days > 90) throw new Error("清理策略响应无效，请重新读取");
  return data.policy;
}
export async function readRetentionPolicy() { return checkPolicy(await request<{ policy: RetentionPolicy }>()); }
export async function saveRetentionPolicy(policy: RetentionPolicy, confirm: boolean) {
  const saved = checkPolicy(await request<{ policy: RetentionPolicy }>("", { ...policy, confirm }));
  window.dispatchEvent(new Event("tszh_history_retention_policy_changed"));
  return saved;
}
export async function sweepHistory() {
  const owner = scope();
  const activeKeys = [`tszh:v2:${owner}:active`, `tszh:v2:opc:${owner}:active`, `tszh:v2:opc:${owner}:active:workflow`];
  const sessionIds = [...new Set(activeKeys.map(key => localStorage.getItem(key)).filter((id): id is string => !!id))];
  // Stable per-tab identity protects simultaneous tabs independently. Sessions
  // of offline clients retain their protection until that client changes them.
  const key = `tszh:retention-client:${owner}`;
  let clientId = sessionStorage.getItem(key);
  if (!clientId) { clientId = crypto.randomUUID(); sessionStorage.setItem(key, clientId); }
  const result = await request<{ expiredIds: string[]; deferred?: string }>("/sweep", { clientId, sessionIds });
  if (!Array.isArray(result?.expiredIds) || result.expiredIds.some(id => typeof id !== "string" || !id) || result.expiredIds.some(id => sessionIds.includes(id))) throw new Error("清理响应无效，当前本地历史已保留");
  const expired = new Set(result.expiredIds);
  let changed = false;
  for (const listKey of [`tszh:v2:${owner}:sessions`, `tszh:v2:opc:${owner}:sessions`]) {
    const raw = localStorage.getItem(listKey);
    if (!raw) continue;
    let sessions: unknown;
    try { sessions = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(sessions)) continue;
    const retained = sessions.filter(item => !item || typeof item.id !== "string" || !expired.has(item.id));
    if (retained.length !== sessions.length) { localStorage.setItem(listKey, JSON.stringify(retained)); changed = true; }
  }
  for (const id of expired) {
    for (const itemKey of [`tszh:v2:${owner}:messages:${id}`, `tszh:v2:opc:${owner}:msg_${id}`, `tszh:v2:opc:${owner}:msg_${id}:synced`]) {
      if (localStorage.getItem(itemKey) !== null) { localStorage.removeItem(itemKey); changed = true; }
    }
  }
  if (changed) window.dispatchEvent(new Event("tszh_history_retention_changed"));
  return result;
}
