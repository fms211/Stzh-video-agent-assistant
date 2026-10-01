"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const load=()=>import("../app/lib/task-list.ts");
const row=(id,status="queued",updatedAt="2026-09-28T00:00:00.000Z")=>({id,status,updatedAt});
const page=(tasks,nextCursor=null,total=tasks.length)=>({tasks,total,nextCursor});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test("task filters query the full server set, including older active tasks outside the first all page",async()=>{
  const {createTaskList}=await load(),queries=[];
  const list=createTaskList(async query=>{queries.push(query);return query.status?page([row("older","paused")]):page([row("recent","completed")],"more",50);});
  await list.connect();assert.equal(list.getSnapshot().tasks[0].id,"recent");
  await list.setFilter("active");assert.equal(list.getSnapshot().tasks[0].id,"older");
  assert.equal(queries.at(-1).status,"queued,running,paused");
  await list.refresh();assert.equal(queries.at(-1).status,"queued,running,paused");
  await list.setFilter("failed");assert.equal(queries.at(-1).status,"failed,cancelled");
  await list.setFilter("archive");assert.equal(queries.at(-1).status,"completed,failed,cancelled");
});

test("pagination is single-flight, deduplicates overlaps and refresh preserves the loaded page depth",async()=>{
  const {createTaskList}=await load(),gate=deferred(),queries=[];
  let deferMore=true;
  const list=createTaskList(async query=>{queries.push(query);if(query.cursor){if(deferMore)return gate.promise;return page([row("b"),row("c")],null,3);}return page([row("a"),row("b")],"page-2",3);},2);
  await list.connect();const pending=list.loadMore();await list.loadMore();assert.equal(queries.length,2);
  gate.resolve(page([row("b"),row("c")],null,3));await pending;assert.equal(list.getSnapshot().tasks.length,3);
  deferMore=false;await list.refresh();assert.deepEqual(queries.slice(-2).map(query=>query.cursor),[undefined,"page-2"]);
  assert.equal(list.getSnapshot().tasks.length,3);assert.equal(list.getSnapshot().nextCursor,null);
});

test("a late response or error from an earlier filter cannot replace the selected list",async()=>{
  const {createTaskList}=await load(),gate=deferred();
  const list=createTaskList(async query=>query.status?page([row("failed","failed")]):gate.promise);
  const old=list.connect();await list.setFilter("failed");gate.reject(new Error("old request failed"));await old;
  assert.equal(list.getSnapshot().filter,"failed");assert.equal(list.getSnapshot().tasks[0].id,"failed");assert.equal(list.getSnapshot().error,"");
});

test("closed list rejects late account results and reconnect invalidates the previous request",async()=>{
  const {createTaskList}=await load(),gate=deferred();let calls=0;
  const list=createTaskList(async()=>++calls===1?gate.promise:page([row("current")]));
  const old=list.connect();list.close();list.applyTask(row("old-event"));await list.connect();
  gate.resolve(page([row("late-owner")]));await old;
  assert.deepEqual(list.getSnapshot().tasks.map(task=>task.id),["current"]);
});

test("realtime updates win over stale refresh data and status changes leave the active filter",async()=>{
  const {createTaskList}=await load(),gate=deferred();let wait=false;
  const list=createTaskList(async()=>wait?gate.promise:page([row("a")]));
  await list.connect();await list.setFilter("active");wait=true;const pending=list.refresh();
  list.applyTask(row("a","completed","2026-09-28T00:00:02.000Z"));
  list.applyTask(row("b","running","2026-09-28T00:00:02.000Z"));
  gate.resolve(page([row("a"),row("b","queued")],null,2));await pending;
  assert.deepEqual(list.getSnapshot().tasks.map(task=>[task.id,task.status]),[["b","running"]]);
  list.applyTask(row("b","queued"));assert.equal(list.getSnapshot().tasks[0].status,"running");
});

test("failed refresh retains usable rows and cursor, then a retry clears the error",async()=>{
  const {createTaskList}=await load();let fail=false;
  const list=createTaskList(async()=>{if(fail)throw new Error("offline");return page([row("a")],"more",9);});
  await list.connect();fail=true;await list.refresh();
  assert.equal(list.getSnapshot().error,"offline");assert.equal(list.getSnapshot().tasks[0].id,"a");assert.equal(list.getSnapshot().nextCursor,"more");
  fail=false;await list.refresh();assert.equal(list.getSnapshot().error,"");
});
