"use strict";
const {MemoryError}=require("./studio-memory-store.js");
const FIELDS=["taskState","conclusion","blocker","action","reference"];
const blank=()=>Object.fromEntries(FIELDS.map(key=>[key,""]));
function createStudioProjectNotes(db){
  db.exec(`CREATE TABLE IF NOT EXISTS studio_project_notes(project_id TEXT PRIMARY KEY REFERENCES creative_projects(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL,enabled INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  const fail=(code,message,status=400)=>{throw new MemoryError(code,message,status);};
  function authorize(userId,projectId){
    if(!Number.isSafeInteger(userId)||typeof projectId!=="string"||!projectId||projectId.length>200)fail("INVALID_PROJECT_NOTE","项目参数无效");
    if(!db.prepare("SELECT 1 FROM creative_projects p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.user_id=?").get(projectId,userId))fail("PROJECT_NOT_FOUND","项目不可用",404);
  }
  function get(userId,projectId){
    authorize(userId,projectId);
    const row=db.prepare("SELECT * FROM studio_project_notes WHERE project_id=? AND user_id=?").get(projectId,userId);
    return row?{projectId,revision:row.revision,enabled:Boolean(row.enabled),fields:JSON.parse(row.body),updatedAt:row.updated_at,verification:"unverified"}
      :{projectId,revision:0,enabled:false,fields:blank(),updatedAt:null,verification:"unverified"};
  }
  function save(userId,projectId,input){
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!["expectedRevision","enabled","fields"].includes(key))
      ||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.enabled!=="boolean"
      ||!input.fields||typeof input.fields!=="object"||Array.isArray(input.fields)||Object.keys(input.fields).some(key=>!FIELDS.includes(key))
      ||FIELDS.some(key=>typeof input.fields[key]!=="string"||input.fields[key].length>4000))fail("INVALID_PROJECT_NOTE","笔记格式无效，每项最多4000字符");
    if(/\b(?:pat_|sk-)[a-zA-Z0-9_-]{16,}/.test(JSON.stringify(input.fields)))fail("SENSITIVE_MEMORY","笔记不能包含此类敏感凭证");
    return db.transaction(()=>{
      const previous=get(userId,projectId);
      if(previous.revision!==input.expectedRevision)fail("PROJECT_NOTE_CONFLICT","项目笔记已变化，请读取最新版本",409);
      const revision=previous.revision+1,updatedAt=new Date().toISOString();
      db.prepare(`INSERT INTO studio_project_notes(project_id,user_id,revision,enabled,body,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,enabled=excluded.enabled,body=excluded.body,updated_at=excluded.updated_at,user_id=excluded.user_id`).run(projectId,userId,revision,Number(input.enabled),JSON.stringify(input.fields),updatedAt);
      return get(userId,projectId);
    })();
  }
  // Keep the revision tombstone so a stale editor cannot overwrite a new note
  // after deletion/recreation with a reused revision number.
  function remove(userId,projectId,expectedRevision){return save(userId,projectId,{expectedRevision,enabled:false,fields:blank()});}
  return {get,save,remove};
}
module.exports={createStudioProjectNotes};
