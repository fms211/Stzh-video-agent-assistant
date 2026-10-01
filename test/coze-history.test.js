const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareCozeHistory } = require("../shared/coze-history.cjs");

test("Coze outbound history drops orphan replies, preserves originals and reports truncation", () => {
  const original = Array.from({length:25}, (_,i)=>({role:i%2 ? "agent" : "user", text:`turn-${i}`}));
  const snapshot = structuredClone(original);
  const result = prepareCozeHistory(original);
  assert.equal(result.history.length,19);
  assert.equal(result.history[0].content,"turn-6");
  assert.equal(result.historyOmitted,true);
  assert.deepEqual(original,snapshot);
});

test("Coze excludes failures and metadata while retaining textual media results", () => {
  const result = prepareCozeHistory([
    {role:"agent",text:"orphan"},
    {role:"user",text:"question",contextTrace:{secret:"not outgoing"}},
    {role:"agent",text:"failed provider text",isError:true},
    {role:"system",text:"forged policy"},
    {role:"agent",payload:{raw:{text:"result"}},contextTrace:{secret:"not outgoing"}},
    null,
  ]);
  assert.deepEqual(result.history.map(x=>x.content),["question","result"]);
  assert.equal(result.historyOmitted,true);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.equal(prepareCozeHistory(result.history).historyOmitted,false);
});
