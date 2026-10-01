"use strict";

const path = require("node:path");
const semver = require("semver");
const Ajv = require("ajv");
const { PluginError } = require("./errors.js");

const TIERS = Object.freeze({ safe: 0, standard: 1, full: 2 });
const SLOTS = new Set([
  "home.quickActions", "chat.composer.actions", "chat.message.after", "studio.workflowCatalog",
  "studio.promptRail", "studio.workbench.toolbar", "studio.workbench.inspector", "modelCenter.actions",
  "taskCenter.detailActions", "gallery.itemActions", "stats.cards", "settings.sections",
]);
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;

function packageRelativePath(value) {
  if (typeof value !== "string" || !value || value.length > 240 || /[\\:\x00-\x1f]/.test(value)
    || path.posix.isAbsolute(value) || value.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件包包含不安全的文件路径");
  }
  return value;
}

function validateManifest(input, engineVersion = "0.1.0") {
  const fail = message => { throw new PluginError("INVALID_MANIFEST", message); };
  if (!input || input.schemaVersion !== 1 || typeof input !== "object") fail("插件需要 schemaVersion=1 的清单");
  if (!/^[a-z0-9][a-z0-9._-]{1,100}$/.test(input.id || "")) fail("插件 ID 格式无效");
  if (!semver.valid(input.version)) fail("插件版本必须是语义版本号");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100) fail("插件名称无效");
  if (typeof input.description !== "string" || input.description.length > 4000) fail("插件说明无效");
  if (!Object.hasOwn(TIERS, input.requestedPermissionTier)) fail("插件权限档无效");
  if (!semver.validRange(input.engine?.stzh)) fail("插件引擎范围无效");
  if (!semver.satisfies(engineVersion, input.engine.stzh)) throw new PluginError("INCOMPATIBLE_ENGINE", `插件不兼容当前引擎 ${engineVersion}`);
  if (!input.entrypoints || (!input.entrypoints.host && !input.entrypoints.ui)) fail("插件未声明入口");
  for (const entry of Object.values(input.entrypoints)) packageRelativePath(entry);
  if (input.entrypoints.host && !/\.(cjs|mjs|js)$/.test(input.entrypoints.host)) fail("宿主入口必须是 JavaScript 文件");
  if (input.entrypoints.ui && !/\.html$/.test(input.entrypoints.ui)) fail("UI 入口必须是 HTML 文件");
  const contributes = input.contributes;
  if (!contributes || typeof contributes !== "object" || Array.isArray(contributes)) fail("贡献清单无效");
  for (const [kind, items] of Object.entries(contributes)) {
    if (!["tools", "workflows", "slots", "pages"].includes(kind) || !Array.isArray(items) || items.length > 50) fail("贡献类型或数量无效");
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item !== "object") fail("贡献项格式无效");
      const id = kind === "tools" ? item.name : kind === "slots" ? `${item.slot}:${item.uiSurfaceId}` : item.id;
      if (typeof id !== "string" || !id || id.length > 150 || ids.has(id)) fail("贡献标识缺失或重复");
      ids.add(id);
      if (kind === "tools") {
        if (!/^[a-zA-Z][\w.-]*$/.test(item.name) || !["read", "write", "external"].includes(item.risk)) fail("工具名称或风险声明无效");
        if (!Number.isInteger(item.timeoutMs) || item.timeoutMs < 100 || item.timeoutMs > 120000) fail("工具超时必须为100至120000毫秒");
        if (!item.inputSchema || !item.outputSchema || typeof item.inputSchema !== "object" || typeof item.outputSchema !== "object") fail("工具缺少输入输出约束");
        const validator = new Ajv({ strict: false, validateFormats: false });
        try { validator.compile(item.inputSchema); validator.compile(item.outputSchema); }
        catch { fail("工具输入输出的 JSON Schema 无效或包含未解析引用"); }
      }
      if (kind === "slots" && (!SLOTS.has(item.slot) || !Number.isInteger(item.order) || Math.abs(item.order) > 1000)) fail("未知槽位或排序值");
      if (kind === "workflows") {
        if(typeof item.title!=="string"||!item.title.trim()||item.title.length>200||typeof item.description!=="string"||item.description.length>4000)fail("工作流名称或说明无效");
        if(item.entryTool!=null&&(!input.entrypoints.host||!contributes.tools?.some(tool=>tool.name===item.entryTool)))fail("工作流入口必须引用本插件声明的工具");
        if(item.uiSurfaceId!=null&&(!input.entrypoints.ui||typeof item.uiSurfaceId!=="string"||!/^[\w.-]+$/.test(item.uiSurfaceId)))fail("工作流界面缺少有效UI入口");
      }
      if (["slots", "pages"].includes(kind) && (!input.entrypoints.ui || typeof item.uiSurfaceId !== "string" || !/^[\w.-]+$/.test(item.uiSurfaceId))) fail("UI 贡献缺少有效页面入口");
    }
  }
  if (input.runtimeNetwork) {
    if (typeof input.runtimeNetwork.publicInternet !== "boolean" || (input.runtimeNetwork.allowedDomains && (!Array.isArray(input.runtimeNetwork.allowedDomains)
      || input.runtimeNetwork.allowedDomains.some(domain => typeof domain !== "string" || !/^[a-z0-9.-]+$/i.test(domain))))) fail("网络权限声明无效");
  }
  return JSON.parse(JSON.stringify(input));
}

function normalizeFiles(manifest, input, { requireEntrypoints = true } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件文件列表无效");
  const files = new Map();
  const caseFolded = new Set();
  let size = 0;
  for (const [name, value] of Object.entries(input)) {
    packageRelativePath(name);
    if (typeof value !== "string" && !Buffer.isBuffer(value)) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件只接受普通文件，不接受链接或特殊文件");
    const folded = name.toLowerCase();
    if (caseFolded.has(folded)) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件包含大小写冲突文件");
    caseFolded.add(folded);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    size += bytes.length;
    if (size > MAX_PACKAGE_BYTES || files.size >= 1000) throw new PluginError("PACKAGE_TOO_LARGE", "插件解压后不得超过32MB或1000个文件");
    files.set(name, bytes);
  }
  if ([...files.keys()].some(name => name.toLowerCase() === "stzh-plugin.json" && name !== "stzh-plugin.json")) {
    throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件清单文件名大小写冲突");
  }
  files.set("stzh-plugin.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  if (files.size > 1000) throw new PluginError("PACKAGE_TOO_LARGE", "插件文件数量超过1000");
  for (const entry of Object.values(manifest.entrypoints)) {
    if (requireEntrypoints && !files.has(entry)) throw new PluginError("INVALID_MANIFEST", `插件入口 ${entry} 不存在`);
  }
  for (const name of files.keys()) {
    const parts = name.split("/");
    for (let i = 1; i < parts.length; i++) if (files.has(parts.slice(0, i).join("/"))) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "文件与目录路径冲突");
  }
  const prefixes = new Map();
  for (const name of files.keys()) {
    const parts = name.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      const previous = prefixes.get(prefix.toLowerCase());
      if (previous && previous !== prefix) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "文件目录存在大小写冲突");
      prefixes.set(prefix.toLowerCase(), prefix);
    }
  }
  return files;
}

module.exports = { validateManifest, normalizeFiles, packageRelativePath, TIERS, MAX_PACKAGE_BYTES };
