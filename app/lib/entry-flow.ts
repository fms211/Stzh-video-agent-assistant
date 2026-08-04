export type EntryPhase = "splash" | "gateway" | "workspace";
export type AccessMode = "authenticated" | "guest";
export type AuthView = "account" | "login" | "register";
export type GuestImportDecision = "pending" | "import" | "keep-local";

export const ENTRY_SESSION_KEY = "tszh_entry_state";

export type EntryState = {
  phase: EntryPhase;
  accessMode: AccessMode | null;
  authView: AuthView;
};

export type EntryEvent =
  | { type: "SPLASH_COMPLETE"; authenticated: boolean }
  | { type: "SET_AUTH_VIEW"; view: AuthView }
  | { type: "ENTER_WORKSPACE" }
  | { type: "ENTER_GUEST" }
  | { type: "RETURN_TO_GATEWAY"; authenticated?: boolean };

export function createInitialEntryState(
  stored: string | null,
  authenticated: boolean,
): EntryState {
  const authView: AuthView = authenticated ? "account" : "login";

  if (!stored || stored === "splash") {
    return { phase: "splash", accessMode: null, authView };
  }

  if (stored === "workspace:guest") {
    return { phase: "workspace", accessMode: "guest", authView };
  }

  if (stored === "workspace:authenticated" && authenticated) {
    return { phase: "workspace", accessMode: "authenticated", authView };
  }

  return { phase: "gateway", accessMode: null, authView };
}

export function reduceEntryState(state: EntryState, event: EntryEvent): EntryState {
  switch (event.type) {
    case "SPLASH_COMPLETE":
      return {
        phase: "gateway",
        accessMode: null,
        authView: event.authenticated ? "account" : "login",
      };
    case "SET_AUTH_VIEW":
      return { ...state, authView: event.view };
    case "ENTER_WORKSPACE":
      return { ...state, phase: "workspace", accessMode: "authenticated" };
    case "ENTER_GUEST":
      return { ...state, phase: "workspace", accessMode: "guest" };
    case "RETURN_TO_GATEWAY":
      return {
        phase: "gateway",
        accessMode: null,
        authView: event.authenticated ? "account" : "login",
      };
  }
}

export function serializeEntryState(state: EntryState) {
  if (state.phase === "splash") return "splash";
  if (state.phase === "gateway") return "gateway";
  return `workspace:${state.accessMode || "guest"}`;
}
