export type DataOwner =
  | { kind: "guest" }
  | { kind: "account"; userId: number };

type WorkspaceDataKind =
  | "sessions"
  | "active"
  | "messages"
  | "preferences"
  | "stats"
  | "generation-stats";

export type StorageLike = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

const LEGACY_SESSIONS_KEY = "tszh_sessions";
const LEGACY_ACTIVE_KEY = "tszh_active";
const LEGACY_MESSAGES_PREFIX = "tszh_msgs_";
const MIGRATION_MARKER_PREFIX = "tszh:v2:migrated:";

export function ownerScope(owner: DataOwner) {
  return owner.kind === "guest" ? "guest" : `user:${owner.userId}`;
}

export function workspaceDataKey(
  owner: DataOwner,
  kind: WorkspaceDataKind,
  id?: string,
) {
  const prefix = `tszh:v2:${ownerScope(owner)}`;
  if (kind === "messages") {
    if (!id) throw new Error("messages key requires a conversation id");
    return `${prefix}:messages:${id}`;
  }
  return `${prefix}:${kind}`;
}

export function dataOwnerFromUser(user: { id: number } | null | undefined): DataOwner {
  return user ? { kind: "account", userId: user.id } : { kind: "guest" };
}

export function hasWorkspaceData(storage: StorageLike, owner: DataOwner) {
  const raw = storage.getItem(workspaceDataKey(owner, "sessions"));
  if (!raw) return false;
  try {
    const sessions = JSON.parse(raw);
    return Array.isArray(sessions) && sessions.length > 0;
  } catch {
    return false;
  }
}

function listKeys(storage: StorageLike) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key));
}

export function migrateLegacyWorkspaceData(storage: StorageLike, owner: DataOwner) {
  const marker = `${MIGRATION_MARKER_PREFIX}${ownerScope(owner)}`;
  if (storage.getItem(marker) === "1") return;

  const sessions = storage.getItem(LEGACY_SESSIONS_KEY);
  const active = storage.getItem(LEGACY_ACTIVE_KEY);
  const targetSessions = workspaceDataKey(owner, "sessions");
  const targetActive = workspaceDataKey(owner, "active");

  if (sessions !== null && storage.getItem(targetSessions) === null) {
    storage.setItem(targetSessions, sessions);
  }
  if (active !== null && storage.getItem(targetActive) === null) {
    storage.setItem(targetActive, active);
  }

  const legacySingletons: Array<[string, WorkspaceDataKind]> = [
    ["tszh_preferences", "preferences"],
    ["tszh_stats", "stats"],
    ["tszh_gen_stats", "generation-stats"],
  ];
  for (const [legacyKey, kind] of legacySingletons) {
    const value = storage.getItem(legacyKey);
    const target = workspaceDataKey(owner, kind);
    if (value !== null && storage.getItem(target) === null) {
      storage.setItem(target, value);
    }
  }

  for (const key of listKeys(storage)) {
    if (!key.startsWith(LEGACY_MESSAGES_PREFIX)) continue;
    const conversationId = key.slice(LEGACY_MESSAGES_PREFIX.length);
    const value = storage.getItem(key);
    const target = workspaceDataKey(owner, "messages", conversationId);
    if (value !== null && storage.getItem(target) === null) {
      storage.setItem(target, value);
    }
  }

  storage.setItem(marker, "1");
}

export function copyWorkspaceData(
  storage: StorageLike,
  from: DataOwner,
  to: DataOwner,
) {
  const sourcePrefix = `tszh:v2:${ownerScope(from)}:`;
  const targetPrefix = `tszh:v2:${ownerScope(to)}:`;
  const sourceSessionsKey = `${sourcePrefix}sessions`;
  const targetSessionsKey = `${targetPrefix}sessions`;
  const sessionIdMap = new Map<string, string>();

  const parseRecords = (value: string | null) => {
    if (!value) return [] as Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is Record<string, unknown> => (
            Boolean(item) && typeof item === "object" && !Array.isArray(item)
          ))
        : [];
    } catch {
      return [] as Array<Record<string, unknown>>;
    }
  };

  const sourceSessions = parseRecords(storage.getItem(sourceSessionsKey));
  const mergedSessions = parseRecords(storage.getItem(targetSessionsKey));
  const occupiedIds = new Set(
    mergedSessions
      .map((session) => session.id)
      .filter((id): id is string => typeof id === "string"),
  );

  for (const session of sourceSessions) {
    if (typeof session.id !== "string") continue;
    const existing = mergedSessions.find((item) => item.id === session.id);
    if (!existing) {
      mergedSessions.push(session);
      occupiedIds.add(session.id);
      sessionIdMap.set(session.id, session.id);
      continue;
    }
    if (JSON.stringify(existing) === JSON.stringify(session)) {
      sessionIdMap.set(session.id, session.id);
      continue;
    }

    let suffix = 1;
    let importedId = `${session.id}-imported`;
    while (occupiedIds.has(importedId)) {
      suffix += 1;
      importedId = `${session.id}-imported-${suffix}`;
    }
    occupiedIds.add(importedId);
    sessionIdMap.set(session.id, importedId);
    mergedSessions.push({ ...session, id: importedId });
  }

  if (sourceSessions.length > 0) {
    storage.setItem(targetSessionsKey, JSON.stringify(mergedSessions));
  }

  for (const key of listKeys(storage)) {
    if (!key.startsWith(sourcePrefix)) continue;
    if (key === sourceSessionsKey) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    const suffix = key.slice(sourcePrefix.length);
    const target = suffix.startsWith("messages:")
      ? `${targetPrefix}messages:${sessionIdMap.get(suffix.slice("messages:".length)) || suffix.slice("messages:".length)}`
      : `${targetPrefix}${suffix}`;
    const copiedValue = suffix === "active"
      ? sessionIdMap.get(value) || value
      : value;
    if (storage.getItem(target) === null) storage.setItem(target, copiedValue);
  }
}

export function currentDataOwner(storage: Pick<Storage, "getItem">): DataOwner {
  const token = storage.getItem("stzh_token");
  const rawUser = storage.getItem("stzh_user");
  if (!token || !rawUser) return { kind: "guest" };
  try {
    const user = JSON.parse(rawUser) as { id?: unknown };
    return typeof user.id === "number"
      ? { kind: "account", userId: user.id }
      : { kind: "guest" };
  } catch {
    return { kind: "guest" };
  }
}
