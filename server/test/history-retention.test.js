"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const retention = require("../history-retention.js");
const now = 2_000_000_000;
function fixture(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE opc_sessions(id TEXT PRIMARY KEY,user_id INTEGER,updated_at INTEGER);
    CREATE TABLE opc_messages(id TEXT PRIMARY KEY,session_id TEXT REFERENCES opc_sessions(id) ON DELETE CASCADE,content TEXT);
    CREATE TABLE tasks(id TEXT,user_id INTEGER,status TEXT,input TEXT);
    CREATE TABLE generations(id TEXT,user_id INTEGER,conversation_id TEXT);
    CREATE TABLE studio_memory(id TEXT,user_id INTEGER,session_id TEXT);
    CREATE TABLE agent_runs(id TEXT,user_id INTEGER,status TEXT);
    CREATE TABLE research_runs(id TEXT,user_id INTEGER,status TEXT);
    CREATE TABLE user_prefs(user_id INTEGER,key TEXT,value TEXT);
    CREATE TABLE conversations(id TEXT,user_id INTEGER);
    CREATE TABLE messages(id TEXT,conversation_id TEXT);
    CREATE TABLE studio_session_modes(user_id INTEGER,session_id TEXT,mode TEXT);
    CREATE TABLE studio_workflow_plans(user_id INTEGER,session_id TEXT,run_id TEXT,plan TEXT);`);
  retention.initialize(db);
  t.after(() => db.close());
  const add = (id, uid = 1, age = 40) => { db.prepare("INSERT INTO opc_sessions VALUES(?,?,?)").run(id, uid, now - age * 86400); db.prepare("INSERT INTO opc_messages VALUES(?,?,?)").run("message-" + id, id, "saved text"); };
  const enable = (uid = 1) => retention.configure(db, uid, { enabled: true, days: 30, confirm: true });
  return { db, add, enable, sweep: uid => retention.sweep(db, uid || 1, now), has: id => !!db.prepare("SELECT 1 FROM opc_sessions WHERE id=?").get(id) };
}
test("old preferences and default policy never trigger deletion", t => {
  const f = fixture(t); f.add("old");
  f.db.prepare("INSERT INTO user_prefs VALUES(1,'historyDays','3')").run();
  assert.deepEqual(f.sweep(), { deletedIds: [], enabled: false }); assert.equal(f.has("old"), true);
  assert.deepEqual(retention.policy(f.db, 1), { enabled: false, days: 30 });
});
test("activation requires explicit confirmation and bounded integer days", t => {
  const f = fixture(t);
  for (const value of [{ enabled: true, days: 30 }, { enabled: true, days: 0, confirm: true }, { enabled: true, days: 91, confirm: true }, { enabled: "true", days: 30, confirm: true }, { enabled: true, days: 1.5, confirm: true }]) assert.throws(() => retention.configure(f.db, 1, value), { status: 400 });
  assert.equal(retention.policy(f.db, 1).enabled, false);
});
test("cleanup protects all current clients, account boundaries and cutoff date", t => {
  const f = fixture(t); f.enable();
  for (const id of ["expired", "current-tab-a", "current-tab-b"]) f.add(id);
  f.add("other-account", 2); f.add("fresh", 1, 29); f.add("boundary", 1, 30);
  retention.registerCurrent(f.db, 1, "client-a", ["current-tab-a"]);
  retention.registerCurrent(f.db, 1, "client-b", ["current-tab-b"]);
  assert.deepEqual(f.sweep().deletedIds, ["expired"]);
  for (const id of ["current-tab-a", "current-tab-b", "other-account", "fresh", "boundary"]) assert.equal(f.has(id), true, id);
  assert.equal(f.db.prepare("SELECT 1 FROM opc_messages WHERE session_id='expired'").get(), undefined);
});
test("queued running paused and unknown task states protect their linked sessions", t => {
  const f = fixture(t); f.enable();
  for (const status of ["queued", "running", "paused", "new-state"]) {
    f.add(status); f.db.prepare("INSERT INTO tasks VALUES(?,?,?,?)").run(status, 1, status, JSON.stringify({ conversationId: status }));
  }
  f.add("ended"); f.db.prepare("INSERT INTO tasks VALUES('done',1,'completed',?)").run(JSON.stringify({ sessionId: "ended" }));
  assert.deepEqual(f.sweep().deletedIds, ["ended"]);
  assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, 5);
});
test("malformed live task links defer cleanup rather than guessing", t => {
  const f = fixture(t); f.enable(); f.add("old"); f.db.prepare("INSERT INTO tasks VALUES('unknown',1,'running','invalid json')").run();
  assert.equal(f.sweep().deferred, "TASK_LINK_UNKNOWN"); assert.equal(f.has("old"), true);
});
test("works memories research collaboration and saved workflow plans remain intact", t => {
  const f = fixture(t); f.enable(); f.add("old"); f.add("workflow"); f.add("research-session");
  f.db.prepare("INSERT INTO studio_workflow_plans VALUES(1,'workflow','run','{}')").run();
  f.db.prepare("INSERT INTO studio_session_modes VALUES(1,'research-session','research')").run();
  for (const table of ["generations", "studio_memory"]) f.db.prepare(`INSERT INTO ${table} VALUES('keep',1,'old')`).run();
  for (const table of ["agent_runs", "research_runs"]) f.db.prepare(`INSERT INTO ${table} VALUES('keep',1,'completed')`).run();
  assert.deepEqual(f.sweep().deletedIds, ["old"]);
  for (const table of ["generations", "studio_memory", "agent_runs", "research_runs", "studio_workflow_plans"]) assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 1, table);
  assert.equal(f.has("workflow"), true); assert.equal(f.has("research-session"), true);
});
test("legacy copy is retired and account-scoped tombstones block resurrection", t => {
  const f = fixture(t); f.enable(); f.add("old");
  f.db.prepare("INSERT INTO conversations VALUES('old',1)").run(); f.db.prepare("INSERT INTO messages VALUES('old-message','old')").run();
  f.sweep();
  assert.throws(() => retention.assertAvailable(f.db, 1, "old"), { status: 410, code: "HISTORY_EXPIRED" });
  assert.doesNotThrow(() => retention.assertAvailable(f.db, 2, "old"));
  assert.equal(f.db.prepare("SELECT count(*) n FROM conversations").get().n, 0);
  assert.deepEqual(f.sweep().deletedIds, []);
  retention.configure(f.db, 1, { enabled: false, days: 30 });
  assert.equal(retention.isRemoved(f.db, 1, "old"), true);
});
test("deletion and tombstone roll back together if a database write fails", t => {
  const f = fixture(t); f.enable(); f.add("old");
  f.db.exec("CREATE TRIGGER block_delete BEFORE DELETE ON opc_sessions BEGIN SELECT RAISE(ABORT,'fixture delete blocked'); END");
  assert.throws(() => f.sweep()); assert.equal(f.has("old"), true);
  assert.equal(retention.isRemoved(f.db, 1, "old"), false);
  assert.equal(f.db.prepare("SELECT count(*) n FROM opc_messages").get().n, 1);
});

test("completed workflow history can expire while incomplete or uncertain runs stay protected", t => {
  const f = fixture(t); f.enable();
  f.db.exec("CREATE TABLE studio_workflow_results(user_id INTEGER,session_id TEXT,run_id TEXT,step_id TEXT,status TEXT)");
  for (const [id, status] of [["workflow-completed", "completed"], ["workflow-uncertain", "uncertain"], ["workflow-running", "running"]]) {
    f.add(id);
    f.db.prepare("INSERT INTO studio_workflow_plans VALUES(?,?,?,?)").run(1, id, id, JSON.stringify({ steps: [{ id: "step" }] }));
    f.db.prepare("INSERT INTO studio_workflow_results VALUES(?,?,?,?,?)").run(1, id, id, `${id}:0:step`, status);
  }
  assert.deepEqual(f.sweep().deletedIds, ["workflow-completed"]);
  assert.equal(f.has("workflow-running"), true); assert.equal(f.has("workflow-uncertain"), true);
});
