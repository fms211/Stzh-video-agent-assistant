"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const load=()=>import(pathToFileURL(path.resolve(__dirname,"../app/lib/studio-context-status.ts")).href);
const item=(rollout,source="mode_override")=>({rollout,source,configurationValid:true});

test("different mode flags are rendered independently; enforce is not actual application", async()=>{
  const {normalizeContextStatus,contextStatusDescription}=await load();
  const status=normalizeContextStatus({rollout:"shadow",byMode:{assistant:item("enforce"),workflow:item("shadow"),coze:item("off"),collaboration:item("off")}});
  assert.match(contextStatusDescription("assistant",status.byMode.assistant),/单助手.*以每次回答的上下文记录为准/);
  assert.match(contextStatusDescription("workflow",status.byMode.workflow),/工作流.*尚未用于模型回答/);
  assert.match(contextStatusDescription("coze",status.byMode.coze),/Coze 创作.*已关闭/);
  assert.doesNotMatch(contextStatusDescription("assistant",status.byMode.assistant),/四模式请求|已用于本次请求/);
});
test("malformed per-mode payload cannot fall back to an enforce global",async()=>{
  const {normalizeContextStatus,contextStatusDescription}=await load();
  for (const byMode of [null,[],{}, {assistant:item("invalid")},{assistant:{rollout:"enforce",source:"unknown",configurationValid:true}},{assistant:{rollout:"enforce",source:"global"}}]) {
    const status=normalizeContextStatus({rollout:"enforce",byMode});
    assert.equal(status.byMode.assistant,null); assert.match(contextStatusDescription("assistant",status.byMode.assistant),/无法确认/);
  }
});
test("old server global responses stay readable and explicitly labelled legacy",async()=>{
  const {normalizeContextStatus,contextStatusDescription}=await load();
  const status=normalizeContextStatus({rollout:"shadow"});
  for (const mode of Object.keys(status.byMode)) {
    assert.equal(status.byMode[mode].configurationValid,null);
    assert.match(contextStatusDescription(mode,status.byMode[mode]),/旧版全局状态/);
  }
  assert.equal(normalizeContextStatus({rollout:"invalid"}).byMode.assistant,null);
});
test("configuration error and request snapshot source use fixed labels only",async()=>{
  const {normalizeContextStatus,contextStatusDescription,rolloutSourceLabel}=await load();
  const status=normalizeContextStatus({rollout:"shadow",byMode:{assistant:{rollout:"off",source:"invalid_override",configurationValid:false}}});
  assert.match(contextStatusDescription("assistant",status.byMode.assistant),/配置无效，已关闭/);
  assert.equal(rolloutSourceLabel("untrusted-value"),"配置来源未记录");
});
