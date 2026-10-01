"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selectMemories, buildStudioContext } = require("../shared/studio-context/index.cjs");
const { context, memory, packetInput } = require("./helpers/studio-memory-fixtures.cjs");
const search = (query, items, patch = {}) => selectMemories({ query, items, context: context(), authorize: () => true, ...patch });

test("受控创作别名能跨中文改写与英文表达，并显示匹配依据", () => {
  for (const [query, content, concept] of [
    ["大量负空间", "大面积留白", "negative-space"],
    ["采用ink wash", "水墨山水", "ink-wash"],
    ["slow motion", "慢镜头展示", "slow-motion"],
    ["shallow depth of field", "浅景深人像", "shallow-depth"],
    ["deep depth of field", "全景深建筑", "deep-depth"],
    ["强反差", "高对比度", "high-contrast"],
    ["low-contrast", "弱反差", "low-contrast"],
  ]) {
    const result = search(query, [memory("expected", content)]);
    assert.equal(result.selected.length, 1, query);
    assert.ok(result.selected[0].matchedTerms.includes(`concept:${concept}`), query);
    assert.equal(result.retrievalVersion, "creative-lexical-v7");
  }
});
test("邻接的通用创作词不形成误命中的跨词字片段", () => {
  const items = [memory("coffee", "上次制作视频使用咖啡杯"), memory("cat", "图片创作采用橘猫")];
  for (const query of ["制作太空视频", "制作视频", "图片创作", "用户偏好", "generate video"]) assert.equal(search(query, items).selected.length, 0, query);
});
test("过滤通用词后仍保留实际主题、短词和画幅", () => {
  const items = [memory("space", "太空视频"), memory("ink", "水墨画面"), memory("aspect", "视频16:9")];
  for (const [query, id] of [["制作太空视频", "space"], ["采用水墨风格", "ink"], ["画幅１６：９", "aspect"]]) assert.deepEqual(search(query, items).selected.map(x => x.item.id), [id]);
});
test("单色不等于黑白、白色不等于留白、slow不等于slow motion", () => {
  for (const [query, content] of [["单色", "黑白"], ["白色", "留白"], ["慢动作", "slow network"], ["负空间", "negative spacecraft"]]) assert.equal(search(query, [memory("wrong", content)]).selected.length, 0, query);
});
test("相反景深和反差值不靠共享字片段进入结果，对照查询仍可取两者", () => {
  const items = [memory("shallow", "浅景深人物"), memory("deep", "全景深人物")];
  assert.deepEqual(search("浅景深", items).selected.map(x => x.item.id), ["shallow"]);
  assert.deepEqual(search("比较浅景深与全景深", items).selected.map(x => x.item.id).sort(), ["deep", "shallow"]);
  assert.equal(search("高对比度", [memory("low", "低对比度海报")]).selected.length, 0);
});
test("英文多词别名支持空白和全角归一化，不匹配单词内部子串", () => {
  assert.equal(search("ＮＥＧＡＴＩＶＥ   ＳＰＡＣＥ", [memory("yes", "留白")]).selected.length, 1);
  for (const content of ["ink washer", "blink wash", "negative spacecraft", "shallow depth of fieldwork"]) {
    assert.equal(search(content.startsWith("shallow") ? "浅景深" : content.startsWith("negative") ? "留白" : "水墨", [memory("no", content)]).selected.length, 0, content);
  }
});
test("别名只增加检索线索，不改写原文否定、不提高核验级别", () => {
  const item = memory("statement", "不喜欢留白，原因尚待确认", { claimKind: "observation" });
  const result = buildStudioContext(packetInput({ task: "回顾负空间的意见", memories: [item] }));
  const packet = result.packets.find(x => x.memoryId);
  assert.equal(packet.content, item.content); assert.equal(packet.verification.state, "unverified"); assert.equal(packet.section, "Evidence");
});
test("别名候选仍遵守权限和当前约束，外部记录不影响本账户排序", () => {
  const item = memory("own", "留白");
  const foreign = Array.from({ length: 50 }, (_, i) => memory(`foreign-${i}`, "负空间", { ownerUserId: 2 }));
  const before = search("负空间", [item]).selected;
  assert.deepEqual(search("负空间", [...foreign, item]).selected, before);
  assert.equal(search("负空间", [item], { authorize: () => false }).selected.length, 0);
  assert.equal(search("负空间", [{ ...item, slot: "composition" }], { context: context({ currentConstraints: { composition: "密集构图" } }) }).selected.length, 0);
});
test("明确替换旧画风时只引用新偏好，比较两种画风仍可引用两者", () => {
  const items = [memory("ink", "用户喜欢水墨"), memory("oil", "用户希望油画")];
  for (const query of ["把水墨改成油画", "别再用水墨，换成油画", "不再使用水墨，改成油画", "水墨不要了，改用油画", "从水墨换成油画", "换掉水墨，用油画"]) {
    assert.deepEqual(search(query, items).selected.map(x => x.item.id), ["oil"], query);
  }
  assert.deepEqual(search("比较水墨和油画", items).selected.map(x => x.item.id).sort(), ["ink", "oil"]);
});
test("替换相反参数不复活旧参数，记录同向拒绝的记忆可作参考", () => {
  const items = [memory("high", "高对比度海报"), memory("low", "低对比度人像")];
  assert.deepEqual(search("将高对比度换成低对比度", items).selected.map(x => x.item.id), ["low"]);
  const old = memory("old", "用户喜欢水墨");
  const rejection = memory("rejection", "用户不要水墨", { claimKind: "constraint" });
  assert.deepEqual(search("别再用水墨", [old, rejection]).selected.map(x => x.item.id), ["rejection"]);
});

test("混合偏好不能借未冲突的词夹带本轮拒绝的旧偏好", () => {
  const mixed=memory("mixed","用户喜欢水墨和留白构图");
  const kept=memory("kept","保留留白构图");
  const rejection=memory("rejection","用户不要水墨，保留留白构图",{claimKind:"constraint"});
  const result=search("不要水墨，保留留白构图，改成油画",[mixed,kept,rejection]);
  assert.deepEqual(result.selected.map(entry=>entry.item.id).sort(),["kept","rejection"]);
  assert.equal(result.dropped.current_negation,1);
  assert.equal(search("比较水墨和油画的留白构图",[mixed]).selected.length,1);
  assert.equal(search("水墨和留白构图",[mixed]).selected.length,1);
});

test("仅否定方向不等于指定该方向，兼容的相反方向仍可匹配", () => {
  for(const [rejected,compatible] of [["高对比","低对比"],["低对比","高对比"],["浅景深","全景深"],["全景深","浅景深"]]){
    const result=search(`不要${rejected}，保留留白`,[memory("old",`用户喜欢${rejected}和留白`),memory("compatible",`用户喜欢${compatible}和留白`)]);
    assert.deepEqual(result.selected.map(entry=>entry.item.id),["compatible"]);
    assert.equal(result.dropped.current_negation,1);
  }
});

test("候选方向的否定与本轮方向一致时保留，抵触本轮正向方向时排除", () => {
  for(const [wanted,opposite] of [["高对比","低对比"],["低对比","高对比"],["浅景深","全景深"],["全景深","浅景深"]]){
    const result=search(`采用${wanted}，保留留白`,[memory("compatible",`用户不要${opposite}，保留留白`),memory("conflicting",`用户不要${wanted}，保留留白`)]);
    assert.deepEqual(result.selected.map(entry=>entry.item.id),["compatible"]);
    assert.equal(result.dropped.opposing_facet,1);
  }
});
