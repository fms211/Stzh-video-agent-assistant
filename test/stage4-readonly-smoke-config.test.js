const test=require("node:test");
const assert=require("node:assert/strict");
const {assertNoDevelopmentApiUrl}=require("../scripts/stage4-readonly-smoke.cjs");

test("same-origin preview rejects a development API address embedded in the Web bundle",()=>{
  assert.throws(()=>assertNoDevelopmentApiUrl('const api="http://localhost:8080";',"bundle.js"),/Development API URL leaked/);
  assert.throws(()=>assertNoDevelopmentApiUrl('const api="http://127.0.0.1:8080/api";',"bundle.js"),/Development API URL leaked/);
  assert.doesNotThrow(()=>assertNoDevelopmentApiUrl('const api="http://127.0.0.1:18080/api";',"bundle.js"));
});
