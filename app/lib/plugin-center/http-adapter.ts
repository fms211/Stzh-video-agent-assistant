import type { PluginCenterAdapter } from "./adapter";
import type { PluginEvent, PluginSource } from "./types";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
const encode = encodeURIComponent;
export function createHttpPluginCenterAdapter({ request }: { request: Request }): PluginCenterAdapter {
  let disposed = false;
  const subscriptions = new Set<() => void>();
  const project = (id: string) => `/api/plugins/projects/${encode(id)}`;
  async function call<T>(url: string, options?: RequestInit): Promise<T> {
    if (disposed) throw new Error("插件中心已关闭");
    const result = await request<T>(url, options);
    if (disposed) throw new Error("插件中心已关闭");
    if (typeof window !== "undefined" && options?.method && options.method !== "GET" && !url.endsWith("/catalog/search")) {
      window.dispatchEvent(new Event("tszh_plugin_runtime_changed"));
    }
    return result;
  }
  const post = <T>(url: string, body: unknown = {}) => call<T>(url, { method: "POST", body: JSON.stringify(body) });
  return {
    async uploadLocalPackage(file) {
      const body = new FormData(); body.append("file", file);
      return (await call<{ source: PluginSource }>("/api/plugins/uploads", { method: "POST", body })).source;
    },
    searchCatalog: query => post("/api/plugins/catalog/search", query),
    resolveSource: source => post("/api/plugins/resolve", { source }),
    install: (previewId, confirmation) => post("/api/plugins/install", { previewId, confirmation }),
    listAccountPackages: () => call("/api/plugins/packages"),
    listBuilds: previewId => call(`/api/plugins/builds${previewId ? `?previewId=${encode(previewId)}` : ""}`),
    listProjectBindings: id => call(`${project(id)}/bindings`),
    async bindProjectPlugin(id, input) { await call(`${project(id)}/bindings/${encode(input.pluginId)}`, { method: "PUT", body: JSON.stringify(input) }); },
    async unbindProjectPlugin(id, pluginId) { await call(`${project(id)}/bindings/${encode(pluginId)}`, { method: "DELETE" }); },
    async changeProjectVersion(id, pluginId, version, options) { await post(`${project(id)}/bindings/${encode(pluginId)}/version`, { version, acceptedPermissionTier: options?.acceptedPermissionTier }); },
    async disableProjectPlugin(id, pluginId) { await post(`${project(id)}/bindings/${encode(pluginId)}/disable`); },
    uninstallVersion: (pluginId, version) => call(`/api/plugins/packages/${encode(pluginId)}/${encode(version)}`, { method: "DELETE" }),
    listQuarantined: () => call("/api/plugins/quarantine"),
    restoreQuarantined: id => post(`/api/plugins/quarantine/${encode(id)}/restore`),
    async purgeQuarantined(id) { await call(`/api/plugins/quarantine/${encode(id)}`, { method: "DELETE" }); },
    getProjectGeneration: id => call(`${project(id)}/generation`),
    getGenerationHistory: id => call(`${project(id)}/generation/history`),
    restartGeneration: id => post(`${project(id)}/generation/restart`),
    enterSafeMode: id => post(`${project(id)}/generation/safe`),
    rollbackGeneration: (id, generationId) => post(`${project(id)}/generation/rollback`, { generationId }),
    subscribe(projectId, afterSeq, handler) {
      let cursor = afterSeq, closed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const close = () => { closed = true; if (timer) clearTimeout(timer); subscriptions.delete(close); };
      const poll = async () => {
        try {
          const query = new URLSearchParams({ afterSeq: String(cursor) });
          if (projectId) query.set("projectId", projectId);
          const { events } = await call<{ events: PluginEvent[] }>(`/api/plugins/events?${query}`);
          if (closed || disposed) return;
          for (const event of events) { if (event.seq > cursor) { cursor = event.seq; handler.onEvent(event); } }
        } catch (error) { if (!closed && !disposed) handler.onError(error instanceof Error ? error : new Error("插件状态同步失败")); }
        if (!closed && !disposed) timer = setTimeout(() => void poll(), 1500);
      };
      subscriptions.add(close); void poll(); return { close };
    },
    dispose() { disposed = true; for (const close of [...subscriptions]) close(); },
  };
}
