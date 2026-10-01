"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { creativeApi } from "@/app/lib/creative-agent-api";
import { resolveApiBase } from "@/app/lib/auth";
import { validateBridgeMessage, type BridgeContext } from "@/app/lib/plugin-center/bridge";

type Props = { pluginId: string; projectId: string; slot: string; uiSurfaceId: string; title: string; frameHeight: number; demoHtml?: string; expectedGenerationId?: string };
type FrameTicket = { frameId: string; frameToken: string; assetToken: string; nonce: string; assetUrl: string; allowedActions: string[] };
type BridgeResult = { nonce: string; result?: unknown; error?: { code: string; message: string } };
const apiUrl = (url: string) => new URL(url, resolveApiBase(process.env.NEXT_PUBLIC_AGENT_BACKEND_URL, window.location)).href;

function revoke(ticket: FrameTicket) {
  // A frame capability can revoke itself even after the account changes.
  void fetch(apiUrl(`/plugin-ui/${ticket.assetToken}/revoke`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frameToken: ticket.frameToken }), keepalive: true }).catch(() => {});
}

export function PluginFrame({ pluginId, projectId, slot, uiSurfaceId, title, frameHeight, demoHtml, expectedGenerationId }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const channelRef = useRef<MessageChannel | null>(null);
  const contextRef = useRef<BridgeContext | null>(null);
  const [ticket, setTicket] = useState<FrameTicket | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (demoHtml) return;
    let closed = false, current: FrameTicket | null = null;
    let renewTimer: ReturnType<typeof setInterval> | undefined;
    setError(""); setReady(false); setTicket(null);
    void creativeApi<FrameTicket>(`/api/plugins/projects/${encodeURIComponent(projectId)}/frames`, {
      method: "POST", body: JSON.stringify({ pluginId, slot, uiSurfaceId, expectedGenerationId }),
    }).then((frame) => {
      if (closed) { revoke(frame); return; }
      current = frame;
      contextRef.current = { bridgeVersion: 1, frameId: frame.frameId, frameToken: frame.frameToken, nonce: frame.nonce, pluginId, projectId, allowedActions: frame.allowedActions };
      setTicket(frame);
      renewTimer = setInterval(() => {
        void creativeApi(`/api/plugins/frames/${frame.frameId}/renew`, { method: "POST", body: JSON.stringify({ frameToken: frame.frameToken }) })
          .catch((error) => { if (!closed) setError(error instanceof Error ? error.message : "插件界面连接已过期"); });
      }, 4 * 60000);
    }).catch((error) => { if (!closed) setError(error instanceof Error ? error.message : "插件界面加载失败"); });
    return () => {
      closed = true;
      if (renewTimer) clearInterval(renewTimer);
      channelRef.current?.port1.close(); channelRef.current?.port2.close(); channelRef.current = null;
      contextRef.current = null;
      if (current) revoke(current);
    };
  }, [pluginId, projectId, slot, uiSurfaceId, demoHtml, revision, expectedGenerationId]);

  const connect = () => {
    const frame = iframeRef.current, context = contextRef.current;
    if (!ticket || !frame?.contentWindow || !context) return;
    channelRef.current?.port1.close(); channelRef.current?.port2.close();
    const channel = new MessageChannel(); channelRef.current = channel;
    channel.port1.onmessage = (event) => {
      const validation = validateBridgeMessage(event.data, context);
      if (!validation.ok) { setError(`插件界面消息被拒绝：${validation.reason}`); channel.port1.close(); revoke(ticket); return; }
      const message = { ...event.data, payload: validation.payload };
      context.nonce = "";
      void creativeApi<BridgeResult>(`/api/plugins/frames/${ticket.frameId}/bridge`, { method: "POST", body: JSON.stringify(message) })
        .then((result) => {
          if (channelRef.current !== channel) return;
          context.nonce = result.nonce;
          setReady(true);
          if (validation.action === "ui.notify" && !result.error) setNotice(String(validation.payload.message || "").slice(0, 500));
          channel.port1.postMessage({ bridgeVersion: 1, frameId: ticket.frameId, frameToken: ticket.frameToken, requestId: message.requestId, ...result });
        }).catch((error) => {
          if (channelRef.current !== channel) return;
          setError(error instanceof Error ? error.message : "插件界面调用失败"); channel.port1.close(); revoke(ticket);
        });
    };
    channel.port1.start();
    frame.contentWindow.postMessage({ type: "stzh:init", context: { ...context, slot, uiSurfaceId } }, "*", [channel.port2]);
  };

  if (error) return <div className="pc-frame-error" role="alert"><ShieldAlert aria-hidden="true" size={14} /><span>插件 {pluginId} 的界面暂不可用：{error}</span><button type="button" className="pc-btn" onClick={() => setRevision((value) => value + 1)}>重新连接</button></div>;
  if (!ticket && !demoHtml) return <p role="status">正在加载插件界面…</p>;
  return <div className="pc-frame-card" data-plugin-id={pluginId} data-slot={slot} aria-busy={!ready && !demoHtml}>
    {notice && <p role="status">{notice}</p>}
    <iframe ref={iframeRef} title={`${title}（插件界面）`} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ height: frameHeight, minHeight: 0 }} src={ticket ? apiUrl(ticket.assetUrl) : undefined} srcDoc={demoHtml} onLoad={connect} onError={() => setError("插件界面资源无法加载")} />
  </div>;
}
