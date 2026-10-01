"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../app/lib/workspace-media.ts");

test("gallery projects completed task media and normalizes legacy signed Markdown links", async () => {
  const { mediaFromTasks } = await load();
  const items = mediaFromTasks([{ id:"task-1", title:"生成作品", status:"completed", completedAt:"2026-09-22T12:00:00Z", input:{conversationId:"local"}, output:{videoUrl:"https://media.invalid/a.mp4?sig=abc)",imageUrls:["https://media.invalid/a.png"]} },{id:"running",status:"running",output:{videoUrl:"https://media.invalid/pending.mp4"}}]);
  assert.equal(items.length,2);
  assert.equal(items[0].url,"https://media.invalid/a.mp4?sig=abc");
  assert.equal(items[1].type,"image");
  assert.equal(items[0].sessionId,"local");
});

test("gallery merges local and server media without duplicate assets", async () => {
  const { mergeMedia } = await load();
  const a={id:"a",type:"video",url:"https://media.invalid/a.mp4",timestamp:1,sessionTitle:"a",sessionId:"s"};
  assert.deepEqual(mergeMedia([a],[{...a,id:"b"}]),[a]);
});

test("gallery follows every completed-task cursor and ignores results after an owner change", async () => {
  const { loadTaskMedia } = await load();
  const cursors=[];
  const items=await loadTaskMedia(async (cursor)=>{
    cursors.push(cursor);
    return {tasks:[{id:cursor||"first",title:"作品",status:"completed",output:{videoUrl:`https://media.invalid/${cursor||"first"}.mp4`}}],nextCursor:cursor?null:"second"};
  });
  assert.deepEqual(cursors,[undefined,"second"]);
  assert.equal(items.length,2);
  let current=true;
  const discarded=await loadTaskMedia(async()=>{current=false;return {tasks:[],nextCursor:"more"};},()=>current);
  assert.deepEqual(discarded,[]);
});
