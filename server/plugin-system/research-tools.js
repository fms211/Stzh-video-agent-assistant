"use strict";

const {PluginError}=require("./errors.js");

// Capture only active contributions, never install or start a plugin for a run.
function researchPluginSteps(generations,userId,projectId) {
  if(!projectId)return [];
  return generations.contributions(userId,projectId).flatMap(pkg=>(pkg.manifest.contributes.tools||[]).map(tool=>({
    id:`plugin:${pkg.pluginId}:${tool.name}`,title:`${pkg.manifest.name} · ${tool.name}`,
    description:tool.description||tool.name,kind:"tool",tool:`plugin:${pkg.pluginId}:${tool.name}`,
    optional:true,enabled:false,dependsOn:["context"],input:{arguments:{}},status:"pending",
    plugin:{pluginId:pkg.pluginId,toolName:tool.name,version:pkg.version,contentHash:pkg.contentHash,generationId:pkg.generationId,
      permissionTier:pkg.permissionTier,risk:tool.risk,inputSchema:tool.inputSchema},
  }))).sort((a,b)=>a.id.localeCompare(b.id));
}

async function invokeResearchPlugin(generations,step,input,ctx) {
  ctx.signal.throwIfAborted();
  if(!ctx.input.projectId||!step.plugin)throw new PluginError("PLUGIN_NOT_ACTIVE","研究计划未绑定项目插件",409);
  if(!Object.hasOwn(input,"arguments"))throw new PluginError("PLUGIN_INPUT_INVALID","请在步骤输入的 arguments 字段中填写工具参数");
  const result=await generations.invoke(ctx.userId,ctx.input.projectId,step.plugin.pluginId,step.plugin.toolName,input.arguments,{expectedGenerationId:step.plugin.generationId});
  ctx.signal.throwIfAborted();
  return result;
}

module.exports={researchPluginSteps,invokeResearchPlugin};
