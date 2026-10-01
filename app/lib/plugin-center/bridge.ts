// 插件中心 — sandboxed iframe bridge 消息校验（规划 §7.9 / B-Task 14）
// 每条消息校验：协议版本、frame 身份、frame token、nonce、动作白名单。
// 拒绝普通 window message 动作；错误 frame/nonce/version/token 一律拒绝且不执行。

export type BridgeContext = {
  bridgeVersion: number;
  frameId: string;
  frameToken: string;
  /** 当前消息期望的 nonce（一次性，父页生成）*/
  nonce: string;
  pluginId: string;
  projectId: string;
  /** 该 slot/frame 允许的动作白名单 */
  allowedActions: string[];
};

export type BridgeMessageInput = {
  bridgeVersion: number;
  frameId: string;
  frameToken: string;
  nonce: string;
  action: string;
  payload: Record<string, unknown>;
};

export type BridgeValidationResult =
  | { ok: true; action: string; payload: Record<string, unknown> }
  | { ok: false; code: "BRIDGE_UNAUTHORIZED"; reason: string };

export function validateBridgeMessage(message: unknown, context: BridgeContext): BridgeValidationResult {
  if (!message || typeof message !== "object") {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: "message must be an object" };
  }
  const msg = message as Partial<BridgeMessageInput>;

  if (msg.bridgeVersion !== context.bridgeVersion) {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: `protocol version mismatch: ${String(msg.bridgeVersion)}` };
  }
  if (msg.frameId !== context.frameId) {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: "frame id mismatch" };
  }
  if (msg.frameToken !== context.frameToken) {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: "frame token mismatch" };
  }
  if (msg.nonce !== context.nonce) {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: "nonce mismatch (replay or forged message)" };
  }
  if (typeof msg.action !== "string" || !context.allowedActions.includes(msg.action)) {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: `action not allowed: ${String(msg.action)}` };
  }
  if (!msg.payload || typeof msg.payload !== "object") {
    return { ok: false, code: "BRIDGE_UNAUTHORIZED", reason: "payload must be an object" };
  }
  return { ok: true, action: msg.action, payload: msg.payload };
}

/** 生成一次性 nonce（父页每条下行消息生成；上行消息必须携带最近一次下发的 nonce）*/
export function createNonce(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
