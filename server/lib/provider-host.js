"use strict";
const net = require("node:net");

function isPrivateModelHost(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const ipType = net.isIP(host);
  if (ipType === 6 && host.startsWith("::ffff:")) {
    const tail = host.slice(7);
    if (net.isIP(tail) === 4) return isPrivateModelHost(tail);
    const parts = tail.split(":");
    if (parts.length === 2 && parts.every(part => /^[a-f0-9]{1,4}$/.test(part))) {
      const value = parseInt(parts[0], 16) * 65536 + parseInt(parts[1], 16);
      return isPrivateModelHost([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join("."));
    }
  }
  if (ipType === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (ipType === 6) return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd")
    || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb");
  return false;
}

module.exports = { isPrivateModelHost };
