"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");
const semver = require("semver");
const tar = require("tar");
const yauzl = require("yauzl");
const { PluginError } = require("./errors.js");
const { validateManifest, packageRelativePath, MAX_PACKAGE_BYTES } = require("./manifest.js");
const { SCRIPT_ORDER } = require("./build-runner.js");

function failure(message) { return new PluginError("SOURCE_RESOLUTION_FAILED", message); }

function archiveCollector() {
  const files = Object.create(null);
  const names = new Set();
  let total = 0;
  return {
    files,
    add(name, chunks) {
      packageRelativePath(name);
      if (names.has(name.toLowerCase())) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "压缩包包含重复文件名");
      const bytes = Buffer.concat(chunks);
      total += bytes.length;
      if (names.size >= 1000 || total > MAX_PACKAGE_BYTES) throw new PluginError("PACKAGE_TOO_LARGE", "压缩包解压后超过限制");
      names.add(name.toLowerCase());
      files[name] = bytes;
    },
  };
}

async function unpackZip(bytes) {
  const collector = archiveCollector();
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(failure("插件包不是有效的 ZIP 文件"));
      let failed = false;
      const fail = cause => { if (!failed) { failed = true; zip.close(); reject(cause instanceof PluginError ? cause : new PluginError("PACKAGE_BOUNDARY_VIOLATION", `插件压缩包校验失败：${cause.message}`)); } };
      zip.on("error", fail);
      zip.on("end", resolve);
      zip.on("entry", entry => {
        try {
          packageRelativePath(entry.fileName.replace(/\/$/, ""));
          const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (entry.generalPurposeBitFlag & 1 || ![0, 0o100000, 0o040000].includes(fileType)) throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "压缩包包含加密、链接或特殊文件");
          if (entry.uncompressedSize > MAX_PACKAGE_BYTES) throw new PluginError("PACKAGE_TOO_LARGE", "压缩包单文件超过限制");
          if (entry.fileName.endsWith("/")) { zip.readEntry(); return; }
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError) return fail(streamError);
            const chunks = [];
            let size = 0;
            stream.on("error", fail);
            stream.on("data", chunk => {
              size += chunk.length;
              if (size > MAX_PACKAGE_BYTES) { stream.destroy(); fail(new PluginError("PACKAGE_TOO_LARGE", "压缩包展开超过限制")); }
              else chunks.push(chunk);
            });
            stream.on("end", () => {
              if (failed) return;
              try { collector.add(entry.fileName, chunks); zip.readEntry(); } catch (cause) { fail(cause); }
            });
          });
        } catch (cause) { fail(cause); }
      });
      zip.readEntry();
    });
  });
  return collector.files;
}

async function unpackTar(bytes) {
  const collector = archiveCollector();
  await new Promise((resolve, reject) => {
    let failed = false;
    const parser = new tar.Parser({ strict: true });
    const fail = error => { if (!failed) { failed = true; reject(error); parser.abort(error); } };
    parser.on("error", error => { if (!failed) { failed = true; reject(error); } });
    parser.on("entry", entry => {
      try {
        packageRelativePath(entry.path.replace(/\/$/, ""));
        if (entry.type === "Directory") { entry.resume(); return; }
        if (entry.type !== "File") throw new PluginError("PACKAGE_BOUNDARY_VIOLATION", "插件包不允许链接或特殊文件");
        if (entry.size > MAX_PACKAGE_BYTES) throw new PluginError("PACKAGE_TOO_LARGE", "压缩包单文件超过限制");
        const chunks = [];
        let size = 0;
        entry.on("data", chunk => {
          size += chunk.length;
          if (size > MAX_PACKAGE_BYTES) fail(new PluginError("PACKAGE_TOO_LARGE", "插件包展开超过限制"));
          else chunks.push(chunk);
        });
        entry.on("end", () => { if (!failed) { try { collector.add(entry.path, chunks); } catch (error) { fail(error); } } });
        entry.on("error", fail);
      } catch (error) { entry.resume(); fail(error); }
    });
    parser.on("end", () => { if (!failed) resolve(); });
    parser.end(bytes);
  });
  return collector.files;
}

function stripRoot(files) {
  if (Object.hasOwn(files, "stzh-plugin.json")) return files;
  const names = Object.keys(files);
  const first = names[0]?.split("/")[0];
  if (first && names.every(name => name.startsWith(`${first}/`))) {
    return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name.slice(first.length + 1), bytes]));
  }
  return files;
}

async function readResponse(response, maximum) {
  if (!response.ok) throw failure(`插件来源返回 HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > maximum) throw new PluginError("PACKAGE_TOO_LARGE", "下载内容超过大小限制");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new PluginError("PACKAGE_TOO_LARGE", "下载内容超过大小限制");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}

class SourceResolver {
  constructor({ fetchImpl = global.fetch, loadUpload, catalog = [] } = {}) {
    this.fetch = fetchImpl;
    this.loadUpload = loadUpload;
    this.catalog = catalog;
  }

  async download(url, maximum = 16 * 1024 * 1024) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
      || !["registry.npmjs.org", "api.github.com", "codeload.github.com"].includes(parsed.hostname)) throw failure("插件下载地址不属于受支持的官方来源");
    const response = await this.fetch(parsed.href, { redirect: "error", signal: AbortSignal.timeout(30000), headers: { "User-Agent": "STZH-Plugin-Resolver/1" } });
    return readResponse(response, maximum);
  }

  async resolve(userId, source) {
    let bytes, resolvedRef, format = "tar";
    if (!source || typeof source !== "object") throw failure("插件来源无效");
    if (source.type === "catalog") {
      const item = this.catalog.find(item => item.catalogId === source.catalogId && item.version === source.version);
      if (!item) throw failure("目录中没有此插件版本");
      const result = await this.resolve(userId, item.source);
      return { ...result, source, signature: item.signature || result.signature, publisher: item.publisher };
    }
    if (source.type === "local") {
      if (!this.loadUpload || typeof source.uploadToken !== "string") throw failure("请先上传本地插件包");
      bytes = await this.loadUpload(userId, source.uploadToken);
      if (!Buffer.isBuffer(bytes) || bytes.length > 16 * 1024 * 1024) throw new PluginError("PACKAGE_TOO_LARGE", "本地插件包无效或超过16MB");
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== source.contentHash) throw new PluginError("PREVIEW_HASH_MISMATCH", "上传包内容与哈希不一致");
      resolvedRef = actual;
      format = "zip";
    } else if (source.type === "npm") {
      const match = /^(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*)(?:@([^\s]+))?$/.exec(source.spec || "");
      if (!match) throw failure("请使用 npm 包名或包名@版本，不支持脚本或本地路径");
      const metadata = JSON.parse((await this.download(`https://registry.npmjs.org/${encodeURIComponent(match[1])}`, 8 * 1024 * 1024)).toString("utf8"));
      const range = match[2] || "latest";
      const version = metadata["dist-tags"]?.[range] || (semver.validRange(range) ? semver.maxSatisfying(Object.keys(metadata.versions || {}), range) : null);
      const release = version && metadata.versions?.[version];
      if (!release?.dist?.tarball) throw failure("npm 版本不存在");
      bytes = await this.download(release.dist.tarball);
      const integrity = release.dist.integrity;
      const integrityMatch = /^(sha512|sha256)-([A-Za-z0-9+/=]+)$/.exec(integrity || "");
      if (!integrityMatch) throw failure("npm 包缺少支持的完整性摘要");
      const actual = createHash(integrityMatch[1]).update(bytes).digest();
      const expected = Buffer.from(integrityMatch[2], "base64");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PluginError("PREVIEW_HASH_MISMATCH", "npm 包完整性校验失败");
      resolvedRef = `${match[1]}@${version}`;
    } else if (source.type === "git") {
      let url;
      try { url = new URL(source.url); } catch { throw failure("Git 地址无效"); }
      const match = /^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.search || url.hash || !match) throw failure("当前 Git 来源支持公开 GitHub HTTPS 仓库");
      const ref = source.ref || "HEAD";
      if (typeof ref !== "string" || ref.length > 200) throw failure("Git 引用无效");
      const commit = JSON.parse((await this.download(`https://api.github.com/repos/${match[1]}/${match[2]}/commits/${encodeURIComponent(ref)}`, 8 * 1024 * 1024)).toString("utf8"));
      if (!/^[a-f0-9]{40}$/.test(commit.sha || "")) throw failure("Git 来源没有返回不可变提交");
      bytes = await this.download(`https://codeload.github.com/${match[1]}/${match[2]}/tar.gz/${commit.sha}`);
      resolvedRef = commit.sha;
    } else throw failure("不支持的插件来源");
    const files = stripRoot(await (format === "zip" ? unpackZip(bytes) : unpackTar(bytes)));
    let rawManifest;
    try { rawManifest = JSON.parse(files["stzh-plugin.json"].toString("utf8")); }
    catch { throw new PluginError("INVALID_MANIFEST", "插件包缺少有效的 stzh-plugin.json"); }
    const manifest = validateManifest(rawManifest);
    if (source.type === "npm" && manifest.version !== resolvedRef.slice(resolvedRef.lastIndexOf("@") + 1)) {
      throw new PluginError("INVALID_MANIFEST", "插件清单版本与 npm 解析版本不一致");
    }
    let packageJson = {};
    if (files["package.json"]) {
      try { packageJson = JSON.parse(files["package.json"].toString("utf8")); }
      catch { throw new PluginError("INVALID_MANIFEST", "package.json 格式无效"); }
    }
    let signature = null;
    if (files["stzh-plugin.sig.json"]) {
      try { signature = JSON.parse(files["stzh-plugin.sig.json"].toString("utf8")); }
      catch { throw new PluginError("SIGNATURE_INVALID", "插件签名文件无效"); }
      delete files["stzh-plugin.sig.json"];
    }
    return { source, resolvedRef, manifest, files, signature,
      dependencies: Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.optionalDependencies, ...packageJson.peerDependencies }).map(([name, version]) => ({ name, version: String(version) })),
      buildScripts: SCRIPT_ORDER.filter(name => packageJson.scripts?.[name]).map(name => ({ name, command: String(packageJson.scripts[name]) })),
    };
  }
}

module.exports = { SourceResolver, unpackZip, unpackTar, stripRoot, readResponse };
