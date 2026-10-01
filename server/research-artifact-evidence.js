"use strict";

// Search/RAG references are leads, not proof that each generated field is true.
// Build this metadata from the owned runtime rather than trusting model labels.
const NOTE="未核验的研究与创作草稿。所列来源仅为本次参考，不代表逐字段事实核验；色值、光影、材质、字体及节奏等建议需结合原始资料确认。";
function researchArtifactContent(snapshot, sourceIds, value, mimeType) {
  const fields=mimeType==="application/json"
    ? Object.fromEntries(Object.entries(value).filter(([key])=>key!=="_researchContext"))
    : {report:value};
  if (!Object.keys(fields).length) throw Object.assign(new Error("研究产物缺少创作内容，不能只返回来源说明"),{code:"UPSTREAM_OUTPUT_INVALID",status:502});
  const evidence={version:1,origin:"model_output",verification:"unverified",runId:snapshot.runId,
    planRevision:snapshot.plan.revision,approvedPlanRevision:snapshot.approvedPlanRevision??null,
    scope:{styleName:snapshot.input.styleName,useCase:snapshot.input.useCase,projectId:snapshot.input.projectId??null},
    note:NOTE,
    fields:Object.fromEntries(Object.keys(fields).map(key=>[key,{origin:"model_output",verification:"unverified"}])),
    references:snapshot.sources.filter(source=>sourceIds.includes(source.id)).map(source=>({id:source.id,title:source.title,url:source.url,sourceType:source.sourceType,retrievedAt:source.retrievedAt,trust:source.trust})),
  };
  const content=mimeType==="application/json"
    ? JSON.stringify({...fields,_researchContext:evidence},null,2)
    : `${value}\n\n---\n\n> ${NOTE}\n\n研究来源与适用范围：\n\n\`\`\`json\n${JSON.stringify(evidence,null,2)}\n\`\`\``;
  return {content,evidence};
}
module.exports={researchArtifactContent};
