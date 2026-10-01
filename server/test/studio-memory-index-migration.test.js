"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),Database=require("better-sqlite3");
const {createStudioMemoryStore}=require("../studio-memory-store.js");
const {TOKENIZER_VERSION}=require("../../shared/studio-context/retrieval.cjs");

test("new vocabulary lazily rebuilds only the querying account's legacy FTS without changing memories",()=>{
  const db=new Database(":memory:");
  try{
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2);");
    const store=createStudioMemoryStore(db,{now:()=>"2026-09-30T12:00:00.000Z"});
    for(const owner of[1,2]){const item=store.create(owner,{requestKey:`migration-${owner}`,mode:"assistant",content:"电影预告声音偏好：环境声开场。"}).item;store.confirm(owner,item.id,item.revision);}
    // The index is populated on first search, not on memory creation.
    for(const owner of[1,2])assert.equal(store.search(owner,{mode:"assistant",query:"电影预告",limit:5}).selected.length,1);
    const primaryBefore=db.prepare("SELECT id,user_id,revision,item FROM studio_memories ORDER BY id").all();
    db.exec("UPDATE studio_memory_fts SET terms='legacyChineseOnlyFixture',tokenizer_version='creative-lexical-v3'");
    const versions=()=>db.prepare("SELECT user_id,tokenizer_version FROM studio_memory_fts ORDER BY user_id").all();
    assert.deepEqual(versions().map(row=>row.tokenizer_version),["creative-lexical-v3","creative-lexical-v3"]);
    const first=store.search(1,{mode:"assistant",query:"cinematic teaser preferences",limit:5});assert.equal(first.selected.length,1);assert.equal(first.selected[0].item.ownerUserId,1);
    assert.deepEqual(versions().map(row=>row.tokenizer_version),[TOKENIZER_VERSION,"creative-lexical-v3"]);
    assert.deepEqual(db.prepare("SELECT id,user_id,revision,item FROM studio_memories ORDER BY id").all(),primaryBefore);
    const second=store.search(2,{mode:"assistant",query:"cinematic teaser preferences",limit:5});assert.equal(second.selected.length,1);assert.equal(second.selected[0].item.ownerUserId,2);
    assert.deepEqual(versions().map(row=>row.tokenizer_version),[TOKENIZER_VERSION,TOKENIZER_VERSION]);assert.deepEqual(db.prepare("SELECT id,user_id,revision,item FROM studio_memories ORDER BY id").all(),primaryBefore);
  }finally{db.close();}
});
