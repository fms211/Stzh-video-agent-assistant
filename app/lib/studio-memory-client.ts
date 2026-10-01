"use client";
import { captureCreativeApi } from "./creative-agent-api";
import type { StudioMemoryItem, StudioMode, MemoryScope } from "../../shared/studio-context/index.cjs";
export type MemoryRow = StudioMemoryItem & { sourceAvailable?: boolean; sourceState?: "manual" | "current" | "changed" | "untracked" | "unavailable" };
export type MemorySourcePreview = { state: MemoryRow["sourceState"]; content: string; fingerprint: string | null; truncated: boolean };
export type MemoryDraft = { content: string; scope: MemoryScope; slot: string; claimKind: StudioMemoryItem["claimKind"] };
export const emptyMemoryDraft = (): MemoryDraft => ({ content: "", scope: { kind: "user" }, slot: "", claimKind: "preference" });
export const draftFromMemory = (item: MemoryRow): MemoryDraft => ({ content: item.content, scope: item.scope, slot: item.slot || "", claimKind: item.claimKind });
export function memoryState(item: MemoryRow, now = Date.now()) {
  if (item.sourceState === "changed" || item.sourceState === "untracked") return "来源待复核";
  if (item.sourceAvailable === false) return "来源已失效";
  if (item.expiresAt && Date.parse(item.expiresAt) <= now) return "已过期";
  if (!item.enabled) return "已停用";
  return item.status === "confirmed" ? "已确认" : item.status === "superseded" ? "已替换" : "待确认";
}
export function createMemorySaveAttempt(mode: StudioMode, draft: MemoryDraft, requestKey = crypto.randomUUID()) {
  return { requestKey, mode, content: draft.content.trim(), scope: draft.scope, claimKind: draft.claimKind, ...(draft.slot ? { slot: draft.slot } : {}) };
}
export function captureStudioMemoryClient(request = captureCreativeApi()) {
  const base = "/api/studio/memories";
  const path = (id: string) => `${base}/${encodeURIComponent(id)}`;
  return {
    list: (after = "") => request<{ items: MemoryRow[]; nextCursor: string | null }>(`${base}?limit=50${after ? `&after=${encodeURIComponent(after)}` : ""}`),
    projects: () => request<{ projects: Array<{ id: string; name: string }> }>("/api/creative-projects"),
    contextStatus: () => request<{ rollout: "off" | "shadow" | "enforce" }>("/api/studio/memories/context-status"),
    get: (id: string) => request<{ item: MemoryRow }>(path(id)),
    source: (id: string) => request<MemorySourcePreview>(`${path(id)}/source`),
    refreshSource: (item: MemoryRow, fingerprint: string) => request<{ item: MemoryRow }>(`${path(item.id)}/refresh-source`, { method: "POST", body: JSON.stringify({ expectedRevision: item.revision, expectedSourceFingerprint: fingerprint }) }),
    create: (attempt: ReturnType<typeof createMemorySaveAttempt>) => request<{ item: MemoryRow; created: boolean }>(base, { method: "POST", body: JSON.stringify(attempt) }),
    edit: (item: MemoryRow, draft: MemoryDraft) => request<{ item: MemoryRow }>(path(item.id), { method: "PATCH", body: JSON.stringify({ expectedRevision: item.revision, content: draft.content.trim(), scope: draft.scope, slot: draft.slot || null }) }),
    confirm: (item: MemoryRow) => request<{ item: MemoryRow }>(`${path(item.id)}/confirm`, { method: "POST", body: JSON.stringify({ expectedRevision: item.revision }) }),
    toggle: (item: MemoryRow) => request<{ item: MemoryRow }>(path(item.id), { method: "PATCH", body: JSON.stringify({ expectedRevision: item.revision, enabled: !item.enabled }) }),
    remove: (item: MemoryRow) => request<void>(path(item.id), { method: "DELETE", body: JSON.stringify({ expectedRevision: item.revision }) }),
    export: () => request<{ schemaVersion: number; exportedAt: string; items: StudioMemoryItem[] }>(`${base}/export`),
  };
}
