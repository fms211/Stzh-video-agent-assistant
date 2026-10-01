"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createStudioMemoryIndex } = require("../studio-memory-index.js");
const { retrievalTerms, matchRetrieval, RETRIEVAL_VERSION, TOKENIZER_VERSION } = require("../../shared/studio-context/retrieval.cjs");

function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE studio_memories(id TEXT PRIMARY KEY,user_id INTEGER,revision INTEGER,item TEXT)");
  const put = (id, content, owner = 1) => db.prepare("INSERT INTO studio_memories VALUES(?,?,1,?)").run(id, owner, JSON.stringify({ id, content }));
  return { db, put, index: createStudioMemoryIndex(db) };
}

test("FTS candidates preserve lexical recall for Chinese, aliases and query syntax without crossing owners", t => {
  const { put, index } = fixture(t);
  const contents = ["负空间构图", "水墨", "shallow depth of field", "全景深", "slow-motion", "红", "工业极简", 'alpha:beta " OR NOT *', "普通不相关内容"];
  contents.forEach((content, i) => put(String(i), content));
  put("foreign", "留白 水墨 工业极简", 2);
  for (const query of ["留白", "ink wash", "浅景深", "深景深", "慢动作", "红", "工业极简", "不要水墨，改为油画", "不用负空间改为密集构图", 'alpha:beta " OR NOT *', "制作视频", ""]) {
    const expected = contents.map((content, i) => ({ id: String(i), content })).filter(item => !matchRetrieval(retrievalTerms(query), retrievalTerms(item.content)).reason).map(item => item.id);
    const actual = index.search(1, query);
    assert.ok(!actual.some(item => item.id === "foreign"));
    // FTS is a recall stage; authoritative facet/permission/ranking filters follow.
    for (const id of expected) assert.ok(actual.some(item => item.id === id), `${query} missed ${id}`);
  }
});

test("index invalidation is transactional and old rows rebuild after edits or tokenizer version changes", t => {
  const { db, put, index } = fixture(t);
  put("one", "水墨");
  assert.equal(index.search(1, "ink wash").length, 1);
  assert.throws(() => db.transaction(() => {
    db.prepare("DELETE FROM studio_memories WHERE id='one'").run();
    throw new Error("rollback");
  })(), /rollback/);
  assert.equal(index.search(1, "水墨").length, 1);
  db.prepare("UPDATE studio_memories SET revision=2,item=? WHERE id='one'").run(JSON.stringify({ id: "one", content: "工业极简" }));
  assert.equal(index.search(1, "水墨").length, 0);
  assert.equal(index.search(1, "工业极简").length, 1);
  db.exec("UPDATE studio_memory_fts SET tokenizer_version='obsolete'");
  assert.equal(createStudioMemoryIndex(db).search(1, "工业极简").length, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM studio_memory_fts").get().n, 1);
  // Existing FTS data from the previous implementation has no version map.
  db.exec("DELETE FROM studio_memory_fts_versions");
  assert.equal(createStudioMemoryIndex(db).search(1, "工业极简").length, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM studio_memory_fts").get().n, 1);
  db.exec("DELETE FROM studio_memories WHERE id='one'");
  assert.equal(index.search(1, "工业极简").length, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM studio_memory_fts").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM studio_memory_fts_versions").get().n, 0);
});
test("matcher-only revision reuses the existing FTS token rows", t => {
  const { db, put, index } = fixture(t);
  assert.notEqual(RETRIEVAL_VERSION, TOKENIZER_VERSION);
  put("one", "水墨");
  assert.equal(index.search(1, "水墨").length, 1);
  const before = db.prepare("SELECT rowid,tokenizer_version FROM studio_memory_fts WHERE memory_id='one'").get();
  assert.equal(before.tokenizer_version, TOKENIZER_VERSION);
  assert.equal(createStudioMemoryIndex(db).search(1, "水墨").length, 1);
  const after = db.prepare("SELECT rowid,tokenizer_version FROM studio_memory_fts WHERE memory_id='one'").get();
  assert.deepEqual(after, before);
});
