"use strict";

const { retrievalTerms, TOKENIZER_VERSION } = require("../shared/studio-context/retrieval.cjs");
// Encoding each logical term as one ASCII token preserves Chinese bigrams and
// concept aliases exactly, without relying on SQLite's language segmentation.
const tokens = content => [...retrievalTerms(content).terms].map(term => `t${Buffer.from(term, "utf8").toString("hex")}`);

function createStudioMemoryIndex(db) {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS studio_memory_fts USING fts5(
    terms, memory_id UNINDEXED, user_id UNINDEXED, revision UNINDEXED, tokenizer_version UNINDEXED,
    tokenize='unicode61'
  );
  CREATE TRIGGER IF NOT EXISTS studio_memory_fts_delete AFTER DELETE ON studio_memories BEGIN
    DELETE FROM studio_memory_fts WHERE memory_id=OLD.id;
  END;
  CREATE TRIGGER IF NOT EXISTS studio_memory_fts_update AFTER UPDATE ON studio_memories BEGIN
    DELETE FROM studio_memory_fts WHERE memory_id=OLD.id;
  END;
  CREATE TABLE IF NOT EXISTS studio_memory_fts_versions (
    memory_id TEXT PRIMARY KEY, index_rowid INTEGER NOT NULL, revision INTEGER NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS studio_memory_fts_versions_delete AFTER DELETE ON studio_memories BEGIN
    DELETE FROM studio_memory_fts_versions WHERE memory_id=OLD.id;
  END;
  CREATE TRIGGER IF NOT EXISTS studio_memory_fts_versions_update AFTER UPDATE ON studio_memories BEGIN
    DELETE FROM studio_memory_fts_versions WHERE memory_id=OLD.id;
  END;`);
  const insert = db.prepare("INSERT INTO studio_memory_fts(terms,memory_id,user_id,revision,tokenizer_version) VALUES(?,?,?,?,?)");
  const remember = db.prepare("INSERT OR REPLACE INTO studio_memory_fts_versions(memory_id,index_rowid,revision) VALUES(?,?,?)");
  const missing = db.prepare(`SELECT m.id,m.user_id,m.revision,m.item FROM studio_memories m
    LEFT JOIN studio_memory_fts_versions v ON v.memory_id=m.id
    WHERE m.user_id=? AND (v.revision IS NULL OR v.revision!=m.revision OR NOT EXISTS (
      SELECT 1 FROM studio_memory_fts f WHERE f.rowid=v.index_rowid
      AND f.memory_id=m.id AND f.user_id=m.user_id AND f.revision=m.revision AND f.tokenizer_version=?))`);
  const lookup = db.prepare(`SELECT m.id,m.item FROM studio_memory_fts f
    JOIN studio_memories m ON m.id=f.memory_id AND m.user_id=f.user_id AND m.revision=f.revision
    WHERE studio_memory_fts MATCH ? AND m.user_id=? AND f.tokenizer_version=? ORDER BY m.id`);
  const search = db.transaction((userId, query) => {
    // Lazy migration/rebuild is scoped to the authenticated account. Deletion
    // and invalidation happen inside the original mutation transaction.
    for (const row of missing.all(userId, TOKENIZER_VERSION)) {
      db.prepare("DELETE FROM studio_memory_fts WHERE memory_id=?").run(row.id);
      const inserted = insert.run(tokens(JSON.parse(row.item).content).join(" "), row.id, row.user_id, row.revision, TOKENIZER_VERSION);
      remember.run(row.id, inserted.lastInsertRowid, row.revision);
    }
    const terms = tokens(query);
    const found = new Map();
    // Bounded expressions avoid SQLite parser limits on long user inputs.
    for (let offset = 0; offset < terms.length; offset += 64) {
      const expression = terms.slice(offset, offset + 64).map(term => `"${term}"`).join(" OR ");
      for (const row of lookup.all(expression, userId, TOKENIZER_VERSION)) found.set(row.id, row.item);
    }
    return [...found].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => JSON.parse(item));
  });
  return { search };
}

module.exports = { createStudioMemoryIndex };
