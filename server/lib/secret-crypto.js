"use strict";

const crypto = require("node:crypto");

function getKey() {
  const material = process.env.STZH_LLM_ENCRYPTION_KEY;
  if (!material || material.length < 32) {
    throw new Error("服务器尚未配置 STZH_LLM_ENCRYPTION_KEY，无法安全保存模型密钥");
  }
  return crypto.createHash("sha256").update(material).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  });
}

function decryptSecret(payload) {
  if (!payload) return null;
  const parsed = JSON.parse(payload);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function redactProvider(row) {
  const config = typeof row.config === "string" ? JSON.parse(row.config) : { ...row.config };
  delete config.apiKey;
  return {
    id: row.id,
    ...config,
    isActive: Boolean(row.is_active),
    hasSecret: Boolean(row.secret),
    keyLast4: row.key_last4 || null,
    verifiedAt: row.verified_at || null,
    updatedAt: row.updated_at,
  };
}

module.exports = { decryptSecret, encryptSecret, redactProvider };
