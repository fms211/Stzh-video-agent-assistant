"use strict";

// 08-29 — Task 10: creative-context 纯函数契约（规划 §1.3）
// reduce 幂等 / shouldInsert revision 去重 / buildPromptFragment 片段顺序 /
// 同值不 bump revision / 重复插入相同 revision 拒绝。

const assert = require("node:assert/strict");
const { test, describe, beforeEach } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");

test("creative parameter snapshot preserves explicit values without injecting authority or mutating state",async()=>{
  const {creativeConstraints,emptyCreativeContext}=await load("app/lib/creative-context.ts");
  assert.deepEqual(creativeConstraints(),{});
  const context={...emptyCreativeContext(),styleLabel:"水墨",selectedParams:["主体居中","留白"],aspect:"9:16"};
  const result=creativeConstraints(context);
  assert.deepEqual(result,{style:"水墨",composition:"主体居中；留白",duration:"8",aspect:"9:16"});
  context.selectedParams.push("新参数");
  assert.equal(result.composition,"主体居中；留白");
});

async function load(relativePath) {
  const abs = path.join(REPO_ROOT, relativePath);
  const url = pathToFileURL(abs);
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return import(url.href);
}

describe("creative-context 纯函数（规划 §1.3）", () => {
  let mod;

  beforeEach(async () => {
    mod = await load("app/lib/creative-context.ts");
  });

  test("emptyCreativeContext 默认值", () => {
    const ctx = mod.emptyCreativeContext();
    assert.equal(ctx.revision, 0);
    assert.equal(ctx.styleId, null);
    assert.equal(ctx.styleLabel, "");
    assert.equal(ctx.aspect, "16:9");
    assert.equal(ctx.durationSeconds, 8);
    assert.deepEqual(ctx.selectedParams, []);
    assert.equal(ctx.promptFragment, "");
  });

  test("reduce 幂等：同 patch 两次不 bump revision（同值跳过）", () => {
    let ctx = mod.emptyCreativeContext();
    ctx = mod.reduceCreativeContext(ctx, { styleId: "s1", styleLabel: "水墨画" });
    const rev1 = ctx.revision;
    ctx = mod.reduceCreativeContext(ctx, { styleId: "s1", styleLabel: "水墨画" });
    assert.equal(ctx.revision, rev1, "同值重复不 bump");
  });

  test("reduce 新值 bump revision + 更新 promptFragment", () => {
    let ctx = mod.emptyCreativeContext();
    ctx = mod.reduceCreativeContext(ctx, { styleId: "s1", styleLabel: "水墨画" });
    assert.equal(ctx.revision, 1);
    assert.ok(ctx.promptFragment.includes("水墨画"));
    ctx = mod.reduceCreativeContext(ctx, { cameraMoveId: "pan", cameraMoveLabel: "摇镜" });
    assert.equal(ctx.revision, 2);
    assert.ok(ctx.promptFragment.includes("摇镜"));
  });

  test("buildPromptFragment 片段顺序：风格 → 运镜 → 参数 → 时长 → 画幅", () => {
    let ctx = mod.emptyCreativeContext();
    ctx = mod.reduceCreativeContext(ctx, { styleId: "s1", styleLabel: "水墨画" });
    ctx = mod.reduceCreativeContext(ctx, { cameraMoveId: "pan", cameraMoveLabel: "摇镜" });
    ctx = mod.reduceCreativeContext(ctx, { selectedParams: ["低对比", "水墨晕染"] });
    ctx = mod.reduceCreativeContext(ctx, { durationSeconds: 8 });
    ctx = mod.reduceCreativeContext(ctx, { aspect: "16:9" });
    const fragment = mod.buildPromptFragment(ctx);
    const styleIdx = fragment.indexOf("水墨画");
    const camIdx = fragment.indexOf("摇镜");
    const paramIdx = fragment.indexOf("低对比");
    const durIdx = fragment.indexOf("8 秒");
    const aspIdx = fragment.indexOf("16:9");
    assert.ok(styleIdx > -1 && camIdx > styleIdx && paramIdx > camIdx && durIdx > paramIdx && aspIdx > durIdx,
      `顺序错误: ${fragment}`);
  });

  test("shouldInsert：仅当 revision > lastInsertedRevision 时允许", () => {
    const ctx = mod.emptyCreativeContext();
    ctx.revision = 5;
    assert.equal(mod.shouldInsert(ctx, 4), true);
    assert.equal(mod.shouldInsert(ctx, 5), false);
    assert.equal(mod.shouldInsert(ctx, 6), false);
  });

  test("formatContextSummary 摘要语义", () => {
    let ctx = mod.emptyCreativeContext();
    ctx = mod.reduceCreativeContext(ctx, { styleId: "s1", styleLabel: "水墨画" });
    ctx = mod.reduceCreativeContext(ctx, { selectedParams: ["低对比", "水墨晕染", "留白"] });
    const summary = mod.formatContextSummary(ctx);
    assert.ok(summary.includes("水墨画"));
    assert.ok(summary.includes("3"));
    assert.ok(summary.length > 0);
  });
});

describe("creative-context 与 OPCPanel 接线（规划 §1.3 结构化同步）", () => {
  test("reduce 接受 OPCPanel onParamsChange 形状", async () => {
    const mod = await load("app/lib/creative-context.ts");
    let ctx = mod.emptyCreativeContext();
    // OPCPanel onParamsChange 传出 { duration, aspect, cameraMove, selectedParams }
    ctx = mod.reduceCreativeContext(ctx, {
      durationSeconds: 10,
      aspect: "9:16",
      cameraMoveId: "dolly",
      cameraMoveLabel: "推拉",
      selectedParams: ["霓虹"],
    });
    assert.equal(ctx.durationSeconds, 10);
    assert.equal(ctx.aspect, "9:16");
    assert.equal(ctx.revision, 1);
  });
});
