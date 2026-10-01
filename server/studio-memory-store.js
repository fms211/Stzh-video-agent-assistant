"use strict";

const { randomUUID, createHash } = require("node:crypto");
const { MODES, validMemory, selectMemories } = require("../shared/studio-context/index.cjs");
const { sessionStorage } = require("./studio-session-scope.js");
class MemoryError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new MemoryError(code, message, status); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && value.trim() && value.length <= 200;
const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : object(value)
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const verification = () => ({ state: "unverified", evidenceIds: [], appliesTo: {}, openQuestions: [] });
function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail("INVALID_MEMORY_INPUT", "记忆字段无效或包含只读字段");
}

function createStudioMemoryStore(db, { now = () => new Date().toISOString() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS studio_memories (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, item TEXT NOT NULL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_studio_memories_owner ON studio_memories(user_id,id);
  CREATE TABLE IF NOT EXISTS studio_memory_requests (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_hash TEXT NOT NULL, payload_hash TEXT NOT NULL, memory_id TEXT NOT NULL,
    PRIMARY KEY(user_id,request_hash)
  );`);
  const index = require("./studio-memory-index.js").createStudioMemoryIndex(db);
  const owner = userId => {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !db.prepare("SELECT 1 FROM users WHERE id=?").get(userId)) fail("AUTH_REQUIRED", "请先登录", 401);
  };
  const tableExists = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  function sessionOwned(userId, mode, sessionId) {
    return Boolean(sessionStorage(db,userId,mode,sessionId));
  }
  function runOwned(userId, mode, runId) {
    if (mode === "collaboration") return db.prepare("SELECT project_id AS projectId FROM agent_runs WHERE id=? AND user_id=?").get(runId, userId) || null;
    if (mode === "workflow" && tableExists("research_runs")) {
      const row = db.prepare("SELECT snapshot FROM research_runs WHERE id=? AND user_id=?").get(runId, userId);
      if (row) { const snapshot = JSON.parse(row.snapshot); return { projectId: snapshot.input?.projectId, snapshot }; }
    }
    return null;
  }
  function scopeOwned(userId, scope) {
    if (!object(scope)) return false;
    if (scope.kind === "user") return Object.keys(scope).length === 1;
    if (scope.kind === "project") return Object.keys(scope).length === 2 && id(scope.projectId) && !!db.prepare("SELECT 1 FROM creative_projects WHERE id=? AND user_id=?").get(scope.projectId, userId);
    if (Object.keys(scope).length !== 3 || !MODES.includes(scope.mode)) return false;
    if (scope.kind === "session") return id(scope.sessionId) && sessionOwned(userId, scope.mode, scope.sessionId);
    return scope.kind === "run" && id(scope.runId) && !!runOwned(userId, scope.mode, scope.runId);
  }
  function sourceOwned(userId, source, memoryId) {
    if (!object(source) || !MODES.includes(source.mode) || !id(source.recordId)) return false;
    if (Object.keys(source).some(key => !["mode", "recordId", "sessionId", "runId", "artifactIds", "fingerprint"].includes(key))) return false;
    if (source.recordId === `manual:${memoryId}`) return Object.keys(source).length === 2;
    if (source.sessionId && !source.runId && !source.artifactIds) {
      if (!id(source.sessionId) || !sessionOwned(userId, source.mode, source.sessionId)) return false;
      const sql = sessionStorage(db,userId,source.mode,source.sessionId)==="legacy" ? "SELECT 1 FROM messages WHERE id=? AND conversation_id=?" : "SELECT 1 FROM opc_messages WHERE id=? AND session_id=?";
      return !!db.prepare(sql).get(source.recordId, source.sessionId);
    }
    if (!source.runId || source.sessionId || source.recordId !== source.runId || !id(source.runId)) return false;
    const run = runOwned(userId, source.mode, source.runId);
    if (!run) return false;
    if (source.artifactIds !== undefined) {
      if (!Array.isArray(source.artifactIds) || !source.artifactIds.every(id) || !run.snapshot) return false;
      const allowed = new Set((run.snapshot.artifacts || []).map(artifact => artifact.id));
      if (source.artifactIds.some(value => !allowed.has(value))) return false;
    }
    return true;
  }
  function get(userId, memoryId) {
    owner(userId);
    if (!id(memoryId)) fail("INVALID_MEMORY_INPUT", "记忆ID无效");
    const row = db.prepare("SELECT item FROM studio_memories WHERE id=? AND user_id=?").get(memoryId, userId);
    if (!row) fail("MEMORY_NOT_FOUND", "记忆不存在", 404);
    return JSON.parse(row.item);
  }
  function available(userId, item) {
    return ["manual", "current"].includes(sourceState(userId, item));
  }
  function sourceSnapshot(userId, source) {
    if (source.sessionId) {
      return sessionStorage(db,userId,source.mode,source.sessionId)==="legacy"
        ? db.prepare("SELECT role,content,payload,is_error,error_text FROM messages WHERE id=? AND conversation_id=?").get(source.recordId, source.sessionId)
        : db.prepare("SELECT role,content,metadata FROM opc_messages WHERE id=? AND session_id=?").get(source.recordId, source.sessionId);
    }
    if (source.mode === "collaboration") return db.prepare("SELECT task,status,team_snapshot,final_instruction,rationale,risks,task_id,error FROM agent_runs WHERE id=? AND user_id=?").get(source.runId, userId);
    const run = runOwned(userId, source.mode, source.runId);
    if (!run?.snapshot) return null;
    const snapshot = run.snapshot;
    return source.artifactIds?.length
      ? { artifacts: snapshot.artifacts.filter(item => source.artifactIds.includes(item.id)).sort((a,b) => a.id.localeCompare(b.id)) }
      : { input: snapshot.input, status: snapshot.status, plan: snapshot.plan, artifacts: snapshot.artifacts };
  }
  function sourceState(userId, item) {
    if (!scopeOwned(userId, item.scope) || !sourceOwned(userId, item.source, item.id)) return "unavailable";
    if (item.source.recordId === `manual:${item.id}`) return "manual";
    if (!item.source.fingerprint) return "untracked";
    return item.source.fingerprint === hash(canonical(sourceSnapshot(userId, item.source))) ? "current" : "changed";
  }
  function readSource(userId, memoryId) {
    const item = get(userId, memoryId);
    if (!scopeOwned(userId, item.scope) || !sourceOwned(userId, item.source, item.id)) fail("MEMORY_SOURCE_UNAVAILABLE", "记忆来源不可用", 404);
    if (item.source.recordId === `manual:${item.id}`) return { state: "manual", content: item.content, fingerprint: null, truncated: false };
    const serialized = canonical(sourceSnapshot(userId, item.source));
    return { state: sourceState(userId, item), content: serialized.slice(0, 20000), fingerprint: hash(serialized), truncated: serialized.length > 20000 };
  }
  function refreshSource(userId, memoryId, input) {
    fields(input, ["expectedRevision", "expectedSourceFingerprint"]);
    return mutate(userId, memoryId, input.expectedRevision, current => {
      const fresh = readSource(userId, memoryId);
      if (fresh.state === "manual" || !fresh.fingerprint || input.expectedSourceFingerprint !== fresh.fingerprint) fail("MEMORY_SOURCE_CONFLICT", "来源已变化，请重新读取并核对", 409);
      const updated = { ...current, source: { ...current.source, fingerprint: fresh.fingerprint }, status: "candidate", verification: verification() };
      validate(updated, userId);
      return updated;
    });
  }
  function validate(item, userId) {
    if (!validMemory(item) || item.content.length > 4000 || (item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(now()))) fail("INVALID_MEMORY_INPUT", "记忆格式、长度或有效期无效");
    if (item.sensitivity !== "normal" || /\b(?:pat_|sk-)[a-zA-Z0-9_-]{16,}/.test(item.content)) fail("SENSITIVE_MEMORY", "此类敏感内容不能保存为长期记忆");
    if (!available(userId, item)) fail("MEMORY_SOURCE_UNAVAILABLE", "记忆范围或来源不可用", 404);
  }
  function create(userId, input) {
    owner(userId);
    fields(input, ["requestKey", "content", "scope", "mode", "kind", "claimKind", "importance", "expiresAt", "slot", "source"]);
    if (!id(input.requestKey) || !MODES.includes(input.mode) || typeof input.content !== "string") fail("INVALID_MEMORY_INPUT", "缺少有效幂等键、模式或正文");
    if (input.source && Object.hasOwn(input.source, "fingerprint")) fail("INVALID_MEMORY_INPUT", "来源版本由服务端读取，不能指定");
    const requestHash = hash(input.requestKey), payloadHash = hash(canonical(input));
    return db.transaction(() => {
      const previous = db.prepare("SELECT * FROM studio_memory_requests WHERE user_id=? AND request_hash=?").get(userId, requestHash);
      if (previous) {
        if (previous.payload_hash !== payloadHash) fail("MEMORY_REQUEST_CONFLICT", "该保存请求已经用于其他内容", 409);
        const row = db.prepare("SELECT item FROM studio_memories WHERE id=? AND user_id=?").get(previous.memory_id, userId);
        if (!row) fail("MEMORY_DELETED", "该请求创建的记忆已删除，不会重新保存", 410);
        return { item: JSON.parse(row.item), created: false };
      }
      const memoryId = `memory_${randomUUID()}`, timestamp = now();
      const item = {
        id: memoryId, ownerUserId: userId, content: input.content.trim(), scope: input.scope === undefined ? { kind: "user" } : input.scope,
        kind: input.kind === undefined ? "semantic" : input.kind, claimKind: input.claimKind === undefined ? "preference" : input.claimKind, status: "candidate", enabled: true,
        revision: 1, confidence: 1, importance: input.importance ?? 0.5, sensitivity: "normal",
        source: input.source === undefined ? { mode: input.mode, recordId: `manual:${memoryId}` } : input.source, verification: verification(),
        createdAt: timestamp, updatedAt: timestamp,
        ...(input.slot !== undefined ? { slot: input.slot } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : input.kind === "working" ? { expiresAt: new Date(Date.parse(timestamp) + 3600000).toISOString() } : {}),
      };
      if (!validMemory(item)) fail("INVALID_MEMORY_INPUT", "记忆格式无效");
      if (!scopeOwned(userId, item.scope) || !sourceOwned(userId, item.source, item.id)) fail("MEMORY_SOURCE_UNAVAILABLE", "记忆范围或来源不可用", 404);
      if (input.source !== undefined) item.source = { ...item.source, fingerprint: hash(canonical(sourceSnapshot(userId, item.source))) };
      validate(item, userId);
      // Different requests can refer to the same unchanged source. Reuse only
      // exact content/scope/settings matches; never treat repetition as evidence
      // or merge conflicting statements. Existing disabled/candidate state wins.
      if (input.source !== undefined) {
        const identity = value => canonical({ content: value.content, scope: value.scope, source: value.source, kind: value.kind, claimKind: value.claimKind, importance: value.importance, expiresAt: value.expiresAt, slot: value.slot });
        const key = identity(item);
        const same = db.prepare("SELECT item FROM studio_memories WHERE user_id=? ORDER BY id").all(userId)
          .map(row => JSON.parse(row.item)).find(value => identity(value) === key);
        if (same) {
          db.prepare("INSERT INTO studio_memory_requests(user_id,request_hash,payload_hash,memory_id) VALUES(?,?,?,?)").run(userId, requestHash, payloadHash, same.id);
          return { item: same, created: false };
        }
      }
      if (db.prepare("SELECT COUNT(*) AS count FROM studio_memories WHERE user_id=?").get(userId).count >= 1000) fail("MEMORY_LIMIT", "记忆已达1000条，请先整理或删除", 409);
      db.prepare("INSERT INTO studio_memories(id,user_id,revision,item,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(memoryId, userId, 1, JSON.stringify(item), timestamp, timestamp);
      db.prepare("INSERT INTO studio_memory_requests(user_id,request_hash,payload_hash,memory_id) VALUES(?,?,?,?)").run(userId, requestHash, payloadHash, memoryId);
      return { item, created: true };
    })();
  }
  function mutate(userId, memoryId, expectedRevision, apply) {
    owner(userId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) fail("INVALID_MEMORY_INPUT", "必须提供有效版本号");
    return db.transaction(() => {
      const current = get(userId, memoryId);
      if (current.revision !== expectedRevision) fail("MEMORY_REVISION_CONFLICT", "记忆已变化，请读取最新版本后操作", 409);
      const updated = apply(current);
      if (updated === null) {
        db.prepare("DELETE FROM studio_memories WHERE id=? AND user_id=? AND revision=?").run(memoryId, userId, expectedRevision);
        return null;
      }
      updated.revision = current.revision + 1; updated.updatedAt = now();
      db.prepare("UPDATE studio_memories SET revision=?,item=?,updated_at=? WHERE id=? AND user_id=? AND revision=?").run(updated.revision, JSON.stringify(updated), updated.updatedAt, memoryId, userId, expectedRevision);
      return updated;
    })();
  }
  function update(userId, memoryId, input) {
    fields(input, ["expectedRevision", "content", "scope", "importance", "expiresAt", "slot", "enabled"]);
    if (Object.keys(input).length < 2) fail("INVALID_MEMORY_INPUT", "没有需要修改的字段");
    return mutate(userId, memoryId, input.expectedRevision, current => {
      const { expectedRevision: _revision, ...patch } = input;
      const updated = { ...current, ...patch };
      if (patch.expiresAt === null) delete updated.expiresAt;
      if (patch.slot === null) delete updated.slot;
      const changedMeaning = ["content", "scope", "slot"].some(key => Object.hasOwn(patch, key) && canonical(updated[key]) !== canonical(current[key]));
      if (changedMeaning) { updated.status = "candidate"; updated.verification = verification(); }
      // Disabling must still work after a source is revoked or the item expires.
      const disablingOnly = Object.keys(patch).length === 1 && patch.enabled === false;
      if (!disablingOnly) validate(updated, userId);
      return updated;
    });
  }
  function confirm(userId, memoryId, expectedRevision) {
    return mutate(userId, memoryId, expectedRevision, current => {
      validate(current, userId);
      // Confirmation authorizes use, never turns a statement into verified fact.
      return { ...current, status: "confirmed" };
    });
  }
  function list(userId, { limit = 50, after = "" } = {}) {
    owner(userId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof after !== "string" || after.length > 200) fail("INVALID_MEMORY_INPUT", "分页参数无效");
    const rows = db.prepare("SELECT item FROM studio_memories WHERE user_id=? AND id>? ORDER BY id LIMIT ?").all(userId, after, limit + 1);
    const items = rows.slice(0, limit).map(row => { const item = JSON.parse(row.item); return { ...item, sourceAvailable: Boolean(available(userId, item)), sourceState: sourceState(userId, item) }; });
    return { items, nextCursor: rows.length > limit ? items.at(-1).id : null };
  }
  function exportItems(userId) {
    owner(userId);
    return { schemaVersion: 1, exportedAt: now(), items: db.prepare("SELECT item FROM studio_memories WHERE user_id=? ORDER BY id").all(userId).map(row => JSON.parse(row.item)) };
  }
  function authorizeScope(userId, input) {
    owner(userId);
    fields(input, ["mode", "projectId", "sessionId", "runId", "currentConstraints"]);
    if (!MODES.includes(input.mode)) fail("INVALID_MEMORY_INPUT", "模式无效");
    const context = { ownerUserId: userId, mode: input.mode, now: now(), versions: {}, currentConstraints: input.currentConstraints ?? {} };
    for (const key of ["projectId", "sessionId", "runId"]) if (input[key] !== undefined) {
      if (!id(input[key])) fail("INVALID_MEMORY_INPUT", "查询范围无效");
      context[key] = input[key];
    }
    if (context.projectId && !scopeOwned(userId, { kind: "project", projectId: context.projectId })) fail("MEMORY_SCOPE_UNAVAILABLE", "项目不可用", 404);
    if (context.sessionId && !sessionOwned(userId, context.mode, context.sessionId)) fail("MEMORY_SCOPE_UNAVAILABLE", "会话不可用", 404);
    if (context.runId) {
      const run = runOwned(userId, context.mode, context.runId);
      if (!run || (context.projectId && run.projectId !== context.projectId)) fail("MEMORY_SCOPE_UNAVAILABLE", "运行不可用或不属于所选项目", 404);
      if (run.projectId) {
        if (!scopeOwned(userId, { kind: "project", projectId: run.projectId })) fail("MEMORY_SCOPE_UNAVAILABLE", "运行项目不可用", 404);
        context.projectId = run.projectId;
      }
    }
    return context;
  }
  function search(userId, input, { restrictionQuery } = {}) {
    fields(input, ["query", "mode", "projectId", "sessionId", "runId", "currentConstraints", "limit", "excludedMemoryIds"]);
    if (typeof input.query !== "string" || input.query.length > 8000) fail("INVALID_MEMORY_INPUT", "查询无效");
    const { query, limit, excludedMemoryIds, ...scopeInput } = input;
    const context = authorizeScope(userId, scopeInput);
    const items = index.search(userId, query);
    try {
      return selectMemories({ items, query, restrictionQuery, context, limit: limit ?? 5, excludedMemoryIds, authorize: item => available(userId, item) });
    } catch (error) {
      if (error instanceof TypeError) fail("INVALID_MEMORY_INPUT", "检索参数无效");
      throw error;
    }
  }
  return { create, get, update, confirm, list, exportItems, search, authorizeScope, available, sourceState, readSource, refreshSource, remove: (userId, memoryId, revision) => mutate(userId, memoryId, revision, () => null) };
}

module.exports = { createStudioMemoryStore, MemoryError };
