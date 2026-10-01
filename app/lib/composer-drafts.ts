import type { CreativeWorkspaceMode } from "./appearance-types";

export type ComposerDrafts = Record<CreativeWorkspaceMode, string>;
export type ComposerDraftState = { owner: string; byOwner: Record<string, ComposerDrafts> };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const MODES: CreativeWorkspaceMode[] = ["coze", "assistant", "workflow", "collaboration"];
const draftKey = (owner: string) => `tszh:v2:composer-drafts:${encodeURIComponent(owner)}`;
const workflowFormKey = (owner: string) => `tszh:v2:workflow-form-draft:${encodeURIComponent(owner)}`;
export const emptyComposerDrafts = (): ComposerDrafts => ({ coze: "", assistant: "", workflow: "", collaboration: "" });
export type WorkflowFormDraft = { workflowId: string; input: Record<string, string> };

export function readComposerDrafts(storage: DraftStorage, owner: string): ComposerDrafts | null {
  try {
    const raw = storage.getItem(draftKey(owner));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || record.owner !== owner || !record.drafts || typeof record.drafts !== "object" || Array.isArray(record.drafts)) return null;
    const drafts = record.drafts as Record<string, unknown>;
    if (!MODES.every(mode => typeof drafts[mode] === "string" && (drafts[mode] as string).length <= 100_000)) return null;
    return Object.fromEntries(MODES.map(mode => [mode, drafts[mode]])) as ComposerDrafts;
  } catch {
    return null;
  }
}

export function writeComposerDrafts(storage: DraftStorage, owner: string, drafts: ComposerDrafts): void {
  if (MODES.every(mode => drafts[mode] === "")) {
    storage.removeItem(draftKey(owner));
  } else {
    storage.setItem(draftKey(owner), JSON.stringify({ version: 1, owner, drafts }));
  }
}

export function readWorkflowFormDraft(storage: DraftStorage, owner: string): WorkflowFormDraft | null {
  try {
    const raw = storage.getItem(workflowFormKey(owner));
    if (!raw || raw.length > 1_000_000) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || record.owner !== owner || typeof record.workflowId !== "string" || !record.input || typeof record.input !== "object" || Array.isArray(record.input)) return null;
    const entries = Object.entries(record.input);
    if (entries.length > 50 || !entries.every(([key, field]) => key.length <= 100 && typeof field === "string" && field.length <= 100_000)) return null;
    return { workflowId: record.workflowId, input: Object.fromEntries(entries) };
  } catch {
    return null;
  }
}

export function writeWorkflowFormDraft(storage: DraftStorage, owner: string, draft: WorkflowFormDraft | null): void {
  if (draft) storage.setItem(workflowFormKey(owner), JSON.stringify({ version: 1, owner, ...draft }));
  else storage.removeItem(workflowFormKey(owner));
}

export function createComposerDrafts(owner: string): ComposerDraftState {
  return { owner, byOwner: { [owner]: emptyComposerDrafts() } };
}

export function switchComposerDraftOwner(state: ComposerDraftState, owner: string): ComposerDraftState {
  if (state.owner === owner) return state;
  // Continue an explicit guest-to-login flow without moving another account's input.
  const initial = state.owner === "guest" && owner.startsWith("user:")
    ? { ...state.byOwner.guest }
    : emptyComposerDrafts();
  return { owner, byOwner: { ...state.byOwner, [owner]: state.byOwner[owner] ?? initial } };
}

export function updateComposerDrafts(state: ComposerDraftState, owner: string, update: (drafts: ComposerDrafts) => ComposerDrafts): ComposerDraftState {
  // An old callback may finish after switching accounts. It may only change its own bucket.
  return { ...state, byOwner: { ...state.byOwner, [owner]: update(state.byOwner[owner] ?? emptyComposerDrafts()) } };
}
