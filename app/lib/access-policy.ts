import type { AccessMode } from "./entry-flow";

export type WorkspaceCapability =
  | "navigate"
  | "configure"
  | "generate"
  | "cloud-sync"
  | "pair-device"
  | "task-control";

const GUEST_CAPABILITIES = new Set<WorkspaceCapability>(["navigate", "configure"]);

export function canUseWorkspaceCapability(
  accessMode: AccessMode,
  capability: WorkspaceCapability,
) {
  return accessMode === "authenticated" || GUEST_CAPABILITIES.has(capability);
}
