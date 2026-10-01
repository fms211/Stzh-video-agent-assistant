"use strict";
const {createHash}=require("node:crypto");
const {createStudioMemoryStore}=require("./studio-memory-store.js");
const {inferMode}=require("./studio-session-scope.js");
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function createStudioCandidateService(db){
  let store;
  function save(userId,input,version){
    try {
      store ||= createStudioMemoryStore(db);
      const result=store.create(userId,{...input,requestKey:`candidate:${digest({input,version})}`,claimKind:"observation",importance:0.5});
      return {ids:[result.item.id],created:result.created?1:0,skipped:[]};
    } catch(error){
      // Candidate extraction follows an already committed message/run. Its
      // failure must never turn that successful operation into a false failure.
      return {ids:[],created:0,skipped:[error.code||"CANDIDATE_SAVE_FAILED"]};
    }
  }
  function messages(userId,sessionId,ids){
    const mode=inferMode(db,userId,sessionId), result={ids:[],created:0,skipped:[]};
    if(!mode)return result;
    for(const id of new Set(ids)){
      const row=db.prepare("SELECT id,role,content,metadata FROM opc_messages WHERE id=? AND session_id=?").get(id,sessionId);
      if(!row)continue;
      let content,kind="semantic";
      if(row.role==="user")content=row.content.match(/^(?:请)?记住[：:\s]+([\s\S]+)$/)?.[1]?.trim();
      if(row.role==="action-cards"){
        let meta;try{meta=JSON.parse(row.metadata||"{}");}catch{continue;}
        if(meta.isError)continue;
        kind="episodic";
        content=row.content.length<=3500?`工作流结果记录（未经事实核验）：\n${row.content}`:"工作流已保存结果记录；内容较长，请读取原始消息核对，不据此认定生成或交付成功。";
      }
      if(!content||content.length>4000)continue;
      const saved=save(userId,{mode,content,kind,scope:{kind:"session",mode,sessionId},source:{mode,recordId:row.id,sessionId}},row);
      result.ids.push(...saved.ids);result.created+=saved.created;result.skipped.push(...saved.skipped);
    }
    return result;
  }
  function collaboration(userId,runId){
    const row=db.prepare("SELECT * FROM agent_runs WHERE id=? AND user_id=?").get(runId,userId);
    if(!row||row.status!=="awaiting_confirmation")return null;
    const content=String(row.final_instruction||"");
    return save(userId,{mode:"collaboration",kind:"episodic",scope:{kind:"project",projectId:row.project_id},source:{mode:"collaboration",recordId:runId,runId},content:content.length<=3500?`协作草稿，仍待人工确认，尚未交付：\n${content}`:"协作已形成待确认草稿；请读取原运行的完整最终指令，尚未交付。"},row);
  }
  function research(userId,runId){
    const row=db.prepare("SELECT snapshot FROM research_runs WHERE id=? AND user_id=?").get(runId,userId);
    if(!row)return null;
    const snapshot=JSON.parse(row.snapshot);
    if(snapshot.status!=="completed"||!snapshot.artifacts?.length)return null;
    return save(userId,{mode:"workflow",kind:"episodic",scope:snapshot.input?.projectId?{kind:"project",projectId:snapshot.input.projectId}:{kind:"run",mode:"workflow",runId},source:{mode:"workflow",recordId:runId,runId,artifactIds:snapshot.artifacts.map(item=>item.id)},content:"研究运行已保存报告与创作资料。结果内容及引用仍需核验；研究完成不表示图片或视频已生成。"},snapshot.artifacts);
  }
  const safe=fn=>(...args)=>{try{return fn(...args);}catch(error){return {ids:[],created:0,skipped:[error.code||"CANDIDATE_SAVE_FAILED"]};}};
  return {messages:safe(messages),collaboration:safe(collaboration),research:safe(research)};
}
module.exports={createStudioCandidateService};
