"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../app/lib/generation-statistics.ts");
const task = (id, output = { videoUrl: "https://media.invalid/result.mp4" }) => ({ id, status: "completed", completedAt: "2025-12-31T23:00:00Z", output });

test("statistics match real date keys across years and use Sunday week boundaries", async () => {
  const { summarizeGenerations } = await load();
  const records = [new Date(2025, 11, 31, 8), new Date(2026, 0, 1, 9), new Date(2026, 0, 4, 8)].map(date => ({ ts: +date, type: "video" }));
  const stats = summarizeGenerations(records, new Date(2026, 0, 4));
  assert.equal(stats.total, 3);
  assert.deepEqual(stats.dayKeys.slice(-5), ["2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  assert.deepEqual(stats.dayKeys.slice(-5).map(key => stats.daily[key] || 0), [1, 1, 0, 0, 1]);
  assert.equal(stats.weekly["2025-12-28"], 2); assert.equal(stats.weekly["2026-01-04"], 1);
  assert.equal(stats.monthly["2025-12"], 1); assert.equal(stats.monthly["2026-01"], 2);
  assert.equal(stats.hourly[8], 2);
});

test("month-end periods never skip February or repeat months", async () => {
  const { summarizeGenerations } = await load();
  const stats = summarizeGenerations([], new Date(2028, 2, 31));
  assert.deepEqual(stats.monthKeys, ["2027-10", "2027-11", "2027-12", "2028-01", "2028-02", "2028-03"]);
  assert.deepEqual(stats.monthLabels, ["2027/10", "2027/11", "2027/12", "2028/1", "2028/2", "2028/3"]);
});

test("invalid local records cannot poison counts, hours, or dates", async () => {
  const { summarizeGenerations } = await load();
  for (const value of [null, {}, "bad"]) assert.equal(summarizeGenerations(value).total, 0);
  const stats = summarizeGenerations([null, {}, { ts: NaN, type: "video" }, { ts: 9e99, type: "video" }, { ts: 1, type: "other" }, { ts: "1", type: "image" }, { ts: 1, type: "image" }]);
  assert.equal(stats.total, 1); assert.equal(stats.imageCount, 1); assert.equal(stats.hourly.reduce((a, b) => a + b, 0), 1);
});

test("completed task statistics count each media task once across every page", async () => {
  const { loadGenerationRecords, summarizeGenerations } = await load();
  const queries = [];
  const records = await loadGenerationRecords(async cursor => {
    queries.push(cursor);
    return cursor ? { tasks: [task("video"), task("images", { imageUrls: ["https://media.invalid/a.png", "https://media.invalid/b.png"] })], nextCursor: null }
      : { tasks: [task("video", { videoUrl: "https://media.invalid/a.mp4)", imageUrls: ["https://media.invalid/a.png"] })], nextCursor: "page2" };
  });
  assert.deepEqual(queries, [undefined, "page2"]);
  const stats = summarizeGenerations(records);
  assert.equal(stats.total, 2); assert.equal(stats.videoCount, 1); assert.equal(stats.imageCount, 1);
  assert.equal(Object.values(stats.daily).reduce((a, b) => a + b, 0), stats.total);
});

test("failed, pending, text-only, unsafe URL and invalid-date tasks are not successful media", async () => {
  const { loadGenerationRecords } = await load();
  const records = await loadGenerationRecords(async () => ({ tasks: [
    { ...task("failed"), status: "failed" }, { ...task("running"), status: "running" },
    task("text", { rawText: "完成" }), task("invalid", { videoUrl: "javascript:alert(1)", imageUrls: [null, "bad"] }),
    { ...task("bad-date"), completedAt: "invalid" }, task("image", { videoUrl: "bad", imageUrls: ["https://media.invalid/a.png"] }),
    { ...task("legacy"), completedAt: null, createdAt: "2025-01-01T00:00:00Z" },
  ], nextCursor: null }));
  assert.deepEqual(records.map(record => record.type), ["image", "video"]);
});

test("statistics fail incomplete pagination instead of publishing misleading partial counts", async () => {
  const { loadGenerationRecords } = await load();
  await assert.rejects(loadGenerationRecords(async () => ({ tasks: [task("a")], nextCursor: "same" })), /游标重复/);
  await assert.rejects(loadGenerationRecords(async cursor => {
    if (cursor) throw new Error("offline");
    return { tasks: [task("a")], nextCursor: "next" };
  }), /offline/);
});

test("account changes stop pagination and discard late responses", async () => {
  const { loadGenerationRecords } = await load();
  let current = true, calls = 0;
  const records = await loadGenerationRecords(async () => {
    calls++; current = false;
    return { tasks: [task("old-owner")], nextCursor: "next" };
  }, () => current);
  assert.deepEqual(records, []); assert.equal(calls, 1);
});

test("local calendar arithmetic keeps unique days through daylight-saving transitions", async () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {summarizeGenerations} from './app/lib/generation-statistics.ts';
    for (const now of [new Date(2026,2,9,0,30), new Date(2026,10,2,0,30)]) {
      const stats=summarizeGenerations([],now);
      assert.equal(new Set(stats.dayKeys).size,14);
      assert.equal(new Set(stats.weekKeys).size,8);
      assert.equal(stats.dayKeys.at(-1),now.getMonth()===2?'2026-03-09':'2026-11-02');
    }
  `], { cwd: require("node:path").resolve(__dirname, ".."), env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
