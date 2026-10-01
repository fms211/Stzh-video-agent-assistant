export type TaskFilter = "all" | "active" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "archive";
type TaskRow = { id: string; status: string; updatedAt: string };
type Page<T> = { tasks: T[]; total: number; nextCursor: string | null };

export function taskFilterStatus(filter: TaskFilter): string | undefined {
  if (filter === "all") return undefined;
  if (filter === "active") return "queued,running,paused";
  if (filter === "failed") return "failed,cancelled";
  if (filter === "archive") return "completed,failed,cancelled";
  return filter;
}
function matches(row: TaskRow, filter: TaskFilter) {
  const status = taskFilterStatus(filter);
  return !status || status.split(",").includes(row.status);
}
function merge<T extends TaskRow>(filter: TaskFilter, ...groups: T[][]): T[] {
  const rows = new Map<string, T>();
  for (const group of groups) for (const row of group) {
    const old = rows.get(row.id);
    if (!old || row.updatedAt >= old.updatedAt) rows.set(row.id, row);
  }
  return [...rows.values()].filter(row => matches(row, filter)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
}

export function createTaskList<T extends TaskRow>(fetchPage: (options: { status?: string; limit: number; cursor?: string }) => Promise<Page<T>>, pageSize = 20) {
  let state = { tasks: [] as T[], total: 0, nextCursor: null as string | null, filter: "all" as TaskFilter, loading: false, error: "" };
  let active = false, requestId = 0, loadedPages = 1;
  let duringRequest = new Map<string, T>();
  const listeners = new Set<() => void>();
  function publish(next: Partial<typeof state>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }
  async function load(append: boolean) {
    if (!active || state.loading || (append && !state.nextCursor)) return;
    const id = ++requestId, filter = state.filter;
    const pageCount = append ? 1 : loadedPages;
    let cursor: string | undefined = append ? state.nextCursor! : undefined;
    let result: Page<T> = { tasks: [], total: 0, nextCursor: null };
    let fetchedPages = 0;
    duringRequest = new Map();
    publish({ loading: true, error: "" });
    try {
      for (let index = 0; index < pageCount; index++) {
        const page = await fetchPage({ status: taskFilterStatus(filter), limit: pageSize, cursor });
        if (!active || id !== requestId) return;
        fetchedPages++;
        result = { ...page, tasks: merge(filter, result.tasks, page.tasks) };
        if (!page.nextCursor) break;
        if (page.nextCursor === cursor) throw new Error("任务分页游标未推进，请刷新重试");
        cursor = page.nextCursor;
      }
      loadedPages = append ? loadedPages + fetchedPages : fetchedPages;
      publish({ ...result, tasks: merge(filter, append ? state.tasks : [], result.tasks, [...duringRequest.values()]), loading: false, error: "" });
    } catch (error) {
      if (active && id === requestId) publish({ loading: false, error: error instanceof Error ? error.message : "任务读取失败" });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect() { active = true; publish({ loading: false }); return load(false); },
    close() { active = false; requestId++; },
    refresh: () => load(false),
    loadMore: () => load(true),
    setFilter(filter: TaskFilter) {
      if (filter === state.filter) return Promise.resolve();
      requestId++; loadedPages = 1;
      publish({ filter, tasks: [], total: 0, nextCursor: null, loading: false, error: "" });
      return load(false);
    },
    applyTask(task: T) {
      if (!active) return;
      if (state.loading) {
        const old = duringRequest.get(task.id);
        if (!old || task.updatedAt >= old.updatedAt) duringRequest.set(task.id, task);
      }
      publish({ tasks: merge(state.filter, state.tasks, [task]) });
    },
  };
}
