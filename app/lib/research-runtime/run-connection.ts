import type { ResearchRuntimeAdapter, ResearchSubscription } from "./adapter";
import type { ResearchRunSnapshot, RunEvent } from "./types";
import { projectRunEvent } from "./projector.ts";

type ConnectionState = {
  snapshot: ResearchRunSnapshot | null;
  events: RunEvent[];
  syncing: boolean;
  error: string;
};

// One connection owns both the snapshot and its stream cursor. Replacing a
// subscription invalidates all callbacks and pending reads from its predecessor.
export function createResearchRunConnection(adapter: ResearchRuntimeAdapter, runId: string | null) {
  let state: ConnectionState = { snapshot: null, events: [], syncing: false, error: "" };
  let generation = 0;
  let active = false;
  let historyCursor = 0;
  let historyGap = false;
  let subscription: ResearchSubscription | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ConnectionState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  async function refresh(skipGap = false) {
    if (!active || !runId) return;
    historyGap ||= skipGap;
    const ticket = ++generation;
    subscription?.close();
    subscription = null;
    const current = () => active && ticket === generation;
    publish({ syncing: true, error: "" });
    try {
      const fresh = await adapter.getRun(runId);
      if (!current()) return;
      if (fresh.runId !== runId) throw new Error("研究任务不匹配，请重新打开运行");
      if (!Number.isInteger(fresh.lastSeq) || fresh.lastSeq < 0) throw new Error("研究进度记录无效，请重新同步");
      // Replay unseen history without projecting it onto a newer snapshot.
      // Only an actual missing sequence skips to the authoritative fresh seq.
      let cursor = historyGap ? fresh.lastSeq : historyCursor;
      historyGap = false;
      historyCursor = cursor;
      publish({ snapshot: fresh, syncing: false });
      const next = adapter.subscribe(runId, cursor, {
        onEvent(event) {
          if (!current() || event.runId !== runId || event.seq <= cursor) return;
          if (event.version !== 1 || !Number.isInteger(event.seq)) {
            publish({ error: "研究进度格式无法识别，请重新同步" });
            return;
          }
          if (event.seq !== cursor + 1) { void refresh(true); return; }
          try {
            let snapshot = state.snapshot!;
            if (event.seq > snapshot.lastSeq) {
              const recorded = event.payload.snapshot as ResearchRunSnapshot | undefined;
              if (recorded) {
                if (recorded.runId !== runId || recorded.lastSeq !== event.seq) {
                  throw new Error("研究状态与进度记录不一致，请重新同步");
                }
                snapshot = recorded;
              } else {
                const projected = projectRunEvent(snapshot, event);
                if (projected.needsResync) { void refresh(true); return; }
                snapshot = projected.snapshot;
              }
            }
            cursor = event.seq;
            historyCursor = cursor;
            publish({ snapshot, events: [...state.events, event], error: "" });
          } catch (error) {
            publish({ error: error instanceof Error ? error.message : "同步研究任务失败" });
          }
        },
        onError(error) { if (current()) publish({ error: error.message }); },
      });
      // Some adapters replay synchronously during subscribe(). A replay can
      // already have triggered another refresh before subscribe returns.
      if (current()) subscription = next;
      else next.close();
    } catch (error) {
      if (current()) publish({ syncing: false, error: error instanceof Error ? error.message : "读取研究任务失败" });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isActive: () => active,
    refresh,
    connect() { active = true; void refresh(); },
    close() { active = false; generation++; subscription?.close(); subscription = null; },
  };
}
