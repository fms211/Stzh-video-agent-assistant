// Server-acknowledged tombstones are account scoped and shared across tabs.
// Consult storage at commit time, so a response started before deletion cannot
// restore a retired session after another tab completes the sweep.
const key = (scope: string) => `tszh:v2:${scope}:history-retired`;
function retired(scope: string): string[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(key(scope));
  if (raw === null) return [];
  const ids: unknown = JSON.parse(raw);
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw new Error("历史清理记录无效，请重新同步");
  return ids;
}
export function isHistoryRetired(scope: string, id: string) {
  return retired(scope).includes(id);
}
export function assertHistoryAvailable(scope: string, id: string) {
  if (isHistoryRetired(scope, id)) throw new Error("此对话已按保留策略清理，请开始新对话");
}
export function markHistoryRetired(scope: string, ids: string[]) {
  if (!ids.length) return;
  localStorage.setItem(key(scope), JSON.stringify([...new Set([...retired(scope), ...ids])]));
}
