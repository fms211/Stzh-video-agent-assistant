import type { ResearchRuntimeAdapter, ResearchRunSummary } from "./adapter";
import type { ResearchRunSnapshot, ResearchPlan, RunEvent } from "./types";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;

export function createHttpResearchRuntimeAdapter({request}: {request: Request}): ResearchRuntimeAdapter {
  let disposed = false;
  const subscriptions = new Set<() => void>();
  const path = (id: string) => `/api/research/runs/${encodeURIComponent(id)}`;
  async function call<T>(url: string, options?: RequestInit): Promise<T> {
    if (disposed) throw new Error("研究工作区已关闭");
    const result = await request<T>(url, options);
    if (disposed) throw new Error("研究工作区已关闭");
    return result;
  }
  return {
    async createRun(input) { return (await call<{run: ResearchRunSnapshot}>("/api/research/runs",{method:"POST",body:JSON.stringify(input)})).run; },
    async getRun(id) { return (await call<{run: ResearchRunSnapshot}>(path(id))).run; },
    async listRuns(limit) { return (await call<{runs: ResearchRunSummary[]}>(`/api/research/runs?limit=${limit}`)).runs; },
    async updatePlan(id,expectedRevision,operations) { return (await call<{plan:ResearchPlan}>(`${path(id)}/plan`,{method:"PATCH",body:JSON.stringify({expectedRevision,operations})})).plan; },
    async act(id,action) { await call(`${path(id)}/actions`,{method:"POST",body:JSON.stringify(action)}); },
    subscribe(id,afterSeq,handlers) {
      let closed = false, cursor = afterSeq;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const close = () => { closed=true; if(timer)clearTimeout(timer); subscriptions.delete(close); };
      const poll = async () => {
        try {
          const {events} = await call<{events:RunEvent[]}>(`${path(id)}/events?afterSeq=${cursor}`);
          if(closed||disposed)return;
          for(const event of events) {
            if(event.seq<=cursor)continue;
            handlers.onEvent(event);cursor=event.seq;
          }
        } catch(error) { if(!closed&&!disposed)handlers.onError(error instanceof Error?error:new Error("研究状态同步失败")); }
        if(!closed&&!disposed)timer=setTimeout(()=>void poll(),1200);
      };
      subscriptions.add(close);
      void poll();
      return {close};
    },
    dispose() { disposed=true; for(const close of [...subscriptions])close(); },
  };
}
