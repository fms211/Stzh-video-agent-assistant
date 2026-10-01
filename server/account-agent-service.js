"use strict";

const { createHash } = require("node:crypto");
const { AgentServiceError, validatePrompt } = require("./agent-service.js");
const { createStudioContextService } = require("./studio-context-service.js");
const { MemoryError } = require("./studio-memory-store.js");
const { sessionStorage } = require("./studio-session-scope.js");
const { prepareCozeHistory } = require("../shared/coze-history.cjs");

// One lock registry per database, shared by the queue and direct Agent routes.
const databaseLocks = new WeakMap();

function createAccountAgentService({ db, service, namespace }) {
  const studioContext = createStudioContextService(db);
  const scope = namespace || `${service.baseUrl || "configured"}/${service.botId || "bot"}`;
  db.exec(`CREATE TABLE IF NOT EXISTS coze_conversation_links (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL,
    local_id TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, namespace, local_id)
  )`);
  const read = db.prepare("SELECT remote_id FROM coze_conversation_links WHERE user_id = ? AND namespace = ? AND local_id = ?");
  const write = db.prepare(`INSERT INTO coze_conversation_links (user_id, namespace, local_id, remote_id)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id, namespace, local_id)
    DO UPDATE SET remote_id = excluded.remote_id, updated_at = unixepoch()`);
  if (!databaseLocks.has(db)) databaseLocks.set(db, new Set());
  const locks = databaseLocks.get(db);

  return {
    async generate(options = {}) {
      const { accountId, conversationId, userId: _untrustedUserId, ...input } = options;
      if (!Number.isSafeInteger(accountId) || accountId <= 0) {
        throw new AgentServiceError("生成请求缺少有效的账户身份", { status: 400, code: "INVALID_ACCOUNT" });
      }
      const localId = typeof conversationId === "string" ? conversationId.trim() : "";
      const projectId = input.projectId;
      if (projectId !== undefined && (typeof projectId !== "string" || !projectId.trim() || projectId.length > 200)) {
        throw new AgentServiceError("项目标识无效", { status: 400, code: "INVALID_PROJECT" });
      }
      // Distinct projects must never resume each other's remote history.
      const conversationScope = projectId ? JSON.stringify([scope, "project", projectId]) : scope;
      if (localId.length > 256) {
        throw new AgentServiceError("本地会话标识过长", { status: 400, code: "INVALID_CONVERSATION" });
      }
      const lockKey = JSON.stringify([accountId, scope, localId]);
      if (localId && locks.has(lockKey)) {
        throw new AgentServiceError("当前会话已有生成任务，请等待完成后继续", { status: 409, code: "CONVERSATION_BUSY" });
      }
      if (localId) locks.add(lockKey);
      try {
        const remoteId = localId ? read.get(accountId, conversationScope, localId)?.remote_id : null;
        const userId = `stzh_${createHash("sha256").update(JSON.stringify([scope, accountId])).digest("hex").slice(0, 48)}`;
        const prompt = validatePrompt(input.prompt);
        // A new local UUID can precede persistence. Only a saved, owned
        // conversation can authorize session-scoped memory.
        const hasConversations = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conversations'").get();
        const hasOpc=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='opc_sessions'").get();
        const savedOpc=localId&&hasOpc?db.prepare("SELECT user_id FROM opc_sessions WHERE id=?").get(localId):null;
        const saved = savedOpc || (localId && hasConversations ? db.prepare("SELECT user_id FROM conversations WHERE id=?").get(localId) : null);
        if (saved && saved.user_id !== accountId) throw new AgentServiceError("会话不可用", { status: 404, code: "CONVERSATION_UNAVAILABLE" });
        const savedStorage = saved ? sessionStorage(db,accountId,"coze",localId) : null;
        if (saved && !savedStorage) throw new AgentServiceError("该会话不属于Coze创作，请使用对应模式继续", {status:409,code:"SESSION_MODE_CONFLICT"});
        // Remote Coze already owns preceding turns. Never copy them a second
        // time merely to construct the local memory packet.
        if (input.historyOmitted !== undefined && typeof input.historyOmitted !== "boolean") throw new AgentServiceError("历史省略标记无效", { status: 400, code: "INVALID_CONTEXT" });
        const localHistory = prepareCozeHistory(input.history);
        const history = remoteId ? [] : localHistory.history.map(({ role, content }) => ({ role, content }));
        if (projectId && !db.prepare("SELECT 1 FROM creative_projects WHERE id=? AND user_id=?").get(projectId,accountId)) throw new AgentServiceError("项目不可用",{status:404,code:"PROJECT_UNAVAILABLE"});
        const prepared = studioContext.prepare({ userId: accountId, mode: "coze", messages: [...history, { role: "user", content: prompt }], scope: { ...(savedStorage ? { sessionId: localId } : {}), ...(projectId ? {projectId} : {}) }, currentConstraints:input.currentConstraints, excludedMemoryIds:input.excludedMemoryIds });
        prepared.trace.clientHistoryOmitted = input.historyOmitted === true || localHistory.historyOmitted;
        prepared.trace.remoteHistoryTokens = "unknown";
        const result = await service.generate({ ...input, userId, conversationId: remoteId || null,
          preparedMessages: prepared.trace.applied ? prepared.messages : undefined,
        });
        if (input.signal?.aborted) throw input.signal.reason || new DOMException("Aborted", "AbortError");
        if (localId && typeof result.conversationId === "string" && result.conversationId.trim()) {
          write.run(accountId, conversationScope, localId, result.conversationId.trim());
        }
        return { ...result, contextTrace: prepared.trace };
      } catch (error) {
        if (error instanceof MemoryError) throw new AgentServiceError(error.message, { code: error.code, status: error.status });
        throw error;
      } finally {
        if (localId) locks.delete(lockKey);
      }
    },
  };
}

module.exports = { createAccountAgentService };
