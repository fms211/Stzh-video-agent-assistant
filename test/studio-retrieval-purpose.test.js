"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {selectMemories}=require("../shared/studio-context/index.cjs");
const {context,memory}=require("./helpers/studio-memory-fixtures.cjs");
const search=(query,items,extra={})=>selectMemories({query,items,context:context(),authorize:()=>true,...extra});

test("normative filler cannot inject another topic into a no-match task",()=>{
  const items=[memory("film","电影预告画幅规范：16:9"),memory("claim","电影预告记录没有任务结果证据",{claimKind:"observation"})];
  for(const query of["请查找量子纠错研究规范，现有材料没有这方面记录","无人机竞赛徽标规范，不用待审建议","陶艺展签规范，不读取未共享记录"])
    assert.deepEqual(search(query,items).selected,[],query);
});

test("cross-language artifact aliases recall saved Chinese rules without rewriting content",()=>{
  for(const[query,content]of[["cinematic teaser preferences","电影预告声音偏好：环境声开场"],["classroom handouts preferences","课堂讲义规范：正文使用大字号"],["exhibition poster preferences","展览海报标题：12字以内"],["bookshop promotion preferences","书店宣传材质：纸张质感"]]){
    const result=search(query,[memory("expected",content)]);assert.equal(result.selected.length,1,query);assert.equal(result.selected[0].item.content,content);assert.equal(result.selected[0].effectiveVerification,"unverified");
  }
});

test("an English prohibition rejects a Chinese old preference and keeps the positive continuation",()=>{
  const items=[memory("old","展览海报：水墨，留白"),memory("current","展览海报：油画，留白"),memory("constraint","展览海报：不要水墨，保留留白")];
  for(const query of["exhibition poster, no ink wash but keep negative space","exhibition poster, avoid ink wash and use oil painting","exhibition poster, do not use ink wash, retain negative space"]){
    const selected=search(query,items).selected.map(item=>item.item.id);assert.ok(!selected.includes("old"),query);assert.ok(selected.includes("current"),query);assert.ok(selected.includes("constraint"),query);
  }
});

test("negation in a memory remains a constraint reference, not an affirmative rejected style",()=>{
  const result=search("bookshop promotion, no full-bleed layout",[memory("old","书店宣传满版铺陈"),memory("constraint","书店宣传：不用满版，主体留白")]);
  assert.deepEqual(result.selected.map(item=>item.item.id),["constraint"]);
});

test("layout comparisons can still recall both alternatives; alias substring is not a translation",()=>{
  const items=[memory("space","留白构图"),memory("bleed","满版构图")];
  assert.deepEqual(search("compare negative-space and full-bleed layouts",items).selected.map(item=>item.item.id).sort(),["bleed","space"]);
  for(const[query,content]of[["电影预告","cinematic teasersomething"],["课堂讲义","classroom handoutwork"],["展览海报","exhibition posterity"],["书店宣传","bookshop promotionwork"]])assert.equal(search(query,[memory("wrong",content)]).selected.length,0,content);
});

test("preferences-only retrieval does not turn a stored completion claim into a design rule",()=>{
  const items=[memory("norm","电影预告画幅规范：16:9"),memory("claim","电影预告已经生成完成",{claimKind:"observation"})];
  const result=search("retrieve cinematic teaser preferences",items);assert.deepEqual(result.selected.map(item=>item.item.id),["norm"]);assert.equal(result.dropped.purpose_mismatch,1);
});

test("mixed investigation retains the same observation as unverified evidence",()=>{
  const items=[memory("norm","电影预告画幅规范：16:9"),memory("claim","电影预告已经生成完成",{claimKind:"observation"})];
  for(const query of["查电影预告规范，也核验任务结果","cinematic teaser preferences and task status verification"]){
    const selected=search(query,items).selected;assert.ok(selected.some(item=>item.item.id==="norm"));const claim=selected.find(item=>item.item.id==="claim");assert.ok(claim);assert.equal(claim.section,"Evidence");assert.equal(claim.effectiveVerification,"unverified");
  }
});

test("a fact request beyond the lexical prefix prevents a preferences-only filter",()=>{
  const query="电影预告规范",items=[memory("claim","电影预告已经生成完成",{claimKind:"observation"})];
  const result=search(query,items,{restrictionQuery:query+"。"+"补充背景。".repeat(1800)+"请核验生成结果。"});assert.equal(result.selected.length,1);assert.equal(result.selected[0].section,"Evidence");
});

test("an explicit artifact topic cannot borrow another artifact's rule through a shared field name",()=>{
  const items=[memory("poster","展览海报画幅规范：16:9"),memory("film","电影预告画幅规范：16:9")];
  assert.deepEqual(search("展览海报画幅规范",items).selected.map(item=>item.item.id),["poster"]);
  assert.deepEqual(search("compare exhibition poster and film trailer framing preferences",items).selected.map(item=>item.item.id).sort(),["film","poster"]);
});

test("normative retrieval still keeps mechanism references, without treating them as runtime results",()=>{
  const item=memory("mechanism","电影预告流程规范：生成完成后核对产物，保存步骤不证明远端已停止。",{claimKind:"mechanism"});
  const result=search("电影预告流程规范",[item]);assert.equal(result.selected.length,1);assert.equal(result.selected[0].section,"Evidence");assert.equal(result.selected[0].effectiveVerification,"unverified");
});

test("a recorded preference opinion can be reviewed as evidence even in a preference query",()=>{
  const item=memory("opinion","留白的意见：不喜欢留白，原因尚待确认。",{claimKind:"observation"});
  const result=search("回顾留白偏好的意见",[item]);assert.equal(result.selected.length,1);assert.equal(result.selected[0].section,"Evidence");assert.equal(result.selected[0].effectiveVerification,"unverified");
});
