"use strict";

const crypto = require("crypto");
const os = require("os");
const { Router } = require("express");
const db = require("../db.js");
const { publish } = require("../events.js");

const router = Router();
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function createCode() {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function serializeDevice(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    pairedAt: new Date(row.paired_at * 1000).toISOString(),
    lastSeen: new Date(row.last_seen * 1000).toISOString(),
  };
}

router.get("/api/devices", (req, res) => {
  res.json({ devices: db.deviceList(req.user.userId).map(serializeDevice) });
});

router.post("/api/devices/register", (req, res) => {
  const id = String(req.body?.id || "").trim();
  const type = req.body?.type === "web" ? "web" : "desktop";
  const name = String(req.body?.name || "桌面创作中心").trim().slice(0, 80) || "桌面创作中心";
  if (!/^(desktop|web)_[A-Za-z0-9_-]{8,120}$/.test(id)) {
    return res.status(400).json({ error: { message: "设备标识格式不正确" } });
  }
  const result = db.deviceRegister({ id, name, type }, req.user.userId);
  if (result.reason === "owned_by_another_account") {
    return res.status(409).json({ error: { message: "该设备已属于另一账户" } });
  }
  if (result.reason === "revoked") {
    return res.status(409).json({ error: { message: "该设备已被撤销，请清除本地设备标识后重新配对" } });
  }
  const device = serializeDevice(result.device);
  publish(req.user.userId, "device.updated", { device });
  res.status(result.created ? 201 : 200).json({ device });
});

router.get("/api/devices/network-targets", (req, res) => {
  const port = Number(req.socket.localPort || process.env.PORT || 8080);
  const targets = [];
  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) continue;
      targets.push({
        label: interfaceName,
        address: address.address,
        url: `http://${address.address}:${port}`,
      });
    }
  }
  res.json({ targets });
});

router.post("/api/devices/pairing-codes", (req, res) => {
  const code = createCode();
  const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
  db.pairingCreate(
    hashCode(code),
    req.user.userId,
    String(req.body?.deviceName || "桌面创作中心").slice(0, 80),
    expiresAt
  );
  res.status(201).json({
    code,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
});

router.post("/api/devices/pair", (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const name = String(req.body?.name || "我的手机").trim().slice(0, 80);
  const type = ["desktop", "mobile", "web"].includes(req.body?.type)
    ? req.body.type
    : "mobile";
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    return res.status(400).json({ error: { message: "配对码格式不正确" } });
  }
  const device = db.pairingConsume(hashCode(code), req.user.userId, {
    id: `device_${crypto.randomUUID()}`,
    name,
    type,
  });
  if (!device) {
    return res.status(409).json({ error: { message: "配对码无效、已使用或已过期" } });
  }
  publish(req.user.userId, "device.paired", { device: serializeDevice(device) });
  res.status(201).json({ device: serializeDevice(device) });
});

router.post("/api/devices/:id/heartbeat", (req, res) => {
  const device = db.deviceGet(req.params.id, req.user.userId);
  if (!device) {
    return res.status(404).json({ error: { message: "设备不存在" } });
  }
  db.deviceTouch(req.params.id, req.user.userId, "online");
  res.json({ ok: true, lastSeen: new Date(Date.now()).toISOString() });
});

router.delete("/api/devices/:id", (req, res) => {
  if (!db.deviceRevoke(req.params.id, req.user.userId)) {
    return res.status(404).json({ error: { message: "设备不存在" } });
  }
  publish(req.user.userId, "device.revoked", { deviceId: req.params.id });
  res.status(204).end();
});

module.exports = router;
module.exports.serializeDevice = serializeDevice;
