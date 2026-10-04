"use strict";
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const { Agent } = require("undici");
const { isPrivateModelHost } = require("./lib/provider-host");
const SUCCESS_TTL = 30 * 60 * 1000, FAILURE_TTL = 60 * 1000;
const unavailable = reason => ({ available: false, reason });
function configuration(env) {
  const enabled = String(env.STZH_WEATHER_ENABLED ?? "").trim().toLowerCase();
  if (["0", "false", "off"].includes(enabled)) return { reason: "DISABLED" };
  if (enabled && !["1", "true", "on"].includes(enabled)) return { reason: "INVALID_CONFIGURATION" };
  const key = String(env.QWEATHER_API_KEY || "").trim(), host = String(env.QWEATHER_API_HOST || "").trim().toLowerCase();
  if (!key || !host) return { reason: "NOT_CONFIGURED" };
  const location = String(env.QWEATHER_LOCATION || "101280601").trim();
  if (key.length > 512 || /[\x00-\x20\x7f-\uffff]/.test(key) || host.length > 253
    || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+qweatherapi\.com$/.test(host)
    || !/^(?:[0-9]{9}|-?[0-9]{1,3}(?:\.[0-9]+)?,-?[0-9]{1,2}(?:\.[0-9]+)?)$/.test(location)) return { reason: "INVALID_CONFIGURATION" };
  return { key, host, location, city: String(env.QWEATHER_CITY || "深圳").replace(/[\x00-\x1f]/g, "").slice(0, 40) };
}
function weatherData(raw, config, now) {
  if (String(raw?.code) !== "200" || !raw?.now) return null;
  const item = raw.now;
  if (typeof item.text !== "string" || typeof item.windDir !== "string"
    || [item.text, item.windDir, String(item.icon || ""), config.city].some(value => value.includes(config.key))) return null;
  if (![item.temp, item.humidity, item.windScale, item.feelsLike].every(value => typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))) return null;
  const result = { temp: Number(item.temp), humidity: Number(item.humidity), windScale: Number(item.windScale), feelsLike: Number(item.feelsLike),
    text: String(item.text || "").slice(0, 40), icon: String(item.icon || ""), windDir: String(item.windDir || "").slice(0, 32), city: config.city, updateTime: now };
  if (!result.text || !/^\d{3}$/.test(result.icon) || ![result.temp, result.humidity, result.windScale, result.feelsLike].every(Number.isFinite)
    || result.temp < -100 || result.temp > 100 || result.humidity < 0 || result.humidity > 100 || result.windScale < 0 || result.windScale > 20 || result.feelsLike < -150 || result.feelsLike > 150) return null;
  return result;
}
function createWeatherService({ env = process.env, fetchImpl = (...args) => global.fetch(...args), lookupImpl = dns.lookup, createDispatcher = options => new Agent(options), now = Date.now, timeoutMs = 4500 } = {}) {
  let entry = null;
  async function load(config) {
    const controller = new AbortController();
    let timer, dispatcher;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Weather timeout")); }, timeoutMs); });
    try {
      return await Promise.race([timeout, (async () => {
        const addresses = await lookupImpl(config.host, { all: true });
        if (controller.signal.aborted || !Array.isArray(addresses) || !addresses.length || addresses.some(item => !item?.address || !net.isIP(item.address) || isPrivateModelHost(item.address))) return unavailable("UNAVAILABLE");
        const pinned = addresses.map(item => ({ address: item.address, family: net.isIP(item.address) }));
        dispatcher = createDispatcher({ connect: { rejectUnauthorized: true, servername: config.host, lookup: (hostname, options, callback) => {
          if (hostname.toLowerCase() !== config.host) return callback(new Error("Unexpected weather host"));
          const family = typeof options === "number" ? options : options?.family;
          const selected = pinned.filter(item => !family || item.family === family);
          if (!selected.length) return callback(new Error("No matching public address"));
          if (typeof options === "object" && options?.all) return callback(null, selected);
          callback(null, selected[0].address, selected[0].family);
        } } });
        const url = new URL(`https://${config.host}/v7/weather/now`);url.searchParams.set("location", config.location);
        const response = await fetchImpl(url.href, { headers: { "X-QW-Api-Key": config.key }, redirect: "error", signal: controller.signal, dispatcher });
        if (!response.ok || Number(response.headers?.get?.("content-length") || 0) > 32768) return unavailable("UNAVAILABLE");
        let raw;
        if (response.body?.getReader) {
          const reader = response.body.getReader(), chunks = [];let bytes = 0;
          try {
            while (true) {
              const chunk = await reader.read();if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 32768) { await reader.cancel(); return unavailable("UNAVAILABLE"); }
              chunks.push(Buffer.from(chunk.value));
            }
            raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } finally { reader.releaseLock(); }
        } else { raw = await response.json(); }
        const data = weatherData(raw, config, now());
        return data ? { available: true, data } : unavailable("UNAVAILABLE");
      })()]);
    } catch { return unavailable("UNAVAILABLE"); }
    finally { clearTimeout(timer); if (dispatcher) void dispatcher.destroy(); }
  }
  return {
    async current() {
      const config = configuration(env);
      if (config.reason) return unavailable(config.reason);
      const key = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
      if (entry?.key === key && entry.value && now() < entry.expires) return entry.value;
      if (entry?.key === key && entry.pending) return entry.pending;
      const current = { key, pending: null, value: null, expires: 0 };entry = current;
      current.pending = load(config).then(value => { current.value = value;current.expires = now() + (value.available ? SUCCESS_TTL : FAILURE_TTL);current.pending = null;return value; });
      return current.pending;
    },
  };
}
module.exports = { createWeatherService };
