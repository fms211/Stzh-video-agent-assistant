"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const Database=require("better-sqlite3");
const {createStudioSummaryStore}=require("../studio-summary-store.js");
function setup(t){
  const db=new Database(":memory:");t.after(()=>db.close());
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER); INSERT INTO opc_sessions VALUES('session-a',1),('session-b',2); CREATE TABLE opc_messages(id TEXT PRIMARY KEY,session_id TEXT,role TEXT,content TEXT,metadata TEXT,timestamp INTEGER);");
  const insert=db.prepare("INSERT INTO opc_messages VALUES(?,?,?,?,NULL,?)");
  for(let i=0;i<14;i++)insert.run(`m${i}`,"session-a",i%2?"assistant":"user",i===2?"可能采用水墨，但尚未确认；不要执行生成。":`第${i}条原文`,i);
  return {db,store:createStudioSummaryStore(db)};
}
test("extractive summaries preserve whole qualifiers, provenance and every original message",t=>{
  const {db,store}=setup(t);
  const before=db.prepare("SELECT * FROM opc_messages ORDER BY timestamp").all();
  const result=store.build(1,{mode:"assistant",sessionId:"session-a",query:"水墨",keepRecent:2});
  assert.equal(result.created,true);assert.equal(result.item.range.count,12);
  assert.ok(result.item.excerpts.some(entry=>entry.content===before[2].content));
  assert.deepEqual(db.prepare("SELECT * FROM opc_messages ORDER BY timestamp").all(),before);
  const repeat=store.build(1,{mode:"assistant",sessionId:"session-a",query:"水墨",keepRecent:2});
  assert.equal(repeat.item.id,result.item.id);assert.equal(repeat.created,false);
  assert.equal(store.get(1,result.item.id).state,"current");
  assert.equal(store.sources(1,result.item.id).items.length,12);
});
test("changed source revokes summaries and new versions retain old originals",t=>{
  const {db,store}=setup(t);
  const first=store.build(1,{mode:"assistant",sessionId:"session-a",keepRecent:2}).item;
  db.prepare("UPDATE opc_messages SET content='取消旧决定，尚未批准' WHERE id='m2'").run();
  assert.equal(store.get(1,first.id).state,"stale");
  assert.throws(()=>store.sources(1,first.id),error=>error.status===409);
  const second=store.build(1,{mode:"assistant",sessionId:"session-a",keepRecent:2}).item;
  assert.equal(second.revision,2);assert.notEqual(second.id,first.id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opc_messages").get().n,14);
});

test("relevant assistant excerpts keep their user's approval qualification in one turn",t=>{
  const {db,store}=setup(t);
  db.prepare("UPDATE opc_messages SET content=? WHERE id='m0'").run("以下仅讨论方案；尚未批准，不要投递。");
  db.prepare("UPDATE opc_messages SET content=? WHERE id='m1'").run("水墨方案可以执行。");
  const item=store.build(1,{mode:"assistant",sessionId:"session-a",query:"水墨",keepRecent:2}).item;
  const answer=item.excerpts.find(entry=>entry.messageId==="m1");
  assert.ok(answer);
  assert.equal(answer.turnId,"m0");
  assert.ok(item.excerpts.some(entry=>entry.messageId==="m0"&&entry.turnId===answer.turnId&&entry.content.includes("尚未批准")));
  db.prepare("UPDATE opc_messages SET content=? WHERE id='m0'").run("尚未批准".repeat(1000));
  const oversized=store.build(1,{mode:"assistant",sessionId:"session-a",query:"水墨",keepRecent:2}).item;
  assert.ok(!oversized.excerpts.some(entry=>["m0","m1"].includes(entry.messageId)));
  assert.ok(oversized.sources.some(entry=>entry.id==="m1"));
});

test("summary coverage does not split a turn at the recent-history boundary",t=>{
  const {store}=setup(t);
  const item=store.build(1,{mode:"assistant",sessionId:"session-a",keepRecent:3}).item;
  assert.equal(item.range.lastId,"m9");
  assert.equal(item.range.count,10);
  assert.ok(!item.sources.some(entry=>entry.id==="m10"));
  for(const entry of item.excerpts.filter(entry=>entry.role==="assistant")) {
    assert.ok(item.excerpts.some(question=>question.messageId===entry.turnId&&question.role==="user"));
  }
});
test("summary reads and source expansion enforce account and mode ownership",t=>{
  const {store}=setup(t);
  const item=store.build(1,{mode:"assistant",sessionId:"session-a"}).item;
  assert.throws(()=>store.get(2,item.id),error=>error.status===404);
  assert.throws(()=>store.sources(2,item.id),error=>error.status===404);
  assert.throws(()=>store.build(1,{mode:"assistant",sessionId:"session-b"}),error=>error.status===404);
  assert.throws(()=>store.build(1,{mode:"workflow",sessionId:"session-a"}),error=>error.status===404);
});
test("manual summaries remain unverified and oversized messages are omitted rather than clipped",t=>{
  const {db,store}=setup(t);
  const manual=store.build(1,{mode:"assistant",sessionId:"session-a",summary:"用户提供的未核实总结"}).item;
  assert.equal(manual.verification,"unverified");assert.equal(manual.algorithm,"user-supplied-v1");
  db.prepare("UPDATE opc_messages SET content=? WHERE id='m0'").run("可能".repeat(2000)+"但未确认");
  const extracted=store.build(1,{mode:"assistant",sessionId:"session-a"}).item;
  assert.ok(!extracted.excerpts.some(entry=>entry.messageId==="m0"));
  assert.ok(extracted.sources.some(entry=>entry.id==="m0"));
  assert.ok(store.sources(1,extracted.id).items.find(entry=>entry.id==="m0").content.endsWith("但未确认"));
});

test("summary listing pages one owned session and deletion preserves its transcript",t=>{
  const {db,store}=setup(t);
  for(let i=0;i<23;i++)store.build(1,{mode:"assistant",sessionId:"session-a",query:`focus-${i}`,keepRecent:2});
  const first=store.list(1,{mode:"assistant",sessionId:"session-a"});
  assert.equal(first.items.length,20);assert.equal(first.items[0].revision,23);
  const next=store.list(1,{mode:"assistant",sessionId:"session-a",before:first.nextCursor});
  assert.equal(next.items.length,3);assert.equal(next.nextCursor,null);
  assert.equal(new Set([...first.items,...next.items].map(item=>item.id)).size,23);
  assert.throws(()=>store.list(2,{mode:"assistant",sessionId:"session-a"}),error=>error.status===404);
  assert.throws(()=>store.remove(2,first.items[0].id),error=>error.status===404);
  store.remove(1,first.items[0].id);
  assert.throws(()=>store.get(1,first.items[0].id),error=>error.status===404);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM opc_messages").get().n,14);
});

test("failed or malformed message metadata cannot become a successful summary excerpt; originals stay inspectable",t=>{
  const {db,store}=setup(t);
  db.prepare("UPDATE opc_messages SET content=?,metadata=? WHERE id='m1'").run("水墨任务已完成（失败回复中的残留文字）",JSON.stringify({isError:true}));
  db.prepare("UPDATE opc_messages SET content=?,metadata=? WHERE id='m3'").run("水墨全部成功",'{invalid');
  const before=db.prepare("SELECT * FROM opc_messages ORDER BY timestamp").all();
  const item=store.build(1,{mode:"assistant",sessionId:"session-a",query:"水墨",keepRecent:2}).item;
  assert.equal(item.algorithm,"extractive-turns-v3");
  assert.equal(item.excludedInvalidMessages,2);
  assert.ok(!item.excerpts.some(entry=>["m1","m3"].includes(entry.messageId)));
  assert.ok(item.excerpts.some(entry=>entry.messageId==="m2"));
  assert.match(item.instructionBoundary,/错误不证明先前动作没有生效/);
  assert.equal(store.sources(1,item.id).items.find(entry=>entry.id==="m1").content,before[1].content);
  assert.deepEqual(db.prepare("SELECT * FROM opc_messages ORDER BY timestamp").all(),before);
});
