type SocketLike = Pick<WebSocket, "onopen" | "onclose" | "onerror" | "onmessage" | "close">;
export function connectAccountEvents(options: {
  url: string | (() => string | Promise<string>);
  current: () => boolean;
  onStatus?: (live: boolean) => void;
  onMessage: (message: { type?: string; payload?: unknown }) => void;
  retryOnError?: (error: unknown) => boolean;
  createSocket?: (url: string) => SocketLike;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  unschedule?: (id: ReturnType<typeof setTimeout>) => void;
}) {
  const make = options.createSocket || (url => new WebSocket(url));
  const schedule = options.schedule || setTimeout, unschedule = options.unschedule || clearTimeout;
  let stopped = false, attempts = 0, socket: SocketLike | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  const active = () => !stopped && options.current();
  function retry() {
    if (!active() || timer !== undefined) return;
    timer = schedule(() => { timer = undefined; void connect(); }, Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000));
  }
  async function connect() {
    if (!active()) return;
    try {
      const url = typeof options.url === "function" ? await options.url() : options.url;
      // Device registration may resolve after unmount or an account switch.
      if (!active()) return;
      const next = make(url); socket = next;
      const valid = () => active() && socket === next;
      next.onmessage = event => {
        if (!valid()) return;
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === "connection.ready") { attempts = 0; options.onStatus?.(true); }
          options.onMessage(message);
        } catch { /* An unrelated malformed frame does not invalidate the connection. */ }
      };
      next.onerror = () => { if (valid()) options.onStatus?.(false); };
      next.onclose = event => {
        if (!valid()) return;
        socket = null; options.onStatus?.(false);
        if (event.code !== 4401 && event.code !== 4403) retry();
      };
    } catch (error) {
      if (!active()) return;
      options.onStatus?.(false);
      if (options.retryOnError?.(error) !== false) retry();
    }
  }
  void connect();
  return () => { stopped = true; if (timer !== undefined) unschedule(timer); socket?.close(); socket = null; };
}
