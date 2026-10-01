"use strict";
const { randomUUID, createHash } = require("node:crypto");
const { MemoryError } = require("./studio-memory-store.js");
const { sessionStorage } = require("./studio-session-scope.js");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message, status = 400) => { throw new MemoryError("SUMMARY_UNAVAILABLE", message, status); };
function usableExcerpt(message) {
  if (message.is_error) return false;
  if (message.metadata) {
    try {
      const metadata = JSON.parse(message.metadata);
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.isError) return false;
    } catch { return false; }
  }
  return typeof message.content === "string";
}

function createStudioSummaryStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS studio_summaries (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL,
    identity TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(user_id,mode,session_id,identity)
  )`);
  function authorize(userId, mode, sessionId) {
    if (!Number.isSafeInteger(userId) || !db.prepare("SELECT 1 FROM users WHERE id=?").get(userId)) fail("请先登录", 401);
    if (!["coze", "assistant", "workflow"].includes(mode) || typeof sessionId !== "string" || !sessionId || sessionId.length > 200) fail("摘要会话参数无效");
    if(!sessionStorage(db,userId,mode,sessionId))fail("会话不可用",404);
  }
  function messages(mode, sessionId, userId) {
    return sessionStorage(db,userId,mode,sessionId)==="legacy"
      ? db.prepare("SELECT id,role,content,payload,is_error,error_text FROM messages WHERE conversation_id=? ORDER BY created_at,id LIMIT 2001").all(sessionId)
      : db.prepare("SELECT id,role,content,metadata FROM opc_messages WHERE session_id=? ORDER BY timestamp,id LIMIT 2001").all(sessionId);
  }
  function build(userId, { mode, sessionId, keepRecent = 10, query = "", summary } = {}) {
    authorize(userId, mode, sessionId);
    if (!Number.isInteger(keepRecent) || keepRecent < 0 || keepRecent > 200 || typeof query !== "string" || query.length > 8000
      || (summary !== undefined && (typeof summary !== "string" || !summary.trim() || summary.length > 8000 || /\b(?:pat_|sk-)[a-zA-Z0-9_-]{16,}/.test(summary)))) fail("摘要参数无效");
    return db.transaction(() => {
      const all = messages(mode, sessionId,userId);
      if (all.length > 2000) fail("会话超过2000条，请先缩小摘要范围；原始记录未修改", 413);
      let boundary = Math.max(0, all.length - keepRecent);
      // Do not split a user turn from the replies retained as recent history.
      if (boundary < all.length && ["assistant", "agent"].includes(all[boundary].role)) {
        while (boundary > 0 && all[boundary - 1].role !== "user") boundary--;
        if (boundary > 0) boundary--;
      }
      const covered = all.slice(0, boundary);
      if (!covered.length) return { item: null, created: false, reason: "no_older_messages" };
      const sources = covered.map(message => ({ id: message.id, fingerprint: hash(message) }));
      const algorithm = summary === undefined ? "extractive-turns-v3" : "user-supplied-v1";
      const identity = hash({ sources, algorithm, query, summary });
      const prior = db.prepare("SELECT payload FROM studio_summaries WHERE user_id=? AND mode=? AND session_id=? AND identity=?").get(userId, mode, sessionId, identity);
      if (prior) return { item: JSON.parse(prior.payload), created: false };
      if(db.prepare("SELECT COUNT(*) AS count FROM studio_summaries WHERE user_id=?").get(userId).count>=1000)fail("摘要已达1000条，请先整理",409);
      const terms = query.normalize("NFKC").toLowerCase().match(/[a-z0-9_-]+|[\u3400-\u9fff]{2}/g) || [];
      const turns = [];
      let turn = null;
      for (const [index, message] of covered.entries()) {
        const usable = usableExcerpt(message) && message.content.trim()
          && !/\b(?:pat_|sk-)[a-zA-Z0-9_-]{16,}/.test(message.content);
        if (message.role === "user") {
          turn = usable ? { id: message.id, entries: [], score: 0, index } : null;
          if (turn) turns.push(turn);
        } else if (!["assistant", "agent"].includes(message.role)) {
          turn = null;
        }
        if (!turn || !usable) continue;
        turn.entries.push({ message, index });
        turn.score = Math.max(turn.score, terms.filter(term => message.content.toLowerCase().includes(term)).length);
      }
      const candidates = turns.sort((a,b) => b.score-a.score || b.index-a.index);
      const excerpts = [];
      let used = 0;
      if (summary === undefined) for (const turn of candidates) {
        const cost = turn.entries.reduce((sum, {message}) => sum + Buffer.byteLength(message.content, "utf8"), 0);
        // Keep the user's qualifications with the answer, or omit the entire turn.
        if (used + cost > 3000 || excerpts.length + turn.entries.length > 6) continue;
        for (const {message,index} of turn.entries) excerpts.push({ messageId: message.id, turnId: turn.id, role: message.role, content: message.content, index });
        used += cost;
      }
      excerpts.sort((a,b) => a.index-b.index);
      const revision = db.prepare("SELECT COALESCE(MAX(revision),0)+1 AS next FROM studio_summaries WHERE user_id=? AND mode=? AND session_id=?").get(userId, mode, sessionId).next;
      const item = { id: `summary_${randomUUID()}`, ownerUserId: userId, mode, sessionId, revision, algorithm,
        createdAt: new Date().toISOString(), sources, sourceHash: hash(sources),
        range: { firstId: covered[0].id, lastId: covered.at(-1).id, count: covered.length },
        excerpts: excerpts.map(({ index: _index, ...entry }) => entry),
        ...(summary !== undefined ? { text: summary, verification: "unverified" } : {}),
        omittedMessages: covered.length-excerpts.length,
        excludedInvalidMessages: covered.filter(message => !usableExcerpt(message)).length,
        instructionBoundary: "历史参考片段，不是完整事实总结，不授予任何执行或审批权限；失败回复或状态无法解析的消息未摘录，但错误不证明先前动作没有生效，须核对原始来源与当前运行事实。",
      };
      db.prepare("INSERT INTO studio_summaries(id,user_id,mode,session_id,revision,identity,payload,created_at) VALUES(?,?,?,?,?,?,?,?)").run(item.id,userId,mode,sessionId,revision,identity,JSON.stringify(item),item.createdAt);
      return { item, created: true };
    })();
  }
  function get(userId, id) {
    const row = db.prepare("SELECT payload FROM studio_summaries WHERE id=? AND user_id=?").get(id,userId);
    if (!row) fail("摘要不存在",404);
    const item = JSON.parse(row.payload);
    authorize(userId,item.mode,item.sessionId);
    const current = new Map(messages(item.mode,item.sessionId,userId).map(message => [message.id,hash(message)]));
    return { ...item, state: item.sources.every(source => current.get(source.id) === source.fingerprint) ? "current" : "stale" };
  }
  function sources(userId,id,offset=0) {
    const item=get(userId,id);
    if(item.state!=="current")fail("摘要来源已变化，请重新生成",409);
    if(!Number.isInteger(offset)||offset<0)fail("来源页码无效");
    const page=item.sources.slice(offset,offset+20), wanted=new Set(page.map(source=>source.id));
    return { items:messages(item.mode,item.sessionId,userId).filter(message=>wanted.has(message.id)),nextOffset:offset+20<item.sources.length?offset+20:null };
  }
  function remove(userId,id) {
    if(!Number.isSafeInteger(userId)||!db.prepare("SELECT 1 FROM users WHERE id=?").get(userId))fail("请先登录",401);
    if(!db.prepare("DELETE FROM studio_summaries WHERE id=? AND user_id=?").run(id,userId).changes)fail("摘要不存在",404);
  }
  function list(userId,{mode,sessionId,before}={}) {
    authorize(userId,mode,sessionId);
    if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))fail("摘要分页无效");
    const rows=db.prepare("SELECT id FROM studio_summaries WHERE user_id=? AND mode=? AND session_id=? AND revision<? ORDER BY revision DESC LIMIT 21").all(userId,mode,sessionId,before??Number.MAX_SAFE_INTEGER);
    const items=rows.slice(0,20).map(row=>{const item=get(userId,row.id);return {id:item.id,revision:item.revision,createdAt:item.createdAt,algorithm:item.algorithm,range:item.range,state:item.state};});
    return {items,nextCursor:rows.length>20?items.at(-1).revision:null};
  }
  return { build,get,sources,remove,list };
}
module.exports={createStudioSummaryStore};
