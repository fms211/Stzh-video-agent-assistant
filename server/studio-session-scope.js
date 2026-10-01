"use strict";
const exists=(db,name)=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
function initialize(db){
  db.exec("CREATE TABLE IF NOT EXISTS studio_session_modes (session_id TEXT PRIMARY KEY REFERENCES opc_sessions(id) ON DELETE CASCADE,user_id INTEGER NOT NULL,mode TEXT NOT NULL)");
}
function inferMode(db,userId,sessionId){
  if(!exists(db,"opc_sessions"))return null;
  const owned=db.prepare("SELECT 1 FROM opc_sessions WHERE id=? AND user_id=?").get(sessionId,userId);
  if(!owned)return null;
  const registered=exists(db,"studio_session_modes")?db.prepare("SELECT mode FROM studio_session_modes WHERE session_id=? AND user_id=?").get(sessionId,userId):null;
  if(registered)return registered.mode;
  if(sessionId.startsWith("opc_workflow_")||db.prepare("SELECT 1 FROM opc_messages WHERE session_id=? AND role IN ('workflow','workflow-step','action-cards')").get(sessionId))return "workflow";
  if(sessionId.startsWith("opc_"))return "assistant";
  if(db.prepare("SELECT 1 FROM opc_messages WHERE session_id=? AND role='agent'").get(sessionId))return "coze";
  if(exists(db,"conversations")&&db.prepare("SELECT 1 FROM conversations WHERE id=? AND user_id=?").get(sessionId,userId))return "coze";
  return "assistant";
}
function register(db,userId,sessionId,mode){
  initialize(db);
  const prior=db.prepare("SELECT * FROM studio_session_modes WHERE session_id=?").get(sessionId);
  if(prior&&(prior.user_id!==userId||prior.mode!==mode))throw Object.assign(new Error("会话模式不一致"),{status:409,code:"SESSION_MODE_CONFLICT"});
  db.prepare("INSERT OR IGNORE INTO studio_session_modes(session_id,user_id,mode) VALUES(?,?,?)").run(sessionId,userId,mode);
}
function sessionStorage(db,userId,mode,sessionId){
  const actual=inferMode(db,userId,sessionId);
  if(actual)return actual===mode?"opc":null;
  if(mode==="coze"&&exists(db,"conversations")&&db.prepare("SELECT 1 FROM conversations WHERE id=? AND user_id=?").get(sessionId,userId))return "legacy";
  return null;
}
module.exports={initialize,inferMode,register,sessionStorage};
